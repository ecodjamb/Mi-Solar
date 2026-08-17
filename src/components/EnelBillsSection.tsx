import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarRange, CheckCircle2, ChevronDown, CircleDollarSign, FileImage, FilePlus2, Gauge, Pencil, Save, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { api } from '../services/api';
import { clp, formatSiteDate, kwh } from '../utils/energy';
import EChart from './EChart';

type BillDocument = { id: number; pageNumber: number; originalName?: string | null; mimeType: string; bytes: number };
type UtilityBill = {
  id: number; periodStart: string; periodEnd: string; previousReading: number | null; currentReading: number | null;
  billedKwh: number; reportedKwh: number | null; estimatedKwh: number | null; consumptionStatus: 'actual'|'estimated'|'pending'; isEstimated: boolean;
  periodDays: number; averageDailyKwh: number | null; amountClp: number; rateBaseClp: number | null; effectiveRateClp: number | null; theoreticalGridKwh: number;
  estimateMethod?: string; rateMethod?: 'energy-transport'|'total-amount'|'unavailable';
  archiveCoveragePct: number; differenceKwh: number; issueDate?: string | null; dueDate?: string | null;
  customerNumber?: string | null; meterNumber?: string | null; tariffName?: string | null; invoiceNumber?: string | null;
  serviceAddress?: string | null; fixedChargeClp?: number | null; energyChargeClp?: number | null; transportChargeClp?: number | null; otherChargesClp?: number | null; taxesClp?: number | null;
  chargeItems?: ChargeItem[]; source?: string; aiConfidence?: number | null; documentCount?: number; documentWarnings?: string[];
  documents?: BillDocument[];
};
type UtilityBillProjection = { periodStart: string; periodEnd: string; observedThrough: string; observedGridKwh: number; observedLoadKwh: number; averageDailyLoadKwh: number; remainingDays: number; projectedFutureLoadKwh: number; projectedFutureSolarKwh: number; projectedFutureGridKwh: number; forecastDays: number; projectedGridKwh: number; projectedAmountClp: number; unitRateClp: number; archiveCoveragePct: number; coveredHours: number; lastDataAt: string | null; calculatedAt: string };
type BillImage = { name: string; dataUrl: string; mimeType: string; bytes: number };
type ChargeItem = { label: string; amountClp: number; category: 'energy'|'fixed'|'transport'|'public_service'|'tax'|'discount'|'debt'|'interest'|'adjustment'|'other'; includedInEnergyRate: boolean };
type ExtractedBill = {
  provider: string | null; documentType: string | null; periodStart: string | null; periodEnd: string | null;
  issueDate: string | null; dueDate: string | null; previousReading: number | null; currentReading: number | null;
  billedKwh: number | null; estimatedKwh: number | null; consumptionIsEstimated: boolean; readingStatus: 'actual'|'estimated'|'pending'|'unavailable'; amountClp: number | null; customerNumber: string | null; meterNumber: string | null;
  tariffName: string | null; invoiceNumber: string | null; serviceAddress: string | null; fixedChargeClp: number | null;
  energyChargeClp: number | null; transportChargeClp: number | null; otherChargesClp: number | null; taxesClp: number | null; chargeItems: ChargeItem[]; confidence: number; warnings: string[];
};

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
function defaultDraft() {
  const periodEnd = formatSiteDate();
  return { periodStart: addDays(periodEnd, -30), periodEnd, previousReading: '', currentReading: '', billedKwh: '', estimatedKwh: '', amountClp: '', issueDate: '', dueDate: '', customerNumber: '', meterNumber: '', tariffName: '', invoiceNumber: '', serviceAddress: '', fixedChargeClp: '', energyChargeClp: '', transportChargeClp: '', otherChargesClp: '', taxesClp: '' };
}
type BillDraft = ReturnType<typeof defaultDraft>;
function draftFromBill(bill: UtilityBill): BillDraft {
  return {
    periodStart: bill.periodStart, periodEnd: bill.periodEnd, previousReading: textValue(bill.previousReading), currentReading: textValue(bill.currentReading),
    billedKwh: textValue(bill.billedKwh), estimatedKwh: '', amountClp: textValue(bill.amountClp), issueDate: textValue(bill.issueDate), dueDate: textValue(bill.dueDate),
    customerNumber: textValue(bill.customerNumber), meterNumber: textValue(bill.meterNumber), tariffName: textValue(bill.tariffName), invoiceNumber: textValue(bill.invoiceNumber),
    serviceAddress: textValue(bill.serviceAddress), fixedChargeClp: textValue(bill.fixedChargeClp), energyChargeClp: textValue(bill.energyChargeClp), transportChargeClp: textValue(bill.transportChargeClp),
    otherChargesClp: textValue(bill.otherChargesClp), taxesClp: textValue(bill.taxesClp)
  };
}
function dateLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }); }
function monthLabel(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }); }
function dataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); }); }
async function optimizeImage(file: File): Promise<BillImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error(`No fue posible abrir ${file.name}. Usa JPG, PNG o WebP.`)); element.src = url; });
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No fue posible optimizar la fotografía.')), 'image/jpeg', 0.78));
    return { name: file.name, dataUrl: await dataUrl(blob), mimeType: 'image/jpeg', bytes: blob.size };
  } finally { URL.revokeObjectURL(url); }
}
function textValue(value: string | number | null | undefined) { return value == null ? '' : String(value); }

