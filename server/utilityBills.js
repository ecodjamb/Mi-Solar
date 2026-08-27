import { ensureSite, rest } from './archive.js';
import { createHash } from 'node:crypto';
import { forecastRange } from './solarProjection.js';

const SITE_TZ = 'America/Santiago';

export function calculateEnergyRate(energyChargeClp, billedKwh, transportChargeClp = 0) {
  const energy = energyChargeClp == null ? NaN : Number(energyChargeClp);
  const transport = transportChargeClp == null ? 0 : Number(transportChargeClp);
  const consumption = Number(billedKwh);
  return Number.isFinite(energy) && energy >= 0 && Number.isFinite(transport) && transport >= 0 && Number.isFinite(consumption) && consumption > 0
    ? Number(((energy + transport) / consumption).toFixed(2))
    : null;
}

export function billPeriodDays(periodStart, periodEnd) {
  const start = Date.parse(`${periodStart}T00:00:00Z`);
  const end = Date.parse(`${periodEnd}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 86_400_000) + 1 : 0;
}

export function estimateBillConsumption({ reportedKwh, estimatedKwh, amountClp, theoreticalKwh, assumedRateClp = 250 }) {
  const reported = Number(reportedKwh);
  if (Number.isFinite(reported) && reported > 0) return { kwh: reported, status: 'actual', method: 'reported' };
  const extracted = Number(estimatedKwh);
  if (Number.isFinite(extracted) && extracted > 0) return { kwh: extracted, status: 'estimated', method: 'bill-estimate' };
  const amount = Number(amountClp);
  if (Number.isFinite(amount) && amount > 0) return { kwh: Number((amount / assumedRateClp).toFixed(2)), status: 'estimated', method: 'amount-divided-by-250' };
  const theoretical = Number(theoreticalKwh);
  if (Number.isFinite(theoretical) && theoretical > 0) return { kwh: theoretical, status: 'estimated', method: 'misolar-archive' };
  return { kwh: 1, status: 'estimated', method: 'minimum-fallback' };
}

export function projectRemainingGrid({ observedGridKwh, averageDailyLoadKwh, remainingDays, projectedSolarKwh }) {
  const observed = Math.max(0, Number(observedGridKwh) || 0);
  const futureLoad = Math.max(0, Number(averageDailyLoadKwh) || 0) * Math.max(0, Number(remainingDays) || 0);
  const solar = Math.min(futureLoad, Math.max(0, Number(projectedSolarKwh) || 0));
  const futureGrid = Math.max(0, futureLoad - solar);
  return { futureLoadKwh: Number(futureLoad.toFixed(2)), projectedSolarKwh: Number(solar.toFixed(2)), futureGridKwh: Number(futureGrid.toFixed(2)), projectedGridKwh: Number((observed + futureGrid).toFixed(2)) };
}

export function effectiveSolarOffsetFactor({ observedLoadKwh, observedGridKwh, observedSolarKwh }) {
  const solar = Math.max(0, Number(observedSolarKwh) || 0);
  if (solar < 1) return 0.65;
  const suppliedBySystem = Math.max(0, (Number(observedLoadKwh) || 0) - (Number(observedGridKwh) || 0));
  return Number(Math.max(0.2, Math.min(1, suppliedBySystem / solar)).toFixed(3));
}

function dateAdd(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function nextMonthSameDay(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function todayChile(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: SITE_TZ });
}

function chileTime(now = new Date()) {
  return now.toLocaleTimeString('en-GB', { timeZone: SITE_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

function dateDifferenceDays(start, end) {
  const delta = Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`);
  return Number.isFinite(delta) ? Math.round(delta / 86_400_000) : 0;
}

function nextReadingDateFromPeriodEnd(periodEnd) {
  const periodStart = dateAdd(periodEnd, 1);
  return nextMonthSameDay(periodStart);
}

function normalizeReminderSettings(row) {
  return {
    enabled: row?.enabled === true,
    notifyDayBefore: row?.notify_day_before !== false,
    notifySameDay: row?.notify_same_day !== false,
    notificationTimeLocal: String(row?.notification_time_local || '09:00:00').slice(0, 5),
    updatedAt: row?.updated_at || null
  };
}

async function reminderSettingsForSite(siteId) {
  const rows = await rest(`utility_bill_reminder_settings?site_id=eq.${siteId}&select=*&limit=1`) || [];
  if (rows[0]) return rows[0];
  const created = await rest('utility_bill_reminder_settings', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId })
  });
  return created?.[0] || { site_id: siteId, enabled: false, notify_day_before: true, notify_same_day: true, notification_time_local: '09:00:00' };
}

