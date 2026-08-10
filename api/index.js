import { md5, tumRequest } from './lib/tumcapp.js';
import { clearCookie, openSession, sessionCookie, SESSION_IDLE_MS } from './lib/session.js';
import { archiveRows, readArchive, readArchiveSeries } from './lib/archive.js';
import { getTuyaDevice, getTuyaDeviceProfile, listTuyaDevices, sendTuyaCommand, tuyaConfiguration } from './lib/tuya.js';

function sendJson(res, statusCode, body, extraHeaders = {}) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function routeOf(req) {
  const fromRewrite = req.query?.path;
  const raw = Array.isArray(fromRewrite) ? fromRewrite.join('/') : String(fromRewrite || '');
  if (raw) return raw.replace(/^\/+|\/+$/g, '');
  return String(req.url || '').split('?')[0].replace(/^\/api\/?/, '').replace(/^\/+|\/+$/g, '');
}

function cookieHeader(req) {
  return req.headers?.cookie || '';
}

function requireSession(req) {
  const session = openSession(cookieHeader(req));
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
    const flagSaysMore = data.hasNextPage === true || data.hasNextPage === 1 || data.hasNextPage === '1' || data.hasNextPage === 'true';
    const totalSaysMore = Number.isFinite(total) && all.length < total;
    if (list.length === 0 || (!flagSaysMore && !totalSaysMore)) break;
    pageNum += 1;
  }
  return { devices: all, total: Number.isFinite(total) ? total : all.length, online, offline };
}

function normalizeOpenMeteo(payload) {
  const c = payload.current || {};
  const hourly = (payload.hourly?.time || []).map((time, i) => ({
    time,
    shortwaveWm2: Number(payload.hourly?.shortwave_radiation?.[i] || 0),
    cloudCover: Number(payload.hourly?.cloud_cover?.[i] || 0),
    precipitation: Number(payload.hourly?.precipitation?.[i] || 0)
  }));
  const dailyRadiation = (payload.daily?.time || []).map((date, i) => ({
    date,
    shortwaveKwhM2: Number(payload.daily?.shortwave_radiation_sum?.[i] || 0),
    weatherCode: Number(payload.daily?.weather_code?.[i] || 0)
  }));
  return {
    temperature: Number(c.temperature_2m),
    humidity: Number(c.relative_humidity_2m),
    weatherCode: Number(c.weather_code),
    windSpeed: Number(c.wind_speed_10m),
    isDay: Number(c.is_day),
    cloudCover: Number(c.cloud_cover),
    precipitation: Number(c.precipitation),
    sunrise: payload.daily?.sunrise?.[0],
    sunset: payload.daily?.sunset?.[0],
    hourly,
    dailyRadiation,
    provider: 'Open-Meteo',
    updatedAt: c.time || new Date().toISOString()
  };
}

async function openMeteo(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day,cloud_cover,precipitation');
  url.searchParams.set('hourly', 'shortwave_radiation,cloud_cover,precipitation,weather_code');
  url.searchParams.set('daily', 'sunrise,sunset,shortwave_radiation_sum,weather_code');
  url.searchParams.set('past_days', '60');
  url.searchParams.set('forecast_days', '14');
  url.searchParams.set('timezone', 'America/Santiago');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  return normalizeOpenMeteo(await response.json());
}

async function metNorway(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MiSolar/7.0 contact: app-owner', Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`MET Norway HTTP ${response.status}`);
  const payload = await response.json();
  const row = payload.properties?.timeseries?.[0];
  const instant = row?.data?.instant?.details || {};
  const next = row?.data?.next_1_hours || {};
  return {
    temperature: Number(instant.air_temperature),
    humidity: Number(instant.relative_humidity),
    windSpeed: Number(instant.wind_speed) * 3.6,
    cloudCover: Number(instant.cloud_area_fraction),
    precipitation: Number(next.details?.precipitation_amount || 0),
    weatherCode: 0,
    provider: 'MET Norway (respaldo)',
    updatedAt: row?.time || new Date().toISOString(),
    hourly: [],
    dailyRadiation: []
  };
}

