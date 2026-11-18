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
    descarga: PLACEHOLDER, estado: 'Sin datos', hora: '--:--'
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
  const path = `energy_samples?site_id=eq.${encodeURIComponent(siteId)}&select=sample_at,solar_w,load_w,grid_w,battery_soc,battery_charge_w,battery_discharge_w&order=sample_at.desc&limit=1`;
  const rows = await query(path);
  const sample = Array.isArray(rows) ? rows[0] : null;
  if (!sample) return emptySnapshot();
  const sampleMs = Date.parse(sample.sample_at);
  const ageMs = Number.isFinite(sampleMs) ? now.getTime() - sampleMs : Infinity;
  const stale = ageMs < -120000 || ageMs > 15 * 60 * 1000;
  return {
    sitio: 'El Arrayán',
    generacion: formatKw(sample.solar_w),
    consumo: formatKw(sample.load_w),
    bateria: formatPercent(sample.battery_soc),
    red: formatKw(sample.grid_w),
    carga: formatKw(sample.battery_charge_w),
    descarga: formatKw(sample.battery_discharge_w),
    estado: stale ? 'Dato atrasado' : 'Actualizado',
    hora: Number.isFinite(sampleMs) ? new Intl.DateTimeFormat('es-CL', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(sampleMs)) : '--:--'
  };
}