export default function EnelBillsSection({ deviceSn, siteLabel }: { deviceSn: string; siteLabel: string }) {
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [projection, setProjection] = useState<UtilityBillProjection | null>(null);
  const [draft, setDraft] = useState(defaultDraft);
  const [images, setImages] = useState<BillImage[]>([]);
  const [aiExtraction, setAiExtraction] = useState<ExtractedBill | null>(null);
  const [aiModel, setAiModel] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState('');
  const [chartFilter, setChartFilter] = useState('12m');
  const [editingBill, setEditingBill] = useState<UtilityBill | null>(null);
  const [editDraft, setEditDraft] = useState<BillDraft | null>(null);
  const [editConsumptionStatus, setEditConsumptionStatus] = useState<'actual'|'estimated'>('actual');
  const [editSaving, setEditSaving] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<BillDocument | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<UtilityBill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readingKwh = draft.previousReading !== '' && draft.currentReading !== '' ? Math.max(0, Number(draft.currentReading) - Number(draft.previousReading)) : 0;
  const actualKwh = Number(draft.billedKwh || 0) > 0 ? Number(draft.billedKwh) : readingKwh;
  const amountEstimate = Number(draft.amountClp || 0) > 0 ? Number(draft.amountClp) / 250 : 0;
  const estimatedKwh = Number(draft.estimatedKwh || 0) > 0 ? Number(draft.estimatedKwh) : amountEstimate;
  const calculatedKwh = actualKwh > 0 ? actualKwh : estimatedKwh;
  const rateBase = Number(draft.energyChargeClp || 0) + Number(draft.transportChargeClp || 0);
  const calculatedRate = calculatedKwh > 0 ? (Number(draft.energyChargeClp || 0) > 0 ? rateBase / calculatedKwh : Number(draft.amountClp || 0) > 0 ? Number(draft.amountClp) / calculatedKwh : null) : null;

  useEffect(() => {
    let active = true; setLoading(true);
    api<{ list: UtilityBill[]; projection: UtilityBillProjection | null }>(`devices/${deviceSn}/utility-bills`).then((result) => { if (active) { setBills(result.list || []); setProjection(result.projection || null); } }).catch((error) => active && setMessage(error instanceof Error ? error.message : 'No fue posible cargar las cuentas.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [deviceSn]);
  useEffect(() => {
    if (!viewingDocument && !deleteCandidate) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setViewingDocument(null); setDeleteCandidate(null); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [viewingDocument, deleteCandidate]);
  const largestKwh = useMemo(() => Math.max(1, ...bills.flatMap((bill) => [bill.billedKwh, bill.theoreticalGridKwh])), [bills]);
  const duplicateMonths = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bill of bills) counts.set(bill.periodEnd.slice(0, 7), (counts.get(bill.periodEnd.slice(0, 7)) || 0) + 1);
    return new Set([...counts].filter(([, count]) => count > 1).map(([month]) => month));
  }, [bills]);
  const billYears = useMemo(() => [...new Set(bills.map((bill) => bill.periodEnd.slice(0, 4)))].sort((a, b) => b.localeCompare(a)), [bills]);
  const chartBills = useMemo(() => {
    const ordered = [...bills].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    if (/^\d{4}$/.test(chartFilter)) return ordered.filter((bill) => bill.periodEnd.startsWith(chartFilter));
    const count = chartFilter === '6m' ? 6 : 12;
    const anchor = ordered.at(-1)?.periodEnd;
    if (!anchor) return [];
    const [year, month] = anchor.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - count, 1)).toISOString().slice(0, 10);
    return ordered.filter((bill) => bill.periodEnd >= start);
  }, [bills, chartFilter]);
  const consumptionChart = useMemo(() => {
    const ordered = chartBills;
    return {
      tooltip: { trigger: 'axis', confine: true, formatter: (params: unknown) => { const items = Array.isArray(params) ? params as Array<{dataIndex?:number}> : []; const bill = ordered[Number(items[0]?.dataIndex || 0)]; return bill ? `<b>${monthLabel(bill.periodEnd)}</b><br/>${bill.isEstimated ? 'Estimado' : 'Real'}: ${bill.billedKwh.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh<br/>Total a pagar: ${clp(bill.amountClp)}` : ''; } },
      legend: { top: 4, textStyle: { color: '#a9bdc3' } },
      grid: { left: 52, right: 20, top: 58, bottom: 50, containLabel: true },
      xAxis: { type: 'category', data: ordered.map((bill) => monthLabel(bill.periodEnd)), axisLabel: { color: '#8ba0a8', hideOverlap: true }, axisLine: { lineStyle: { color: '#29444e' } } },
      yAxis: [{ type: 'value', name: 'kWh', axisLabel: { color: '#8ba0a8' }, nameTextStyle: { color: '#8ba0a8' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } }, { type: 'value', name: 'CLP', axisLabel: { color: '#8ba0a8', formatter: (value:number) => `$${Math.round(value / 1000)}k` }, nameTextStyle: { color: '#8ba0a8' }, splitLine: { show: false } }],
      series: [
        { name: 'Consumo real', type: 'bar', stack: 'consumo', data: ordered.map((bill) => bill.isEstimated ? null : bill.billedKwh), itemStyle: { color: '#4e9dff', borderRadius: [5, 5, 0, 0] }, label: { show: true, position: 'top', color: '#bcd9f7', formatter: (params:{value?:number}) => params.value == null ? '' : `${Number(params.value).toLocaleString('es-CL', { maximumFractionDigits: 1 })}` } },
        { name: 'Consumo estimado', type: 'bar', stack: 'consumo', data: ordered.map((bill) => bill.isEstimated ? bill.billedKwh : null), itemStyle: { color: '#ef9d42', borderRadius: [5, 5, 0, 0] }, label: { show: true, position: 'top', color: '#f3c27e', formatter: (params:{value?:number}) => params.value == null ? '' : `${Number(params.value).toLocaleString('es-CL', { maximumFractionDigits: 1 })}` } },
        { name: 'Total a pagar', type: 'line', yAxisIndex: 1, data: ordered.map((bill) => bill.amountClp), symbolSize: 7, lineStyle: { color: '#64d7aa', width: 2 }, itemStyle: { color: '#64d7aa' } }
      ]
    };
  }, [chartBills]);
  const chartSpendClp = useMemo(() => chartBills.reduce((sum, bill) => sum + bill.amountClp, 0), [chartBills]);
  const chartSpendLabel = /^\d{4}$/.test(chartFilter) ? `Gasto total en electricidad · ${chartFilter}` : chartFilter === '6m' ? 'Gasto total · últimos 6 meses' : 'Gasto total · últimos 12 meses';

  async function chooseFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage('Optimizando fotografías…');
    try {
      const selected = Array.from(files).slice(0, Math.max(0, 4 - images.length));
      const optimized = await Promise.all(selected.map(optimizeImage));
      const next = [...images, ...optimized];
      if (next.some((image) => image.bytes > 1_200_000) || next.reduce((sum, image) => sum + image.bytes, 0) > 2_800_000) throw new Error('Las páginas son demasiado pesadas para procesarlas juntas. Elimina una fotografía o vuelve a capturarla con menor resolución.');
      setImages(next); setAiExtraction(null); setMessage(`${next.length} ${next.length === 1 ? 'página preparada' : 'páginas preparadas'} para analizar.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible preparar las fotografías.'); }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function extract() {
    setExtracting(true); setMessage('La IA está leyendo y consolidando las páginas de la cuenta…');
    try {
      const result = await api<{ extracted: ExtractedBill; model: string }>(`devices/${deviceSn}/utility-bills/extract`, { method: 'POST', body: JSON.stringify({ images }) });
      const value = result.extracted; setAiExtraction(value); setAiModel(result.model);
      setDraft((current) => ({ ...current, periodStart: value.periodStart || current.periodStart, periodEnd: value.periodEnd || current.periodEnd, previousReading: textValue(value.previousReading), currentReading: textValue(value.currentReading), billedKwh: textValue(value.billedKwh), estimatedKwh: textValue(value.estimatedKwh), amountClp: textValue(value.amountClp), issueDate: textValue(value.issueDate), dueDate: textValue(value.dueDate), customerNumber: textValue(value.customerNumber), meterNumber: textValue(value.meterNumber), tariffName: textValue(value.tariffName), invoiceNumber: textValue(value.invoiceNumber), serviceAddress: textValue(value.serviceAddress), fixedChargeClp: textValue(value.fixedChargeClp), energyChargeClp: textValue(value.energyChargeClp), transportChargeClp: textValue(value.transportChargeClp), otherChargesClp: textValue(value.otherChargesClp), taxesClp: textValue(value.taxesClp) }));
      setMessage(`Lectura terminada · confianza ${Math.round(value.confidence * 100)}%. Revisa los datos antes de guardar.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible leer la cuenta con IA.'); }
    finally { setExtracting(false); }
  }

  async function save() {
    setSaving(true); setMessage('Guardando la cuenta, sus páginas y el comparativo permanente…');
    try {
      const result = await api<{ bill: UtilityBill }>(`devices/${deviceSn}/utility-bills`, { method: 'POST', body: JSON.stringify({ ...draft, previousReading: draft.previousReading === '' ? null : Number(draft.previousReading), currentReading: draft.currentReading === '' ? null : Number(draft.currentReading), billedKwh: actualKwh > 0 ? actualKwh : null, estimatedKwh: Number(draft.estimatedKwh || 0) > 0 ? Number(draft.estimatedKwh) : null, consumptionIsEstimated: aiExtraction?.consumptionIsEstimated === true, amountClp: Number(draft.amountClp || 0), fixedChargeClp: draft.fixedChargeClp === '' ? null : Number(draft.fixedChargeClp), energyChargeClp: draft.energyChargeClp === '' ? null : Number(draft.energyChargeClp), transportChargeClp: draft.transportChargeClp === '' ? null : Number(draft.transportChargeClp), otherChargesClp: draft.otherChargesClp === '' ? null : Number(draft.otherChargesClp), taxesClp: draft.taxesClp === '' ? null : Number(draft.taxesClp), chargeItems: aiExtraction?.chargeItems || [], images, aiExtraction, aiConfidence: aiExtraction?.confidence ?? null, aiModel }) });
      const savedMonth = result.bill.periodEnd.slice(0, 7);
      setBills((current) => [result.bill, ...current.filter((bill) => bill.id !== result.bill.id && bill.periodEnd.slice(0, 7) !== savedMonth)].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)));
      if (projection && result.bill.periodEnd >= projection.periodEnd) setProjection(null);
      setDraft(defaultDraft()); setImages([]); setAiExtraction(null); setAiModel(''); setOpen(false); setMessage(result.bill.documentWarnings?.length ? `Cuenta y monto guardados. ${result.bill.documentWarnings.join(' ')}` : 'Cuenta, documentos y datos analíticos guardados correctamente.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible guardar la cuenta.'); }
    finally { setSaving(false); }
  }

  function beginEdit(bill: UtilityBill) {
    setEditingBill(bill); setEditDraft(draftFromBill(bill)); setEditConsumptionStatus(bill.isEstimated ? 'estimated' : 'actual'); setMessage(`Editando la cuenta de ${monthLabel(bill.periodEnd)}.`);
  }

  async function saveEdit() {
    if (!editingBill || !editDraft) return;
    setEditSaving(true); setMessage('Guardando la corrección y recalculando el período…');
    try {
      const numberOrNull = (value: string) => value === '' ? null : Number(value);
      const result = await api<{ bill: UtilityBill }>(`devices/${deviceSn}/utility-bills/${editingBill.id}`, { method: 'PATCH', body: JSON.stringify({
        ...editDraft, previousReading: numberOrNull(editDraft.previousReading), currentReading: numberOrNull(editDraft.currentReading), billedKwh: numberOrNull(editDraft.billedKwh),
        consumptionStatus: editConsumptionStatus, amountClp: Number(editDraft.amountClp || 0), fixedChargeClp: numberOrNull(editDraft.fixedChargeClp),
        energyChargeClp: numberOrNull(editDraft.energyChargeClp), transportChargeClp: numberOrNull(editDraft.transportChargeClp), otherChargesClp: numberOrNull(editDraft.otherChargesClp), taxesClp: numberOrNull(editDraft.taxesClp)
      }) });
      setBills((current) => [result.bill, ...current.filter((bill) => bill.id !== result.bill.id)].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)));
      setEditingBill(null); setEditDraft(null); setMessage(`Cuenta de ${monthLabel(result.bill.periodEnd)} corregida y guardada permanentemente.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible guardar la corrección.'); }
    finally { setEditSaving(false); }
  }

  async function removeBill() {
    if (!deleteCandidate) return;
    setDeleting(true); setMessage('');
    try {
      await api(`devices/${deviceSn}/utility-bills/${deleteCandidate.id}`, { method: 'DELETE' });
      const result = await api<{ list: UtilityBill[]; projection: UtilityBillProjection | null }>(`devices/${deviceSn}/utility-bills`);
      setBills(result.list || []); setProjection(result.projection || null);
      setMessage(`Cuenta de ${monthLabel(deleteCandidate.periodEnd)} eliminada junto con sus fotografías y datos guardados.`);
      setDeleteCandidate(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible eliminar la cuenta.'); }
    finally { setDeleting(false); }
  }

  const setField = (name: keyof ReturnType<typeof defaultDraft>, value: string) => setDraft((current) => ({ ...current, [name]: value }));
  return <section className="enel-bills-section">
    <header className="enel-bills-heading"><div><small>Control real frente a Mi Solar · {siteLabel}</small><h2>Cuentas eléctricas Enel</h2><p>Guarda siempre la cuenta y su monto final. La tarifa energética usa energía más traslado; deudas, intereses, descuentos e impuestos quedan registrados fuera del cálculo.</p></div><button type="button" className="primary-action" onClick={() => setOpen((value) => !value)}>{open ? <X/> : <FilePlus2/>}{open ? 'Cerrar' : 'Agregar cuenta'}</button></header>
    {bills.length ? <section className="panel bill-consumption-history"><header><div><small>Historial mensual respaldado</small><h3><BarChart3/> Consumo facturado por período</h3></div><p><i/> Real <i/> Estimado</p></header><div className="bill-chart-filters" role="group" aria-label="Período del gráfico de cuentas"><button type="button" className={chartFilter === '12m' ? 'active' : ''} onClick={() => setChartFilter('12m')}>12 meses</button>{billYears.map((year) => <button type="button" className={chartFilter === year ? 'active' : ''} onClick={() => setChartFilter(year)} key={year}>{year}</button>)}<button type="button" className={chartFilter === '6m' ? 'active' : ''} onClick={() => setChartFilter('6m')}>6 meses</button></div>{chartBills.length ? <><EChart option={consumptionChart}/><div className="annual-electricity-total"><span><small>{chartSpendLabel}</small><strong>{clp(chartSpendClp)}</strong></span><em>{chartBills.length} {chartBills.length === 1 ? 'cuenta incluida' : 'cuentas incluidas'}</em></div></> : <div className="chart-loading">No hay cuentas guardadas en este período.</div>}</section> : null}
    {projection ? <section className="panel utility-bill-projection"><header><div><small>Cuenta todavía no ingresada · estimación Mi Solar</small><h3>Proyección cuenta {monthLabel(projection.periodEnd)}</h3><p>{dateLabel(projection.periodStart)} → {dateLabel(projection.periodEnd)}</p></div><strong>{clp(projection.projectedAmountClp)}</strong></header><div><span><small>Red ya consumida</small><b>{kwh(projection.observedGridKwh)}</b><em>Desde {dateLabel(projection.periodStart)} hasta la última muestra</em></span><span><small>Consumo total promedio diario</small><b>{kwh(projection.averageDailyLoadKwh)}</b><em>Calculado sobre {projection.coveredHours.toFixed(1)} h respaldadas</em></span><span><small>Demanda restante estimada</small><b>{kwh(projection.projectedFutureLoadKwh)}</b><em>{projection.remainingDays.toFixed(1)} días equivalentes por completar</em></span><span><small>Solar previsto para los días restantes</small><b>{kwh(projection.projectedFutureSolarKwh)}</b><em>{projection.forecastDays} días meteorológicos disponibles</em></span><span><small>Red futura estimada</small><b>{kwh(projection.projectedFutureGridKwh)}</b><em>Demanda restante menos producción solar prevista</em></span><span><small>Red total proyectada</small><b>{kwh(projection.projectedGridKwh)}</b><em>{clp(projection.unitRateClp)} por kWh · cuenta {clp(projection.projectedAmountClp)}</em></span></div><p className="utility-projection-formula"><b>Cálculo:</b> red ya consumida + (consumo promedio diario × días restantes − producción solar prevista).</p><footer>Último dato energético: {projection.lastDataAt ? new Date(projection.lastDataAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'medium' }) : 'sin muestras'} · cálculo actualizado {new Date(projection.calculatedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · cobertura {projection.archiveCoveragePct.toFixed(1)}%</footer></section> : null}
    {open ? <section className="panel enel-bill-form">
      <header><div><small>Nueva cuenta · ingreso manual o inteligente</small><h3>Resumen de la cuenta</h3></div><strong>{kwh(calculatedKwh)}</strong></header>
      <div className="bill-ai-uploader"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden onChange={(event) => void chooseFiles(event.target.files)}/><button type="button" className="bill-upload-button" onClick={() => fileRef.current?.click()} disabled={images.length >= 4}><Upload/><span><b>Subir fotografías de la cuenta</b><small>Una a cuatro páginas · JPG, PNG o WebP</small></span></button>{images.length ? <div className="bill-image-strip">{images.map((image, index) => <figure key={`${image.name}-${index}`}><img src={image.dataUrl} alt={`Página ${index + 1} de la cuenta`}/><figcaption>Página {index + 1}</figcaption><button type="button" aria-label={`Eliminar página ${index + 1}`} onClick={() => { setImages((current) => current.filter((_, item) => item !== index)); setAiExtraction(null); }}><Trash2/></button></figure>)}</div> : null}<button type="button" className="primary-action bill-ai-action" disabled={!images.length || extracting} onClick={() => void extract()}><Sparkles/>{extracting ? 'Leyendo cuenta…' : 'Extraer datos con IA'}</button>{aiExtraction ? <div className="bill-ai-result"><CheckCircle2/><span><b>Datos extraídos y listos para revisar</b><small>Confianza {Math.round(aiExtraction.confidence * 100)}% · {images.length} {images.length === 1 ? 'página' : 'páginas'} consolidadas</small></span></div> : null}</div>
      <div className="enel-form-grid">
        <label>Desde<input type="date" value={draft.periodStart} max={draft.periodEnd} onChange={(event) => setField('periodStart', event.target.value)}/></label>
        <label>Hasta<input type="date" value={draft.periodEnd} min={draft.periodStart} max={formatSiteDate()} onChange={(event) => setField('periodEnd', event.target.value)}/></label>
        <label>Consumo facturado <span>kWh indicados por Enel</span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.billedKwh} placeholder={readingKwh ? readingKwh.toFixed(2) : '0'} onChange={(event) => setField('billedKwh', event.target.value)}/></label>
        <label>Consumo estimado <span>usar si la lectura está pendiente</span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.estimatedKwh} placeholder="Pendiente" onChange={(event) => setField('estimatedKwh', event.target.value)}/></label>
        <label>Lectura anterior <span>opcional · kWh del medidor</span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.previousReading} onChange={(event) => setField('previousReading', event.target.value)}/></label>
        <label>Lectura actual <span>opcional · kWh del medidor</span><input type="number" min={draft.previousReading || '0'} step="0.01" inputMode="decimal" value={draft.currentReading} onChange={(event) => setField('currentReading', event.target.value)}/></label>
        <label>Cargo de energía del período <span>parte de la base $/kWh</span><input type="number" min="0" step="1" inputMode="numeric" value={draft.energyChargeClp} onChange={(event) => setField('energyChargeClp', event.target.value)}/></label>
        <label>Costo de traslado <span>transporte, transmisión o distribución</span><input type="number" min="0" step="1" inputMode="numeric" value={draft.transportChargeClp} onChange={(event) => setField('transportChargeClp', event.target.value)}/></label>
        <label>Monto total a pagar <span>incluye todos los demás conceptos</span><input type="number" min="0" step="1" inputMode="numeric" value={draft.amountClp} onChange={(event) => setField('amountClp', event.target.value)}/></label>
      </div>
      <details className="bill-extra-fields" open={Boolean(aiExtraction)}><summary>Datos adicionales de la cuenta</summary><div className="enel-form-grid bill-details-grid">
        <label>Emisión<input type="date" value={draft.issueDate} onChange={(event) => setField('issueDate', event.target.value)}/></label><label>Vencimiento<input type="date" value={draft.dueDate} onChange={(event) => setField('dueDate', event.target.value)}/></label><label>N.º cliente<input value={draft.customerNumber} onChange={(event) => setField('customerNumber', event.target.value)}/></label><label>N.º medidor<input value={draft.meterNumber} onChange={(event) => setField('meterNumber', event.target.value)}/></label><label>Tarifa<input value={draft.tariffName} onChange={(event) => setField('tariffName', event.target.value)}/></label><label>N.º documento<input value={draft.invoiceNumber} onChange={(event) => setField('invoiceNumber', event.target.value)}/></label><label className="bill-address">Dirección de suministro<input value={draft.serviceAddress} onChange={(event) => setField('serviceAddress', event.target.value)}/></label><label>Cargo fijo<input type="number" min="0" value={draft.fixedChargeClp} onChange={(event) => setField('fixedChargeClp', event.target.value)}/></label><label>Otros cargos<input type="number" min="0" value={draft.otherChargesClp} onChange={(event) => setField('otherChargesClp', event.target.value)}/></label><label>Impuestos<input type="number" min="0" value={draft.taxesClp} onChange={(event) => setField('taxesClp', event.target.value)}/></label>
      </div>{aiExtraction?.chargeItems?.length ? <div className="bill-charge-breakdown"><header><strong>Desglose detectado</strong><small>Las filas verdes forman energía + traslado</small></header>{aiExtraction.chargeItems.map((item, index) => <div className={item.includedInEnergyRate ? 'included' : ''} key={`${item.label}-${index}`}><span>{item.label}<small>{item.includedInEnergyRate ? 'Incluido en $/kWh' : 'Guardado, fuera del cálculo'}</small></span><b>{clp(item.amountClp)}</b></div>)}</div> : null}{aiExtraction?.warnings?.length ? <ul className="bill-ai-warnings">{aiExtraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</details>
      <div className="bill-rate-formula"><b>Fórmula energética</b><span>({clp(Number(draft.energyChargeClp || 0))} energía + {clp(Number(draft.transportChargeClp || 0))} traslado) ÷ {calculatedKwh > 0 ? kwh(calculatedKwh) : 'consumo pendiente'} = <strong>{calculatedRate == null ? 'Pendiente' : `${clp(calculatedRate)} / kWh`}</strong></span><small>El monto final siempre se guarda. Cargo fijo, impuestos, descuentos, deudas, intereses y repactaciones permanecen en el detalle, fuera de esta división.</small></div>
      <div className="enel-calculated"><span><Gauge/><small>Consumo del período {actualKwh > 0 ? 'real' : 'estimado'}</small><strong>{kwh(calculatedKwh)}</strong></span><span><CircleDollarSign/><small>Valor calculado por kWh</small><strong>{calculatedRate == null ? 'No se pudo calcular' : `${clp(calculatedRate)} / kWh`}</strong></span></div>
      <button type="button" className="primary-action enel-save" disabled={saving} onClick={() => void save()}><Save/>{saving ? 'Guardando…' : 'Guardar siempre la cuenta'}</button>
    </section> : null}
    {editingBill && editDraft ? <section className="panel enel-bill-form bill-edit-form">
      <header><div><small>Corrección manual · {monthLabel(editingBill.periodEnd)}</small><h3>Editar datos de la cuenta</h3></div><button type="button" className="bill-edit-close" onClick={() => { setEditingBill(null); setEditDraft(null); }}><X/> Cancelar</button></header>
      <p className="bill-edit-help">Corrige cualquier dato que la IA haya interpretado mal. Al guardar se recalculan los días, el promedio, la tarifa y el comparativo con Mi Solar.</p>
      <div className="enel-form-grid bill-details-grid">
        <label>Desde<input type="date" value={editDraft.periodStart} max={editDraft.periodEnd} onChange={(event) => setEditDraft({ ...editDraft, periodStart: event.target.value })}/></label><label>Hasta<input type="date" value={editDraft.periodEnd} min={editDraft.periodStart} onChange={(event) => setEditDraft({ ...editDraft, periodEnd: event.target.value })}/></label><label>Consumo del período<input type="number" min="0" step="0.01" value={editDraft.billedKwh} onChange={(event) => setEditDraft({ ...editDraft, billedKwh: event.target.value })}/></label><label>Tipo de consumo<select value={editConsumptionStatus} onChange={(event) => setEditConsumptionStatus(event.target.value === 'estimated' ? 'estimated' : 'actual')}><option value="actual">Real</option><option value="estimated">Estimado</option></select></label><label>Total a pagar<input type="number" min="0" step="1" value={editDraft.amountClp} onChange={(event) => setEditDraft({ ...editDraft, amountClp: event.target.value })}/></label>
        <label>Lectura anterior<input type="number" min="0" step="0.01" value={editDraft.previousReading} onChange={(event) => setEditDraft({ ...editDraft, previousReading: event.target.value })}/></label><label>Lectura actual<input type="number" min="0" step="0.01" value={editDraft.currentReading} onChange={(event) => setEditDraft({ ...editDraft, currentReading: event.target.value })}/></label><label>Emisión<input type="date" value={editDraft.issueDate} onChange={(event) => setEditDraft({ ...editDraft, issueDate: event.target.value })}/></label><label>Vencimiento<input type="date" value={editDraft.dueDate} onChange={(event) => setEditDraft({ ...editDraft, dueDate: event.target.value })}/></label>
        <label>Cargo de energía<input type="number" min="0" step="1" value={editDraft.energyChargeClp} onChange={(event) => setEditDraft({ ...editDraft, energyChargeClp: event.target.value })}/></label><label>Costo de traslado<input type="number" min="0" step="1" value={editDraft.transportChargeClp} onChange={(event) => setEditDraft({ ...editDraft, transportChargeClp: event.target.value })}/></label><label>Cargo fijo<input type="number" min="0" step="1" value={editDraft.fixedChargeClp} onChange={(event) => setEditDraft({ ...editDraft, fixedChargeClp: event.target.value })}/></label><label>Otros cargos o descuentos<input type="number" step="1" value={editDraft.otherChargesClp} onChange={(event) => setEditDraft({ ...editDraft, otherChargesClp: event.target.value })}/></label>
        <label>Impuestos<input type="number" min="0" step="1" value={editDraft.taxesClp} onChange={(event) => setEditDraft({ ...editDraft, taxesClp: event.target.value })}/></label><label>N.º cliente<input value={editDraft.customerNumber} onChange={(event) => setEditDraft({ ...editDraft, customerNumber: event.target.value })}/></label><label>N.º medidor<input value={editDraft.meterNumber} onChange={(event) => setEditDraft({ ...editDraft, meterNumber: event.target.value })}/></label><label>Tarifa<input value={editDraft.tariffName} onChange={(event) => setEditDraft({ ...editDraft, tariffName: event.target.value })}/></label><label>N.º documento<input value={editDraft.invoiceNumber} onChange={(event) => setEditDraft({ ...editDraft, invoiceNumber: event.target.value })}/></label><label className="bill-address">Dirección de suministro<input value={editDraft.serviceAddress} onChange={(event) => setEditDraft({ ...editDraft, serviceAddress: event.target.value })}/></label>
      </div><button type="button" className="primary-action enel-save" disabled={editSaving} onClick={() => void saveEdit()}><Save/>{editSaving ? 'Guardando corrección…' : 'Guardar cambios'}</button>
    </section> : null}
    {message ? <p className="enel-bill-message" role="status">{message}</p> : null}
    {loading ? <div className="chart-loading">Consultando cuentas guardadas…</div> : bills.length ? <>
      <div className="enel-bill-list">{bills.map((bill, index) => {
        const variancePct = bill.theoreticalGridKwh > 0 ? bill.differenceKwh / bill.theoreticalGridKwh * 100 : 0;
        return <details className="panel enel-bill-card" key={bill.id}>
          <summary className="bill-period-summary"><div><small>{index === 0 ? 'Cuenta más reciente' : 'Cuenta guardada'} · {bill.source === 'photo-ai' ? '✨ IA' : 'Manual'}{duplicateMonths.has(bill.periodEnd.slice(0, 7)) ? <b className="bill-duplicate-badge">Duplicada</b> : null}</small><h3>{monthLabel(bill.periodEnd)}</h3><p>{dateLabel(bill.periodStart)} → {dateLabel(bill.periodEnd)} · {bill.periodDays} días</p></div><div className="bill-period-kpis"><span><small>Consumo del período</small><strong>{bill.billedKwh > 0 ? kwh(bill.billedKwh) : 'Pendiente'}</strong><em className={bill.isEstimated ? 'estimated' : 'actual'}>{bill.isEstimated ? 'Estimado' : 'Real'}</em></span><span><small>Promedio diario</small><strong>{bill.averageDailyKwh == null ? 'Pendiente' : `${bill.averageDailyKwh.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh/día`}</strong></span><span><small>Total a pagar</small><strong>{clp(bill.amountClp)}</strong></span><ChevronDown/></div></summary>
          <div className="bill-detail-body"><div className="bill-detail-actions"><button type="button" onClick={() => beginEdit(bill)}><Pencil/> Editar datos</button><button type="button" className="danger" onClick={() => setDeleteCandidate(bill)}><Trash2/> Borrar cuenta</button></div><div className="enel-bill-kpis"><span><small>Consumo Enel</small><b>{bill.billedKwh > 0 ? kwh(bill.billedKwh) : 'Pendiente'}</b></span><span><small>Cálculo Mi Solar</small><b>{kwh(bill.theoreticalGridKwh)}</b></span><span><small>Diferencia</small><b className={Math.abs(variancePct) <= 10 ? 'good' : 'warn'}>{bill.differenceKwh >= 0 ? '+' : ''}{bill.differenceKwh.toFixed(2)} kWh · {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%</b></span><span><small>Valor energía + traslado</small><b>{bill.effectiveRateClp == null ? 'Pendiente' : `${clp(bill.effectiveRateClp)} / kWh`}</b></span></div>
          <div className="bill-saved-formula"><span>Base tarifaria: <b>{bill.rateBaseClp == null ? 'Pendiente' : clp(bill.rateBaseClp)}</b></span><small>{`${bill.energyChargeClp == null ? 'Energía pendiente' : `Energía ${clp(bill.energyChargeClp)}`} · ${bill.transportChargeClp == null ? 'Traslado pendiente' : `Traslado ${clp(bill.transportChargeClp)}`}`}</small></div>
          <dl className="bill-account-details"><div><dt>Emisión</dt><dd>{bill.issueDate ? dateLabel(bill.issueDate) : 'Pendiente'}</dd></div><div><dt>Vencimiento</dt><dd>{bill.dueDate ? dateLabel(bill.dueDate) : 'Pendiente'}</dd></div><div><dt>N.º cliente</dt><dd>{bill.customerNumber || 'Pendiente'}</dd></div><div><dt>N.º medidor</dt><dd>{bill.meterNumber || 'Pendiente'}</dd></div><div><dt>Tarifa</dt><dd>{bill.tariffName || 'Pendiente'}</dd></div><div><dt>N.º documento</dt><dd>{bill.invoiceNumber || 'Pendiente'}</dd></div><div><dt>Cargo fijo</dt><dd>{bill.fixedChargeClp == null ? 'Pendiente' : clp(bill.fixedChargeClp)}</dd></div><div><dt>Otros cargos</dt><dd>{bill.otherChargesClp == null ? 'Pendiente' : clp(bill.otherChargesClp)}</dd></div><div><dt>Impuestos</dt><dd>{bill.taxesClp == null ? 'Pendiente' : clp(bill.taxesClp)}</dd></div><div className="wide"><dt>Dirección</dt><dd>{bill.serviceAddress || 'Pendiente'}</dd></div></dl>
          {bill.source === 'photo-ai' && bill.documents?.length ? <section className="saved-bill-pages"><header><FileImage/><div><strong>Fotografías analizadas por IA</strong><small>Toca una página para verla; podrás cerrarla y volver a Mi Solar</small></div></header><div>{bill.documents.map((document) => <figure key={document.id}><button type="button" onClick={() => setViewingDocument(document)} aria-label={`Abrir página ${document.pageNumber} de la cuenta de ${monthLabel(bill.periodEnd)}`}><img loading="lazy" src={`/api/devices/${encodeURIComponent(deviceSn)}/utility-bills/documents/${document.id}`} alt={`Página ${document.pageNumber} de la cuenta de ${monthLabel(bill.periodEnd)}`}/></button><figcaption>Página {document.pageNumber}{document.originalName ? ` · ${document.originalName}` : ''}</figcaption></figure>)}</div></section> : null}
          {bill.chargeItems?.length ? <details className="saved-charge-details"><summary>Ver todos los conceptos ({bill.chargeItems.length})</summary>{bill.chargeItems.map((item,itemIndex)=><div className={item.includedInEnergyRate?'included':''} key={`${item.label}-${itemIndex}`}><span>{item.label}</span><b>{clp(item.amountClp)}</b></div>)}</details>:null}<div className="enel-comparison" aria-label={`Cuenta ${bill.billedKwh.toFixed(2)} kWh; Mi Solar ${bill.theoreticalGridKwh.toFixed(2)} kWh`}><span className={bill.isEstimated ? 'estimated' : ''}><i style={{ width: `${bill.billedKwh / largestKwh * 100}%` }}/><small>{bill.isEstimated ? 'Cuenta estimada' : 'Cuenta real'}</small></span><span><i style={{ width: `${bill.theoreticalGridKwh / largestKwh * 100}%` }}/><small>Mi Solar</small></span></div><footer><CalendarRange/><span>{bill.previousReading != null && bill.currentReading != null ? `Lecturas: ${bill.previousReading.toLocaleString('es-CL')} → ${bill.currentReading.toLocaleString('es-CL')} kWh` : 'Lecturas pendientes o no informadas'}</span><small>Respaldo disponible: {bill.archiveCoveragePct.toFixed(1)}%</small></footer></div>
        </details>;
      })}</div>
    </> : <section className="panel enel-empty"><FileImage/><div><strong>Aún no hay cuentas guardadas</strong><p>Sube las fotografías de la primera cuenta para comenzar el comparativo mensual.</p></div></section>}
    {viewingDocument ? <div className="bill-document-viewer" role="dialog" aria-modal="true" aria-label={`Página ${viewingDocument.pageNumber} de la cuenta`} onClick={(event) => { if (event.target === event.currentTarget) setViewingDocument(null); }}><header><div><strong>Página {viewingDocument.pageNumber}</strong><small>{viewingDocument.originalName || 'Cuenta Enel respaldada'}</small></div><button type="button" onClick={() => setViewingDocument(null)}><X/> Cerrar y volver</button></header><img src={`/api/devices/${encodeURIComponent(deviceSn)}/utility-bills/documents/${viewingDocument.id}`} alt={`Página ${viewingDocument.pageNumber} de la cuenta`}/></div> : null}
    {deleteCandidate ? <div className="bill-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="bill-delete-title"><section><Trash2/><div><small>Eliminación permanente</small><h3 id="bill-delete-title">¿Borrar la cuenta de {monthLabel(deleteCandidate.periodEnd)}?</h3><p>Se eliminarán la cuenta, sus datos extraídos y todas sus fotografías de la base de datos. Esta acción no se puede deshacer.</p></div><footer><button type="button" onClick={() => setDeleteCandidate(null)} disabled={deleting}>Cancelar</button><button type="button" className="danger" onClick={() => void removeBill()} disabled={deleting}>{deleting ? 'Eliminando…' : 'Sí, borrar definitivamente'}</button></footer></section></div> : null}
  </section>;
}
