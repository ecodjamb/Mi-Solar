import { ensureSite, rest } from './archive.js';
import { createHash } from 'node:crypto';

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
  const rows = await rest(`energy_hourly?site_id=eq.${siteId}&bucket_at=gte.${encodeURIComponent(start)}&bucket_at=lt.${encodeURIComponent(end)}&select=load_w,grid_w,grid_active,battery_discharge_w,samples,coverage_hours&order=bucket_at.asc&limit=10000`) || [];
  let gridKwh = 0;
  let coveredHours = 0;
  for (const row of rows) {
    const coverage = Math.max(0, Math.min(1, Number(row.coverage_hours || 0)));
    const load = Math.max(0, Number(row.load_w || 0));
    const battery = Math.min(load, Math.max(0, Number(row.battery_discharge_w || 0)));
    const grid = row.grid_active ? Math.max(0, Number(row.grid_w || 0)) : 0;
    gridKwh += Math.min(Math.max(0, load - battery), grid) * coverage / 1000;
    coveredHours += coverage;
  }
  const expectedHours = Math.max(1, (Date.parse(end) - Date.parse(start)) / 3_600_000);
  return {
    kwh: Number(gridKwh.toFixed(3)),
    coveragePct: Number(Math.min(100, coveredHours / expectedHours * 100).toFixed(1))
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
  const consumptionStatus = reportedKwh && reportedKwh > 0 ? (row.consumption_status === 'estimated' ? 'estimated' : 'actual') : billedKwh > 0 ? 'estimated' : 'pending';
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
    periodDays,
    averageDailyKwh: periodDays > 0 && billedKwh > 0 ? Number((billedKwh / periodDays).toFixed(3)) : null,
    amountClp,
    rateBaseClp: energyChargeClp == null && transportChargeClp == null ? null : Number(energyChargeClp || 0) + Number(transportChargeClp || 0),
    effectiveRateClp: calculateEnergyRate(energyChargeClp, billedKwh, transportChargeClp),
    theoreticalGridKwh,
    archiveCoveragePct: theoretical?.coveragePct ?? Number(row.archive_coverage_pct || 0),
    differenceKwh: Number((billedKwh - theoreticalGridKwh).toFixed(3)),
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
    documents: documents.map((document) => ({ pageNumber: Number(document.page_number), originalName: document.original_name, mimeType: document.mime_type, bytes: Number(document.bytes || 0) })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listUtilityBills(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`utility_bills?site_id=eq.${siteId}&select=*&order=period_end.desc,created_at.desc`) || [];
  const ids = rows.map((row) => row.id);
  const documents = ids.length ? await rest(`utility_bill_documents?bill_id=in.(${ids.join(',')})&select=bill_id,page_number,original_name,mime_type,bytes&order=page_number.asc`) || [] : [];
  return Promise.all(rows.map(async (row) => normalize(row, await theoreticalGrid(deviceSn, row.period_start, row.period_end), documents.filter((document) => document.bill_id === row.id))));
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

export async function saveUtilityBill(deviceSn, bill, images = [], ai = null) {
  const siteId = await ensureSite(deviceSn);
  const theoretical = await theoreticalGrid(deviceSn, bill.periodStart, bill.periodEnd);
  const readingKwh = bill.previousReading != null && bill.currentReading != null ? Math.max(0, Number(bill.currentReading) - Number(bill.previousReading)) : null;
  const reportedKwh = Number(bill.billedKwh) > 0 ? Number(bill.billedKwh) : readingKwh && readingKwh > 0 ? readingKwh : null;
  const extractedEstimate = Number(bill.estimatedKwh) > 0 ? Number(bill.estimatedKwh) : null;
  const estimatedKwh = reportedKwh == null ? (extractedEstimate || (theoretical.kwh > 0 ? theoretical.kwh : null)) : null;
  const consumptionStatus = reportedKwh != null ? (bill.consumptionIsEstimated ? 'estimated' : 'actual') : estimatedKwh != null ? 'estimated' : 'pending';
  const transportFromItems = (bill.chargeItems || []).filter((item) => item.category === 'transport').reduce((sum, item) => sum + Math.max(0, Number(item.amountClp || 0)), 0);
  const transportChargeClp = bill.transportChargeClp == null ? (transportFromItems || null) : Number(bill.transportChargeClp);
  const rows = await rest('utility_bills?on_conflict=site_id,period_start,period_end', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      site_id: siteId,
      period_start: bill.periodStart,
      period_end: bill.periodEnd,
      previous_reading: bill.previousReading,
      current_reading: bill.currentReading,
      reported_kwh: reportedKwh,
      estimated_kwh: estimatedKwh,
      consumption_status: consumptionStatus,
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
  return { ...normalize(saved, theoretical, documents), documentWarnings };
}