export function calculateUtilityReminderSchedule(settings, nextReadingDate, now = new Date()) {
  const today = todayChile(now);
  const time = settings.notificationTimeLocal || '09:00';
  const candidates = [];
  if (settings.notifyDayBefore) candidates.push({ kind: 'day-before', date: dateAdd(nextReadingDate, -1), label: 'Día anterior' });
  if (settings.notifySameDay) candidates.push({ kind: 'same-day', date: nextReadingDate, label: 'Mismo día' });
  const pending = candidates.filter((item) => item.date > today || (item.date === today && chileTime(now) < time));
  const next = pending.sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  return {
    nextReadingDate,
    daysRemaining: Math.max(0, dateDifferenceDays(today, nextReadingDate)),
    isOverdue: nextReadingDate < today,
    nextNotification: settings.enabled && next ? { ...next, timeLocal: time } : null
  };
}

function billingMonthBounds(periodEnd) {
  const [year, month] = String(periodEnd).split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start, end };
}

function zonedParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function timeZoneOffsetMs(date) {
  const parts = zonedParts(date);
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - date.getTime();
}

function chileMidnightUtc(date) {
  const [year, month, day] = date.split('-').map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day));
  for (let index = 0; index < 2; index += 1) guess = new Date(Date.UTC(year, month - 1, day) - timeZoneOffsetMs(guess));
  return guess.toISOString();
}

async function theoreticalGrid(deviceSn, periodStart, periodEnd) {
  const siteId = await ensureSite(deviceSn);
  const start = chileMidnightUtc(periodStart);
  const end = chileMidnightUtc(dateAdd(periodEnd, 1));
  const rows = await rest(`energy_hourly?site_id=eq.${siteId}&bucket_at=gte.${encodeURIComponent(start)}&bucket_at=lt.${encodeURIComponent(end)}&select=bucket_at,load_w,solar_w,grid_w,grid_active,battery_discharge_w,samples,coverage_hours&order=bucket_at.asc&limit=10000`) || [];
  let gridKwh = 0;
  let loadKwh = 0;
  let solarKwh = 0;
  let coveredHours = 0;
  for (const row of rows) {
    const coverage = Math.max(0, Math.min(1, Number(row.coverage_hours || 0)));
    const load = Math.max(0, Number(row.load_w || 0));
    const battery = Math.min(load, Math.max(0, Number(row.battery_discharge_w || 0)));
    const grid = row.grid_active ? Math.max(0, Number(row.grid_w || 0)) : 0;
    gridKwh += Math.min(Math.max(0, load - battery), grid) * coverage / 1000;
    loadKwh += load * coverage / 1000;
    solarKwh += Math.max(0, Number(row.solar_w || 0)) * coverage / 1000;
    coveredHours += coverage;
  }
  const expectedHours = Math.max(1, (Date.parse(end) - Date.parse(start)) / 3_600_000);
  return {
    kwh: Number(gridKwh.toFixed(3)),
    loadKwh: Number(loadKwh.toFixed(3)),
    solarKwh: Number(solarKwh.toFixed(3)),
    coveragePct: Number(Math.min(100, coveredHours / expectedHours * 100).toFixed(1)),
    coveredHours: Number(coveredHours.toFixed(3)),
    expectedHours,
    lastSampleAt: rows.at(-1)?.bucket_at || null,
    lastCoverageHours: Number(Math.max(0, Math.min(1, Number(rows.at(-1)?.coverage_hours || 0))).toFixed(3))
  };
}

