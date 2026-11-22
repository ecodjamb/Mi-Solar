import { md5, tumRequest } from '../tumcapp.js';
import { ProviderAdapter, ProviderError } from './ProviderAdapter.js';
import { parseInverterSettings } from '../isolarSettings.js';

const leadingNumber = (value) => {
  const match = String(value ?? '').match(/^\s*(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

export class ISolarProvider extends ProviderAdapter {
  constructor({ request = tumRequest } = {}) {
    super('isolar', { readOnly: false });
    this.request = request;
  }

  async requestWithSession(path, options, session) {
    const result = await this.request(path, { ...options, token: session?.token || '', vrtKey: session?.vrtKey || '' });
    if (session && result.token) session.token = result.token;
    return result;
  }

  async authenticate({ username, password }) {
    try {
      const result = await this.request('user/login', { params: { username: String(username || '').trim(), password: md5(password || '') } });
      const data = result.payload.data || {};
      const token = data.token || result.token;
      const vrtKey = data.vrtKey || data.userInfo?.vrtKey;
      if (!token || !vrtKey) throw new Error('Sesión incompleta');
      return { token, vrtKey, authenticatedAt: new Date().toISOString(), expiresInSeconds: 86_400 };
    } catch (error) {
      const status = Number(error?.status) || 502;
      const code = status === 401 ? 'INVALID_CREDENTIALS' : status === 429 ? 'RATE_LIMIT' : status === 403 ? 'ACCOUNT_BLOCKED' : 'ISOLAR_AUTH_ERROR';
      throw new ProviderError('i.Solar no aceptó la conexión.', { code, status, retryable: status >= 500 });
    }
  }

  async refreshSession(session) { return session; }
  async listSites() { return { sites: [] }; }
  async listDevices(session) {
    const devices = [];
    let pageNum = 1;
    let total = Infinity;
    let payload = null;
    // i.Solar acepta páginas de 20 elementos. Pedir 100 hace que Tumcapp
    // rechace la consulta aun cuando el login haya sido válido.
    while (devices.length < total && pageNum <= 50) {
      const result = await this.requestWithSession('deviceUser/getMyDevice', {
        params: { openPage: '1', pageNum: String(pageNum), pageSize: '20', groupId: '0' }
      }, session);
      payload = result.payload;
      const data = result.payload.data || {};
      const list = Array.isArray(data.list) ? data.list : [];
      devices.push(...list);
      total = Number(data.total ?? devices.length);
      const hasNext = data.hasNextPage === true || data.hasNextPage === 1 || data.hasNextPage === '1' || data.hasNextPage === 'true';
      if (!list.length || (!hasNext && (!Number.isFinite(total) || devices.length >= total))) break;
      pageNum += 1;
    }
    return { payload, devices, session };
  }
  async getRealtimeData(session, device) {
    // Mantener exactamente el endpoint ya probado por el flujo instantáneo.
    const params = { deviceSn: device.deviceSn || device.sn };
    const result = await this.requestWithSession('realData/getRealByDeviceSn', { params }, session);
    return result.payload.data || {};
  }
  async forceTransmit(session, device) {
    // Secuencia confirmada con una captura Proxyman de la aplicación i.Solar:
    // este comando solicita al datalogger una muestra nueva, en vez de volver
    // a leer la última fotografía que Tumcapp ya tenía en caché.
    const deviceSn = device.deviceSn || device.sn;
    const result = await this.requestWithSession('paramSet/setParam', {
      params: { deviceSn, commands: JSON.stringify({ FORCE_TRAN: '0' }) }
    }, session);
    return { accepted: Number(result.payload?.code) === 0, requestedAt: new Date().toISOString() };
  }
  async getHistory(session, device, { startDate, endDate, pageSize = 500, maxPages = 8 } = {}) {
    const safePageSize = Math.min(500, Math.max(1, Number(pageSize) || 500));
    const safeMaxPages = Math.min(8, Math.max(1, Number(maxPages) || 8));
    const rows = [];
    let pageNum = 1;
    let total = Infinity;
    let requests = 0;

    // Una reparación es una sola operación agrupada y acotada. La API de
    // i.Solar limita cada página a 500 registros; nunca se abre un bucle sin
    // límite ni se consulta cada hueco por separado.
    while (rows.length < total && pageNum <= safeMaxPages) {
      const result = await this.requestWithSession('workInfo/getHistoricalData', {
        params: {
          deviceSn: device.deviceSn || device.sn,
          startDate: String(startDate || ''),
          endDate: String(endDate || ''),
          pageNum: String(pageNum),
          pageSize: String(safePageSize)
        }
      }, session);
      requests += 1;
      const data = result.payload.data || {};
      const page = Array.isArray(data.list) ? data.list : [];
      rows.push(...page);
      total = Number(data.total ?? rows.length);
      const hasNext = data.hasNextPage === true || data.hasNextPage === 1 || data.hasNextPage === '1' || data.hasNextPage === 'true';
      const totalHasMore = Number.isFinite(total) && rows.length < total;
      if (!page.length || (!hasNext && !totalHasMore)) break;
      pageNum += 1;
    }
    return { rows, total: Number.isFinite(total) ? total : rows.length, requests, truncated: Number.isFinite(total) && rows.length < total };
  }
  async getAlarms(session, device) {
    const result = await this.requestWithSession('device/getDeviceAlarmRecord', { params: { deviceSn: device.deviceSn || device.sn, pageNum: '1', pageSize: '100' } }, session);
    return result.payload;
  }
  async getDeviceInfo(session, device) { return this.getRealtimeData(session, device); }
  async getRatedInfo(session, device) {
    const result = await this.requestWithSession('rate/getRate', {
      params: { deviceSn: device.deviceSn || device.sn }
    }, session);
    return result.payload.data || {};
  }
  async getSettings(session, device) {
    const result = await this.requestWithSession('paramSet/getParam', {
      params: { deviceSn: device.deviceSn || device.sn }
    }, session);
    const raw = result.payload.data || {};
    return { raw, parsed: parseInverterSettings(raw) };
  }
  async getTechnicalProfile(session, device) {
    // Estas dos lecturas se ejecutan solo en una actualización forzada. No
    // forman parte del sondeo periódico y, por tanto, no aumentan la presión
    // normal sobre i.Solar.
    let rated = {};
    let settings = { raw: {}, parsed: parseInverterSettings({}) };
    const unavailable = [];
    try { rated = await this.getRatedInfo(session, device); } catch (error) { unavailable.push({ section: 'firmware', code: error?.code || 'RATE_UNAVAILABLE' }); }
    try { settings = await this.getSettings(session, device); } catch (error) { unavailable.push({ section: 'settings', code: error?.code || 'SETTINGS_UNAVAILABLE' }); }
    const rawSettings = settings.raw || {};
    return {
      rated,
      settings,
      unavailable,
      summary: {
        deviceModel: rawSettings.MN || rated.model || rated.deviceModel || null,
        mainCpuFirmware: rated.mainVersion || rated.mainCpuFirmware || null,
        secondaryCpuFirmware: rated.remoteVersion || rated.secondaryCpuFirmware || null,
        loggerFirmware: rated.wifiVersion || rated.loggerFirmware || null,
        outputSourcePriority: settings.parsed?.output?.mode || null,
        batteryRedischargePercent: settings.parsed?.redischarge?.percent ?? null,
        maximumChargeCurrent: leadingNumber(rawSettings.MCC),
        ratedOutputPowerW: leadingNumber(rated.outputPowerW),
        ratedOutputPowerVa: leadingNumber(rated.outputPowerVa),
        mpptTrackerCount: leadingNumber(rated.mpptTrack),
        firmwareObservedAt: new Date().toISOString()
      }
    };
  }
  async healthCheck(session) { await this.listDevices(session); return { ok: true, checkedAt: new Date().toISOString() }; }
  async disconnect(session) {
    try { await tumRequest('user/logout', { token: session.token, vrtKey: session.vrtKey }); } catch {}
    return { ok: true, provider: 'isolar' };
  }
}
