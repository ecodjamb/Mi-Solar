// Mi Solar V5.3 — archivo actualizado para reemplazo completo del repositorio.
import { md5, tumRequest } from './tumcapp.js';
import { clearCookie, openSession, sessionCookie } from './session.js';

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  },
  body: JSON.stringify(body)
});

function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); } catch { return {}; }
}

function routeOf(event) {
  const raw = event.path || '';
  const marker = '/api/';
  const index = raw.indexOf(marker);
  if (index >= 0) return raw.slice(index + marker.length).replace(/^\/+|\/+$/g, '');
  return raw.replace(/^.*\/api\/?/, '').replace(/^\/+|\/+$/g, '');
}

function requireSession(event) {
  const session = openSession(event.headers?.cookie || event.headers?.Cookie || '');
  if (!session?.token || !session?.vrtKey) {
    const error = new Error('Sesión no iniciada o vencida.');
    error.status = 401;
    throw error;
  }
  return session;
}

async function listAllDevices(session) {
  const all = [];
  let pageNum = 1;
  let total = Infinity;
  let online = 0;
  let offline = 0;
  while (all.length < total && pageNum <= 50) {
    const params = { openPage: '1', pageNum: String(pageNum), pageSize: '20', groupId: '0' };
    const result = await tumRequest('deviceUser/getMyDevice', {
      params,
      token: session.token,
      vrtKey: session.vrtKey
    });
    session.token = result.token;
    const data = result.payload.data || {};
    const list = Array.isArray(data.list) ? data.list : [];
    all.push(...list);
    total = Number(data.total ?? all.length);
    online = Number(data.onlineSum ?? online);
    offline = Number(data.offlineSum ?? offline);
    if (!data.hasNextPage || list.length === 0) break;
    pageNum += 1;
  }
  return { devices: all, total: Number.isFinite(total) ? total : all.length, online, offline };
}

export async function handler(event) {
  const method = event.httpMethod || 'GET';
  const route = routeOf(event);

  try {
    if (method === 'GET' && route === 'health') {
      return json(200, { ok: true, service: 'isolar-backend', time: new Date().toISOString() });
    }

    if (method === 'POST' && route === 'login') {
      const { username, password } = parseBody(event);
      if (!String(username || '').trim() || !String(password || '')) {
        return json(400, { error: 'Ingresa usuario y contraseña.' });
      }
      const params = {
        username: String(username).trim(),
        password: md5(password)
      };
      // Antes del login vrtKey es cadena vacía, exactamente como en la APK.
      const result = await tumRequest('user/login', { params, vrtKey: '', token: '' });
      const data = result.payload.data || {};
      const vrtKey = data.vrtKey || data.userInfo?.vrtKey;
      const token = data.token || result.token;
      if (!token || !vrtKey) throw new Error('El login respondió sin token o vrtKey.');
      const session = {
        token,
        vrtKey,
        username: data.userInfo?.userName || String(username).trim(),
        nickname: data.userInfo?.nickName || String(username).trim(),
        expiresAt: Date.now() + 8 * 60 * 60 * 1000
      };
      return json(200, { user: { username: session.username, nickname: session.nickname } }, {
        'Set-Cookie': sessionCookie(session)
      });
    }

    if (method === 'POST' && route === 'logout') {
      const session = openSession(event.headers?.cookie || event.headers?.Cookie || '');
      if (session?.token && session?.vrtKey) {
        try { await tumRequest('user/logout', { token: session.token, vrtKey: session.vrtKey }); } catch {}
      }
      return json(200, { ok: true }, { 'Set-Cookie': clearCookie() });
    }

    if (method === 'GET' && route === 'session') {
      const session = openSession(event.headers?.cookie || event.headers?.Cookie || '');
      return json(200, {
        authenticated: Boolean(session?.token && session?.vrtKey),
        user: session ? { username: session.username, nickname: session.nickname } : null
      });
    }

    if (method === 'GET' && route === 'devices') {
      const session = requireSession(event);
      const data = await listAllDevices(session);
      return json(200, data, { 'Set-Cookie': sessionCookie(session) });
    }

    const realtime = route.match(/^devices\/([^/]+)\/realtime$/);
    if (method === 'GET' && realtime) {
      const session = requireSession(event);
      const sn = decodeURIComponent(realtime[1]);
      if (!/^\d{8,20}$/.test(sn)) return json(400, { error: 'Número de serie inválido.' });
      const result = await tumRequest('realData/getRealByDeviceSn', {
        params: { deviceSn: sn }, token: session.token, vrtKey: session.vrtKey
      });
      session.token = result.token;
      return json(200, { data: result.payload.data || {} }, { 'Set-Cookie': sessionCookie(session) });
    }


    const history = route.match(/^devices\/([^/]+)\/history$/);
    if (method === 'GET' && history) {
      const session = requireSession(event);
      const sn = decodeURIComponent(history[1]);
      if (!/^\d{8,20}$/.test(sn)) return json(400, { error: 'Número de serie inválido.' });
      const startDate = event.queryStringParameters?.start;
      const endDate = event.queryStringParameters?.end;
      if (!startDate || !endDate) return json(400, { error: 'Debes indicar start y end.' });
      const requestedPages = Number(event.queryStringParameters?.maxPages || 20);
      const maxPages = Math.max(1, Math.min(50, requestedPages));
      const list = [];
      let pageNum = 1;
      let total = Infinity;
      while (list.length < total && pageNum <= maxPages) {
        const result = await tumRequest('workInfo/getHistoricalData', {
          params: {
            deviceSn: sn,
            startDate,
            endDate,
            pageNum: String(pageNum),
            pageSize: '500'
          },
          token: session.token,
          vrtKey: session.vrtKey
        });
        session.token = result.token;
        const data = result.payload.data || {};
        const rows = Array.isArray(data.list) ? data.list : [];
        list.push(...rows);
        total = Number(data.total ?? list.length);
        if (!data.hasNextPage || rows.length === 0) break;
        pageNum += 1;
      }
      return json(200, { list, total, truncated: list.length < total }, { 'Set-Cookie': sessionCookie(session) });
    }

    const summary = route.match(/^devices\/([^/]+)\/summary$/);
    if (method === 'GET' && summary) {
      const session = requireSession(event);
      const sn = decodeURIComponent(summary[1]);
      if (!/^\d{8,20}$/.test(sn)) return json(400, { error: 'Número de serie inválido.' });
      const result = await tumRequest('deviceData/index/getData', {
        params: { deviceSn: sn }, token: session.token, vrtKey: session.vrtKey
      });
      session.token = result.token;
      return json(200, { data: result.payload.data || {} }, { 'Set-Cookie': sessionCookie(session) });
    }

    return json(404, { error: 'Ruta no encontrada.' });
  } catch (error) {
    console.error('API error:', error);
    const status = Number(error.status) || 500;
    return json(status, {
      error: error.message || 'Error interno.',
      ...(error.tumCode != null ? { tumCode: error.tumCode } : {})
    }, status === 401 ? { 'Set-Cookie': clearCookie() } : {});
  }
}
