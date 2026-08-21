import crypto from 'node:crypto';
import { ProviderAdapter, ProviderError } from './ProviderAdapter.js';

const DEFAULT_BASE_URL = 'https://android.shinemonitor.com/public/';
const COMPANY_KEY = 'bnrl_frRFjEz8Mkn';
const SUFFIX = '&i18n=pt_BR&lang=pt_BR&source=1&_app_client_=android&_app_id_=wifiapp.volfw.watchpower&_app_version_=1.0.6.3';
const AUTH_CODES = new Set([0x0007, 0x000f, 0x0010, 0x0019, 0x0105, 0x010e]);

const sha1 = (value) => crypto.createHash('sha1').update(String(value), 'utf8').digest('hex');
const salt = () => String(Date.now());
const queryValue = (value) => encodeURIComponent(String(value ?? ''));

function checkPayload(payload) {
  const err = Number(payload?.err ?? -1);
  if (err === 0) return payload;
  if (AUTH_CODES.has(err)) {
    const wrongCredentials = [0x0010, 0x0105].includes(err);
    const frozen = err === 0x0019;
    throw new ProviderError(
      wrongCredentials ? 'Las credenciales de WatchPower no fueron aceptadas.' : frozen ? 'La cuenta WatchPower está bloqueada.' : 'La sesión WatchPower no es válida.',
      { code: wrongCredentials ? 'INVALID_CREDENTIALS' : frozen ? 'ACCOUNT_BLOCKED' : 'SESSION_EXPIRED', status: wrongCredentials ? 401 : 423, retryable: false, details: { providerCode: err } }
    );
  }
  throw new ProviderError('WatchPower respondió con un error de proveedor.', { code: `WATCHPOWER_${err}`, retryable: err >= 500, details: { providerCode: err } });
}

function deviceParams(device) {
  if (!device?.pn || device?.devcode == null || device?.devaddr == null || !device?.sn) {
    throw new ProviderError('El identificador del dispositivo WatchPower está incompleto.', { code: 'DEVICE_ID_INCOMPLETE', status: 400 });
  }
  return `&pn=${queryValue(device.pn)}&devcode=${queryValue(device.devcode)}&devaddr=${queryValue(device.devaddr)}&sn=${queryValue(device.sn)}`;
}

function flattenDeviceLists(payload) {
  const dat = payload?.dat || {};
  const candidates = [dat.device, dat.devices, dat.list, dat.rows, payload?.device, payload?.devices];
  return candidates.find(Array.isArray) || [];
}

