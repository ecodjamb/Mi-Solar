import { createHash } from 'node:crypto';
import { ensureSite as ensureSolarSite, rest } from './archive.js';

const TZ = 'America/Santiago';
const BUCKET = 'water-cost-documents';
const ARRAYAN_DEVICE_SN = '96342509120972';

async function ensureSite(deviceSn) {
  if (String(deviceSn) !== ARRAYAN_DEVICE_SN) throw Object.assign(new Error('Los costos de agua solo están habilitados para El Arrayán.'), { status: 404 });
  return ensureSolarSite(deviceSn, 'El Arrayán');
}

function todayChile(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: TZ });
}

function dateAdd(value, days) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function periodDays(start, end) {
  const delta = Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`);
  return Number.isFinite(delta) && delta >= 0 ? Math.max(1, Math.round(delta / 86_400_000)) : 1;
}

function billingMonth(value, fallback) {
  const raw = String(value || fallback || '');
  const match = raw.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

function billingDays(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  return year && month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 30;
}

function nullableNumber(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && Number.isFinite(Date.parse(`${value}T12:00:00Z`));
}

export function classifyWaterConsumption(bill, ai = null) {
  const extracted = ai?.extracted && typeof ai.extracted === 'object' && Object.keys(ai.extracted).length ? ai.extracted : null;
  const evidence = extracted || bill || {};
  const periodStart = evidence.periodStart;
  const periodEnd = evidence.periodEnd;
  const previous = nullableNumber(evidence.previousReadingM3);
  const current = nullableNumber(evidence.currentReadingM3);
  const reportedDifference = nullableNumber(evidence.readingDifferenceM3);
  const deductible = Math.max(0, nullableNumber(evidence.deductibleM3) || 0);
  const billed = nullableNumber(evidence.billedM3);
  const hasReadingDates = validIsoDate(periodStart) && validIsoDate(periodEnd) && periodEnd >= periodStart;
  const hasMeterPair = previous != null && current != null && current >= previous;
  const isPhotoExtraction = Boolean(extracted);
  const visibleEvidence = !isPhotoExtraction || (
    evidence.previousReadingVisible === true && evidence.currentReadingVisible === true
    && evidence.previousReadingDateVisible === true && evidence.currentReadingDateVisible === true
    && evidence.readingStatus === 'actual' && evidence.consumptionIsEstimated !== true
  );
  const calculatedDifference = hasMeterPair ? current - previous : null;
  const differenceTolerance = Math.max(0.1, Math.abs(calculatedDifference || 0) * 0.02);
  const differenceMatches = calculatedDifference != null && (reportedDifference == null || Math.abs(reportedDifference - calculatedDifference) <= differenceTolerance);
  const expectedBilled = calculatedDifference == null ? null : Math.max(0, calculatedDifference - deductible);
  const billedTolerance = Math.max(0.25, Math.abs(expectedBilled || 0) * 0.05);
  const billedMatches = expectedBilled != null && (billed == null || Math.abs(billed - expectedBilled) <= billedTolerance);

  if (hasReadingDates && hasMeterPair && visibleEvidence) {
    return {
      status: 'actual',
      method: differenceMatches && billedMatches ? 'actual-readings-verified' : 'actual-readings-reconciled',
      reason: differenceMatches && billedMatches
        ? 'Lecturas anterior y actual fechadas; diferencia y consumo coherentes.'
        : 'Lecturas anterior y actual fechadas; la boleta aplica una conciliación o descuento adicional.',
      evidence: { hasReadingDates, hasMeterPair, differenceMatches, billedMatches }
    };
  }
  const companyEstimate = evidence.consumptionIsEstimated === true || ['estimated','pending','unavailable'].includes(evidence.readingStatus);
  return {
    status: 'estimated',
    method: companyEstimate ? 'company-estimate-no-complete-reading' : 'missing-reading-evidence',
    reason: hasMeterPair ? 'Falta la fecha completa de las lecturas; el consumo se trata como estimado.' : 'No hay dos lecturas fechadas y verificables; el consumo se trata como estimado.',
    evidence: { hasReadingDates, hasMeterPair, differenceMatches, billedMatches }
  };
}

function normalizeDocument(row) {
  return { id: Number(row.id), pageNumber: Number(row.page_number), originalName: row.original_name, mimeType: row.mime_type, bytes: Number(row.bytes || 0) };
}

function normalizeBill(row, documents = []) {
  const billedM3 = Number(row.billed_m3 || 0);
  const readingSpanDays = periodDays(row.period_start, row.period_end);
  const month = billingMonth(row.billing_month, row.issue_date || row.period_end);
  const days = billingDays(month);
  const subtotal = nullableNumber(row.subtotal_service_clp);
  const classification = row.source === 'meter-period' ? {
    status: 'actual', method: 'meter-period-readings', reason: 'Consumo consolidado desde lecturas guardadas en Mi Solar.'
  } : row.source === 'photo-ai' ? {
    status: row.consumption_status === 'actual' ? 'actual' : 'estimated',
    method: row.estimate_method || (row.consumption_status === 'actual' ? 'actual-readings-verified' : 'company-estimate-no-complete-reading'),
    reason: row.consumption_status === 'actual'
      ? 'La fotografía contiene ambas lecturas acumuladas y sus fechas.'
      : 'La boleta no muestra las dos lecturas acumuladas completas; el consumo informado se trata como estimado.'
  } : classifyWaterConsumption({
    periodStart: row.period_start, periodEnd: row.period_end, previousReadingM3: row.previous_reading_m3,
    currentReadingM3: row.current_reading_m3, readingDifferenceM3: row.reading_difference_m3,
    deductibleM3: row.deductible_m3, billedM3: row.billed_m3,
    readingStatus: row.consumption_status, consumptionIsEstimated: row.consumption_status !== 'actual'
  });
  return {
    id: Number(row.id), billingMonth: month, periodStart: row.period_start, periodEnd: row.period_end, periodDays: readingSpanDays, billingDays: days, readingSpanDays,
    issueDate: row.issue_date, dueDate: row.due_date, nextReadingDate: row.next_reading_date,
    previousReadingM3: nullableNumber(row.previous_reading_m3), currentReadingM3: nullableNumber(row.current_reading_m3),
    readingDifferenceM3: nullableNumber(row.reading_difference_m3), deductibleM3: nullableNumber(row.deductible_m3), billedM3,
    averageDailyM3: billedM3 > 0 ? Number((billedM3 / days).toFixed(3)) : null,
    consumptionStatus: classification.status, isEstimated: classification.status !== 'actual', estimateMethod: classification.method,
    classificationReason: row.estimate_method === 'historical-daily-average' ? 'Estimado con el promedio diario histórico.' : classification.reason,
    amountClp: Number(row.amount_clp || 0), unitServiceRateClp: billedM3 > 0 && subtotal != null ? Number((subtotal / billedM3).toFixed(2)) : null,
    customerNumber: row.customer_number, meterNumber: row.meter_number, meterBrand: row.meter_brand, meterModel: row.meter_model,
    invoiceNumber: row.invoice_number, serviceAddress: row.service_address,
    fixedChargeClp: nullableNumber(row.fixed_charge_clp), potableWaterChargeClp: nullableNumber(row.potable_water_charge_clp),
    sewerCollectionChargeClp: nullableNumber(row.sewer_collection_charge_clp), wastewaterTreatmentChargeClp: nullableNumber(row.wastewater_treatment_charge_clp),
    subtotalServiceClp: subtotal, taxesClp: nullableNumber(row.taxes_clp), otherChargesClp: nullableNumber(row.other_charges_clp), discountsClp: nullableNumber(row.discounts_clp),
    chargeItems: Array.isArray(row.charge_items) ? row.charge_items : [], source: row.source || 'manual', aiConfidence: nullableNumber(row.ai_confidence),
    documents: documents.map(normalizeDocument), createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function normalizePeriod(row) {
  if (!row) return null;
  return {
    id: Number(row.id), periodStart: row.period_start, expectedCloseDate: row.expected_close_date, actualCloseDate: row.actual_close_date,
    openingReadingM3: Number(row.opening_reading_m3), closingReadingM3: nullableNumber(row.closing_reading_m3), status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function normalizeReading(row) {
  return {
    id: Number(row.id), periodId: row.period_id == null ? null : Number(row.period_id), readingAt: row.reading_at, readingM3: Number(row.reading_m3),
    source: row.source, notes: row.notes, hasPhoto: Boolean(row.storage_path), originalName: row.original_name, mimeType: row.mime_type,
    aiConfidence: nullableNumber(row.ai_confidence), createdAt: row.created_at
  };
}

function normalizeSettings(row) {
  return {
    reminderEnabled: row?.reminder_enabled !== false, reminderDaysBefore: Number(row?.reminder_days_before ?? 2),
    reminderTimeLocal: String(row?.reminder_time_local || '09:00:00').slice(0, 5), closingDayHint: row?.closing_day_hint == null ? null : Number(row.closing_day_hint), updatedAt: row?.updated_at || null
  };
}

function storageConfiguration() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const appKey = process.env.MISOLAR_DB_KEY;
  if (!url || !key || !appKey) throw Object.assign(new Error('El almacenamiento privado no está configurado.'), { status: 503 });
  return { url, key, appKey };
}

function decodeImage(image) {
  const match = image?.dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw Object.assign(new Error('Formato de fotografía no válido.'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
  return { buffer, mimeType: match[1], extension, hash: createHash('sha256').update(buffer).digest('hex') };
}

async function uploadImage(pathPrefix, image) {
  const { url, key, appKey } = storageConfiguration();
  const decoded = decodeImage(image);
  const storagePath = `${pathPrefix}-${decoded.hash.slice(0, 12)}.${decoded.extension}`;
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${storagePath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey, 'Content-Type': decoded.mimeType, 'x-upsert': 'true' }, body: decoded.buffer
  });
  if (!response.ok) throw new Error(`No fue posible respaldar la fotografía: ${(await response.text()).slice(0, 140)}`);
  return { storagePath, mimeType: decoded.mimeType, bytes: decoded.buffer.length, sha256: decoded.hash, originalName: String(image.name || `foto.${decoded.extension}`).slice(0, 180) };
}

async function removeStored(paths) {
  if (!paths.length) return;
  const { url, key, appKey } = storageConfiguration();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths })
  });
  if (!response.ok && response.status !== 404) throw new Error('No fue posible retirar la fotografía privada.');
}

async function readStored(path, mimeType, originalName) {
  const { url, key, appKey } = storageConfiguration();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'x-misolar-key': appKey }
  });
  if (!response.ok) throw Object.assign(new Error('No fue posible abrir la fotografía respaldada.'), { status: response.status === 404 ? 404 : 502 });
  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: mimeType || response.headers.get('content-type') || 'image/jpeg', originalName: originalName || 'agua.jpg' };
}

export async function listWaterBills(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`water_bills?site_id=eq.${siteId}&select=*&order=billing_month.desc,created_at.desc`) || [];
  const ids = rows.map((row) => row.id);
  const docs = ids.length ? await rest(`water_bill_documents?bill_id=in.(${ids.join(',')})&select=id,bill_id,page_number,original_name,mime_type,bytes&order=page_number.asc`) || [] : [];
  return rows.map((row) => normalizeBill(row, docs.filter((doc) => doc.bill_id === row.id)));
}

async function latestAverage(siteId) {
  const rows = await rest(`water_bills?site_id=eq.${siteId}&billed_m3=gt.0&select=billed_m3,billing_month&order=billing_month.desc&limit=6`) || [];
  if (!rows.length) return null;
  const daily = rows.map((row) => Number(row.billed_m3) / billingDays(row.billing_month)).filter(Number.isFinite);
  return daily.length ? daily.reduce((sum, value) => sum + value, 0) / daily.length : null;
}

export async function saveWaterBill(deviceSn, bill, images = [], ai = null) {
  const siteId = await ensureSite(deviceSn);
  const previous = nullableNumber(bill.previousReadingM3);
  const current = nullableNumber(bill.currentReadingM3);
  const difference = nullableNumber(bill.readingDifferenceM3) ?? (previous != null && current != null && current >= previous ? current - previous : null);
  const deductible = Math.max(0, nullableNumber(bill.deductibleM3) || 0);
  const visibleBilled = nullableNumber(bill.billedM3);
  const calculatedBilled = difference != null ? Math.max(0, difference - deductible) : null;
  let billedM3 = visibleBilled != null && visibleBilled >= 0 ? visibleBilled : calculatedBilled;
  const classification = classifyWaterConsumption(bill, ai);
  let status = classification.status;
  let estimateMethod = classification.method;
  if (!(billedM3 > 0)) {
    const averageDaily = await latestAverage(siteId);
    if (averageDaily != null) {
      billedM3 = Number((averageDaily * periodDays(bill.periodStart, bill.periodEnd)).toFixed(3));
      status = 'estimated'; estimateMethod = 'historical-daily-average';
    } else {
      billedM3 = 0; status = 'estimated'; estimateMethod = 'not-enough-data';
    }
  }
  const month = billingMonth(bill.billingMonth, bill.issueDate || bill.periodEnd);
  if (!month) throw Object.assign(new Error('No fue posible determinar el mes de la boleta.'), { status: 400 });
  const payload = {
    site_id: siteId, billing_month: month, period_start: bill.periodStart, period_end: bill.periodEnd, issue_date: bill.issueDate || null, due_date: bill.dueDate || null,
    next_reading_date: bill.nextReadingDate || null, previous_reading_m3: previous, current_reading_m3: current,
    reading_difference_m3: difference, deductible_m3: deductible || null, billed_m3: billedM3, consumption_status: status,
    estimate_method: estimateMethod || (status === 'actual' ? 'reported' : 'bill-estimate'), amount_clp: Math.max(0, Number(bill.amountClp) || 0),
    customer_number: bill.customerNumber || null, meter_number: bill.meterNumber || null, meter_brand: bill.meterBrand || null, meter_model: bill.meterModel || null,
    invoice_number: bill.invoiceNumber || null, service_address: bill.serviceAddress || null,
    fixed_charge_clp: nullableNumber(bill.fixedChargeClp), potable_water_charge_clp: nullableNumber(bill.potableWaterChargeClp),
    sewer_collection_charge_clp: nullableNumber(bill.sewerCollectionChargeClp), wastewater_treatment_charge_clp: nullableNumber(bill.wastewaterTreatmentChargeClp),
    subtotal_service_clp: nullableNumber(bill.subtotalServiceClp), taxes_clp: nullableNumber(bill.taxesClp), other_charges_clp: nullableNumber(bill.otherChargesClp),
    discounts_clp: nullableNumber(bill.discountsClp), charge_items: Array.isArray(bill.chargeItems) ? bill.chargeItems.slice(0, 80) : [],
    source: images.length ? 'photo-ai' : 'manual', ai_extraction: { ...(ai?.extracted || {}), classification: { status, method: estimateMethod, reason: classification.reason, evidence: classification.evidence } }, ai_confidence: nullableNumber(ai?.confidence), ai_model: ai?.model || null,
    updated_at: new Date().toISOString()
  };
  const rows = await rest('water_bills?on_conflict=site_id,billing_month', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(payload)
  });
  const saved = rows?.[0];
  if (!saved) throw new Error('La base de datos no confirmó la cuenta de agua.');
  const oldDocs = await rest(`water_bill_documents?bill_id=eq.${saved.id}&select=id,page_number,storage_path`) || [];
  const documentWarnings = [];
  if (images.length) {
    for (let index = 0; index < images.length; index += 1) {
      try {
        const pageNumber = index + 1;
        const previous = oldDocs.find((doc) => Number(doc.page_number) === pageNumber);
        const uploaded = await uploadImage(`${siteId}/bills/${saved.id}/pagina-${pageNumber}`, images[index]);
        await rest('water_bill_documents?on_conflict=bill_id,page_number', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ bill_id: saved.id, page_number: pageNumber, storage_path: uploaded.storagePath, original_name: uploaded.originalName, mime_type: uploaded.mimeType, bytes: uploaded.bytes, sha256: uploaded.sha256 }) });
        if (previous?.storage_path && previous.storage_path !== uploaded.storagePath) await removeStored([previous.storage_path]);
      } catch (error) {
        documentWarnings.push(`La página ${index + 1} no pudo respaldarse: ${error instanceof Error ? error.message : 'error de almacenamiento'}`);
      }
    }
    const excess = oldDocs.filter((doc) => Number(doc.page_number) > images.length);
    if (excess.length) {
      await removeStored(excess.map((doc) => doc.storage_path).filter(Boolean));
      await rest(`water_bill_documents?bill_id=eq.${saved.id}&page_number=gt.${images.length}`, { method: 'DELETE' });
    }
  }
  await ensureOpenWaterPeriod(deviceSn, { fromBill: { ...payload, id: saved.id } });
  const all = await listWaterBills(deviceSn);
  return { ...all.find((item) => item.id === Number(saved.id)), documentWarnings };
}

export async function readWaterBillDocument(deviceSn, documentId) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`water_bill_documents?id=eq.${Number(documentId)}&select=id,bill_id,storage_path,original_name,mime_type&limit=1`) || [];
  const document = rows[0];
  if (!document) throw Object.assign(new Error('La página de la cuenta no existe.'), { status: 404 });
  const bills = await rest(`water_bills?id=eq.${document.bill_id}&site_id=eq.${siteId}&select=id&limit=1`) || [];
  if (!bills[0]) throw Object.assign(new Error('La página no pertenece a esta instalación.'), { status: 404 });
  return readStored(document.storage_path, document.mime_type, document.original_name);
}

export async function deleteWaterBill(deviceSn, billId) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`water_bills?id=eq.${Number(billId)}&site_id=eq.${siteId}&select=id&limit=1`) || [];
  if (!rows[0]) throw Object.assign(new Error('La cuenta no existe.'), { status: 404 });
  const docs = await rest(`water_bill_documents?bill_id=eq.${rows[0].id}&select=storage_path`) || [];
  await removeStored(docs.map((doc) => doc.storage_path).filter(Boolean));
  await rest(`water_bills?id=eq.${rows[0].id}`, { method: 'DELETE' });
  return { id: Number(rows[0].id) };
}

async function settingsForSite(siteId) {
  const rows = await rest(`water_settings?site_id=eq.${siteId}&select=*&limit=1`) || [];
  if (rows[0]) return rows[0];
  const created = await rest('water_settings', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId }) });
  return created?.[0] || { site_id: siteId };
}

export async function updateWaterSettings(deviceSn, patch) {
  const siteId = await ensureSite(deviceSn);
  const current = await settingsForSite(siteId);
  const body = {
    site_id: siteId, reminder_enabled: patch.reminderEnabled ?? current.reminder_enabled ?? true,
    reminder_days_before: Math.max(0, Math.min(14, Number(patch.reminderDaysBefore ?? current.reminder_days_before ?? 2))),
    reminder_time_local: /^\d{2}:\d{2}$/.test(String(patch.reminderTimeLocal || '')) ? `${patch.reminderTimeLocal}:00` : current.reminder_time_local || '09:00:00',
    closing_day_hint: patch.closingDayHint == null || patch.closingDayHint === '' ? null : Math.max(1, Math.min(31, Number(patch.closingDayHint))), updated_at: new Date().toISOString()
  };
  const rows = await rest('water_settings?on_conflict=site_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) });
  return normalizeSettings(rows?.[0] || body);
}

export async function ensureOpenWaterPeriod(deviceSn, options = {}) {
  const siteId = await ensureSite(deviceSn);
  const existing = await rest(`water_meter_periods?site_id=eq.${siteId}&status=eq.open&select=*&order=period_start.desc&limit=1`) || [];
  if (existing[0]) {
    const incoming = options.fromBill;
    if (incoming && incoming.period_end > existing[0].period_start && nullableNumber(incoming.current_reading_m3) != null) {
      const readings = await rest(`water_meter_readings?period_id=eq.${existing[0].id}&select=id&limit=1`) || [];
      if (!readings[0]) {
        const expectedCloseDate = incoming.next_reading_date || dateAdd(incoming.period_end, 30);
        const updated = await rest(`water_meter_periods?id=eq.${existing[0].id}`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ period_start: incoming.period_end, expected_close_date: expectedCloseDate, opening_reading_m3: Number(incoming.current_reading_m3), updated_at: new Date().toISOString() })
        });
        return normalizePeriod(updated?.[0] || existing[0]);
      }
    }
    return normalizePeriod(existing[0]);
  }
  const latestRows = options.fromBill ? [options.fromBill] : await rest(`water_bills?site_id=eq.${siteId}&current_reading_m3=not.is.null&select=*&order=period_end.desc&limit=1`) || [];
  const latest = latestRows[0];
  if (!latest || nullableNumber(latest.current_reading_m3) == null) return null;
  const settings = await settingsForSite(siteId);
  const typicalDaysRows = await rest(`water_bills?site_id=eq.${siteId}&select=period_start,period_end&order=period_end.desc&limit=6`) || [];
  const typicalDays = typicalDaysRows.length ? Math.round(typicalDaysRows.reduce((sum, row) => sum + periodDays(row.period_start, row.period_end), 0) / typicalDaysRows.length) : 30;
  let expectedCloseDate = latest.next_reading_date || dateAdd(latest.period_end, typicalDays);
  if (settings.closing_day_hint) {
    const [year, month] = expectedCloseDate.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    expectedCloseDate = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(lastDay, settings.closing_day_hint)).padStart(2, '0')}`;
  }
  const rows = await rest('water_meter_periods', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId, period_start: latest.period_end, expected_close_date: expectedCloseDate, opening_reading_m3: Number(latest.current_reading_m3), status: 'open' }) });
  return normalizePeriod(rows?.[0]);
}

