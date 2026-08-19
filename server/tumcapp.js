// Mi Solar V6 — archivo actualizado para reemplazo completo del repositorio.
import crypto from 'node:crypto';

export const BASE_URL = 'https://www.tumcapp.com/app/api/mobile';

export function md5(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

// Reproducción exacta de common/API/ajax_fc.js extraído de i.Solar 2.4.0.
// 1) key=value unidos con &, usando valores SIN percent-encoding.
// 2) suma de códigos UTF-16/ASCII de la cadena.
// 3) SHA-256 de la suma decimal.
// 4) SHA-256(vrtKey + últimos 8 + primeros 8).
export function calculateVrt(params = {}, vrtKey = '') {
  const raw = Object.keys(params)
    .map((key) => {
      const value = Array.isArray(params[key]) ? params[key].join(',') : params[key];
      return `${key}=${value ?? ''}`;
    })
    .join('&');

  let sum = 0;
  for (let i = 0; i < raw.length; i += 1) sum += raw.charCodeAt(i);
  const firstHash = sha256(String(sum));
  const seed = `${vrtKey || ''}${firstHash.slice(-8)}${firstHash.slice(0, 8)}`;
  return sha256(seed);
}

function encodeBody(params) {
  const body = new URLSearchParams();
  for (const [key, original] of Object.entries(params)) {
    const value = Array.isArray(original) ? original.join(',') : original;
    body.append(key, value == null ? '' : String(value));
  }
  return body.toString();
}

export async function tumRequest(path, { params = {}, token = '', vrtKey = '', method = 'POST' } = {}) {
  const upperMethod = method.toUpperCase();
  const encoded = encodeBody(params);
  const url = upperMethod === 'GET' && encoded
    ? `${BASE_URL}/${path}?${encoded}`
    : `${BASE_URL}/${path}`;

  const headers = {
    Accept: '*/*',
    'Accept-Language': 'es-419,es;q=0.9',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/20) uni-app',
    token,
    vrt: calculateVrt(params, vrtKey)
  };

  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        method: upperMethod,
        headers,
        body: upperMethod === 'GET' ? undefined : encoded,
        redirect: 'manual',
        signal: controller.signal
      }).finally(() => clearTimeout(timer));

      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`Tumcapp devolvió una respuesta no JSON (${response.status}).`);
      }

      if (!response.ok || Number(payload.code) !== 0) {
        const error = new Error(payload.message || `Tumcapp respondió ${response.status}`);
        error.status = response.status >= 400 ? response.status : 502;
        error.tumCode = payload.code;
        throw error;
      }

      return {
        payload,
        token: response.headers.get('token') || token
      };
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const retryable = !status || [408, 429, 500, 502, 503, 504].includes(status);
      if (!retryable || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}
