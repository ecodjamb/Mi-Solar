import { ensureSite, rest } from './archive.js';

const SITE_TZ = 'America/Santiago';

function dateAdd(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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
  const rows = await rest(`energy_hourly?site_id=eq.${siteId}&bucket_at=gte.${encodeURIComponent(start)}&bucket_at=lt.${encodeURIComponent(end)}&select=load_w,grid_w,grid_active,battery_discharge_w,samples&order=bucket_at.asc&limit=10000`) || [];
  let gridKwh = 0;
  let receivedSamples = 0;
  for (const row of rows) {
    const samples = Math.max(0, Number(row.samples || 0));
    const coverage = Math.min(1, Math.max(1, samples) / 12);
    const load = Math.max(0, Number(row.load_w || 0));
    const battery = Math.min(load, Math.max(0, Number(row.battery_discharge_w || 0)));
    const grid = row.grid_active ? Math.max(0, Number(row.grid_w || 0)) : 0;
    gridKwh += Math.min(Math.max(0, load - battery), grid) * coverage / 1000;
    receivedSamples += samples;
  }
  const expectedHours = Math.max(1, (Date.parse(end) - Date.parse(start)) / 3_600_000);
  return {
    kwh: Number(gridKwh.toFixed(3)),
    coveragePct: Number(Math.min(100, receivedSamples / (expectedHours * 12) * 100).toFixed(1))
  };
}

function normalize(row, theoretical = null) {
  const billedKwh = Number(row.billed_kwh || 0);
  const amountClp = Number(row.amount_clp || 0);
  const theoreticalGridKwh = theoretical?.kwh ?? Number(row.theoretical_grid_kwh || 0);
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    previousReading: Number(row.previous_reading || 0),
    currentReading: Number(row.current_reading || 0),
    billedKwh,
    amountClp,
    effectiveRateClp: billedKwh > 0 ? Number((amountClp / billedKwh).toFixed(2)) : 0,
    theoreticalGridKwh,
    archiveCoveragePct: theoretical?.coveragePct ?? Number(row.archive_coverage_pct || 0),
    differenceKwh: Number((billedKwh - theoreticalGridKwh).toFixed(3)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listUtilityBills(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`utility_bills?site_id=eq.${siteId}&select=*&order=period_end.desc,created_at.desc`) || [];
  return Promise.all(rows.map(async (row) => normalize(row, await theoreticalGrid(deviceSn, row.period_start, row.period_end))));
}

export async function saveUtilityBill(deviceSn, bill) {
  const siteId = await ensureSite(deviceSn);
  const theoretical = await theoreticalGrid(deviceSn, bill.periodStart, bill.periodEnd);
  const rows = await rest('utility_bills?on_conflict=site_id,period_start,period_end', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      site_id: siteId,
      period_start: bill.periodStart,
      period_end: bill.periodEnd,
      previous_reading: bill.previousReading,
      current_reading: bill.currentReading,
      amount_clp: bill.amountClp,
      theoretical_grid_kwh: theoretical.kwh,
      archive_coverage_pct: theoretical.coveragePct,
      updated_at: new Date().toISOString()
    })
  });
  return normalize(rows?.[0] || {}, theoretical);
}