function normalize(row, theoretical = null, documents = []) {
  const reportedKwh = row.reported_kwh == null && row.billed_kwh == null ? null : Number(row.reported_kwh ?? row.billed_kwh);
  const estimatedKwh = row.estimated_kwh == null ? null : Number(row.estimated_kwh);
  const billedKwh = reportedKwh && reportedKwh > 0 ? reportedKwh : Math.max(0, estimatedKwh || 0);
  const amountClp = Number(row.amount_clp || 0);
  const energyChargeClp = row.energy_charge_clp == null ? null : Number(row.energy_charge_clp);
  const transportChargeClp = row.transport_charge_clp == null ? null : Number(row.transport_charge_clp);
  const theoreticalGridKwh = theoretical?.kwh ?? Number(row.theoretical_grid_kwh || 0);
  const periodDays = Number(row.period_days || billPeriodDays(row.period_start, row.period_end));
  const consumptionStatus = reportedKwh && reportedKwh > 0 ? (row.consumption_status === 'estimated' ? 'estimated' : 'actual') : 'estimated';
  const classifiedRate = calculateEnergyRate(energyChargeClp, billedKwh, transportChargeClp);
  const fallbackRate = billedKwh > 0 && amountClp > 0 ? Number((amountClp / billedKwh).toFixed(2)) : null;
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    previousReading: row.previous_reading == null ? null : Number(row.previous_reading),
    currentReading: row.current_reading == null ? null : Number(row.current_reading),
    billedKwh,
    reportedKwh,
    estimatedKwh,
    consumptionStatus,
    isEstimated: consumptionStatus !== 'actual',
    estimateMethod: row.estimate_method || (consumptionStatus === 'actual' ? 'reported' : 'unknown'),
    periodDays,
    averageDailyKwh: periodDays > 0 && billedKwh > 0 ? Number((billedKwh / periodDays).toFixed(3)) : null,
    amountClp,
    rateBaseClp: energyChargeClp == null && transportChargeClp == null ? null : Number(energyChargeClp || 0) + Number(transportChargeClp || 0),
    effectiveRateClp: classifiedRate ?? fallbackRate,
    rateMethod: row.rate_method || (classifiedRate != null ? 'energy-transport' : fallbackRate != null ? 'total-amount' : 'unavailable'),
    theoreticalGridKwh,
    archiveCoveragePct: theoretical?.coveragePct ?? Number(row.archive_coverage_pct || 0),
    differenceKwh: Number((billedKwh - theoreticalGridKwh).toFixed(3)),
    misolarProjection: row.misolar_projection && typeof row.misolar_projection === 'object' ? row.misolar_projection : null,
    meterProjection: row.meter_projection && typeof row.meter_projection === 'object' ? row.meter_projection : null,
    projectionSnapshotAt: row.projection_snapshot_at || null,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    customerNumber: row.customer_number,
    meterNumber: row.meter_number,
    tariffName: row.tariff_name,
    invoiceNumber: row.invoice_number,
    serviceAddress: row.service_address,
    fixedChargeClp: row.fixed_charge_clp == null ? null : Number(row.fixed_charge_clp),
    energyChargeClp,
    transportChargeClp,
    otherChargesClp: row.other_charges_clp == null ? null : Number(row.other_charges_clp),
    taxesClp: row.taxes_clp == null ? null : Number(row.taxes_clp),
    chargeItems: Array.isArray(row.charge_items) ? row.charge_items : [],
    source: row.source || 'manual',
    aiConfidence: row.ai_confidence == null ? null : Number(row.ai_confidence),
    documentCount: documents.length,
    documents: documents.map((document) => ({ id: Number(document.id), pageNumber: Number(document.page_number), originalName: document.original_name, mimeType: document.mime_type, bytes: Number(document.bytes || 0) })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listUtilityBills(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`utility_bills?site_id=eq.${siteId}&select=*&order=period_end.desc,created_at.desc`) || [];
  const ids = rows.map((row) => row.id);
  const documents = ids.length ? await rest(`utility_bill_documents?bill_id=in.(${ids.join(',')})&select=id,bill_id,page_number,original_name,mime_type,bytes&order=page_number.asc`) || [] : [];
  return rows.map((row) => normalize(row, null, documents.filter((document) => document.bill_id === row.id)));
}

function normalizeUtilityMeterReading(row) {
  return {
    id: Number(row.id), periodStart: row.period_start, periodEnd: row.period_end,
    openingReadingKwh: Number(row.opening_reading_kwh), readingAt: row.reading_at,
    readingKwh: Number(row.reading_kwh), notes: row.notes || null, source: row.source || 'manual'
  };
}

export function calculateUtilityMeterProjection({ periodStart, periodEnd, openingReadingKwh, readings = [], unitRateClp = 250 }) {
  const ordered = [...readings].sort((a, b) => String(b.readingAt).localeCompare(String(a.readingAt)));
  const latest = ordered[0] || null;
  const latestDate = latest ? new Date(latest.readingAt).toLocaleDateString('en-CA', { timeZone: SITE_TZ }) : periodStart;
  const elapsedDays = Math.max(0, dateDifferenceDays(periodStart, latestDate));
  const totalDays = Math.max(1, dateDifferenceDays(periodStart, periodEnd));
  const consumedKwh = latest ? Math.max(0, Number(latest.readingKwh) - Number(openingReadingKwh)) : 0;
  const averageDailyKwh = elapsedDays > 0 ? consumedKwh / elapsedDays : 0;
  const projectedKwh = Math.max(consumedKwh, averageDailyKwh * totalDays);
  return {
    periodStart, periodEnd, openingReadingKwh: Number(openingReadingKwh), latestReadingKwh: latest?.readingKwh ?? null,
    latestReadingAt: latest?.readingAt || null, consumedKwh: Number(consumedKwh.toFixed(3)), elapsedDays, totalDays,
    averageDailyKwh: Number(averageDailyKwh.toFixed(3)), projectedKwh: Number(projectedKwh.toFixed(2)),
    projectedAmountClp: Math.round(projectedKwh * unitRateClp), unitRateClp
  };
}

export async function utilityMeterTracking(deviceSn, bills = null) {
  const siteId = await ensureSite(deviceSn);
  const list = bills || await listUtilityBills(deviceSn);
  const latestBill = list[0];
  if (!latestBill?.currentReading || !latestBill.periodEnd) return null;
  const periodStart = dateAdd(latestBill.periodEnd, 1);
  const periodEnd = nextMonthSameDay(periodStart);
  const rows = await rest(`utility_meter_readings?site_id=eq.${siteId}&period_start=eq.${periodStart}&period_end=eq.${periodEnd}&select=*&order=reading_at.desc&limit=300`) || [];
  const readings = rows.map(normalizeUtilityMeterReading);
  return {
    periodStart, periodEnd, openingReadingKwh: latestBill.currentReading, readings,
    projection: calculateUtilityMeterProjection({ periodStart, periodEnd, openingReadingKwh: latestBill.currentReading, readings })
  };
}

export async function saveUtilityMeterReading(deviceSn, input) {
  const siteId = await ensureSite(deviceSn);
  const bills = await listUtilityBills(deviceSn);
  const tracking = await utilityMeterTracking(deviceSn, bills);
  if (!tracking) throw Object.assign(new Error('La última cuenta no tiene una lectura actual para iniciar el período.'), { status: 409 });
  const readingKwh = Number(input.readingKwh);
  if (!Number.isFinite(readingKwh) || readingKwh < tracking.openingReadingKwh) throw Object.assign(new Error(`La lectura debe ser igual o mayor a ${tracking.openingReadingKwh.toLocaleString('es-CL')} kWh.`), { status: 400 });
  const readingAt = input.readingAt && Number.isFinite(Date.parse(input.readingAt)) ? new Date(input.readingAt).toISOString() : new Date().toISOString();
  const rows = await rest('utility_meter_readings', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      site_id: siteId, period_start: tracking.periodStart, period_end: tracking.periodEnd,
      opening_reading_kwh: tracking.openingReadingKwh, reading_at: readingAt,
      reading_kwh: Number(readingKwh.toFixed(3)), notes: String(input.notes || '').trim().slice(0, 500) || null, source: 'manual'
    })
  });
  return { reading: normalizeUtilityMeterReading(rows[0]), tracking: await utilityMeterTracking(deviceSn, bills) };
}

