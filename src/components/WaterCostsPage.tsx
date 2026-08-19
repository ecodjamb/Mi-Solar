import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CalendarClock, Camera, CheckCircle2, ChevronDown, CircleDollarSign, Droplets, FileImage, FilePlus2, Gauge, Save, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { api } from '../services/api';
import { clp, formatSiteDate } from '../utils/energy';
import EChart from './EChart';

type WaterImage = { name: string; dataUrl: string; mimeType: string; bytes: number };
type WaterCharge = { label: string; cubicMeters: number | null; amountClp: number; category: string };
type WaterDocument = { id: number; pageNumber: number; originalName?: string | null; mimeType: string; bytes: number };
type WaterBill = {
  id: number; periodStart: string; periodEnd: string; periodDays: number; issueDate?: string | null; dueDate?: string | null; nextReadingDate?: string | null;
  previousReadingM3: number | null; currentReadingM3: number | null; readingDifferenceM3: number | null; deductibleM3: number | null;
  billedM3: number; averageDailyM3: number | null; consumptionStatus: 'actual'|'estimated'|'pending'|'unavailable'; isEstimated: boolean; estimateMethod?: string | null;
  amountClp: number; unitServiceRateClp: number | null; customerNumber?: string | null; meterNumber?: string | null; meterBrand?: string | null; meterModel?: string | null;
  invoiceNumber?: string | null; serviceAddress?: string | null; fixedChargeClp?: number | null; potableWaterChargeClp?: number | null;
  sewerCollectionChargeClp?: number | null; wastewaterTreatmentChargeClp?: number | null; subtotalServiceClp?: number | null; taxesClp?: number | null;
  otherChargesClp?: number | null; discountsClp?: number | null; chargeItems: WaterCharge[]; source: string; aiConfidence?: number | null; documents: WaterDocument[];
};
type WaterPeriod = { id: number; periodStart: string; expectedCloseDate: string; actualCloseDate: string | null; openingReadingM3: number; closingReadingM3: number | null; status: 'open'|'closed' };
type WaterReading = { id: number; periodId: number | null; readingAt: string; readingM3: number; source: string; notes?: string | null; hasPhoto: boolean; originalName?: string | null; aiConfidence?: number | null };
type WaterProjection = { consumedM3: number; averageDailyM3: number; projectedM3: number; projectedAmountClp: number; unitServiceRateClp: number; elapsedDays: number; remainingDays: number; lastReadingAt: string | null; calculatedAt: string; method: string };
type WaterSettings = { reminderEnabled: boolean; reminderDaysBefore: number; reminderTimeLocal: string; closingDayHint: number | null; updatedAt: string | null };
type WaterDashboard = { bills: WaterBill[]; period: WaterPeriod | null; readings: WaterReading[]; projection: WaterProjection | null; settings: WaterSettings; today: string };
type WaterBillExtract = {
  provider: string | null; documentType: string | null; invoiceNumber: string | null; periodStart: string | null; periodEnd: string | null; issueDate: string | null;
  dueDate: string | null; nextReadingDate: string | null; previousReadingM3: number | null; currentReadingM3: number | null; readingDifferenceM3: number | null;
  deductibleM3: number | null; billedM3: number | null; readingStatus: 'actual'|'estimated'|'pending'|'unavailable'; consumptionIsEstimated: boolean;
  amountClp: number | null; customerNumber: string | null; meterNumber: string | null; meterBrand: string | null; meterModel: string | null; serviceAddress: string | null;
  fixedChargeClp: number | null; potableWaterChargeClp: number | null; sewerCollectionChargeClp: number | null; wastewaterTreatmentChargeClp: number | null;
  subtotalServiceClp: number | null; taxesClp: number | null; otherChargesClp: number | null; discountsClp: number | null; chargeItems: WaterCharge[]; confidence: number; warnings: string[];
};

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function defaultBillDraft() {
  const periodEnd = formatSiteDate();
  return { periodStart: addDays(periodEnd, -30), periodEnd, issueDate: '', dueDate: '', nextReadingDate: '', previousReadingM3: '', currentReadingM3: '', readingDifferenceM3: '', deductibleM3: '', billedM3: '', readingStatus: 'unavailable', amountClp: '', customerNumber: '', meterNumber: '', meterBrand: 'SENSUS', meterModel: '', invoiceNumber: '', serviceAddress: '', fixedChargeClp: '', potableWaterChargeClp: '', sewerCollectionChargeClp: '', wastewaterTreatmentChargeClp: '', subtotalServiceClp: '', taxesClp: '', otherChargesClp: '', discountsClp: '' };
}
type BillDraft = ReturnType<typeof defaultBillDraft>;
function text(value: unknown) { return value == null ? '' : String(value); }
function dateLabel(value?: string | null) { return value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
function dateTimeLabel(value?: string | null) { return value ? new Date(value).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' }) : 'Sin lecturas'; }
function monthLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); }
function m3(value: number | null | undefined, digits = 2) { return `${Number(value || 0).toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits })} m³`; }
function localDateTimeInput() { return new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(' ', 'T'); }
function toDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); }
async function optimizeImage(file: File): Promise<WaterImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error(`No fue posible abrir ${file.name}.`)); element.src = url; });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No fue posible optimizar la fotografía.')), 'image/jpeg', 0.82));
    return { name: file.name, dataUrl: await toDataUrl(blob), mimeType: 'image/jpeg', bytes: blob.size };
  } finally { URL.revokeObjectURL(url); }
}