export async function openWaterPeriod(deviceSn, input) {
  const siteId = await ensureSite(deviceSn);
  const openingReadingM3 = Number(input.openingReadingM3);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.periodStart || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.expectedCloseDate || ''))) throw Object.assign(new Error('Ingresa fechas válidas para abrir el período.'), { status: 400 });
  if (input.expectedCloseDate <= input.periodStart) throw Object.assign(new Error('El cierre estimado debe ser posterior al inicio.'), { status: 400 });
  if (!Number.isFinite(openingReadingM3) || openingReadingM3 < 0) throw Object.assign(new Error('Ingresa una lectura inicial válida en m³.'), { status: 400 });
  const existing = await rest(`water_meter_periods?site_id=eq.${siteId}&status=eq.open&select=id&limit=1`) || [];
  if (existing[0]) throw Object.assign(new Error('Ya existe un mes de agua abierto. Ciérralo antes de abrir otro.'), { status: 409 });
  const rows = await rest('water_meter_periods', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId, period_start: input.periodStart, expected_close_date: input.expectedCloseDate, opening_reading_m3: openingReadingM3, status: 'open' }) });
  return normalizePeriod(rows?.[0]);
}

export async function closeWaterPeriod(deviceSn, input) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`water_meter_periods?id=eq.${Number(input.periodId)}&site_id=eq.${siteId}&status=eq.open&select=*&limit=1`) || [];
  const period = rows[0];
  if (!period) throw Object.assign(new Error('El período abierto no existe.'), { status: 404 });
  const closing = Number(input.closingReadingM3);
  if (!Number.isFinite(closing) || closing < Number(period.opening_reading_m3)) throw Object.assign(new Error('La lectura de cierre debe ser igual o mayor a la inicial.'), { status: 400 });
  const readingAt = input.readingAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(readingAt))) throw Object.assign(new Error('La fecha de cierre no es válida.'), { status: 400 });
  await saveWaterReading(deviceSn, { periodId: period.id, readingAt, readingM3: closing, source: 'closing', notes: 'Lectura de cierre del período' });
  const closedDate = todayChile(new Date(readingAt));
  const updated = await rest(`water_meter_periods?id=eq.${period.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'closed', actual_close_date: closedDate, closing_reading_m3: closing, updated_at: new Date().toISOString() }) });

  const month = billingMonth(closedDate, closedDate);
  const existingBill = await rest(`water_bills?site_id=eq.${siteId}&billing_month=eq.${month}&select=id,source&limit=1`) || [];
  if (!existingBill[0]) {
    const consumed = Math.max(0, closing - Number(period.opening_reading_m3));
    await rest('water_bills?on_conflict=site_id,billing_month', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        site_id: siteId, billing_month: month, period_start: period.period_start, period_end: closedDate,
        previous_reading_m3: Number(period.opening_reading_m3), current_reading_m3: closing,
        reading_difference_m3: consumed, deductible_m3: null, billed_m3: consumed,
        consumption_status: 'actual', estimate_method: 'meter-period-readings', amount_clp: 0,
        charge_items: [], source: 'meter-period', ai_extraction: { classification: { status: 'actual', method: 'meter-period-readings', reason: 'Período cerrado con lecturas inicial y final guardadas en Mi Solar.' } },
        updated_at: new Date().toISOString()
      })
    });
  }

  const settings = await settingsForSite(siteId);
  let expectedCloseDate = dateAdd(closedDate, 30);
  if (settings.closing_day_hint) {
    const [year, monthNumber] = expectedCloseDate.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    expectedCloseDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(Math.min(lastDay, settings.closing_day_hint)).padStart(2, '0')}`;
  }
  const nextRows = await rest('water_meter_periods', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ site_id: siteId, period_start: closedDate, expected_close_date: expectedCloseDate, opening_reading_m3: closing, status: 'open' }) });
  return { ...normalizePeriod(updated?.[0]), nextPeriod: normalizePeriod(nextRows?.[0]) };
}

