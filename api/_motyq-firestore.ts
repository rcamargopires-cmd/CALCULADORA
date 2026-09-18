import { createSign } from 'node:crypto';

type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type ServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

let cachedToken = '';
let cachedTokenExpiresAt = 0;

const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString('base64url');

const serviceAccount = (): ServiceAccount => {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_missing');
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_invalid');
  }
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  return parsed;
};

const accessToken = async () => {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - 60_000) return cachedToken;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(String(sa.private_key)).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(`firebase_oauth_failed_${response.status}`);
  }
  cachedToken = String(data.access_token);
  cachedTokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
};

const ctx = () => {
  const sa = serviceAccount();
  const projectId = String(process.env.FIREBASE_PROJECT_ID || sa.project_id || '').trim();
  const databaseId = String(process.env.FIREBASE_DATABASE_ID || 'ai-studio-447676b4-da38-4e69-b22f-6aa10f85367b').trim();
  if (!projectId || !databaseId) throw new Error('firebase_context_missing');
  return {
    projectId,
    databaseId,
    docsBase: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`,
  };
};

const toValue = (value: any): FirestoreValue => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toValue(item)])),
      },
    };
  }
  return { stringValue: String(value) };
};

const fromValue = (value: any): any => {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(fromValue);
  if ('mapValue' in value) return fieldsToObject(value.mapValue?.fields || {});
  return null;
};

const fieldsToObject = (fields: Record<string, any>) =>
  Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, fromValue(value)]));

const authHeaders = async () => ({
  authorization: `Bearer ${await accessToken()}`,
  'content-type': 'application/json',
});

const docIdFromName = (name = '') => decodeURIComponent(name.split('/').pop() || '');

export const motyqFirestore = {
  configured: () => Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()),

  get: async (collection: string, id: string) => {
    const { docsBase } = ctx();
    const response = await fetch(`${docsBase}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, {
      headers: await authHeaders(),
    });
    if (response.status === 404) return null;
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`firestore_get_${response.status}`);
    return { id: docIdFromName(data.name), ...fieldsToObject(data.fields || {}) };
  },

  patch: async (collection: string, id: string, data: Record<string, any>) => {
    const { docsBase } = ctx();
    const params = new URLSearchParams();
    Object.keys(data).forEach(key => params.append('updateMask.fieldPaths', key));
    const url = `${docsBase}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}?${params.toString()}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({
        fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toValue(value)])),
      }),
    });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`firestore_patch_${response.status}_${body?.error?.message || ''}`);
    return { id: docIdFromName(body.name), ...fieldsToObject(body.fields || {}) };
  },

  query: async (
    collection: string,
    filters: Array<{ field: string; op?: 'EQUAL'; value: any }>,
    limit = 80,
  ) => {
    const { projectId, databaseId } = ctx();
    const fieldFilters = filters.map(filter => ({
      fieldFilter: {
        field: { fieldPath: filter.field },
        op: filter.op || 'EQUAL',
        value: toValue(filter.value),
      },
    }));
    const where = fieldFilters.length === 1
      ? fieldFilters[0]
      : { compositeFilter: { op: 'AND', filters: fieldFilters } };

    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:runQuery`,
      {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: collection }],
            ...(filters.length ? { where } : {}),
            limit,
          },
        }),
      },
    );
    const rows: any[] = await response.json().catch(() => []);
    if (!response.ok) throw new Error(`firestore_query_${response.status}`);
    return rows
      .map(row => row?.document)
      .filter(Boolean)
      .map(document => ({ id: docIdFromName(document.name), ...fieldsToObject(document.fields || {}) }));
  },
};
