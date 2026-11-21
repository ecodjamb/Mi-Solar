import crypto from 'node:crypto';
import { findSiteId, rest } from './archive.js';

const PLACEHOLDER = '--';
const TZ = 'America/Santiago';

function formatKw(value) {
  if (value == null || value === '') return PLACEHOLDER;
  const watts = Number(value);
  return Number.isFinite(watts)
    ? `${(watts / 1000).toFixed(1).replace('.', ',')} kW`
    : PLACEHOLDER;
}
function formatPercent(value) {
  if (value == null || value === '') return PLACEHOLDER;
  const percent = Number(value);
  return Number.isFinite(percent) ? `${Math.round(percent)} %` : PLACEHOLDER;
}
function emptySnapshot() {
  return {
    sitio: 'El Arrayán', generacion: PLACEHOLDER, consumo: PLACEHOLDER,
    bateria: PLACEHOLDER, red: PLACEHOLDER, carga: PLACEHOLDER,
    descarga: PLACEHOLDER, pv1: PLACEHOLDER, pv2: PLACEHOLDER,
    generadoHoy: PLACEHOLDER, esperadoHoy: PLACEHOLDER,
    progresoSolar: '0%', progresoSolarValor: 0, tienePronostico: false,
    estado: 'Sin datos', hora: '--:--', origen: 'archivo Mi Solar',
    disponible: false, sampledAt: null
  };
}

/**
 * La API de Alexa usa un token independiente de la sesión web de Mi Solar.
 * Nunca incluir el secreto en el widget APL ni en el frontend.
 */
export function authorizedAlexaWidgetRequest(headers, secret = process.env.ALEXA_WIDGET_TOKEN) {
  const bearer = String(headers?.authorization || '');
  if (!secret || !bearer.startsWith('Bearer ')) return false;
  const provided = bearer.slice(7);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(String(secret), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Lee exclusivamente el archivo ya almacenado. No invoca Tumcapp,
 * evitando tráfico extra hacia el inversor y sus tokens rotativos.
 */
export async function readAlexaWidgetSnapshot({
  deviceSn = process.env.ALEXA_WIDGET_DEVICE_SN,
  lookupSite = findSiteId,
  query = rest,
  now = new Date()
} = {}) {
  if (!/^\d{8,20}$/.test(String(deviceSn || ''))) {
    const error = new Error('Configura ALEXA_WIDGET_DEVICE_SN con el número de serie del inversor.');
    error.status = 503;
    throw error;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.MISOLAR_DB_KEY) {
    const error = new Error('El archivo permanente no está configurado.');
    error.status = 503;
    throw error;
  }
  const siteId = await lookupSite(String(deviceSn));
  if (!siteId) return emptySnapshot();
  const path = `energy_samples?site_id=eq.${encodeURIComponent(siteId)}&select=sample_at,solar_w,pv1_w,pv2_w,load_w,grid_w,battery_soc,battery_charge_w,battery_discharge_w&order=sample_at.desc&limit=1`;
  const rows = await query(path);
  const sample = Array.isArray(rows) ? rows[0] : null;
  if (!sample) return emptySnapshot();
  const dayStart = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const dailyRows = await query(`energy_hourly?site_id=eq.${encodeURIComponent(siteId)}&bucket_at=gte.${encodeURIComponent(`${dayStart}T00:00:00-03:00`)}&select=pv1_w,pv2_w,coverage_hours&order=bucket_at.asc&limit=48`);
  const generatedToday = (Array.isArray(dailyRows) ? dailyRows : []).reduce((total, row) => {
    const hours = Math.max(0, Number(row?.coverage_hours) || 0);
    return total + (Math.max(0, Number(row?.pv1_w) || 0) + Math.max(0, Number(row?.pv2_w) || 0)) * hours / 1000;
  }, 0);
  const sampleMs = Date.parse(sample.sample_at);
  const ageMs = Number.isFinite(sampleMs) ? now.getTime() - sampleMs : Infinity;
  const stale = ageMs < -120000 || ageMs > 15 * 60 * 1000;
  return {
    sitio: 'El Arrayán',
    generacion: formatKw(sample.solar_w),
    pv1: formatKw(sample.pv1_w),
    pv2: formatKw(sample.pv2_w),
    consumo: formatKw(sample.load_w),
    bateria: formatPercent(sample.battery_soc),
    red: formatKw(sample.grid_w),
    carga: formatKw(sample.battery_charge_w),
    descarga: formatKw(sample.battery_discharge_w),
    generadoHoy: `${generatedToday.toFixed(1).replace('.', ',')} kWh`,
    esperadoHoy: PLACEHOLDER,
    progresoSolar: '0%',
    progresoSolarValor: 0,
    tienePronostico: false,
    estado: stale ? 'Dato atrasado' : 'Actualizado',
    hora: Number.isFinite(sampleMs) ? new Intl.DateTimeFormat('es-CL', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(sampleMs)) : '--:--',
    origen: 'archivo Mi Solar',
    disponible: true,
    sampledAt: sample.sample_at
  };
}
