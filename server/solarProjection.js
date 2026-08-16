import { rest } from './archive.js';
import { automationSiteProfile } from './siteProfiles.js';

function chileDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

function chileTime(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function forecastLockDue(now = new Date()) {
  return minutes(chileTime(now)) >= 21 * 60 + 35;
}

function addDays(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function circularDayDistance(a, b) {
  const day = (value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
  };
  const distance = Math.abs(day(a) - day(b));
  return Math.min(distance, 365 - distance);
}

function regression(samples, installedKwp, targetDate) {
  if (samples.length < 3) return { slope: installedKwp * 0.62, intercept: 0, rSquared: 0 };
  const weighted = samples.map((sample) => ({
    ...sample,
    weight: Math.exp(-Math.pow(circularDayDistance(targetDate, sample.date) / 62, 2))
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const meanX = weighted.reduce((sum, item) => sum + item.radiation * item.weight, 0) / totalWeight;
  const meanY = weighted.reduce((sum, item) => sum + item.actual * item.weight, 0) / totalWeight;
  const covariance = weighted.reduce((sum, item) => sum + item.weight * (item.radiation - meanX) * (item.actual - meanY), 0);
  const variance = weighted.reduce((sum, item) => sum + item.weight * Math.pow(item.radiation - meanX, 2), 0);
  const rawSlope = variance > 0.02 ? covariance / variance : median(weighted.map((item) => item.actual / item.radiation));
  const slope = Math.max(installedKwp * 0.18, Math.min(installedKwp * 1.05, rawSlope));
  const intercept = Math.max(-installedKwp * 0.8, Math.min(installedKwp * 0.8, meanY - slope * meanX));
  const residual = weighted.reduce((sum, item) => sum + item.weight * Math.pow(item.actual - (slope * item.radiation + intercept), 2), 0);
  const total = weighted.reduce((sum, item) => sum + item.weight * Math.pow(item.actual - meanY, 2), 0);
  return { slope, intercept, rSquared: total > 0.01 ? Math.max(0, Math.min(1, 1 - residual / total)) : 0 };
}

async function radiation(profile) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(profile.latitude));
  url.searchParams.set('longitude', String(profile.longitude));
  url.searchParams.set('daily', 'shortwave_radiation_sum,weather_code');
  url.searchParams.set('past_days', '60');
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('timezone', 'America/Santiago');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.daily?.time || []).map((date, index) => ({
    date,
    radiation: Number(payload.daily?.shortwave_radiation_sum?.[index] || 0) / 3.6,
    weatherCode: Number(payload.daily?.weather_code?.[index] || 0)
  }));
}

const SEASON_UPPER = {
  arrayan: { winter: 13.4, spring: 44, summer: 80, autumn: 40 },
  'puerto-montt': { winter: 12, spring: 18, summer: 24, autumn: 16 }
};

function season(date) {
  const month = Number(date.slice(5, 7));
  if (month === 12 || month <= 2) return 'summer';
  if (month <= 5) return 'autumn';
  if (month <= 8) return 'winter';
  return 'spring';
}

async function readForecastLock(siteId, targetDate) {
  const rows = await rest(`solar_forecast_locks?site_id=eq.${siteId}&forecast_date=eq.${targetDate}&select=*&limit=1`);
  const row = rows?.[0];
  if (!row) return null;
  return {
    date: row.forecast_date,
    forecastKwh: Number(row.forecast_kwh),
    radiationKwhM2: Number(row.radiation_kwh_m2),
    sampleDays: Number(row.sample_days || 0),
    slope: Number(row.slope || 0),
    intercept: Number(row.intercept || 0),
    rSquared: Number(row.r_squared || 0),
    locked: true,
    lockedAt: row.locked_at
  };
}

async function saveForecastLock(siteId, forecast) {
  await rest('solar_forecast_locks?on_conflict=site_id,forecast_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      site_id: siteId,
      forecast_date: forecast.date,
      forecast_kwh: forecast.forecastKwh,
      radiation_kwh_m2: forecast.radiationKwhM2,
      sample_days: forecast.sampleDays,
      slope: forecast.slope,
      intercept: forecast.intercept,
      r_squared: forecast.rSquared,
      locked_at: new Date().toISOString()
    })
  });
  return readForecastLock(siteId, forecast.date);
}