export async function utilityBillReminder(deviceSn, now = new Date()) {
  const siteId = await ensureSite(deviceSn);
  const [settingsRow, latestRows] = await Promise.all([
    reminderSettingsForSite(siteId),
    rest(`utility_bills?site_id=eq.${siteId}&select=period_end&order=period_end.desc,created_at.desc&limit=1`)
  ]);
  const settings = normalizeReminderSettings(settingsRow);
  const latestPeriodEnd = latestRows?.[0]?.period_end || null;
  if (!latestPeriodEnd) return { settings, schedule: null };
  return { settings, schedule: calculateUtilityReminderSchedule(settings, nextReadingDateFromPeriodEnd(latestPeriodEnd), now) };
}

export async function updateUtilityBillReminder(deviceSn, patch) {
  const siteId = await ensureSite(deviceSn);
  const current = await reminderSettingsForSite(siteId);
  const requestedTime = String(patch.notificationTimeLocal || '');
  const body = {
    site_id: siteId,
    enabled: patch.enabled ?? current.enabled ?? false,
    notify_day_before: patch.notifyDayBefore ?? current.notify_day_before ?? true,
    notify_same_day: patch.notifySameDay ?? current.notify_same_day ?? true,
    notification_time_local: /^\d{2}:\d{2}$/.test(requestedTime) ? `${requestedTime}:00` : current.notification_time_local || '09:00:00',
    updated_at: new Date().toISOString()
  };
  if (!body.notify_day_before && !body.notify_same_day) body.enabled = false;
  const rows = await rest('utility_bill_reminder_settings?on_conflict=site_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body)
  });
  const settings = normalizeReminderSettings(rows?.[0] || body);
  const latestRows = await rest(`utility_bills?site_id=eq.${siteId}&select=period_end&order=period_end.desc,created_at.desc&limit=1`) || [];
  const schedule = latestRows[0] ? calculateUtilityReminderSchedule(settings, nextReadingDateFromPeriodEnd(latestRows[0].period_end)) : null;
  return { settings, schedule };
}

export async function listDueUtilityBillReminders(now = new Date()) {
  const today = todayChile(now);
  const localTime = chileTime(now);
  const settingsRows = await rest('utility_bill_reminder_settings?enabled=eq.true&select=site_id,notify_day_before,notify_same_day,notification_time_local') || [];
  const due = [];
  for (const setting of settingsRows) {
    if (localTime < String(setting.notification_time_local || '09:00').slice(0, 5)) continue;
    const latestRows = await rest(`utility_bills?site_id=eq.${setting.site_id}&select=period_end&order=period_end.desc,created_at.desc&limit=1`) || [];
    if (!latestRows[0]) continue;
    const nextReadingDate = nextReadingDateFromPeriodEnd(latestRows[0].period_end);
    if (setting.notify_day_before !== false && today === dateAdd(nextReadingDate, -1)) due.push({ siteId: Number(setting.site_id), nextReadingDate, kind: 'day-before' });
    if (setting.notify_same_day !== false && today === nextReadingDate) due.push({ siteId: Number(setting.site_id), nextReadingDate, kind: 'same-day' });
  }
  return due;
}