export async function saveWaterReading(deviceSn, reading, image = null, ai = null) {
  const siteId = await ensureSite(deviceSn);
  const period = reading.periodId ? { id: Number(reading.periodId) } : await ensureOpenWaterPeriod(deviceSn);
  const readingM3 = Number(reading.readingM3);
  if (!Number.isFinite(readingM3) || readingM3 < 0) throw Object.assign(new Error('Ingresa una lectura válida en m³.'), { status: 400 });
  const readingAt = reading.readingAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(readingAt))) throw Object.assign(new Error('La fecha de la lectura no es válida.'), { status: 400 });
  let uploaded = null;
  if (image) uploaded = await uploadImage(`${siteId}/readings/${Date.now()}`, image);
  const rows = await rest('water_meter_readings', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ site_id: siteId, period_id: period?.id || null, reading_at: readingAt, reading_m3: readingM3, source: image ? 'photo-ai' : reading.source || 'manual', notes: reading.notes || null, storage_path: uploaded?.storagePath || null, original_name: uploaded?.originalName || null, mime_type: uploaded?.mimeType || null, bytes: uploaded?.bytes || null, sha256: uploaded?.sha256 || null, ai_confidence: nullableNumber(ai?.confidence), ai_model: ai?.model || null, ai_extraction: ai?.extracted || {} })
  });
  return normalizeReading(rows?.[0]);
}