export async function forecastForDate(deviceSn, targetDate, nowDate = new Date(), options = {}) {
  const profile = automationSiteProfile(deviceSn);
  const siteRows = await rest(`solar_sites?device_sn=eq.${encodeURIComponent(deviceSn)}&select=id&limit=1`);
  if (!siteRows?.[0]?.id) throw new Error('La instalación todavía no existe en el respaldo permanente.');
  const siteId = siteRows[0].id;
  if (targetDate && !options.ignoreLock) {
    const existingLock = await readForecastLock(siteId, targetDate);
    if (existingLock) return { ...existingLock, site: profile };
  }
  const today = chileDate(nowDate);
  const start = addDays(today, -65);
  const [radiationDays, actualRows] = await Promise.all([
    radiation(profile),
    rest(`energy_daily?site_id=eq.${siteRows[0].id}&bucket_at=gte.${start}T00:00:00Z&bucket_at=lt.${today}T00:00:00Z&select=bucket_at,solar_w,samples&order=bucket_at.asc&limit=100`)
  ]);
  const byDate = new Map(radiationDays.map((item) => [item.date, item.radiation]));
  const rawSamples = (actualRows || []).map((row) => {
    const date = String(row.bucket_at).slice(0, 10);
    const radiationValue = byDate.get(date) || 0;
    const actual = Number(row.solar_w || 0) * 24 / 1000;
    return { date, radiation: radiationValue, actual, samples: Number(row.samples || 0), ratio: actual / (profile.installedKwp * (radiationValue || 1)) };
  }).filter((item) => item.samples >= 120 && item.actual > 0.35 && item.radiation > 0.5 && item.ratio > 0.12 && item.ratio < 1.35);
  const center = median(rawSamples.map((item) => item.ratio));
  const mad = median(rawSamples.map((item) => Math.abs(item.ratio - center)));
  const filtered = rawSamples.filter((item) => Math.abs(item.ratio - center) <= Math.max(0.1, mad * 3));
  const samples = filtered.length >= 3 ? filtered : rawSamples;
  if (!targetDate) targetDate = addDays(today, 1);
  if (targetDate < today || targetDate > addDays(today, 2)) throw new Error('La fecha de proyección automática no es válida.');
  const globalCoefficients = regression(samples, profile.installedKwp, today);
  const localCoefficients = regression(samples, profile.installedKwp, targetDate);
  const confidence = Math.min(0.82, 0.48 + samples.length / 55);
  const coefficients = samples.length < 5 ? globalCoefficients : {
    slope: globalCoefficients.slope * (1 - confidence) + localCoefficients.slope * confidence,
    intercept: globalCoefficients.intercept * (1 - confidence) + localCoefficients.intercept * confidence,
    rSquared: localCoefficients.rSquared
  };
  const targetRadiation = byDate.get(targetDate);
  if (!(targetRadiation > 0)) throw new Error('Open-Meteo todavía no entregó la radiación de mañana.');
  const upper = Math.max(SEASON_UPPER[profile.key][season(targetDate)], targetRadiation * profile.installedKwp * 1.05);
  const forecastKwh = Math.max(0, Math.min(upper, coefficients.slope * targetRadiation + coefficients.intercept));
  const result = {
    date: targetDate,
    forecastKwh: Number(forecastKwh.toFixed(2)),
    radiationKwhM2: Number(targetRadiation.toFixed(2)),
    sampleDays: samples.length,
    slope: Number(coefficients.slope.toFixed(3)),
    intercept: Number(coefficients.intercept.toFixed(3)),
    rSquared: Number(coefficients.rSquared.toFixed(3)),
    site: profile,
    locked: false,
    lockedAt: null
  };
  const shouldLock = !options.ignoreLock && targetDate === addDays(today, 1) && forecastLockDue(nowDate);
  if (!shouldLock) return result;
  const locked = await saveForecastLock(siteId, result);
  return locked ? { ...locked, site: profile } : result;
}