export async function projectUtilityBill(deviceSn, bills = null, unitRateClp = 250) {
  const list = bills || await listUtilityBills(deviceSn);
  const latest = list[0];
  if (!latest) return null;
  const periodStart = dateAdd(latest.periodEnd, 1);
  const periodEnd = nextMonthSameDay(periodStart);
  const today = todayChile();
  if (periodStart > today) return null;
  const observedThrough = today < periodEnd ? today : periodEnd;
  const [observed, observedToday] = await Promise.all([theoreticalGrid(deviceSn, periodStart, observedThrough), theoreticalGrid(deviceSn, observedThrough, observedThrough)]);
  const periodStartMs = Date.parse(chileMidnightUtc(periodStart));
  const periodEndMs = Date.parse(chileMidnightUtc(dateAdd(periodEnd, 1)));
  const totalHours = Math.max(1, (periodEndMs - periodStartMs) / 3_600_000);
  const lastSampleMs = observed.lastSampleAt ? Date.parse(observed.lastSampleAt) : periodStartMs;
  const elapsedHours = Math.max(0, Math.min(totalHours, (lastSampleMs - periodStartMs) / 3_600_000 + observed.lastCoverageHours));
  const remainingDays = Math.max(0, (totalHours - elapsedHours) / 24);
  const averageDailyLoadKwh = observed.coveredHours > 0 ? observed.loadKwh / observed.coveredHours * 24 : 0;
  let futureForecasts = [];
  try { futureForecasts = await forecastRange(deviceSn, observedThrough, periodEnd); } catch { futureForecasts = []; }
  const availableForecastKwh = futureForecasts.reduce((sum, item) => sum + Math.max(0, Number(item.forecastKwh || 0) - (item.date === observedThrough ? observedToday.solarKwh : 0)), 0);
  const uncoveredDays = Math.max(0, Math.ceil(remainingDays) - futureForecasts.length);
  const averageForecastKwh = futureForecasts.length ? futureForecasts.reduce((sum, item) => sum + Number(item.forecastKwh || 0), 0) / futureForecasts.length : (observed.coveredHours > 0 ? observed.solarKwh / observed.coveredHours * 24 : 0);
  const grossProjectedFutureSolarKwh = availableForecastKwh + averageForecastKwh * uncoveredDays;
  const solarOffsetFactor = effectiveSolarOffsetFactor({ observedLoadKwh: observed.loadKwh, observedGridKwh: observed.kwh, observedSolarKwh: observed.solarKwh });
  const effectiveProjectedSolarKwh = grossProjectedFutureSolarKwh * solarOffsetFactor;
  const projection = projectRemainingGrid({ observedGridKwh: observed.kwh, averageDailyLoadKwh, remainingDays, projectedSolarKwh: effectiveProjectedSolarKwh });
  return {
    periodStart,
    periodEnd,
    observedThrough,
    observedGridKwh: observed.kwh,
    observedLoadKwh: observed.loadKwh,
    averageDailyLoadKwh: Number(averageDailyLoadKwh.toFixed(2)),
    remainingDays: Number(remainingDays.toFixed(2)),
    projectedFutureLoadKwh: projection.futureLoadKwh,
    projectedFutureSolarKwh: projection.projectedSolarKwh,
    grossProjectedFutureSolarKwh: Number(grossProjectedFutureSolarKwh.toFixed(2)),
    solarOffsetFactor,
    projectedFutureGridKwh: projection.futureGridKwh,
    forecastDays: futureForecasts.length,
    projectedGridKwh: projection.projectedGridKwh,
    projectedAmountClp: Math.round(projection.projectedGridKwh * unitRateClp),
    unitRateClp,
    archiveCoveragePct: observed.coveragePct,
    coveredHours: observed.coveredHours,
    lastDataAt: observed.lastSampleAt,
    calculatedAt: new Date().toISOString()
  };
}

function projectionMatchesPeriod(projection, periodStart, periodEnd) {
  return projection?.periodStart === periodStart && projection?.periodEnd === periodEnd;
}