export class WatchPowerProvider extends ProviderAdapter {
  constructor({ baseUrl = DEFAULT_BASE_URL, timeoutMs = 15_000, fetchImpl = fetch } = {}) {
    super('watchpower', { readOnly: true });
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async #get(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'MiSolar/WatchPower-read-only' },
        signal: controller.signal,
        redirect: 'error'
      });
      const text = await response.text();
      let payload;
      try { payload = JSON.parse(text); } catch {
        throw new ProviderError('WatchPower devolvió una respuesta no válida.', { code: 'INVALID_RESPONSE', status: 502 });
      }
      if (response.status === 429) throw new ProviderError('WatchPower limitó temporalmente las consultas.', { code: 'RATE_LIMIT', status: 429, retryable: true });
      if (!response.ok) throw new ProviderError(`WatchPower no está disponible (HTTP ${response.status}).`, { code: `HTTP_${response.status}`, status: 502, retryable: response.status >= 500 });
      return checkPayload(payload);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error?.name === 'AbortError') throw new ProviderError('WatchPower demoró demasiado en responder.', { code: 'TIMEOUT', status: 504, retryable: true });
      throw new ProviderError('No fue posible conectar con WatchPower.', { code: 'NETWORK_ERROR', status: 502, retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  #loginUrl(username, password) {
    // El protocolo móvil firma el usuario en formato application/x-www-form-urlencoded.
    // En particular, un "+" representa un espacio y no debe transformarse a "%2B".
    const protocolUsername = queryValue(username).replace(/%2B/gi, '+');
    const baseAction = `&action=authSource&usr=${protocolUsername}&company-key=${COMPANY_KEY}${SUFFIX}`;
    const requestSalt = salt();
    const sign = sha1(`${requestSalt}${sha1(password)}${baseAction}`);
    return `${this.baseUrl}?sign=${sign}&salt=${requestSalt}${baseAction}`;
  }

  #authedUrl(session, baseAction) {
    if (!session?.token || !session?.secret) throw new ProviderError('Falta la sesión WatchPower.', { code: 'SESSION_MISSING', status: 401 });
    const requestSalt = salt();
    const sign = sha1(`${requestSalt}${session.secret}${session.token}${baseAction}`);
    return `${this.baseUrl}?sign=${sign}&salt=${requestSalt}&token=${queryValue(session.token)}${baseAction}`;
  }

  async #action(session, action, params = '') {
    return this.#get(this.#authedUrl(session, `&action=${action}${params}${SUFFIX}`));
  }

  async authenticate({ username, password }) {
    if (!String(username || '').trim() || !String(password || '')) throw new ProviderError('Faltan las credenciales WatchPower.', { code: 'CREDENTIALS_MISSING', status: 400 });
    const payload = await this.#get(this.#loginUrl(String(username).trim(), String(password)));
    const data = payload.dat || {};
    if (!data.token || !data.secret) throw new ProviderError('WatchPower autenticó sin entregar una sesión utilizable.', { code: 'SESSION_INVALID' });
    return { token: data.token, secret: data.secret, expiresInSeconds: Number(data.expire || 600), authenticatedAt: new Date().toISOString() };
  }

  async refreshSession(session) {
    const payload = await this.#action(session, 'updateToken');
    const data = payload.dat || {};
    return { ...session, token: data.token || session.token, secret: data.secret || session.secret, expiresInSeconds: Number(data.expire || session.expiresInSeconds || 600), authenticatedAt: new Date().toISOString() };
  }

  async listSites(session) { return this.#action(session, 'queryPlants', '&page=0&pagesize=100'); }
  async listCollectors(session) { return this.#action(session, 'queryCollectors', '&page=0&pagesize=100'); }

  async listDevices(session) {
    const first = await this.#action(session, 'webQueryDeviceEs');
    const devices = flattenDeviceLists(first);
    if (devices.length) return { payload: first, devices };
    const fallback = await this.#action(session, 'queryDevices', '&page=0&pagesize=100');
    return { payload: fallback, devices: flattenDeviceLists(fallback) };
  }

  async getRealtimeData(session, device) { return this.#action(session, 'querySPDeviceLastData', deviceParams(device)); }
  async getHistory(session, device, from, to = from) {
    const dates = [];
    const current = new Date(`${from}T12:00:00Z`);
    const end = new Date(`${to}T12:00:00Z`);
    while (current <= end && dates.length < 370) {
      dates.push(current.toISOString().slice(0, 10));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    const rows = [];
    for (const date of dates) rows.push(await this.#action(session, 'queryDeviceDataOneDay', `${deviceParams(device)}&date=${date}`));
    return rows;
  }
  async getAlarms(session, device) { return this.#action(session, 'queryDeviceWarning', deviceParams(device)); }
  async getDeviceInfo(session, device) { return this.#action(session, 'queryDeviceInfo', deviceParams(device)); }
  async getRatedInfo(session, device) { return this.getDeviceInfo(session, device); }
  async getSettings(session, device) { return this.#action(session, 'queryDeviceCtrlField', deviceParams(device)); }
  async healthCheck(session) { await this.#action(session, 'queryAccountInfo'); return { ok: true, checkedAt: new Date().toISOString() }; }
  async disconnect() { return { ok: true, provider: 'watchpower', remoteLogoutSupported: false }; }
}

export const WATCHPOWER_WRITES_ENABLED = false;
