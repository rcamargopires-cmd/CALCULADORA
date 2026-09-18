import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const key = () => {
  const raw = String(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!raw) throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY_missing');
  return createHash('sha256').update(raw).digest();
};

export const encryptWhatsAppToken = (token: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
};

export const decryptWhatsAppToken = (payload: string) => {
  const [ivRaw, tagRaw, encryptedRaw] = String(payload || '').split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('whatsapp_token_payload_invalid');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