export async function captureUtilityProjectionSnapshots(deviceSn, projection, meterTracking) {
  const siteId = await ensureSite(deviceSn);
  const snapshotDate = todayChile();
  const entries = [];
  if (projection?.projectedGridKwh != null) entries.push({
    site_id: siteId, period_start: projection.periodStart, period_end: projection.periodEnd, snapshot_date: snapshotDate,
    source: 'misolar', projected_kwh: projection.projectedGridKwh, projected_amount_clp: projection.projectedAmountClp,
    calculated_at: projection.calculatedAt || new Date().toISOString(), payload: projection
  });
  const meter = meterTracking?.projection;
  if (meter?.latestReadingKwh != null) entries.push({
    site_id: siteId, period_start: meterTracking.periodStart, period_end: meterTracking.periodEnd, snapshot_date: snapshotDate,
    source: 'meter', projected_kwh: meter.projectedKwh, projected_amount_clp: meter.projectedAmountClp,
    calculated_at: meter.latestReadingAt || new Date().toISOString(), payload: { ...meter, periodStart: meterTracking.periodStart, periodEnd: meterTracking.periodEnd }
  });
  for (const entry of entries) await rest('utility_projection_snapshots?on_conflict=site_id,period_start,period_end,snapshot_date,source', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(entry)
  });
  return entries.length;
}

export async function readUtilityBillDocument(deviceSn, documentId) {
  const siteId = await ensureSite(deviceSn);
  const documents = await rest(`utility_bill_documents?id=eq.${Number(documentId)}&select=id,bill_id,storage_path,original_name,mime_type&limit=1`) || [];
  const document = documents[0];
  if (!document) throw Object.assign(new Error('La fotografía de la cuenta no existe.'), { status: 404 });
  const bills = await rest(`utility_bills?id=eq.${document.bill_id}&site_id=eq.${siteId}&select=id&limit=1`) || [];
  if (!bills[0]) throw Object.assign(new Error('La fotografía no pertenece a esta instalación.'), { status: 404 });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const appKey = process.env.MISOLAR_DB_KEY;
  if (!url || !key || !appKey) throw Object.assign(new Error('El almacenamiento privado no está configurado.'), { status: 503 });
  const storagePath = String(document.storage_path).split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${url}/storage/v1/object/utility-bill-pages/${storagePath}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey }
  });
  if (!response.ok) throw Object.assign(new Error('No fue posible abrir la fotografía respaldada.'), { status: response.status === 404 ? 404 : 502 });
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: document.mime_type || response.headers.get('content-type') || 'image/jpeg',
    originalName: document.original_name || `cuenta-${document.id}.jpg`
  };
}

