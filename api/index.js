import { md5, tumRequest } from '../server/tumcapp.js';
import { clearCookie, openSession, sessionCookie, SESSION_IDLE_MS } from '../server/session.js';
import { archiveRows, readArchive, readArchiveSeries, rest } from '../server/archive.js';
import { getTuyaDevice, getTuyaDeviceProfile, listTuyaDevices, sendTuyaCommand, tuyaConfiguration } from '../server/tuya.js';
import { parseInverterSettings } from '../server/isolarSettings.js';
import {
  deleteEquipment, listEquipment, pushSubscriptionStatus, readAutomationRule, recordConfigurationEvent, removePushSubscription, saveAutomationCredentials,
  saveEquipment, savePushSubscription, updateAutomationRule
} from '../server/automationStore.js';
import { encryptCredentials } from '../server/secretBox.js';
import { applyInverterTarget, loginOrigin, logoutOrigin } from '../server/inverterControl.js';
import { pushConfiguration, pushPublicKey, sendAutomationPush, sendSiteNotification } from '../server/pushNotifications.js';
import { ensureSite } from '../server/archive.js';
import { runDueAutomations } from '../server/automationRunner.js';
import { runNotificationMonitors } from '../server/notificationMonitor.js';
import { automationSiteProfile } from '../server/siteProfiles.js';
import { forecastForDate, listForecastRevisions, lockTomorrowForecasts } from '../server/solarProjection.js';
import { deleteUtilityBill, listUtilityBills, projectUtilityBill, readUtilityBillDocument, saveUtilityBill, saveUtilityMeterReading, updateUtilityBill, utilityBillReminder, utilityMeterTracking, updateUtilityBillReminder } from '../server/utilityBills.js';
import { extractUtilityBill, validateBillImages } from '../server/utilityBillAi.js';
import {
  closeWaterPeriod, deleteWaterBill, openWaterPeriod, readWaterBillDocument, readWaterReadingPhoto,
  saveWaterBill, saveWaterReading, updateWaterSettings, waterDashboard
} from '../server/waterCosts.js';
import { extractWaterBill, extractWaterMeterReading, validateWaterImages } from '../server/waterBillAi.js';

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
    // Open-Meteo entrega la suma diaria en MJ/m²; se normaliza a kWh/m².
    shortwaveKwhM2: Number(payload.daily?.shortwave_radiation_sum?.[i] || 0) / 3.6,
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
  url.searchParams.set('past_days', '90');
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
      const push = pushConfiguration();
      let archiveAuthorized = false;
      let archiveError = null;
      try {
        const sites = await rest('solar_sites?select=id&limit=1');
        archiveAuthorized = Array.isArray(sites);
      } catch (cause) {
        archiveError = cause instanceof Error ? cause.message : 'No fue posible comprobar el archivo permanente.';
      }
      return sendJson(res, 200, { ok: true, service: 'mi-solar-vercel-backend', version: '8.26.0', archiveConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.MISOLAR_DB_KEY), archiveAuthorized, archiveError, aiConfigured: Boolean(process.env.OPENAI_API_KEY), tuyaConfigured: tuyaConfiguration().configured, automationConfigured: Boolean(process.env.CRON_SECRET && process.env.AUTOMATION_CREDENTIALS_KEY), pushConfigured: push.configured, pushKeyValid: push.valid, time: new Date().toISOString() });
    }

    if (method === 'POST' && route === 'automation/run') {
      if (!process.env.CRON_SECRET || req.headers?.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return sendJson(res, 401, { error: 'Ejecución programada no autorizada.' });
      }
      const [automation, forecastLocks] = await Promise.all([runDueAutomations(), lockTomorrowForecasts()]);
      return sendJson(res, 200, { automation, forecastLocks });
    }

    if (method === 'POST' && route === 'notifications/monitor') {
      if (!process.env.CRON_SECRET || req.headers?.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return sendJson(res, 401, { error: 'Monitor de notificaciones no autorizado.' });
      }
      return sendJson(res, 200, await runNotificationMonitors());
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
      if (session?.token && session?.vrtKey && String(req.query?.validate || '') === '1') {
        try {
          await listAllDevices(session);
          return sendJson(res, 200, { authenticated: true, user: { username: session.username, nickname: session.nickname }, expiresAt: session.expiresAt || null, idleTimeoutMs: SESSION_IDLE_MS }, { 'Set-Cookie': sessionCookie(session) });
        } catch {
          return sendJson(res, 200, { authenticated: false, user: null, expiresAt: null, idleTimeoutMs: SESSION_IDLE_MS }, { 'Set-Cookie': clearCookie() });
        }
      }
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

    const settingsCheck = route.match(/^devices\/([^/]+)\/settings-check$/);
    if (method === 'GET' && settingsCheck) {
      const session = requireSession(req);
      const sn = decodeURIComponent(settingsCheck[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const result = await tumRequest('paramSet/getParam', {
        params: { deviceSn: sn }, token: session.token, vrtKey: session.vrtKey
      });
      session.token = result.token;
      const settings = parseInverterSettings(result.payload.data || {});
      return sendJson(res, 200, {
        ...settings,
        observedAt: new Date().toISOString(),
        readOnly: true
      }, { 'Set-Cookie': sessionCookie(session) });
    }

    const automation = route.match(/^devices\/([^/]+)\/automation$/);
    if ((method === 'GET' || method === 'PUT') && automation) {
      requireSession(req);
      const sn = decodeURIComponent(automation[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      if (method === 'GET') return sendJson(res, 200, await readAutomationRule(sn));
      const body = parseBody(req);
      const current = await readAutomationRule(sn);
      const thresholdKwh = body.thresholdKwh == null ? current.thresholdKwh : Number(body.thresholdKwh);
      const runAtLocal = body.runAtLocal == null ? current.runAtLocal : String(body.runAtLocal).slice(0, 5);
      const sunny = body.sunny || current.sunny;
      const cloudy = body.cloudy || current.cloudy;
      const conditions = body.conditions == null ? current.conditions : body.conditions;
      const enabled = body.enabled == null ? current.enabled : body.enabled;
      const notificationPreferences = body.notificationPreferences == null ? current.notificationPreferences : body.notificationPreferences;
      const outputAllowed = (value) => ['Utility', 'SOL', 'SBU'].includes(value);
      const redischargeAllowed = (value) => Number.isInteger(Number(value)) && Number(value) >= 10 && Number(value) <= 100;
      if (typeof enabled !== 'boolean') return sendJson(res, 400, { error: 'El estado de automatización debe ser verdadero o falso.' });
      if (!notificationPreferences || ['automationExecuted','automationState','serviceOutage','gridOutage','solarSurplus'].some((key) => typeof notificationPreferences[key] !== 'boolean')) {
        return sendJson(res, 400, { error: 'Las preferencias de notificación no son válidas.' });
      }
      if (!Number.isFinite(thresholdKwh) || thresholdKwh < 0 || thresholdKwh > 60) return sendJson(res, 400, { error: 'La generación de activación debe estar entre 0 y 60 kWh.' });
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(runAtLocal)) return sendJson(res, 400, { error: 'La hora chilena no es válida.' });
      if (!redischargeAllowed(sunny.redischarge) || !redischargeAllowed(cloudy.redischarge) || !outputAllowed(sunny.output) || !outputAllowed(cloudy.output)) {
        return sendJson(res, 400, { error: 'Los parámetros de día soleado o nublado no son válidos.' });
      }
      if (!Array.isArray(conditions) || conditions.length < 1 || conditions.length > 12) return sendJson(res, 400, { error: 'Debes guardar entre 1 y 12 condiciones.' });
      const ids = new Set();
      for (const condition of conditions) {
        const min = Number(condition.minKwh ?? 0), max = Number(condition.maxKwh);
        if (!String(condition.id || '') || ids.has(condition.id)) return sendJson(res, 400, { error: 'Cada condición debe tener un identificador único.' });
        ids.add(condition.id);
        if (!['lessThan','between'].includes(condition.kind) || !['sunny','cloudy'].includes(condition.preset)) return sendJson(res, 400, { error: 'Una condición contiene una opción no válida.' });
        if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 60 || min > max) return sendJson(res, 400, { error: 'Los rangos de generación deben estar entre 0 y 60 kWh.' });
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(condition.runAtLocal || ''))) return sendJson(res, 400, { error: 'Una de las horas programadas no es válida.' });
        if (![0,-1].includes(Number(condition.dayOffset))) return sendJson(res, 400, { error: 'Selecciona el mismo día o el día anterior.' });
      }
      if (enabled && !current.credentialsConfigured) return sendJson(res, 409, { error: 'Guarda primero el acceso automático a i.Solar.' });
      const saved = await updateAutomationRule(sn, {
        enabled,
        executionMode: enabled ? 'automatic' : 'manual',
        thresholdKwh,
        runAtLocal,
        sunny: { redischarge: Number(sunny.redischarge), output: sunny.output },
        cloudy: { redischarge: Number(cloudy.redischarge), output: cloudy.output },
        conditions: conditions.map(condition => ({ id: String(condition.id), enabled: condition.enabled !== false, kind: condition.kind, minKwh: Number(condition.minKwh ?? 0), maxKwh: Number(condition.maxKwh), preset: condition.preset, runAtLocal: String(condition.runAtLocal), dayOffset: Number(condition.dayOffset) })),
        notificationPreferences
      });
      if (current.enabled !== saved.enabled && saved.notificationPreferences.automationState) {
        const siteId = await ensureSite(sn);
        const profile = automationSiteProfile(sn);
        const active = saved.enabled;
        await sendSiteNotification(
          siteId,
          'automation_state',
          `Mi Solar · automatización ${active ? 'activada' : 'desactivada'}`,
          active
            ? `La programación automática de ${profile.label} quedó activada. Mi Solar evaluará las reglas guardadas en hora de Chile.`
            : `La programación automática de ${profile.label} quedó desactivada. No se modificarán parámetros hasta volver a activarla.`,
          { url: '/?page=programming', enabled: active, site: profile.key },
          `automation-state-${active ? 'on' : 'off'}-${Date.now()}`
        );
      }
      return sendJson(res, 200, saved);
    }

    const automationCredentials = route.match(/^devices\/([^/]+)\/automation-credentials$/);
    if (method === 'PUT' && automationCredentials) {
      requireSession(req);
      const sn = decodeURIComponent(automationCredentials[1]);
      const { username, password } = parseBody(req);
      if (!/^\d{8,20}$/.test(sn) || !String(username || '').trim() || !String(password || '')) {
        return sendJson(res, 400, { error: 'Ingresa el usuario y la contraseña de i.Solar.' });
      }
      let validationSession;
      try {
        validationSession = await loginOrigin(username, password);
      } finally {
        await logoutOrigin(validationSession);
      }
      const saved = await saveAutomationCredentials(sn, encryptCredentials({ username: String(username).trim(), password: String(password) }));
      return sendJson(res, 200, { ...saved, message: 'Acceso automático validado y guardado de forma cifrada.' });
    }

    if (method === 'GET' && route === 'push/public-key') {
      requireSession(req);
      const publicKey = pushPublicKey();
      if (!publicKey || !pushConfiguration().valid) return sendJson(res, 503, { error: 'Las llaves de notificaciones del servidor no son válidas.' });
      return sendJson(res, 200, { publicKey });
    }

    const pushSubscription = route.match(/^devices\/([^/]+)\/push-subscription$/);
    if ((method === 'POST' || method === 'DELETE') && pushSubscription) {
      requireSession(req);
      const sn = decodeURIComponent(pushSubscription[1]);
      const body = parseBody(req);
      if (!/^\d{8,20}$/.test(sn) || !body.endpoint) return sendJson(res, 400, { error: 'Suscripción de notificaciones inválida.' });
      if (method === 'DELETE') return sendJson(res, 200, await removePushSubscription(sn, String(body.endpoint)));
      if (!body.keys?.p256dh || !body.keys?.auth) return sendJson(res, 400, { error: 'La suscripción no contiene sus llaves públicas.' });
      return sendJson(res, 200, await savePushSubscription(sn, body));
    }

    const pushStatus = route.match(/^devices\/([^/]+)\/push-status$/);
    if (method === 'GET' && pushStatus) {
      requireSession(req);
      const sn = decodeURIComponent(pushStatus[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      return sendJson(res, 200, { ...(await pushSubscriptionStatus(sn)), serverConfigured: Boolean(pushPublicKey()) });
    }

    const pushTest = route.match(/^devices\/([^/]+)\/push-test$/);
    if (method === 'POST' && pushTest) {
      requireSession(req);
      const sn = decodeURIComponent(pushTest[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const siteId = await ensureSite(sn);
      const result = await sendAutomationPush(siteId, 'Mi Solar · prueba', 'Las notificaciones están funcionando correctamente en este celular.', { url: '/?page=programming', test: true });
      if (!result.configured) return sendJson(res, 503, { error: 'El servidor de notificaciones no está configurado.' });
      if (result.sent < 1) return sendJson(res, 409, { error: result.lastError ? `El servicio push rechazó la entrega (${result.lastError.status || 'sin código'}). Activa y repara nuevamente la suscripción en este celular.` : 'No hay un celular suscrito. Usa “Activar, reparar y probar” desde la app instalada.', ...result });
      return sendJson(res, 200, { ...result, message: 'Notificación de prueba enviada. Debe aparecer en el celular en unos segundos.' });
    }

    const equipment = route.match(/^devices\/([^/]+)\/equipment(?:\/([^/]+))?$/);
    if (equipment && ['GET','POST','PUT','DELETE'].includes(method)) {
      requireSession(req);
      const sn = decodeURIComponent(equipment[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      if (method === 'GET') return sendJson(res, 200, { assets: await listEquipment(sn) });
      const body = parseBody(req);
      if (method === 'DELETE') return sendJson(res, 200, await deleteEquipment(sn, equipment[2]));
      const category = String(body.category || '');
      const quantity = Number(body.quantity || 1);
      if (!['panel','battery','inverter','generator','other'].includes(category) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return sendJson(res, 400, { error: 'Categoría o cantidad de equipo inválida.' });
      const saved = await saveEquipment(sn, { ...body, id: method === 'PUT' ? equipment[2] : null, category, quantity });
      return sendJson(res, 200, { asset: saved });
    }

    const settingsApply = route.match(/^devices\/([^/]+)\/settings-apply$/);
    if (method === 'POST' && settingsApply) {
      const session = requireSession(req);
      const sn = decodeURIComponent(settingsApply[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const body = parseBody(req);
      const preset = String(body.preset || '');
      const rule = await readAutomationRule(sn);
      const target = preset === 'sunny' || preset === 'cloudy' ? rule[preset] : null;
      if (!target) return sendJson(res, 400, { error: 'Configuración solicitada no reconocida.' });
      let audit = { stored: false };
      try {
        const result = await applyInverterTarget(sn, target, session);
        audit = await recordConfigurationEvent(sn, {
          source: 'manual', preset, forecastDate: body.forecastDate, forecastKwh: body.forecastKwh,
          before: result.before, target, after: result.after, commands: { requested: result.commands, sent: result.commandResults }, success: result.confirmed,
          message: result.confirmed ? 'Cambio confirmado mediante lectura posterior.' : 'El origen aceptó la solicitud, pero la lectura posterior aún no coincide.'
        }).catch(() => ({ stored: false }));
        const partialMessage = `Cambio parcial: Redischarge quedó en ${result.after?.redischarge?.percent ?? 'valor no identificado'}% y Output quedó en ${result.after?.output?.mode || 'valor no identificado'}.`;
        return sendJson(res, result.confirmed ? 200 : 409, {
          ...result, preset, target, audit,
          error: result.confirmed ? undefined : `${partialMessage} El intento quedó registrado y no se enviarán más órdenes automáticamente.`,
          message: result.confirmed ? (result.changed ? 'Configuración aplicada y confirmada correctamente.' : 'La configuración ya estaba aplicada; no fue necesario modificar el inversor.') : partialMessage
        }, { 'Set-Cookie': sessionCookie(session) });
      } catch (error) {
        await recordConfigurationEvent(sn, {
          source: 'manual', preset, forecastDate: body.forecastDate, forecastKwh: body.forecastKwh,
          before: {}, target, after: {}, commands: {}, success: false, message: error instanceof Error ? error.message : 'Error desconocido'
        }).catch(() => undefined);
        throw error;
      }
    }

    const live = route.match(/^devices\/([^/]+)\/live$/);
    if (method === 'GET' && live) {
      const session = requireSession(req);
      const sn = decodeURIComponent(live[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });

      // Una sola respuesta mantiene consistente el token rotativo de Tumcapp y
      // entrega primero la telemetría que alimenta el flujo instantáneo.
      const realtimeResult = await tumRequest('realData/getRealByDeviceSn', {
        params: { deviceSn: sn }, token: session.token, vrtKey: session.vrtKey
      });
      session.token = realtimeResult.token;
      const realtimeData = realtimeResult.payload.data || {};
      let summaryData = {};
      let partial = false;
      try {
        const summaryResult = await tumRequest('deviceData/index/getData', {
          params: { deviceSn: sn }, token: session.token, vrtKey: session.vrtKey
        });
        session.token = summaryResult.token;
        summaryData = summaryResult.payload.data || {};
      } catch (summaryError) {
        partial = true;
        console.error('Live summary:', summaryError);
      }
      try { await archiveRows(sn, [realtimeData], { bucketMinutes: 5 }); } catch (archiveError) { console.error('Archive live:', archiveError); }
      return sendJson(res, 200, {
        realtime: realtimeData,
        summary: summaryData,
        partial,
        receivedAt: new Date().toISOString(),
        source: 'tumcapp-live'
      }, { 'Set-Cookie': sessionCookie(session) });
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

    const utilityBillDocument = route.match(/^devices\/([^/]+)\/utility-bills\/documents\/(\d+)$/);
    if (method === 'GET' && utilityBillDocument) {
      requireSession(req);
      const sn = decodeURIComponent(utilityBillDocument[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const document = await readUtilityBillDocument(sn, utilityBillDocument[2]);
      res.statusCode = 200;
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="${String(document.originalName).replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
      return res.end(document.buffer);
    }

    const utilityBillExtract = route.match(/^devices\/([^/]+)\/utility-bills\/extract$/);
    if (method === 'POST' && utilityBillExtract) {
      requireSession(req);
      const sn = decodeURIComponent(utilityBillExtract[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const images = validateBillImages(parseBody(req).images);
      return sendJson(res, 200, await extractUtilityBill(images));
    }

    const utilityBill = route.match(/^devices\/([^/]+)\/utility-bills\/(\d+)$/);
    if ((method === 'PATCH' || method === 'DELETE') && utilityBill) {
      requireSession(req);
      const sn = decodeURIComponent(utilityBill[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      if (method === 'DELETE') return sendJson(res, 200, { deleted: await deleteUtilityBill(sn, utilityBill[2]) });
      const body = parseBody(req);
      const date = (name) => /^\d{4}-\d{2}-\d{2}$/.test(String(body[name] || '')) ? String(body[name]) : null;
      const periodStart = date('periodStart');
      const periodEnd = date('periodEnd');
      if (!periodStart || !periodEnd || periodStart > periodEnd) return sendJson(res, 400, { error: 'Revisa las fechas: el inicio debe ser anterior o igual al término.' });
      const nullableNumber = (name, allowNegative = false) => {
        if (body[name] === '' || body[name] == null) return null;
        const value = Number(body[name]);
        return Number.isFinite(value) && (allowNegative || value >= 0) ? value : null;
      };
      const text = (name, max = 240) => body[name] == null ? null : String(body[name]).trim().slice(0, max) || null;
      const previousReading = nullableNumber('previousReading');
      const currentReading = nullableNumber('currentReading');
      if ((previousReading == null) !== (currentReading == null) || (previousReading != null && currentReading < previousReading)) return sendJson(res, 400, { error: 'Las lecturas deben ingresarse juntas y la lectura actual no puede ser menor.' });
      const amountClp = nullableNumber('amountClp');
      if (amountClp == null) return sendJson(res, 400, { error: 'El monto total debe ser un número válido.' });
      const billedKwh = nullableNumber('billedKwh');
      const result = await updateUtilityBill(sn, utilityBill[2], {
        periodStart, periodEnd, previousReading, currentReading, billedKwh,
        consumptionStatus: body.consumptionStatus === 'estimated' ? 'estimated' : 'actual', amountClp,
        issueDate: date('issueDate'), dueDate: date('dueDate'), customerNumber: text('customerNumber', 80), meterNumber: text('meterNumber', 80),
        tariffName: text('tariffName', 100), invoiceNumber: text('invoiceNumber', 100), serviceAddress: text('serviceAddress', 300),
        fixedChargeClp: nullableNumber('fixedChargeClp'), energyChargeClp: nullableNumber('energyChargeClp'), transportChargeClp: nullableNumber('transportChargeClp'),
        otherChargesClp: nullableNumber('otherChargesClp', true), taxesClp: nullableNumber('taxesClp')
      });
      return sendJson(res, 200, { bill: result, reminder: await utilityBillReminder(sn) });
    }

    const utilityBills = route.match(/^devices\/([^/]+)\/utility-bills$/);
    if (utilityBills && (method === 'GET' || method === 'POST')) {
      requireSession(req);
      const sn = decodeURIComponent(utilityBills[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      if (method === 'GET') {
        const list = await listUtilityBills(sn);
        const [projection, reminder, meterTracking] = await Promise.all([projectUtilityBill(sn, list), utilityBillReminder(sn), utilityMeterTracking(sn, list)]);
        return sendJson(res, 200, { list, projection, reminder, meterTracking });
      }
      const body = parseBody(req);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const fallbackStart = new Date(Date.parse(`${today}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
      const rawPeriodEnd = String(body.periodEnd || '');
      const periodEnd = /^\d{4}-\d{2}-\d{2}$/.test(rawPeriodEnd) ? rawPeriodEnd : today;
      const rawPeriodStart = String(body.periodStart || '');
      const periodStart = /^\d{4}-\d{2}-\d{2}$/.test(rawPeriodStart) && rawPeriodStart <= periodEnd ? rawPeriodStart : fallbackStart > periodEnd ? periodEnd : fallbackStart;
      const rawPrevious = body.previousReading === '' || body.previousReading == null ? null : Number(body.previousReading);
      const rawCurrent = body.currentReading === '' || body.currentReading == null ? null : Number(body.currentReading);
      const validReadingPair = rawPrevious != null && rawCurrent != null && Number.isFinite(rawPrevious) && Number.isFinite(rawCurrent) && rawPrevious >= 0 && rawCurrent >= rawPrevious;
      const previousReading = validReadingPair ? rawPrevious : null;
      const currentReading = validReadingPair ? rawCurrent : null;
      const rawBilledKwh = body.billedKwh === '' || body.billedKwh == null ? null : Number(body.billedKwh);
      const billedKwh = Number.isFinite(rawBilledKwh) && Number(rawBilledKwh) > 0 ? Number(rawBilledKwh) : (validReadingPair ? Number(rawCurrent) - Number(rawPrevious) : null);
      const rawEstimatedKwh = body.estimatedKwh === '' || body.estimatedKwh == null ? null : Number(body.estimatedKwh);
      const estimatedKwh = Number.isFinite(rawEstimatedKwh) && Number(rawEstimatedKwh) > 0 ? Number(rawEstimatedKwh) : null;
      const rawAmountClp = Number(body.amountClp);
      const amountClp = Number.isFinite(rawAmountClp) && rawAmountClp >= 0 ? rawAmountClp : 0;
      const images = Array.isArray(body.images) && body.images.length ? validateBillImages(body.images) : [];
      const text = (name, max = 240) => body[name] == null ? null : String(body[name]).trim().slice(0, max) || null;
      const optionalNumber = (name) => { const value = body[name] === '' || body[name] == null ? null : Number(body[name]); return value != null && Number.isFinite(value) && value >= 0 ? value : null; };
      const chargeItems = Array.isArray(body.chargeItems) ? body.chargeItems.slice(0, 80).map((item) => ({ label: String(item?.label || '').trim().slice(0, 180), amountClp: Number(item?.amountClp), category: String(item?.category || 'other'), includedInEnergyRate: item?.includedInEnergyRate === true })).filter((item) => item.label && Number.isFinite(item.amountClp)) : [];
      const allowedChargeCategories = new Set(['energy','fixed','transport','public_service','tax','discount','debt','interest','adjustment','other']);
      const details = { issueDate: text('issueDate', 10), dueDate: text('dueDate', 10), customerNumber: text('customerNumber', 80), meterNumber: text('meterNumber', 80), tariffName: text('tariffName', 100), invoiceNumber: text('invoiceNumber', 100), serviceAddress: text('serviceAddress', 300), fixedChargeClp: optionalNumber('fixedChargeClp'), energyChargeClp: optionalNumber('energyChargeClp'), transportChargeClp: optionalNumber('transportChargeClp'), otherChargesClp: optionalNumber('otherChargesClp'), taxesClp: optionalNumber('taxesClp'), chargeItems };
      if (details.issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(details.issueDate)) details.issueDate = null;
      if (details.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(details.dueDate)) details.dueDate = null;
      details.chargeItems = chargeItems.map((item) => allowedChargeCategories.has(item.category) ? item : { ...item, category: 'other' });
      const bill = await saveUtilityBill(sn, { periodStart, periodEnd, previousReading, currentReading, billedKwh, estimatedKwh, consumptionIsEstimated: body.consumptionIsEstimated === true, amountClp, ...details }, images, { extracted: body.aiExtraction && typeof body.aiExtraction === 'object' ? body.aiExtraction : {}, confidence: optionalNumber('aiConfidence'), model: text('aiModel', 80) });
      return sendJson(res, 200, { bill, reminder: await utilityBillReminder(sn) });
    }

    const utilityMeterReadings = route.match(/^devices\/([^/]+)\/utility-meter-readings$/);
    if (method === 'POST' && utilityMeterReadings) {
      requireSession(req);
      const sn = decodeURIComponent(utilityMeterReadings[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const body = parseBody(req);
      return sendJson(res, 201, await saveUtilityMeterReading(sn, { readingKwh: body.readingKwh, readingAt: body.readingAt, notes: body.notes }));
    }

    const utilityReminder = route.match(/^devices\/([^/]+)\/utility-reading-reminder$/);
    if (method === 'PATCH' && utilityReminder) {
      requireSession(req);
      const sn = decodeURIComponent(utilityReminder[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      return sendJson(res, 200, { reminder: await updateUtilityBillReminder(sn, parseBody(req)) });
    }

    const waterBillDocument = route.match(/^devices\/([^/]+)\/water-bills\/documents\/(\d+)$/);
    if (method === 'GET' && waterBillDocument) {
      requireSession(req);
      const sn = decodeURIComponent(waterBillDocument[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const document = await readWaterBillDocument(sn, waterBillDocument[2]);
      res.statusCode = 200;
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="${String(document.originalName).replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
      return res.end(document.buffer);
    }

    const waterReadingPhoto = route.match(/^devices\/([^/]+)\/water-meter\/readings\/(\d+)\/photo$/);
    if (method === 'GET' && waterReadingPhoto) {
      requireSession(req);
      const sn = decodeURIComponent(waterReadingPhoto[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const document = await readWaterReadingPhoto(sn, waterReadingPhoto[2]);
      res.statusCode = 200;
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="${String(document.originalName).replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
      return res.end(document.buffer);
    }

    const waterBillExtract = route.match(/^devices\/([^/]+)\/water-bills\/extract$/);
    if (method === 'POST' && waterBillExtract) {
      requireSession(req);
      const sn = decodeURIComponent(waterBillExtract[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const images = validateWaterImages(parseBody(req).images, 4);
      return sendJson(res, 200, await extractWaterBill(images));
    }

    const waterMeterExtract = route.match(/^devices\/([^/]+)\/water-meter\/extract$/);
    if (method === 'POST' && waterMeterExtract) {
      requireSession(req);
      const sn = decodeURIComponent(waterMeterExtract[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const images = validateWaterImages(parseBody(req).images, 1);
      return sendJson(res, 200, await extractWaterMeterReading(images[0]));
    }

    const waterBill = route.match(/^devices\/([^/]+)\/water-bills\/(\d+)$/);
    if (method === 'DELETE' && waterBill) {
      requireSession(req);
      const sn = decodeURIComponent(waterBill[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      return sendJson(res, 200, { deleted: await deleteWaterBill(sn, waterBill[2]) });
    }

    const waterBills = route.match(/^devices\/([^/]+)\/water-bills$/);
    if (method === 'POST' && waterBills) {
      requireSession(req);
      const sn = decodeURIComponent(waterBills[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const body = parseBody(req);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
      const periodEnd = validDate(body.periodEnd) || validDate(body.issueDate) || today;
      const billingMonth = /^\d{4}-\d{2}$/.test(String(body.billingMonth || '')) ? `${body.billingMonth}-01` : validDate(body.billingMonth) || `${(validDate(body.issueDate) || periodEnd).slice(0, 7)}-01`;
      const periodStart = validDate(body.periodStart) && String(body.periodStart) <= periodEnd
        ? String(body.periodStart)
        : new Date(Date.parse(`${periodEnd}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
      const images = Array.isArray(body.images) && body.images.length ? validateWaterImages(body.images, 4) : [];
      const text = (value, max = 240) => value == null ? null : String(value).trim().slice(0, max) || null;
      const number = (value) => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
      const allowed = new Set(['fixed','potable_water','sewer_collection','wastewater_treatment','tax','discount','agreement','debt','interest','adjustment','other']);
      const chargeItems = Array.isArray(body.chargeItems) ? body.chargeItems.slice(0, 80).map((item) => ({ label: text(item?.label, 180), cubicMeters: number(item?.cubicMeters), amountClp: Number(item?.amountClp), category: allowed.has(item?.category) ? item.category : 'other' })).filter((item) => item.label && Number.isFinite(item.amountClp)) : [];
      const bill = await saveWaterBill(sn, {
        billingMonth, periodStart, periodEnd, issueDate: validDate(body.issueDate), dueDate: validDate(body.dueDate), nextReadingDate: validDate(body.nextReadingDate),
        previousReadingM3: number(body.previousReadingM3), currentReadingM3: number(body.currentReadingM3), readingDifferenceM3: number(body.readingDifferenceM3),
        deductibleM3: number(body.deductibleM3), billedM3: number(body.billedM3), readingStatus: body.readingStatus,
        consumptionIsEstimated: body.consumptionIsEstimated === true, amountClp: Math.max(0, Number(body.amountClp) || 0),
        customerNumber: text(body.customerNumber, 80), meterNumber: text(body.meterNumber, 80), meterBrand: text(body.meterBrand, 80), meterModel: text(body.meterModel, 100),
        invoiceNumber: text(body.invoiceNumber, 100), serviceAddress: text(body.serviceAddress, 300),
        fixedChargeClp: number(body.fixedChargeClp), potableWaterChargeClp: number(body.potableWaterChargeClp), sewerCollectionChargeClp: number(body.sewerCollectionChargeClp),
        wastewaterTreatmentChargeClp: number(body.wastewaterTreatmentChargeClp), subtotalServiceClp: number(body.subtotalServiceClp), taxesClp: number(body.taxesClp),
        otherChargesClp: number(body.otherChargesClp), discountsClp: number(body.discountsClp), chargeItems
      }, images, { extracted: body.aiExtraction && typeof body.aiExtraction === 'object' ? body.aiExtraction : {}, confidence: number(body.aiConfidence), model: text(body.aiModel, 80) });
      return sendJson(res, 200, { bill });
    }

    const waterReading = route.match(/^devices\/([^/]+)\/water-meter\/readings$/);
    if (method === 'POST' && waterReading) {
      requireSession(req);
      const sn = decodeURIComponent(waterReading[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const body = parseBody(req);
      const readingM3 = Number(body.readingM3);
      if (!Number.isFinite(readingM3) || readingM3 < 0) return sendJson(res, 400, { error: 'Lectura de agua inválida.' });
      const image = body.image ? validateWaterImages([body.image], 1)[0] : null;
      const reading = await saveWaterReading(sn, { periodId: body.periodId, readingAt: body.readingAt, readingM3, notes: body.notes, source: image ? 'photo-ai' : 'manual' }, image, { extracted: body.aiExtraction && typeof body.aiExtraction === 'object' ? body.aiExtraction : {}, confidence: Number(body.aiConfidence), model: body.aiModel });
      return sendJson(res, 200, { reading });
    }

    const waterPeriodOpen = route.match(/^devices\/([^/]+)\/water-periods\/open$/);
    if (method === 'POST' && waterPeriodOpen) {
      requireSession(req);
      const sn = decodeURIComponent(waterPeriodOpen[1]);
      const body = parseBody(req);
      if (!/^\d{8,20}$/.test(sn) || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.periodStart || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.expectedCloseDate || ''))) return sendJson(res, 400, { error: 'Datos del período inválidos.' });
      return sendJson(res, 200, { period: await openWaterPeriod(sn, body) });
    }

    const waterPeriodClose = route.match(/^devices\/([^/]+)\/water-periods\/close$/);
    if (method === 'POST' && waterPeriodClose) {
      requireSession(req);
      const sn = decodeURIComponent(waterPeriodClose[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      return sendJson(res, 200, { period: await closeWaterPeriod(sn, parseBody(req)) });
    }

    const waterSettings = route.match(/^devices\/([^/]+)\/water-settings$/);
    if (method === 'PATCH' && waterSettings) {
      requireSession(req);
      const sn = decodeURIComponent(waterSettings[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      return sendJson(res, 200, { settings: await updateWaterSettings(sn, parseBody(req)) });
    }

    const waterReminderTest = route.match(/^devices\/([^/]+)\/water-reminder-test$/);
    if (method === 'POST' && waterReminderTest) {
      requireSession(req);
      const sn = decodeURIComponent(waterReminderTest[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const siteId = await ensureSite(sn);
      return sendJson(res, 200, await sendSiteNotification(siteId, 'water_reading_reminder_test', '💧 Recordatorio de lectura listo', 'Mi Solar te avisará antes de la próxima fecha estimada de lectura de Aguas Andinas.', { url: '/?page=water' }, `water-test-${Date.now()}`));
    }

    const waterCosts = route.match(/^devices\/([^/]+)\/water-costs$/);
    if (method === 'GET' && waterCosts) {
      requireSession(req);
      const sn = decodeURIComponent(waterCosts[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      return sendJson(res, 200, await waterDashboard(sn));
    }

    const solarForecast = route.match(/^devices\/([^/]+)\/solar-forecast$/);
    if (method === 'GET' && solarForecast) {
      requireSession(req);
      const sn = decodeURIComponent(solarForecast[1]);
      if (!/^\d{8,20}$/.test(sn)) return sendJson(res, 400, { error: 'Número de serie inválido.' });
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const [year, month, day] = today.split('-').map(Number);
      const tomorrow = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
      const [current, next, revisions] = await Promise.all([forecastForDate(sn, today), forecastForDate(sn, tomorrow), listForecastRevisions(sn, [today, tomorrow])]);
      return sendJson(res, 200, { today: current, tomorrow: next, revisions, lockTimeChile: '21:35' });
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
