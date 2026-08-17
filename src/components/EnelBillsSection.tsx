import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CalendarRange, CheckCircle2, ChevronDown, CircleDollarSign, FileImage, FilePlus2, Gauge, Save, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { api } from '../services/api';
import { clp, formatSiteDate, kwh } from '../utils/energy';
import EChart from './EChart';

type UtilityBill = {
  id: number; periodStart: string; periodEnd: string; previousReading: number | null; currentReading: number | null;
  billedKwh: number; reportedKwh: number | null; estimatedKwh: number | null; consumptionStatus: 'actual'|'estimated'|'pending'; isEstimated: boolean;
  periodDays: number; averageDailyKwh: number | null; amountClp: number; rateBaseClp: number | null; effectiveRateClp: number | null; theoreticalGridKwh: number;
  archiveCoveragePct: number; differenceKwh: number; issueDate?: string | null; dueDate?: string | null;
  customerNumber?: string | null; meterNumber?: string | null; tariffName?: string | null; invoiceNumber?: string | null;
  serviceAddress?: string | null; fixedChargeClp?: number | null; energyChargeClp?: number | null; transportChargeClp?: number | null; otherChargesClp?: number | null; taxesClp?: number | null;
  chargeItems?: ChargeItem[]; source?: string; aiConfidence?: number | null; documentCount?: number; documentWarnings?: string[];
};
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
  const [draft, setDraft] = useState(defaultDraft);
  const [images, setImages] = useState<BillImage[]>([]);
  const [aiExtraction, setAiExtraction] = useState<ExtractedBill | null>(null);
  const [aiModel, setAiModel] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const readingKwh = draft.previousReading !== '' && draft.currentReading !== '' ? Math.max(0, Number(draft.currentReading) - Number(draft.previousReading)) : 0;
  const actualKwh = Number(draft.billedKwh || 0) > 0 ? Number(draft.billedKwh) : readingKwh;
  const estimatedKwh = Number(draft.estimatedKwh || 0) > 0 ? Number(draft.estimatedKwh) : 0;
  const calculatedKwh = actualKwh > 0 ? actualKwh : estimatedKwh;
  const rateBase = Number(draft.energyChargeClp || 0) + Number(draft.transportChargeClp || 0);
  const calculatedRate = calculatedKwh > 0 && Number(draft.energyChargeClp || 0) > 0 ? rateBase / calculatedKwh : null;

  useEffect(() => {
    let active = true; setLoading(true);
    api<{ list: UtilityBill[] }>(`devices/${deviceSn}/utility-bills`).then((result) => active && setBills(result.list || [])).catch((error) => active && setMessage(error instanceof Error ? error.message : 'No fue posible cargar las cuentas.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [deviceSn]);
  const largestKwh = useMemo(() => Math.max(1, ...bills.flatMap((bill) => [bill.billedKwh, bill.theoreticalGridKwh])), [bills]);
  const consumptionChart = useMemo(() => {
    const ordered = [...bills].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
    return {
      tooltip: { trigger: 'axis', confine: true, valueFormatter: (value: unknown) => value == null ? '—' : `${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh` },
      legend: { top: 4, textStyle: { color: '#a9bdc3' } },
      grid: { left: 52, right: 20, top: 58, bottom: 50, containLabel: true },
      xAxis: { type: 'category', data: ordered.map((bill) => monthLabel(bill.periodEnd)), axisLabel: { color: '#8ba0a8', hideOverlap: true }, axisLine: { lineStyle: { color: '#29444e' } } },
      yAxis: { type: 'value', name: 'kWh', axisLabel: { color: '#8ba0a8' }, nameTextStyle: { color: '#8ba0a8' }, splitLine: { lineStyle: { color: 'rgba(110,150,160,.12)' } } },
      series: [
        { name: 'Consumo real', type: 'bar', stack: 'consumo', data: ordered.map((bill) => bill.isEstimated ? null : bill.billedKwh), itemStyle: { color: '#4e9dff', borderRadius: [5, 5, 0, 0] } },
        { name: 'Consumo estimado', type: 'bar', stack: 'consumo', data: ordered.map((bill) => bill.isEstimated ? bill.billedKwh : null), itemStyle: { color: '#efbd42', borderRadius: [5, 5, 0, 0] } }
      ]
    };
  }, [bills]);

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
      const result = await api<{ bill: UtilityBill }>(`devices/${deviceSn}/utility-bills`, { method: 'POST', body: JSON.stringify({ ...draft, previousReading: draft.previousReading === '' ? null : Number(draft.previousReading), currentReading: draft.currentReading === '' ? null : Number(draft.currentReading), billedKwh: actualKwh > 0 ? actualKwh : null, estimatedKwh: estimatedKwh > 0 ? estimatedKwh : null, consumptionIsEstimated: aiExtraction?.consumptionIsEstimated === true, amountClp: Number(draft.amountClp), fixedChargeClp: draft.fixedChargeClp === '' ? null : Number(draft.fixedChargeClp), energyChargeClp: draft.energyChargeClp === '' ? null : Number(draft.energyChargeClp), transportChargeClp: draft.transportChargeClp === '' ? null : Number(draft.transportChargeClp), otherChargesClp: draft.otherChargesClp === '' ? null : Number(draft.otherChargesClp), taxesClp: draft.taxesClp === '' ? null : Number(draft.taxesClp), chargeItems: aiExtraction?.chargeItems || [], images, aiExtraction, aiConfidence: aiExtraction?.confidence ?? null, aiModel }) });
      setBills((current) => [result.bill, ...current.filter((bill) => bill.id !== result.bill.id)].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)));
      setDraft(defaultDraft()); setImages([]); setAiExtraction(null); setAiModel(''); setOpen(false); setMessage(result.bill.documentWarnings?.length ? `Cuenta y monto guardados. ${result.bill.documentWarnings.join(' ')}` : 'Cuenta, documentos y datos analíticos guardados correctamente.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible guardar la cuenta.'); }
    finally { setSaving(false); }
  }

  const setField = (name: keyof ReturnType<typeof defaultDraft>, value: string) => setDraft((current) => ({ ...current, [name]: value }));
  return <section className="enel-bills-section">
    <header className="enel-bills-heading"><div><small>Control real frente a Mi Solar · {siteLabel}</small><h2>Cuentas eléctricas Enel</h2><p>Guarda siempre la cuenta y su monto final. La tarifa energética usa energía más traslado; deudas, intereses, descuentos e impuestos quedan registrados fuera del cálculo.</p></div><button type="button" className="primary-action" onClick={() => setOpen((value) => !value)}>{open ? <X/> : <FilePlus2/>}{open ? 'Cerrar' : 'Agregar cuenta'}</button></header>
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
      <div className="enel-calculated"><span><Gauge/><small>Consumo facturado del período</small><strong>{kwh(calculatedKwh)}</strong></span><span><CircleDollarSign/><small>Valor real de la energía</small><strong>{calculatedRate == null ? 'Pendiente' : `${clp(calculatedRate)} / kWh`}</strong></span></div>
      <button type="button" className="primary-action enel-save" disabled={saving || !draft.periodStart || !draft.periodEnd || draft.amountClp === '' || !Number.isFinite(Number(draft.amountClp)) || Number(draft.amountClp) < 0} onClick={() => void save()}><Save/>{saving ? 'Guardando…' : 'Guardar cuenta y documentos'}</button>
    </section> : null}
    {message ? <p className="enel-bill-message" role="status">{message}</p> : null}
    {loading ? <div className="chart-loading">Consultando cuentas guardadas…</div> : bills.length ? <>
      <div className="enel-bill-list">{bills.map((bill, index) => {
        const variancePct = bill.theoreticalGridKwh > 0 ? bill.differenceKwh / bill.theoreticalGridKwh * 100 : 0;
        return <details className="panel enel-bill-card" key={bill.id}>
          <summary className="bill-period-summary"><div><small>{index === 0 ? 'Cuenta más reciente' : 'Cuenta guardada'} · {bill.source === 'photo-ai' ? '✨ IA' : 'Manual'}</small><h3>{monthLabel(bill.periodEnd)}</h3><p>{dateLabel(bill.periodStart)} → {dateLabel(bill.periodEnd)} · {bill.periodDays} días</p></div><div className="bill-period-kpis"><span><small>Consumo del período</small><strong>{bill.billedKwh > 0 ? kwh(bill.billedKwh) : 'Pendiente'}</strong><em className={bill.isEstimated ? 'estimated' : 'actual'}>{bill.isEstimated ? 'Estimado' : 'Real'}</em></span><span><small>Promedio diario</small><strong>{bill.averageDailyKwh == null ? 'Pendiente' : `${bill.averageDailyKwh.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kWh/día`}</strong></span><span><small>Total a pagar</small><strong>{clp(bill.amountClp)}</strong></span><ChevronDown/></div></summary>
          <div className="bill-detail-body"><div className="enel-bill-kpis"><span><small>Consumo Enel</small><b>{bill.billedKwh > 0 ? kwh(bill.billedKwh) : 'Pendiente'}</b></span><span><small>Cálculo Mi Solar</small><b>{kwh(bill.theoreticalGridKwh)}</b></span><span><small>Diferencia</small><b className={Math.abs(variancePct) <= 10 ? 'good' : 'warn'}>{bill.differenceKwh >= 0 ? '+' : ''}{bill.differenceKwh.toFixed(2)} kWh · {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%</b></span><span><small>Valor energía + traslado</small><b>{bill.effectiveRateClp == null ? 'Pendiente' : `${clp(bill.effectiveRateClp)} / kWh`}</b></span></div>
          <div className="bill-saved-formula"><span>Base tarifaria: <b>{bill.rateBaseClp == null ? 'Pendiente' : clp(bill.rateBaseClp)}</b></span><small>{`${bill.energyChargeClp == null ? 'Energía pendiente' : `Energía ${clp(bill.energyChargeClp)}`} · ${bill.transportChargeClp == null ? 'Traslado pendiente' : `Traslado ${clp(bill.transportChargeClp)}`}`}</small></div>
          <dl className="bill-account-details"><div><dt>Emisión</dt><dd>{bill.issueDate ? dateLabel(bill.issueDate) : 'Pendiente'}</dd></div><div><dt>Vencimiento</dt><dd>{bill.dueDate ? dateLabel(bill.dueDate) : 'Pendiente'}</dd></div><div><dt>N.º cliente</dt><dd>{bill.customerNumber || 'Pendiente'}</dd></div><div><dt>N.º medidor</dt><dd>{bill.meterNumber || 'Pendiente'}</dd></div><div><dt>Tarifa</dt><dd>{bill.tariffName || 'Pendiente'}</dd></div><div><dt>N.º documento</dt><dd>{bill.invoiceNumber || 'Pendiente'}</dd></div><div><dt>Cargo fijo</dt><dd>{bill.fixedChargeClp == null ? 'Pendiente' : clp(bill.fixedChargeClp)}</dd></div><div><dt>Otros cargos</dt><dd>{bill.otherChargesClp == null ? 'Pendiente' : clp(bill.otherChargesClp)}</dd></div><div><dt>Impuestos</dt><dd>{bill.taxesClp == null ? 'Pendiente' : clp(bill.taxesClp)}</dd></div><div className="wide"><dt>Dirección</dt><dd>{bill.serviceAddress || 'Pendiente'}</dd></div></dl>
          {bill.chargeItems?.length ? <details className="saved-charge-details"><summary>Ver todos los conceptos ({bill.chargeItems.length})</summary>{bill.chargeItems.map((item,itemIndex)=><div className={item.includedInEnergyRate?'included':''} key={`${item.label}-${itemIndex}`}><span>{item.label}</span><b>{clp(item.amountClp)}</b></div>)}</details>:null}<div className="enel-comparison" aria-label={`Cuenta ${bill.billedKwh.toFixed(2)} kWh; Mi Solar ${bill.theoreticalGridKwh.toFixed(2)} kWh`}><span className={bill.isEstimated ? 'estimated' : ''}><i style={{ width: `${bill.billedKwh / largestKwh * 100}%` }}/><small>{bill.isEstimated ? 'Cuenta estimada' : 'Cuenta real'}</small></span><span><i style={{ width: `${bill.theoreticalGridKwh / largestKwh * 100}%` }}/><small>Mi Solar</small></span></div><footer><CalendarRange/><span>{bill.previousReading != null && bill.currentReading != null ? `Lecturas: ${bill.previousReading.toLocaleString('es-CL')} → ${bill.currentReading.toLocaleString('es-CL')} kWh` : 'Lecturas pendientes o no informadas'}</span><small>Respaldo disponible: {bill.archiveCoveragePct.toFixed(1)}%</small></footer></div>
        </details>;
      })}</div>
      <section className="panel bill-consumption-history"><header><div><small>Historial mensual respaldado</small><h3><BarChart3/> Consumo facturado por período</h3></div><p><i/> Real <i/> Estimado</p></header><EChart option={consumptionChart}/></section>
    </> : <section className="panel enel-empty"><FileImage/><div><strong>Aún no hay cuentas guardadas</strong><p>Sube las fotografías de la primera cuenta para comenzar el comparativo mensual.</p></div></section>}
  </section>;
}