async function uploadDocument(siteId, billId, image, pageNumber) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const appKey = process.env.MISOLAR_DB_KEY;
  if (!url || !key || !appKey) throw new Error('El almacenamiento privado no está configurado.');
  const match = image.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Formato de fotografía no válido.');
  const buffer = Buffer.from(match[2], 'base64');
  const hash = createHash('sha256').update(buffer).digest('hex');
  const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `${siteId}/${billId}/pagina-${pageNumber}-${hash.slice(0, 12)}.${extension}`;
  const response = await fetch(`${url}/storage/v1/object/utility-bill-pages/${storagePath}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey, 'Content-Type': match[1], 'x-upsert': 'true' },
    body: buffer
  });
  if (!response.ok) throw new Error(`No fue posible respaldar la página ${pageNumber}: ${(await response.text()).slice(0, 140)}`);
  return { storagePath, hash, mimeType: match[1], bytes: buffer.length, originalName: String(image.name || `pagina-${pageNumber}.${extension}`).slice(0, 180) };
}

async function removeStoredDocuments(paths) {
  if (!paths.length) return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const appKey = process.env.MISOLAR_DB_KEY;
  if (!url || !key || !appKey) throw new Error('El almacenamiento privado no está configurado.');
  const response = await fetch(`${url}/storage/v1/object/utility-bill-pages`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths })
  });
  if (!response.ok && response.status !== 404) throw new Error(`No fue posible borrar las fotografías de la cuenta: ${(await response.text()).slice(0, 140)}`);
}

export async function deleteUtilityBill(deviceSn, billId) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`utility_bills?id=eq.${Number(billId)}&site_id=eq.${siteId}&select=id,period_start,period_end&limit=1`) || [];
  const bill = rows[0];
  if (!bill) throw Object.assign(new Error('La cuenta que intentas borrar no existe.'), { status: 404 });
  const documents = await rest(`utility_bill_documents?bill_id=eq.${bill.id}&select=storage_path`) || [];
  await removeStoredDocuments(documents.map((document) => document.storage_path).filter(Boolean));
  await rest(`utility_bills?id=eq.${bill.id}&site_id=eq.${siteId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return { id: Number(bill.id), periodStart: bill.period_start, periodEnd: bill.period_end };
}

async function removeOlderBillsForMonth(deviceSn, siteId, savedId, periodEnd) {
  const bounds = billingMonthBounds(periodEnd);
  const duplicates = await rest(`utility_bills?site_id=eq.${siteId}&id=neq.${Number(savedId)}&period_end=gte.${bounds.start}&period_end=lt.${bounds.end}&select=id&order=created_at.desc`) || [];
  const removed = [];
  for (const duplicate of duplicates) removed.push(await deleteUtilityBill(deviceSn, duplicate.id));
  return removed;
}

export async function saveUtilityBill(deviceSn, bill, images = [], ai = null) {
  const siteId = await ensureSite(deviceSn);
  const priorBills = await listUtilityBills(deviceSn);
  const [currentProjection, currentMeterTracking] = await Promise.all([
    projectUtilityBill(deviceSn, priorBills), utilityMeterTracking(deviceSn, priorBills)
  ]);
  await captureUtilityProjectionSnapshots(deviceSn, currentProjection, currentMeterTracking);
  const existingBill = priorBills.find((item) => item.periodStart === bill.periodStart && item.periodEnd === bill.periodEnd);
  const frozenMisolarProjection = projectionMatchesPeriod(currentProjection, bill.periodStart, bill.periodEnd) ? currentProjection : existingBill?.misolarProjection || null;
  const frozenMeterProjection = projectionMatchesPeriod(currentMeterTracking, bill.periodStart, bill.periodEnd)
    ? { ...currentMeterTracking.projection, periodStart: currentMeterTracking.periodStart, periodEnd: currentMeterTracking.periodEnd }
    : existingBill?.meterProjection || null;
  const projectionSnapshotAt = frozenMisolarProjection || frozenMeterProjection ? existingBill?.projectionSnapshotAt || new Date().toISOString() : null;
  const theoretical = await theoreticalGrid(deviceSn, bill.periodStart, bill.periodEnd);
  const readingKwh = bill.previousReading != null && bill.currentReading != null ? Math.max(0, Number(bill.currentReading) - Number(bill.previousReading)) : null;
  const reportedKwh = Number(bill.billedKwh) > 0 ? Number(bill.billedKwh) : readingKwh && readingKwh > 0 ? readingKwh : null;
  const actualReportedKwh = reportedKwh != null && !bill.consumptionIsEstimated ? reportedKwh : null;
  const providedEstimate = bill.consumptionIsEstimated && reportedKwh != null ? reportedKwh : bill.estimatedKwh;
  const consumption = estimateBillConsumption({ reportedKwh: actualReportedKwh, estimatedKwh: providedEstimate, amountClp: bill.amountClp, theoreticalKwh: theoretical.kwh });
  const estimatedKwh = consumption.status === 'estimated' ? consumption.kwh : null;
  const consumptionStatus = actualReportedKwh != null ? 'actual' : 'estimated';
  const transportFromItems = (bill.chargeItems || []).filter((item) => item.category === 'transport').reduce((sum, item) => sum + Math.max(0, Number(item.amountClp || 0)), 0);
  const transportChargeClp = bill.transportChargeClp == null ? (transportFromItems || null) : Number(bill.transportChargeClp);
  const rateMethod = bill.energyChargeClp != null ? 'energy-transport' : Number(bill.amountClp) > 0 ? 'total-amount' : 'unavailable';
  const rows = await rest('utility_bills?on_conflict=site_id,period_start,period_end', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      site_id: siteId,
      period_start: bill.periodStart,
      period_end: bill.periodEnd,
      previous_reading: bill.previousReading,
      current_reading: bill.currentReading,
      reported_kwh: actualReportedKwh,
      estimated_kwh: estimatedKwh,
      consumption_status: consumptionStatus,
      estimate_method: consumptionStatus === 'actual' ? 'reported' : consumption.method,
      estimated_unit_rate_clp: 250,
      rate_method: rateMethod,
      amount_clp: bill.amountClp,
      issue_date: bill.issueDate || null,
      due_date: bill.dueDate || null,
      customer_number: bill.customerNumber || null,
      meter_number: bill.meterNumber || null,
      tariff_name: bill.tariffName || null,
      invoice_number: bill.invoiceNumber || null,
      service_address: bill.serviceAddress || null,
      fixed_charge_clp: bill.fixedChargeClp,
      energy_charge_clp: bill.energyChargeClp,
      transport_charge_clp: transportChargeClp,
      other_charges_clp: bill.otherChargesClp,
      taxes_clp: bill.taxesClp,
      charge_items: bill.chargeItems || [],
      source: images.length ? 'photo-ai' : 'manual',
      ai_extraction: ai?.extracted || {},
      ai_confidence: ai?.confidence ?? null,
      ai_model: ai?.model || null,
      theoretical_grid_kwh: theoretical.kwh,
      archive_coverage_pct: theoretical.coveragePct,
      misolar_projection: frozenMisolarProjection || {},
      meter_projection: frozenMeterProjection || {},
      projection_snapshot_at: projectionSnapshotAt,
      updated_at: new Date().toISOString()
    })
  });
  const saved = rows?.[0] || {};
  const documents = [];
  const documentWarnings = [];
  for (let index = 0; index < images.length; index += 1) {
    try {
      const uploaded = await uploadDocument(siteId, saved.id, images[index], index + 1);
      const documentRows = await rest('utility_bill_documents?on_conflict=bill_id,page_number', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ bill_id: saved.id, page_number: index + 1, storage_path: uploaded.storagePath, original_name: uploaded.originalName, mime_type: uploaded.mimeType, bytes: uploaded.bytes, sha256: uploaded.hash })
      });
      if (documentRows?.[0]) documents.push(documentRows[0]);
    } catch (error) {
      documentWarnings.push(`La cuenta quedó guardada, pero la página ${index + 1} quedó pendiente: ${error instanceof Error ? error.message : 'error de almacenamiento'}.`);
    }
  }
  try {
    const replaced = await removeOlderBillsForMonth(deviceSn, siteId, saved.id, bill.periodEnd);
    if (replaced.length) documentWarnings.push(`${replaced.length} cuenta anterior del mismo mes fue reemplazada por esta carga.`);
  } catch (error) {
    documentWarnings.push(`La cuenta nueva quedó guardada, pero no fue posible retirar una versión anterior: ${error instanceof Error ? error.message : 'error desconocido'}.`);
  }
  return { ...normalize(saved, theoretical, documents), documentWarnings };
}