export default async function handler(req, res) {
  const method = req.method || 'GET';
  const route = routeOf(req);

  try {
    if (method === 'GET' && route === 'health') {
      return sendJson(res, 200, { ok: true, service: 'mi-solar-vercel-backend', version: '8.10.2', archiveConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.MISOLAR_DB_KEY), tuyaConfigured: tuyaConfiguration().configured, time: new Date().toISOString() });
    }

    if (method === 'GET' && route === 'weather') {
      const lat = Number(req.query?.lat);
      const lon = Number(req.query?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return sendJson(res, 400, { error: 'Coordenadas inválidas.' });
      try {
        const weather = await openMeteo(lat, lon);
        return sendJson(res, 200, weather, { 'Cache-Control': 's-maxage=600, stale-while-revalidate=300' });
      } catch (primaryError) {
        try {
          const fallback = await metNorway(lat, lon);
          return sendJson(res, 200, { ...fallback, error: `Open-Meteo no respondió: ${primaryError.message}` });
        } catch (fallbackError) {
          return sendJson(res, 502, { error: `Clima no disponible. ${primaryError.message}; ${fallbackError.message}` });
        }
      }
    }

    if (method === 'POST' && route === 'login') {
      const { username, password } = parseBody(req);
      if (!String(username || '').trim() || !String(password || '')) {
        return sendJson(res, 400, { error: 'Ingresa usuario y contraseña.' });
      }
      const params = { username: String(username).trim(), password: md5(password) };
      const result = await tumRequest('user/login', { params, vrtKey: '', token: '' });
      const data = result.payload.data || {};
      const vrtKey = data.vrtKey || data.userInfo?.vrtKey;
      const token = data.token || result.token;
      if (!token || !vrtKey) throw new Error('El login respondió sin token o vrtKey.');
      const now = Date.now();
      const session = {
        token,
        vrtKey,
        username: data.userInfo?.userName || String(username).trim(),
        nickname: data.userInfo?.nickName || String(username).trim(),
        lastActivityAt: now,
        expiresAt: now + SESSION_IDLE_MS
      };
      return sendJson(res, 200, { user: { username: session.username, nickname: session.nickname } }, {
        'Set-Cookie': sessionCookie(session)
      });
    }

    if (method === 'POST' && route === 'logout') {
      const session = openSession(cookieHeader(req));
      if (session?.token && session?.vrtKey) {
        try { await tumRequest('user/logout', { token: session.token, vrtKey: session.vrtKey }); } catch {}
      }
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
    }

    if (method === 'GET' && route === 'session') {
      const session = openSession(cookieHeader(req));
      return sendJson(res, 200, {
        authenticated: Boolean(session?.token && session?.vrtKey),
        user: session ? { username: session.username, nickname: session.nickname } : null,
        expiresAt: session?.expiresAt || null,
        idleTimeoutMs: SESSION_IDLE_MS
      });
    }

    if (method === 'POST' && route === 'activity') {
      const session = requireSession(req);
      const now = Date.now();
      session.lastActivityAt = now;
      session.expiresAt = now + SESSION_IDLE_MS;
      return sendJson(res, 200, { ok: true, expiresAt: session.expiresAt, idleTimeoutMs: SESSION_IDLE_MS }, {
        'Set-Cookie': sessionCookie(session)
      });
    }

    if (method === 'GET' && route === 'tuya/status') {
      requireSession(req);
      const config = tuyaConfiguration();
      return sendJson(res, 200, { configured: config.configured, region: config.region || null, uidHint: config.uid ? `${config.uid.slice(0, 4)}••••${config.uid.slice(-4)}` : null });
    }

    if (method === 'GET' && route === 'tuya/devices') {
      requireSession(req);
      const devices = await listTuyaDevices();
      return sendJson(res, 200, { devices, total: devices.length, updatedAt: new Date().toISOString() });
    }

    const tuyaDevice = route.match(/^tuya\/devices\/([^/]+)$/);
    if (method === 'GET' && tuyaDevice) {
      requireSession(req);
      const device = await getTuyaDevice(decodeURIComponent(tuyaDevice[1]));
      return sendJson(res, 200, { device, updatedAt: new Date().toISOString() });
    }

    const tuyaProfile = route.match(/^tuya\/devices\/([^/]+)\/profile$/);
    if (method === 'GET' && tuyaProfile) {
      requireSession(req);
      const profile = await getTuyaDeviceProfile(decodeURIComponent(tuyaProfile[1]));
      return sendJson(res, 200, { ...profile, updatedAt: new Date().toISOString() });
    }

    const tuyaCommand = route.match(/^tuya\/devices\/([^/]+)\/commands$/);
    if (method === 'POST' && tuyaCommand) {
      requireSession(req);
      const { code, value } = parseBody(req);
      if (!String(code || '')) return sendJson(res, 400, { error: 'Falta el código de la función.' });
      const success = await sendTuyaCommand(decodeURIComponent(tuyaCommand[1]), String(code), value);
      return sendJson(res, 200, { success, updatedAt: new Date().toISOString() });
    }

    if (method === 'GET' && route === 'devices') {
      const session = requireSession(req);
      const data = await listAllDevices(session);
      return sendJson(res, 200, data, { 'Set-Cookie': sessionCookie(session) });
    }

    const realtime = route.match(/^devices\/([^/]+)\/realtime$/);
    if (method === 'GET' && realtime) {
      const session = requireSession(req);
      const sn = decodeURIComponent(realtime[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const result = await tumRequest('realData/getRealByDeviceSn', {
        params: { deviceSn: sn }, token: session.token, vrtKey: session.vrtKey
      });
      session.token = result.token;
      try { await archiveRows(sn, [result.payload.data || {}], { bucketMinutes: 5 }); } catch (archiveError) { console.error('Archive realtime:', archiveError); }
      return sendJson(res, 200, { data: result.payload.data || {} }, { 'Set-Cookie': sessionCookie(session) });
    }

    const history = route.match(/^devices\/([^/]+)\/history$/);
    if (method === 'GET' && history) {
      const session = requireSession(req);
      const sn = decodeURIComponent(history[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const startDate = req.query?.start;
      const endDate = req.query?.end;
      if (!startDate || !endDate) return sendJson(res, 400, { error: 'Debes indicar start y end.' });
      const requestedPages = Number(req.query?.maxPages || 20);
      const maxPages = Math.max(1, Math.min(50, requestedPages));
      const list = [];
      let pageNum = 1;
      let total = Infinity;
      const startedAt = Date.now();
      const softDeadlineMs = 45000;
      while (list.length < total && pageNum <= maxPages) {
        if (Date.now() - startedAt > softDeadlineMs) break;
        const result = await tumRequest('workInfo/getHistoricalData', {
          params: {
            deviceSn: sn,
            startDate: String(startDate),
            endDate: String(endDate),
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
        if (rows.length === 0) break;
        const flagSaysMore = data.hasNextPage === true || data.hasNextPage === 1 || data.hasNextPage === '1' || data.hasNextPage === 'true';
        const totalSaysMore = Number.isFinite(total) && list.length < total;
        if (!flagSaysMore && !totalSaysMore) break;
        pageNum += 1;
      }
      try { await archiveRows(sn, list); } catch (archiveError) { console.error('Archive history:', archiveError); }
      return sendJson(res, 200, {
        list,
        total,
        truncated: list.length < total,
        pages: pageNum,
        elapsedMs: Date.now() - startedAt
      }, { 'Set-Cookie': sessionCookie(session) });
    }

    const archive = route.match(/^devices\/([^/]+)\/archive$/);
    if (method === 'GET' && archive) {
      requireSession(req);
      const sn = decodeURIComponent(archive[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const start = String(req.query?.start || '');
      const end = String(req.query?.end || '');
      if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return sendJson(res, 400, { error: 'Rango de archivo inválido.' });
      const stored = await readArchive(sn, new Date(start).toISOString(), new Date(end).toISOString());
      return sendJson(res, 200, { list: stored.rows, total: stored.rows.length, source: 'misolar-archive', configured: stored.configured });
    }

    const archiveSeries = route.match(/^devices\/([^/]+)\/archive-series$/);
    if (method === 'GET' && archiveSeries) {
      requireSession(req);
      const sn = decodeURIComponent(archiveSeries[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const start = String(req.query?.start || '');
      const end = String(req.query?.end || '');
      const resolution = req.query?.resolution === 'day' ? 'day' : 'hour';
      if (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return sendJson(res, 400, { error: 'Rango de serie inválido.' });
      const stored = await readArchiveSeries(sn, new Date(start).toISOString(), new Date(end).toISOString(), resolution);
      return sendJson(res, 200, { list: stored.rows, total: stored.rows.length, source: 'misolar-archive', resolution: stored.resolution, configured: stored.configured });
    }

    const summary = route.match(/^devices\/([^/]+)\/summary$/);
    if (method === 'GET' && summary) {
      const session = requireSession(req);
      const sn = decodeURIComponent(summary[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const result = await tumRequest('deviceData/index/getData', {
        params: { deviceSn: sn }, token: session.token, vrtKey: session.vrtKey
      });
      session.token = result.token;
      return sendJson(res, 200, { data: result.payload.data || {} }, { 'Set-Cookie': sessionCookie(session) });
    }

    return sendJson(res, 404, { error: `Ruta no encontrada: ${route}` });
  } catch (error) {
    console.error('Vercel API error:', error);
    const status = Number(error.status) || 500;
    return sendJson(res, status, {
      error: error.message || 'Error interno.',
      ...(error.tumCode != null ? { tumCode: error.tumCode } : {}),
      ...(error.tuyaCode != null ? { tuyaCode: error.tuyaCode } : {})
    }, status === 401 ? { 'Set-Cookie': clearCookie() } : {});
  }
}