export async function readWaterReadingPhoto(deviceSn, readingId) {
  const siteId = await ensureSite(deviceSn);
  const rows = await rest(`water_meter_readings?id=eq.${Number(readingId)}&site_id=eq.${siteId}&storage_path=not.is.null&select=storage_path,original_name,mime_type&limit=1`) || [];
  if (!rows[0]) throw Object.assign(new Error('La fotografía de esta lectura no existe.'), { status: 404 });
  return readStored(rows[0].storage_path, rows[0].mime_type, rows[0].original_name);
}

function projectionFor(period, readings, bills) {
  if (!period) return null;
  const now = Date.now();
  const startMs = Date.parse(`${period.periodStart}T12:00:00Z`);
  const endMs = Date.parse(`${period.expectedCloseDate}T12:00:00Z`);
  const latest = readings[0];
  const latestMs = latest ? Date.parse(latest.readingAt) : startMs;
  const consumed = latest ? Math.max(0, latest.readingM3 - period.openingReadingM3) : 0;
  const elapsedDays = Math.max(0.25, (latestMs - startMs) / 86_400_000);
  const totalDays = Math.max(1, (endMs - startMs) / 86_400_000);
  const historicDaily = bills.filter((bill) => bill.billedM3 > 0).slice(0, 6).map((bill) => bill.billedM3 / bill.periodDays);
  const fallbackDaily = historicDaily.length ? historicDaily.reduce((sum, value) => sum + value, 0) / historicDaily.length : 0;
  const daily = consumed > 0 ? consumed / elapsedDays : fallbackDaily;
  const projectedM3 = Math.max(consumed, daily * totalDays);
  const unitService = 1500;
  return {
    consumedM3: Number(consumed.toFixed(3)), averageDailyM3: Number(daily.toFixed(3)), projectedM3: Number(projectedM3.toFixed(2)),
    projectedAmountClp: Math.max(0, Math.round(projectedM3 * unitService)), unitServiceRateClp: unitService,
    elapsedDays: Number(elapsedDays.toFixed(2)), remainingDays: Number(Math.max(0, (endMs - Math.min(now, endMs)) / 86_400_000).toFixed(2)),
    lastReadingAt: latest?.readingAt || null, calculatedAt: new Date().toISOString(), method: consumed > 0 ? 'current-readings' : 'historical-average'
  };
}