async function siteIdForDevice(deviceSn) {
  const rows = await rest(`solar_sites?device_sn=eq.${encodeURIComponent(deviceSn)}&select=id&limit=1`);
  return rows?.[0]?.id || null;
}

export async function listForecastRevisions(deviceSn, dates) {
  const siteId = await siteIdForDevice(deviceSn);
  if (!siteId || !dates?.length) return {};
  const rows = await rest(`solar_forecast_revisions?site_id=eq.${siteId}&forecast_date=in.(${dates.join(',')})&select=forecast_date,forecast_kwh,radiation_kwh_m2,observed_at&order=observed_at.asc&limit=96`) || [];
  return Object.fromEntries(dates.map((date) => [date, rows.filter((row) => row.forecast_date === date).map((row) => ({
    date: row.forecast_date,
    forecastKwh: Number(row.forecast_kwh),
    radiationKwhM2: Number(row.radiation_kwh_m2),
    observedAt: row.observed_at
  }))]));
}

export async function recordForecastRevision(deviceSn, targetDate, nowDate = new Date()) {
  const siteId = await siteIdForDevice(deviceSn);
  if (!siteId || !await readForecastLock(siteId, targetDate)) return { status: 'not-locked', targetDate };
  const latestRows = await rest(`solar_forecast_revisions?site_id=eq.${siteId}&forecast_date=eq.${targetDate}&select=forecast_kwh,radiation_kwh_m2,observed_at&order=observed_at.desc&limit=1`);
  const latest = latestRows?.[0];
  if (latest && nowDate.getTime() - new Date(latest.observed_at).getTime() < 15 * 60 * 1000) return { status: 'too-soon', targetDate };
  const live = await forecastForDate(deviceSn, targetDate, nowDate, { ignoreLock: true });
  if (latest && Number(latest.forecast_kwh) === live.forecastKwh && Number(latest.radiation_kwh_m2) === live.radiationKwhM2) return { status: 'unchanged', targetDate };
  await rest('solar_forecast_revisions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
    site_id: siteId,
    forecast_date: targetDate,
    forecast_kwh: live.forecastKwh,
    radiation_kwh_m2: live.radiationKwhM2,
    observed_at: nowDate.toISOString()
  }) });
  return { status: 'recorded', targetDate, forecastKwh: live.forecastKwh, radiationKwhM2: live.radiationKwhM2 };
}

export async function forecastTomorrow(deviceSn) {
  return forecastForDate(deviceSn, addDays(chileDate(), 1));
}

export async function lockTomorrowForecasts(nowDate = new Date()) {
  const today = chileDate(nowDate);
  const time = chileTime(nowDate);
  const sites = await rest('solar_sites?select=device_sn&order=device_sn.asc');
  const targetDate = addDays(today, 1);
  const results = [];

  if (!forecastLockDue(nowDate)) {
    for (const site of sites || []) {
      try {
        const revision = await recordForecastRevision(site.device_sn, today, nowDate);
        results.push({ deviceSn: site.device_sn, status: revision.status, revisions: [revision] });
      } catch (error) {
        results.push({ deviceSn: site.device_sn, status: 'failed', error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { status: 'before-lock-time', chile: { date: today, time }, targetDate, results };
  }

  for (const site of sites || []) {
    try {
      const projection = await forecastForDate(site.device_sn, targetDate, nowDate);
      const revisions = await Promise.all([
        recordForecastRevision(site.device_sn, today, nowDate),
        recordForecastRevision(site.device_sn, targetDate, nowDate)
      ]);
      results.push({ deviceSn: site.device_sn, status: projection.locked ? 'locked' : 'live', projection, revisions });
    } catch (error) {
      results.push({ deviceSn: site.device_sn, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { status: 'checked', chile: { date: today, time }, targetDate, results };
}