export default function WaterCostsPage({ deviceSn, siteLabel }: { deviceSn: string; siteLabel: string }) {
  const [dashboard, setDashboard] = useState<WaterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [billOpen, setBillOpen] = useState(false);
  const [billDraft, setBillDraft] = useState(defaultBillDraft);
  const [billImages, setBillImages] = useState<WaterImage[]>([]);
  const [billAi, setBillAi] = useState<WaterBillExtract | null>(null);
  const [billModel, setBillModel] = useState('');
  const [billBusy, setBillBusy] = useState(false);
  const [chartFilter, setChartFilter] = useState('12m');
  const [viewDocument, setViewDocument] = useState<{ kind: 'bill'|'reading'; id: number; title: string } | null>(null);
  const [readingImage, setReadingImage] = useState<WaterImage | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingAt, setReadingAt] = useState(localDateTimeInput);
  const [readingNotes, setReadingNotes] = useState('');
  const [readingAi, setReadingAi] = useState<Record<string, unknown> | null>(null);
  const [readingModel, setReadingModel] = useState('');
  const [readingBusy, setReadingBusy] = useState(false);
  const [closeValue, setCloseValue] = useState('');
  const [openDraft, setOpenDraft] = useState({ periodStart: formatSiteDate(), expectedCloseDate: addDays(formatSiteDate(), 30), openingReadingM3: '' });
  const [settingsDraft, setSettingsDraft] = useState<WaterSettings | null>(null);
  const billInput = useRef<HTMLInputElement>(null);
  const readingInput = useRef<HTMLInputElement>(null);

  async function reload(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const result = await api<WaterDashboard>(`devices/${deviceSn}/water-costs`);
      setDashboard(result); setSettingsDraft(result.settings); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar los costos de agua.'); }
    finally { if (showLoading) setLoading(false); }
  }

  useEffect(() => { let active = true; setLoading(true); api<WaterDashboard>(`devices/${deviceSn}/water-costs`).then((result) => { if (active) { setDashboard(result); setSettingsDraft(result.settings); setError(''); } }).catch((cause) => active && setError(cause instanceof Error ? cause.message : 'No fue posible cargar los costos de agua.')).finally(() => active && setLoading(false)); return () => { active = false; }; }, [deviceSn]);
  useEffect(() => { if (!viewDocument) return; const close = (event: KeyboardEvent) => event.key === 'Escape' && setViewDocument(null); window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [viewDocument]);

  const years = useMemo(() => [...new Set((dashboard?.bills || []).map((bill) => bill.periodEnd.slice(0, 4)))].sort((a, b) => b.localeCompare(a)), [dashboard?.bills]);
  const chartBills = useMemo(() => {
    const ordered = [...(dashboard?.bills || [])].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    if (/^\d{4}$/.test(chartFilter)) return ordered.filter((bill) => bill.periodEnd.startsWith(chartFilter));
    return ordered.slice(-(chartFilter === '6m' ? 6 : 12));
  }, [dashboard?.bills, chartFilter]);
  const chartOption = useMemo(() => ({
    tooltip: { trigger: 'axis', confine: true, formatter: (params: unknown) => { const items = Array.isArray(params) ? params as Array<{ dataIndex?: number }> : []; const bill = chartBills[Number(items[0]?.dataIndex || 0)]; return bill ? `<b>${monthLabel(bill.periodEnd)}</b><br/>${bill.isEstimated ? 'Consumo estimado' : 'Consumo real'}: ${m3(bill.billedM3)}<br/>Total: ${clp(bill.amountClp)}` : ''; } },
    legend: { top: 2, textStyle: { color: '#a9bdc3' } }, grid: { left: 48, right: 42, top: 62, bottom: 54, containLabel: true },
    xAxis: { type: 'category', data: chartBills.map((bill) => monthLabel(bill.periodEnd)), axisLabel: { color: '#8ba0a8', hideOverlap: true }, axisLine: { lineStyle: { color: '#29444e' } } },
    yAxis: [{ type: 'value', name: 'm³', axisLabel: { color: '#8ba0a8' }, nameTextStyle: { color: '#8ba0a8' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } }, { type: 'value', name: 'CLP', axisLabel: { color: '#8ba0a8', formatter: (value: number) => `$${Math.round(value / 1000)}k` }, nameTextStyle: { color: '#8ba0a8' }, splitLine: { show: false } }],
    series: [
      { name: 'Consumo real', type: 'bar', stack: 'water', data: chartBills.map((bill) => bill.isEstimated ? null : bill.billedM3), itemStyle: { color: '#38bdf8', borderRadius: [6, 6, 0, 0] } },
      { name: 'Consumo estimado', type: 'bar', stack: 'water', data: chartBills.map((bill) => bill.isEstimated ? bill.billedM3 : null), itemStyle: { color: '#f3a847', borderRadius: [6, 6, 0, 0] } },
      { name: 'Monto de la cuenta', type: 'line', yAxisIndex: 1, data: chartBills.map((bill) => bill.amountClp), symbolSize: 7, lineStyle: { color: '#72e0a6', width: 2 }, itemStyle: { color: '#72e0a6' } }
    ]
  }), [chartBills]);

  async function chooseBillFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(''); setMessage('Optimizando páginas…');
    try {
      const selected = Array.from(files).slice(0, Math.max(0, 4 - billImages.length));
      const next = [...billImages, ...await Promise.all(selected.map(optimizeImage))];
      if (next.reduce((sum, item) => sum + item.bytes, 0) > 2_800_000) throw new Error('Las imágenes pesan demasiado en conjunto. Elimina una página o toma fotos más cercanas.');
      setBillImages(next); setBillAi(null); setMessage(`${next.length} ${next.length === 1 ? 'página preparada' : 'páginas preparadas'}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible preparar las imágenes.'); }
    if (billInput.current) billInput.current.value = '';
  }

  async function analyzeBill() {
    if (!billImages.length) return;
    setBillBusy(true); setError(''); setMessage('La IA está leyendo las fechas, lecturas, descuentos y cargos…');
    try {
      const result = await api<{ extracted: WaterBillExtract; model: string }>(`devices/${deviceSn}/water-bills/extract`, { method: 'POST', body: JSON.stringify({ images: billImages }) });
      const value = result.extracted; setBillAi(value); setBillModel(result.model);
      setBillDraft((current) => ({ ...current, periodStart: value.periodStart || current.periodStart, periodEnd: value.periodEnd || current.periodEnd, issueDate: text(value.issueDate), dueDate: text(value.dueDate), nextReadingDate: text(value.nextReadingDate), previousReadingM3: text(value.previousReadingM3), currentReadingM3: text(value.currentReadingM3), readingDifferenceM3: text(value.readingDifferenceM3), deductibleM3: text(value.deductibleM3), billedM3: text(value.billedM3), readingStatus: value.readingStatus, amountClp: text(value.amountClp), customerNumber: text(value.customerNumber), meterNumber: text(value.meterNumber), meterBrand: text(value.meterBrand || current.meterBrand), meterModel: text(value.meterModel), invoiceNumber: text(value.invoiceNumber), serviceAddress: text(value.serviceAddress), fixedChargeClp: text(value.fixedChargeClp), potableWaterChargeClp: text(value.potableWaterChargeClp), sewerCollectionChargeClp: text(value.sewerCollectionChargeClp), wastewaterTreatmentChargeClp: text(value.wastewaterTreatmentChargeClp), subtotalServiceClp: text(value.subtotalServiceClp), taxesClp: text(value.taxesClp), otherChargesClp: text(value.otherChargesClp), discountsClp: text(value.discountsClp) }));
      setMessage(`Lectura lista · confianza ${Math.round(value.confidence * 100)}%. Revisa y guarda; los campos ausentes no impedirán el respaldo.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible leer la boleta.'); }
    finally { setBillBusy(false); }
  }

  async function saveBill() {
    setBillBusy(true); setError(''); setMessage('Guardando la boleta y sus fotografías en Mi Solar…');
    try {
      const saved = await api<{ bill?: { documentWarnings?: string[] }; documentWarnings?: string[] }>(`devices/${deviceSn}/water-bills`, { method: 'POST', body: JSON.stringify({ ...billDraft, consumptionIsEstimated: billAi?.consumptionIsEstimated ?? billDraft.readingStatus !== 'actual', chargeItems: billAi?.chargeItems || [], images: billImages, aiExtraction: billAi, aiConfidence: billAi?.confidence ?? null, aiModel: billModel }) });
      setBillDraft(defaultBillDraft()); setBillImages([]); setBillAi(null); setBillModel(''); setBillOpen(false);
      const documentWarnings = saved.bill?.documentWarnings || saved.documentWarnings || [];
      setMessage(documentWarnings.length ? `Cuenta guardada. ${documentWarnings.join(' ')}` : 'Cuenta de agua, cargos y documentos guardados permanentemente.');
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar la boleta.'); }
    finally { setBillBusy(false); }
  }

  async function chooseReadingPhoto(files: FileList | null) {
    const file = files?.[0]; if (!file) return;
    setReadingBusy(true); setError(''); setMessage('Preparando y leyendo el visor del medidor…');
    try {
      const image = await optimizeImage(file); setReadingImage(image);
      const result = await api<{ extracted: Record<string, unknown> & { readingM3: number | null; confidence: number; warnings: string[] }; model: string }>(`devices/${deviceSn}/water-meter/extract`, { method: 'POST', body: JSON.stringify({ images: [image] }) });
      setReadingAi(result.extracted); setReadingModel(result.model); setReadingValue(result.extracted.readingM3 == null ? '' : String(result.extracted.readingM3));
      setMessage(result.extracted.readingM3 == null ? 'No fue posible leer el visor con seguridad. Puedes ingresar el valor manualmente y guardar la foto.' : `Lectura detectada: ${m3(result.extracted.readingM3, 3)} · confianza ${Math.round(result.extracted.confidence * 100)}%.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible leer el medidor.'); }
    finally { setReadingBusy(false); if (readingInput.current) readingInput.current.value = ''; }
  }

  async function saveReading() {
    if (!dashboard?.period) return;
    setReadingBusy(true); setError('');
    try {
      await api(`devices/${deviceSn}/water-meter/readings`, { method: 'POST', body: JSON.stringify({ periodId: dashboard.period.id, readingAt: new Date(readingAt).toISOString(), readingM3: Number(readingValue), notes: readingNotes, image: readingImage, aiExtraction: readingAi, aiConfidence: Number(readingAi?.confidence || 0), aiModel: readingModel }) });
      setReadingImage(null); setReadingValue(''); setReadingNotes(''); setReadingAi(null); setReadingModel(''); setReadingAt(localDateTimeInput()); setMessage('Lectura guardada. La proyección del mes fue actualizada.'); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar la lectura.'); }
    finally { setReadingBusy(false); }
  }

  async function openPeriod() {
    setReadingBusy(true); setError('');
    try { await api(`devices/${deviceSn}/water-periods/open`, { method: 'POST', body: JSON.stringify(openDraft) }); setMessage('Mes de agua abierto correctamente.'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible abrir el período.'); }
    finally { setReadingBusy(false); }
  }

  async function closePeriod() {
    if (!dashboard?.period) return;
    setReadingBusy(true); setError('');
    try { await api(`devices/${deviceSn}/water-periods/close`, { method: 'POST', body: JSON.stringify({ periodId: dashboard.period.id, closingReadingM3: Number(closeValue), readingAt: new Date().toISOString() }) }); setCloseValue(''); setMessage('Período cerrado y lectura final guardada.'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cerrar el período.'); }
    finally { setReadingBusy(false); }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setError('');
    try { const result = await api<{ settings: WaterSettings }>(`devices/${deviceSn}/water-settings`, { method: 'PATCH', body: JSON.stringify(settingsDraft) }); setSettingsDraft(result.settings); setDashboard((current) => current ? { ...current, settings: result.settings } : current); setMessage('Recordatorio de lectura guardado.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar el recordatorio.'); }
  }

  async function removeBill(bill: WaterBill) {
    if (!window.confirm(`¿Eliminar definitivamente la cuenta de ${monthLabel(bill.periodEnd)} y sus fotografías?`)) return;
    setError('');
    try { await api(`devices/${deviceSn}/water-bills/${bill.id}`, { method: 'DELETE' }); setMessage('Cuenta de agua eliminada de la base de datos.'); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible eliminar la cuenta.'); }
  }

  if (loading) return <section className="water-costs-page"><section className="panel water-loading">Cargando costos de agua…</section></section>;
  const bills = dashboard?.bills || [];
  const projection = dashboard?.projection;
  const period = dashboard?.period;
  const readings = dashboard?.readings || [];

  return <section className="water-costs-page">
    <header className="water-hero"><div className="water-hero-icon"><Droplets/></div><div><small>Control de Aguas Andinas · {siteLabel}</small><h1>Costos y consumo de agua</h1><p>Boletas, lecturas del medidor y proyección del mes en un solo lugar.</p></div><button type="button" onClick={() => setBillOpen((value) => !value)}><FilePlus2/> Nueva cuenta</button></header>
    {message ? <p className="water-message"><CheckCircle2/> {message}</p> : null}
    {error ? <p className="water-error">{error}</p> : null}

    <section className="panel water-chart-card"><header><div><small>Histórico respaldado</small><h2>Consumo mensual y monto</h2></div><nav aria-label="Período visible"><button className={chartFilter === '6m' ? 'active' : ''} onClick={() => setChartFilter('6m')}>6 meses</button><button className={chartFilter === '12m' ? 'active' : ''} onClick={() => setChartFilter('12m')}>12 meses</button>{years.map((year) => <button className={chartFilter === year ? 'active' : ''} onClick={() => setChartFilter(year)} key={year}>{year}</button>)}</nav></header>{chartBills.length ? <EChart option={chartOption} className="water-chart"/> : <div className="water-empty-chart"><Droplets/><b>Aún no hay cuentas guardadas</b><span>Sube la primera boleta para iniciar el historial.</span></div>}<footer><span><b>{m3(chartBills.reduce((sum, bill) => sum + bill.billedM3, 0))}</b> consumo del período visible</span><span><b>{clp(chartBills.reduce((sum, bill) => sum + bill.amountClp, 0))}</b> total pagado</span></footer></section>

    <section className="panel water-current"><header><div><small>Seguimiento entre lecturas</small><h2>Mes en curso</h2></div>{period ? <span className="water-status-open">● Abierto</span> : <span className="water-status-pending">Sin período</span>}</header>
      {period ? <>
        <div className="water-period-meta"><span><small>Inicio</small><b>{dateLabel(period.periodStart)}</b></span><span><small>Cierre estimado</small><b>{dateLabel(period.expectedCloseDate)}</b></span><span><small>Lectura inicial</small><b>{m3(period.openingReadingM3, 3)}</b></span><span><small>Última lectura</small><b>{readings[0] ? m3(readings[0].readingM3, 3) : 'Pendiente'}</b></span></div>
        {projection ? <div className="water-projection"><article><small>Consumido hasta ahora</small><strong>{m3(projection.consumedM3)}</strong><span>Según lecturas guardadas</span></article><article><small>Promedio diario</small><strong>{m3(projection.averageDailyM3, 3)}</strong><span>por día</span></article><article className="featured"><small>Proyección al cierre</small><strong>{m3(projection.projectedM3)}</strong><span>{clp(projection.projectedAmountClp)} estimados</span></article><article><small>Última actualización</small><strong>{dateTimeLabel(projection.lastReadingAt)}</strong><span>{projection.method === 'current-readings' ? 'Medición del mes actual' : 'Promedio histórico'}</span></article></div> : null}
        <div className="water-reading-entry"><div><Camera/><span><b>Agregar lectura</b><small>Toma una foto del visor o ingresa los m³ manualmente.</small></span></div><input ref={readingInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => void chooseReadingPhoto(event.target.files)}/><button type="button" onClick={() => readingInput.current?.click()} disabled={readingBusy}><Camera/> {readingBusy ? 'Leyendo…' : 'Tomar o subir foto'}</button><label><span>Lectura acumulada (m³)</span><input type="number" min="0" step="0.001" value={readingValue} onChange={(event) => setReadingValue(event.target.value)} placeholder="Ej. 7876"/></label><label><span>Fecha y hora</span><input type="datetime-local" value={readingAt} onChange={(event) => setReadingAt(event.target.value)}/></label><label className="wide"><span>Nota opcional</span><input value={readingNotes} onChange={(event) => setReadingNotes(event.target.value)} placeholder="Ej. lectura tomada antes de viajar"/></label>{readingImage ? <div className="water-photo-ready"><FileImage/><span><b>{readingImage.name}</b><small>{Math.round(readingImage.bytes / 1024)} KB · quedará respaldada</small></span><button onClick={() => { setReadingImage(null); setReadingAi(null); }} aria-label="Quitar foto"><X/></button></div> : null}<button className="primary wide" type="button" onClick={() => void saveReading()} disabled={readingBusy || !readingValue}><Save/> Guardar lectura y recalcular</button></div>
        {readings.length ? <div className="water-reading-history"><h3>Lecturas del período</h3>{readings.map((reading) => <article key={reading.id}><span className={reading.hasPhoto ? 'photo' : 'manual'}>{reading.hasPhoto ? <Camera/> : <Gauge/>}</span><div><b>{m3(reading.readingM3, 3)}</b><small>{dateTimeLabel(reading.readingAt)} · {reading.source === 'photo-ai' ? 'foto analizada por IA' : reading.source === 'closing' ? 'cierre' : 'manual'}</small></div>{reading.hasPhoto ? <button onClick={() => setViewDocument({ kind: 'reading', id: reading.id, title: `Lectura ${m3(reading.readingM3, 3)}` })}>Ver foto</button> : null}</article>)}</div> : null}
        <details className="water-close-period"><summary>Cerrar este período</summary><p>El cierre deja registrada la última lectura. La boleta oficial se podrá subir después.</p><div><input type="number" min={period.openingReadingM3} step="0.001" value={closeValue} onChange={(event) => setCloseValue(event.target.value)} placeholder="Lectura final en m³"/><button type="button" onClick={() => void closePeriod()} disabled={!closeValue || readingBusy}>Confirmar cierre</button></div></details>
      </> : <div className="water-open-period"><Droplets/><div><h3>Abrir el mes en curso</h3><p>Indica la lectura inicial y la fecha probable de la próxima lectura.</p></div><label>Fecha inicial<input type="date" value={openDraft.periodStart} onChange={(event) => setOpenDraft((current) => ({ ...current, periodStart: event.target.value }))}/></label><label>Cierre estimado<input type="date" value={openDraft.expectedCloseDate} onChange={(event) => setOpenDraft((current) => ({ ...current, expectedCloseDate: event.target.value }))}/></label><label>Lectura inicial (m³)<input type="number" min="0" step="0.001" value={openDraft.openingReadingM3} onChange={(event) => setOpenDraft((current) => ({ ...current, openingReadingM3: event.target.value }))}/></label><button type="button" onClick={() => void openPeriod()} disabled={!openDraft.openingReadingM3 || readingBusy}>Abrir seguimiento</button></div>}
    </section>

    {settingsDraft ? <section className="panel water-reminder"><header><Bell/><div><small>Notificación automática</small><h2>Recordatorio para subir la lectura</h2><p>Mi Solar enviará un aviso al celular antes del cierre estimado.</p></div><label className="switch"><input type="checkbox" checked={settingsDraft.reminderEnabled} onChange={(event) => setSettingsDraft((current) => current ? { ...current, reminderEnabled: event.target.checked } : current)}/><i/></label></header><div><label>Avisar con anticipación<select value={settingsDraft.reminderDaysBefore} onChange={(event) => setSettingsDraft((current) => current ? { ...current, reminderDaysBefore: Number(event.target.value) } : current)}>{[0,1,2,3,5,7].map((days) => <option value={days} key={days}>{days === 0 ? 'El mismo día' : `${days} días antes`}</option>)}</select></label><label>Hora local de Chile<input type="time" value={settingsDraft.reminderTimeLocal} onChange={(event) => setSettingsDraft((current) => current ? { ...current, reminderTimeLocal: event.target.value } : current)}/></label><label>Día habitual de cierre<input type="number" min="1" max="31" value={settingsDraft.closingDayHint ?? ''} onChange={(event) => setSettingsDraft((current) => current ? { ...current, closingDayHint: event.target.value === '' ? null : Number(event.target.value) } : current)} placeholder="Automático"/></label><button type="button" onClick={() => void saveSettings()}><Save/> Guardar aviso</button><button type="button" className="secondary" onClick={() => void api(`devices/${deviceSn}/water-reminder-test`, { method: 'POST' }).then(() => setMessage('Notificación de prueba enviada.')).catch((cause) => setError(cause instanceof Error ? cause.message : 'No fue posible enviar la prueba.'))}><Bell/> Probar</button></div></section> : null}

    {billOpen ? <section className="panel water-bill-entry"><header><div><small>Nueva boleta</small><h2>Ingresar cuenta de Aguas Andinas</h2><p>Puedes subir hasta cuatro páginas. La cuenta se podrá guardar aunque falten lecturas.</p></div><button onClick={() => setBillOpen(false)} aria-label="Cerrar"><X/></button></header><div className="water-upload-zone"><input ref={billInput} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void chooseBillFiles(event.target.files)}/><button type="button" onClick={() => billInput.current?.click()}><Upload/> Elegir o fotografiar páginas</button><span>{billImages.length ? `${billImages.length} página(s) lista(s)` : 'JPG, PNG o WebP'}</span>{billImages.length ? <button className="analyze" type="button" onClick={() => void analyzeBill()} disabled={billBusy}><Sparkles/> {billBusy ? 'Analizando…' : 'Extraer todos los datos con IA'}</button> : null}</div>{billImages.length ? <div className="water-upload-list">{billImages.map((image, index) => <span key={`${image.name}-${index}`}><FileImage/><b>Página {index + 1}</b><small>{image.name}</small><button onClick={() => setBillImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X/></button></span>)}</div> : null}{billAi?.warnings?.length ? <aside className="water-ai-warnings"><b>Revisión recomendada</b>{billAi.warnings.map((warning) => <span key={warning}>• {warning}</span>)}</aside> : null}<div className="water-bill-form">
      <label>Desde<input type="date" value={billDraft.periodStart} onChange={(event) => setBillDraft((current) => ({ ...current, periodStart: event.target.value }))}/></label><label>Hasta<input type="date" value={billDraft.periodEnd} onChange={(event) => setBillDraft((current) => ({ ...current, periodEnd: event.target.value }))}/></label><label>Emisión<input type="date" value={billDraft.issueDate} onChange={(event) => setBillDraft((current) => ({ ...current, issueDate: event.target.value }))}/></label><label>Vencimiento<input type="date" value={billDraft.dueDate} onChange={(event) => setBillDraft((current) => ({ ...current, dueDate: event.target.value }))}/></label><label>Próxima lectura<input type="date" value={billDraft.nextReadingDate} onChange={(event) => setBillDraft((current) => ({ ...current, nextReadingDate: event.target.value }))}/></label><label>Estado de lectura<select value={billDraft.readingStatus} onChange={(event) => setBillDraft((current) => ({ ...current, readingStatus: event.target.value }))}><option value="actual">Registra lectura real</option><option value="estimated">Consumo estimado</option><option value="pending">Lectura pendiente</option><option value="unavailable">No registra</option></select></label><label>Lectura anterior (m³)<input type="number" step="0.001" value={billDraft.previousReadingM3} onChange={(event) => setBillDraft((current) => ({ ...current, previousReadingM3: event.target.value }))}/></label><label>Lectura actual (m³)<input type="number" step="0.001" value={billDraft.currentReadingM3} onChange={(event) => setBillDraft((current) => ({ ...current, currentReadingM3: event.target.value }))}/></label><label>Diferencia lecturas (m³)<input type="number" step="0.001" value={billDraft.readingDifferenceM3} onChange={(event) => setBillDraft((current) => ({ ...current, readingDifferenceM3: event.target.value }))}/></label><label>m³ descontados<input type="number" step="0.001" value={billDraft.deductibleM3} onChange={(event) => setBillDraft((current) => ({ ...current, deductibleM3: event.target.value }))}/></label><label>Consumo facturado (m³)<input type="number" step="0.001" value={billDraft.billedM3} onChange={(event) => setBillDraft((current) => ({ ...current, billedM3: event.target.value }))}/></label><label>Total a pagar<input type="number" value={billDraft.amountClp} onChange={(event) => setBillDraft((current) => ({ ...current, amountClp: event.target.value }))}/></label><label>Número de cuenta<input value={billDraft.customerNumber} onChange={(event) => setBillDraft((current) => ({ ...current, customerNumber: event.target.value }))}/></label><label>Número de boleta<input value={billDraft.invoiceNumber} onChange={(event) => setBillDraft((current) => ({ ...current, invoiceNumber: event.target.value }))}/></label><label>Número de medidor<input value={billDraft.meterNumber} onChange={(event) => setBillDraft((current) => ({ ...current, meterNumber: event.target.value }))}/></label><label>Marca medidor<input value={billDraft.meterBrand} onChange={(event) => setBillDraft((current) => ({ ...current, meterBrand: event.target.value }))}/></label><label className="wide">Dirección de servicio<input value={billDraft.serviceAddress} onChange={(event) => setBillDraft((current) => ({ ...current, serviceAddress: event.target.value }))}/></label></div><details className="water-charge-fields"><summary>Revisar desglose de costos</summary><div><label>Cargo fijo<input type="number" value={billDraft.fixedChargeClp} onChange={(event) => setBillDraft((current) => ({ ...current, fixedChargeClp: event.target.value }))}/></label><label>Agua potable<input type="number" value={billDraft.potableWaterChargeClp} onChange={(event) => setBillDraft((current) => ({ ...current, potableWaterChargeClp: event.target.value }))}/></label><label>Recolección aguas servidas<input type="number" value={billDraft.sewerCollectionChargeClp} onChange={(event) => setBillDraft((current) => ({ ...current, sewerCollectionChargeClp: event.target.value }))}/></label><label>Tratamiento aguas servidas<input type="number" value={billDraft.wastewaterTreatmentChargeClp} onChange={(event) => setBillDraft((current) => ({ ...current, wastewaterTreatmentChargeClp: event.target.value }))}/></label><label>Subtotal servicio<input type="number" value={billDraft.subtotalServiceClp} onChange={(event) => setBillDraft((current) => ({ ...current, subtotalServiceClp: event.target.value }))}/></label><label>IVA / impuestos<input type="number" value={billDraft.taxesClp} onChange={(event) => setBillDraft((current) => ({ ...current, taxesClp: event.target.value }))}/></label><label>Otros cargos / convenio<input type="number" value={billDraft.otherChargesClp} onChange={(event) => setBillDraft((current) => ({ ...current, otherChargesClp: event.target.value }))}/></label><label>Descuentos<input type="number" value={billDraft.discountsClp} onChange={(event) => setBillDraft((current) => ({ ...current, discountsClp: event.target.value }))}/></label></div></details><button className="water-save-bill" type="button" onClick={() => void saveBill()} disabled={billBusy}><Save/> {billBusy ? 'Guardando…' : 'Guardar cuenta permanentemente'}</button></section> : null}

    <section className="water-bill-history"><header><div><small>Archivo permanente</small><h2>Cuentas guardadas</h2></div><span>{bills.length} {bills.length === 1 ? 'cuenta' : 'cuentas'}</span></header>{bills.length ? bills.map((bill) => <details className="panel water-bill-row" key={bill.id}><summary><div><small>{bill.source === 'photo-ai' ? 'Cuenta analizada con IA' : 'Ingreso manual'}</small><h3>{monthLabel(bill.periodEnd)}</h3><p>{dateLabel(bill.periodStart)} → {dateLabel(bill.periodEnd)} · {bill.periodDays} días</p></div><span><small>Consumo</small><b>{m3(bill.billedM3)}</b><em className={bill.isEstimated ? 'estimated' : 'actual'}>{bill.isEstimated ? 'ESTIMADO' : 'REAL'}</em></span><span><small>Promedio diario</small><b>{m3(bill.averageDailyM3, 2)}/día</b></span><span><small>Total a pagar</small><b>{clp(bill.amountClp)}</b></span><ChevronDown/></summary><div className="water-bill-detail"><section><h4>Lecturas y consumo</h4><dl><div><dt>Estado</dt><dd>{bill.consumptionStatus === 'actual' ? 'Registra lectura real' : bill.consumptionStatus === 'estimated' ? 'Consumo estimado' : bill.consumptionStatus === 'pending' ? 'Lectura pendiente' : 'No registra lectura'}</dd></div><div><dt>Lectura anterior</dt><dd>{bill.previousReadingM3 == null ? 'No registra' : m3(bill.previousReadingM3, 3)}</dd></div><div><dt>Lectura actual</dt><dd>{bill.currentReadingM3 == null ? 'No registra' : m3(bill.currentReadingM3, 3)}</dd></div><div><dt>Diferencia</dt><dd>{bill.readingDifferenceM3 == null ? 'No registra' : m3(bill.readingDifferenceM3)}</dd></div><div><dt>Descontados</dt><dd>{bill.deductibleM3 == null ? '0 m³' : m3(bill.deductibleM3)}</dd></div><div><dt>Consumo facturado</dt><dd>{m3(bill.billedM3)}</dd></div></dl></section><section><h4>Datos de la cuenta</h4><dl><div><dt>Nº cuenta</dt><dd>{bill.customerNumber || '—'}</dd></div><div><dt>Nº boleta</dt><dd>{bill.invoiceNumber || '—'}</dd></div><div><dt>Vencimiento</dt><dd>{dateLabel(bill.dueDate)}</dd></div><div><dt>Próxima lectura</dt><dd>{dateLabel(bill.nextReadingDate)}</dd></div><div><dt>Medidor</dt><dd>{[bill.meterBrand, bill.meterNumber].filter(Boolean).join(' · ') || '—'}</dd></div><div><dt>Dirección</dt><dd>{bill.serviceAddress || '—'}</dd></div></dl></section><section className="wide"><h4>Desglose completo</h4><div className="water-charges">{bill.chargeItems.length ? bill.chargeItems.map((item, index) => <span key={`${item.label}-${index}`}><b>{item.label}</b><small>{item.cubicMeters == null ? '' : m3(item.cubicMeters)}</small><strong>{clp(item.amountClp)}</strong></span>) : <><span><b>Cargo fijo</b><strong>{clp(bill.fixedChargeClp || 0)}</strong></span><span><b>Agua potable</b><strong>{clp(bill.potableWaterChargeClp || 0)}</strong></span><span><b>Recolección</b><strong>{clp(bill.sewerCollectionChargeClp || 0)}</strong></span><span><b>Tratamiento</b><strong>{clp(bill.wastewaterTreatmentChargeClp || 0)}</strong></span><span><b>Otros</b><strong>{clp(bill.otherChargesClp || 0)}</strong></span></>}</div></section>{bill.documents.length ? <section className="wide"><h4>Fotografías respaldadas</h4><div className="water-document-grid">{bill.documents.map((document) => <button key={document.id} onClick={() => setViewDocument({ kind: 'bill', id: document.id, title: `${monthLabel(bill.periodEnd)} · página ${document.pageNumber}` })}><img loading="lazy" src={`/api/devices/${encodeURIComponent(deviceSn)}/water-bills/documents/${document.id}`} alt={`Página ${document.pageNumber}`}/><span>Página {document.pageNumber}</span></button>)}</div></section> : null}<footer className="wide"><span>Tarifa servicio: {bill.unitServiceRateClp == null ? 'no calculable' : `${clp(bill.unitServiceRateClp)} por m³`}</span><button className="danger" onClick={() => void removeBill(bill)}><Trash2/> Eliminar</button></footer></div></details>) : <div className="panel water-history-empty"><Droplets/><b>No hay cuentas guardadas todavía</b><p>La primera que ingreses aparecerá aquí con su detalle y fotografías.</p></div>}</section>

    {viewDocument ? <div className="water-document-viewer" role="dialog" aria-modal="true" aria-label={viewDocument.title} onClick={(event) => event.target === event.currentTarget && setViewDocument(null)}><header><div><strong>{viewDocument.title}</strong><small>Documento privado de Mi Solar</small></div><button onClick={() => setViewDocument(null)}><X/> Cerrar y volver</button></header><img src={viewDocument.kind === 'bill' ? `/api/devices/${encodeURIComponent(deviceSn)}/water-bills/documents/${viewDocument.id}` : `/api/devices/${encodeURIComponent(deviceSn)}/water-meter/readings/${viewDocument.id}/photo`} alt={viewDocument.title}/></div> : null}
  </section>;
}
