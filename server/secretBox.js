import crypto from 'node:crypto';

function key() {
  const configured = process.env.AUTOMATION_CREDENTIALS_KEY;
  if (!configured) throw new Error('Falta configurar la llave de credenciales automáticas.');
  return crypto.createHash('sha256').update(configured).digest();
}

export function encryptCredentials(credentials) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptCredentials(packed) {
  const [ivRaw, tagRaw, encryptedRaw] = String(packed || '').split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Las credenciales automáticas guardadas no son válidas.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