export async function waterDashboard(deviceSn) {
  const siteId = await ensureSite(deviceSn);
  const [bills, settingsRow] = await Promise.all([listWaterBills(deviceSn), settingsForSite(siteId)]);
  const period = await ensureOpenWaterPeriod(deviceSn);
  const rows = period ? await rest(`water_meter_readings?site_id=eq.${siteId}&period_id=eq.${period.id}&select=*&order=reading_at.desc&limit=300`) || [] : [];
  const readings = rows.map(normalizeReading);
  return { bills, period, readings, projection: projectionFor(period, readings, bills), settings: normalizeSettings(settingsRow), today: todayChile() };
}

export async function listDueWaterReminders(now = new Date()) {
  const chileDate = todayChile(now);
  const chileTime = now.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const rows = await rest('water_settings?reminder_enabled=eq.true&select=site_id,reminder_days_before,reminder_time_local') || [];
  const due = [];
  for (const setting of rows) {
    if (chileTime < String(setting.reminder_time_local || '09:00').slice(0, 5)) continue;
    const periods = await rest(`water_meter_periods?site_id=eq.${setting.site_id}&status=eq.open&select=id,expected_close_date&limit=1`) || [];
    const period = periods[0];
    if (!period) continue;
    const reminderDate = dateAdd(period.expected_close_date, -Number(setting.reminder_days_before || 0));
    if (chileDate >= reminderDate && chileDate <= period.expected_close_date) due.push({ siteId: Number(setting.site_id), periodId: Number(period.id), expectedCloseDate: period.expected_close_date, reminderDate });
  }
  return due;
}
