import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const env = String(process.env.VERCEL_ENV || '').trim();
if (env !== 'production') {
  console.log('[firestore-rules] skip: VERCEL_ENV=' + (env || 'local'));
  process.exit(0);
}

const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_missing_in_production');

const sa = JSON.parse(raw);
if (!sa?.project_id || !sa?.client_email || !sa?.private_key) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON_invalid');
}

const projectId = String(process.env.FIREBASE_PROJECT_ID || sa.project_id).trim();
const databaseId = String(
  process.env.FIREBASE_DATABASE_ID || 'ai-studio-447676b4-da38-4e69-b22f-6aa10f85367b'
).trim();

const base64url = value => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
const payload = base64url(JSON.stringify({
  iss: sa.client_email,
  sub: sa.client_email,
  aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
}));
const unsigned = header + '.' + payload;
const signer = createSign('RSA-SHA256');
signer.update(unsigned);
signer.end();
const signature = signer
  .sign(String(sa.private_key).replace(/\\n/g, '\n'))
  .toString('base64url');
const assertion = unsigned + '.' + signature;

const tokenResponse = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }),
});
const tokenData = await tokenResponse.json().catch(() => ({}));
if (!tokenResponse.ok || !tokenData?.access_token) {
  throw new Error('firebase_rules_oauth_failed_' + tokenResponse.status);
}

const auth = {
  authorization: 'Bearer ' + tokenData.access_token,
  'content-type': 'application/json',
};

const content = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

const rulesetResponse = await fetch(
  'https://firebaserules.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/rulesets',
  {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      source: { files: [{ name: 'firestore.rules', content }] },
    }),
  },
);
const rulesetBody = await rulesetResponse.json().catch(() => ({}));
if (!rulesetResponse.ok || !rulesetBody?.name) {
  throw new Error(
    'firebase_rules_ruleset_failed_' +
      rulesetResponse.status +
      '_' +
      JSON.stringify(rulesetBody).slice(0, 300)
  );
}

const releaseName =
  'projects/' + projectId + '/releases/cloud.firestore/' + databaseId;
const releaseUrl =
  'https://firebaserules.googleapis.com/v1/' +
  releaseName.split('/').map(encodeURIComponent).join('/').replace(/%2F/g, '/');

const releaseResponse = await fetch(releaseUrl, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({
    release: {
      name: releaseName,
      rulesetName: rulesetBody.name,
    },
    updateMask: 'ruleset_name',
  }),
});
const releaseBody = await releaseResponse.json().catch(() => ({}));
if (!releaseResponse.ok) {
  throw new Error(
    'firebase_rules_release_failed_' +
      releaseResponse.status +
      '_' +
      JSON.stringify(releaseBody).slice(0, 300)
  );
}

console.log('[firestore-rules] published', rulesetBody.name, 'to', releaseName);