export async function updateUtilityBill(deviceSn, billId, bill) {
  const siteId = await ensureSite(deviceSn);
  const existingRows = await rest(`utility_bills?id=eq.${Number(billId)}&site_id=eq.${siteId}&select=*&limit=1`) || [];
  const existing = existingRows[0];
  if (!existing) throw Object.assign(new Error('La cuenta que intentas editar no existe.'), { statusCode: 404 });

  const theoretical = await theoreticalGrid(deviceSn, bill.periodStart, bill.periodEnd);
  const readingKwh = bill.previousReading != null && bill.currentReading != null
    ? Math.max(0, Number(bill.currentReading) - Number(bill.previousReading))
    : null;
  const enteredKwh = Number(bill.billedKwh) > 0 ? Number(bill.billedKwh) : readingKwh && readingKwh > 0 ? readingKwh : null;
  const consumption = estimateBillConsumption({
    reportedKwh: bill.consumptionStatus === 'actual' ? enteredKwh : null,
    estimatedKwh: bill.consumptionStatus === 'estimated' ? enteredKwh : null,
    amountClp: bill.amountClp,
    theoreticalKwh: theoretical.kwh
  });
  const actual = bill.consumptionStatus === 'actual';
  const aiExtraction = existing.ai_extraction && typeof existing.ai_extraction === 'object' ? existing.ai_extraction : {};
  const rows = await rest(`utility_bills?id=eq.${Number(billId)}&site_id=eq.${siteId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      period_start: bill.periodStart,
      period_end: bill.periodEnd,
      previous_reading: bill.previousReading,
      current_reading: bill.currentReading,
      reported_kwh: actual ? consumption.kwh : null,
      estimated_kwh: actual ? null : consumption.kwh,
      consumption_status: actual ? 'actual' : 'estimated',
      estimate_method: actual ? 'reported' : consumption.method,
      amount_clp: bill.amountClp,
      issue_date: bill.issueDate || null,
      due_date: bill.dueDate || null,
      customer_number: bill.customerNumber || null,
      meter_number: bill.meterNumber || null,
      tariff_name: bill.tariffName || null,
      invoice_number: bill.invoiceNumber || null,
      service_address: bill.serviceAddress || null,
      fixed_charge_clp: bill.fixedChargeClp,
      energy_charge_clp: bill.energyChargeClp,
      transport_charge_clp: bill.transportChargeClp,
      other_charges_clp: bill.otherChargesClp,
      taxes_clp: bill.taxesClp,
      rate_method: bill.energyChargeClp != null ? 'energy-transport' : Number(bill.amountClp) > 0 ? 'total-amount' : 'unavailable',
      theoretical_grid_kwh: theoretical.kwh,
      archive_coverage_pct: theoretical.coveragePct,
      ai_extraction: { ...aiExtraction, periodStart: bill.periodStart, periodEnd: bill.periodEnd, manuallyCorrectedAt: new Date().toISOString() },
      updated_at: new Date().toISOString()
    })
  });
  const documents = await rest(`utility_bill_documents?bill_id=eq.${Number(billId)}&select=id,bill_id,page_number,original_name,mime_type,bytes&order=page_number.asc`) || [];
  return normalize(rows?.[0] || existing, theoretical, documents);
}
