import { md5, tumRequest } from '../tumcapp.js';
import { ProviderAdapter, ProviderError } from './ProviderAdapter.js';

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
      throw new ProviderError('i.Solar no aceptó la conexión.', { code: Number(error?.status) === 401 ? 'INVALID_CREDENTIALS' : 'ISOLAR_AUTH_ERROR', status: Number(error?.status) || 502, retryable: false });
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
    return result.payload;
  }
  async getHistory() { throw new ProviderError('Use el histórico persistente de MiSolar para i.Solar.', { code: 'USE_CANONICAL_HISTORY', status: 400 }); }
  async getAlarms(session, device) {
    const result = await this.requestWithSession('device/getDeviceAlarmRecord', { params: { deviceSn: device.deviceSn || device.sn, pageNum: '1', pageSize: '100' } }, session);
    return result.payload;
  }
  async getDeviceInfo(session, device) { return this.getRealtimeData(session, device); }
  async getRatedInfo(session, device) { return this.getDeviceInfo(session, device); }
  async getSettings() { return { available: true, source: 'isolar' }; }
  async healthCheck(session) { await this.listDevices(session); return { ok: true, checkedAt: new Date().toISOString() }; }
  async disconnect(session) {
    try { await tumRequest('user/logout', { token: session.token, vrtKey: session.vrtKey }); } catch {}
    return { ok: true, provider: 'isolar' };
  }
}
