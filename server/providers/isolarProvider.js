import { md5, tumRequest } from '../tumcapp.js';
import { ProviderAdapter, ProviderError } from './ProviderAdapter.js';

export class ISolarProvider extends ProviderAdapter {
  constructor() { super('isolar', { readOnly: false }); }

  async authenticate({ username, password }) {
    try {
      const result = await tumRequest('user/login', { params: { username: String(username || '').trim(), password: md5(password || '') } });
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
    const result = await tumRequest('deviceUser/getMyDevice', { params: { openPage: '1', pageNum: '1', pageSize: '100', groupId: '0' }, token: session.token, vrtKey: session.vrtKey });
    return { payload: result.payload, devices: result.payload.data?.list || [], session: { ...session, token: result.token } };
  }
  async getRealtimeData(session, device) {
    const params = { deviceSn: device.deviceSn || device.sn, type: '0' };
    const result = await tumRequest('device/getDeviceRealTimeData', { params, token: session.token, vrtKey: session.vrtKey });
    return result.payload;
  }
  async getHistory() { throw new ProviderError('Use el histórico persistente de MiSolar para i.Solar.', { code: 'USE_CANONICAL_HISTORY', status: 400 }); }
  async getAlarms(session, device) {
    const result = await tumRequest('device/getDeviceAlarmRecord', { params: { deviceSn: device.deviceSn || device.sn, pageNum: '1', pageSize: '100' }, token: session.token, vrtKey: session.vrtKey });
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
