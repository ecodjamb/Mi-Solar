import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, CircleDollarSign, FilePlus2, Gauge, Save, X } from 'lucide-react';
import { api } from '../services/api';
import { clp, formatSiteDate, kwh } from '../utils/energy';

type UtilityBill = {
  id: number;
  periodStart: string;
  periodEnd: string;
  previousReading: number;
  currentReading: number;
  billedKwh: number;
  amountClp: number;
  effectiveRateClp: number;
  theoreticalGridKwh: number;
  archiveCoveragePct: number;
  differenceKwh: number;
};

function addDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function defaultDraft() {
  const periodEnd = formatSiteDate();
  const periodStart = addDays(periodEnd, -30);
  return { periodStart, periodEnd, previousReading: '', currentReading: '', amountClp: '' };
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EnelBillsSection({ deviceSn, siteLabel }: { deviceSn: string; siteLabel: string }) {
  const [bills, setBills] = useState<UtilityBill[]>([]);
  const [draft, setDraft] = useState(defaultDraft);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const calculatedKwh = Math.max(0, Number(draft.currentReading || 0) - Number(draft.previousReading || 0));
  const calculatedRate = calculatedKwh > 0 ? Number(draft.amountClp || 0) / calculatedKwh : 0;

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ list: UtilityBill[] }>(`devices/${deviceSn}/utility-bills`)
      .then((result) => active && setBills(result.list || []))
      .catch((error) => active && setMessage(error instanceof Error ? error.message : 'No fue posible cargar las cuentas.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [deviceSn]);

  const largestKwh = useMemo(() => Math.max(1, ...bills.flatMap((bill) => [bill.billedKwh, bill.theoreticalGridKwh])), [bills]);

  async function save() {
    setSaving(true); setMessage('Calculando el comparativo con el respaldo permanente…');
    try {
      const result = await api<{ bill: UtilityBill }>(`devices/${deviceSn}/utility-bills`, {
        method: 'POST', body: JSON.stringify({
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          previousReading: Number(draft.previousReading),
          currentReading: Number(draft.currentReading),
          amountClp: Number(draft.amountClp)
        })
      });
      setBills((current) => [result.bill, ...current.filter((bill) => bill.id !== result.bill.id)].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)));
      setDraft(defaultDraft()); setOpen(false); setMessage('Cuenta guardada y comparada correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar la cuenta.');
    } finally { setSaving(false); }
  }

  return <section className="enel-bills-section">
    <header className="enel-bills-heading"><div><small>Control real frente a Mi Solar · {siteLabel}</small><h2>Cuentas eléctricas Enel</h2><p>Registra cada cuenta y compárala con la energía de red calculada por Mi Solar entre las mismas fechas.</p></div><button type="button" className="primary-action" onClick={() => setOpen((value) => !value)}>{open ? <X /> : <FilePlus2 />}{open ? 'Cerrar' : 'Agregar cuenta'}</button></header>
    {open ? <section className="panel enel-bill-form"><header><div><small>Nueva lectura mensual</small><h3>Resumen de la cuenta</h3></div><strong>{kwh(calculatedKwh)}</strong></header><div className="enel-form-grid">
      <label>Desde<input type="date" value={draft.periodStart} max={draft.periodEnd} onChange={(event) => setDraft((value) => ({ ...value, periodStart: event.target.value }))}/></label>
      <label>Hasta<input type="date" value={draft.periodEnd} min={draft.periodStart} max={formatSiteDate()} onChange={(event) => setDraft((value) => ({ ...value, periodEnd: event.target.value }))}/></label>
      <label>Lectura anterior <span>kWh del medidor</span><input type="number" min="0" step="0.01" inputMode="decimal" value={draft.previousReading} onChange={(event) => setDraft((value) => ({ ...value, previousReading: event.target.value }))}/></label>
      <label>Lectura actual <span>kWh del medidor</span><input type="number" min={draft.previousReading || '0'} step="0.01" inputMode="decimal" value={draft.currentReading} onChange={(event) => setDraft((value) => ({ ...value, currentReading: event.target.value }))}/></label>
      <label>Monto total a pagar <span>pesos chilenos</span><input type="number" min="0" step="1" inputMode="numeric" value={draft.amountClp} onChange={(event) => setDraft((value) => ({ ...value, amountClp: event.target.value }))}/></label>
    </div><div className="enel-calculated"><span><Gauge/><small>Consumo calculado</small><strong>{kwh(calculatedKwh)}</strong></span><span><CircleDollarSign/><small>Valor efectivo</small><strong>{clp(calculatedRate)} / kWh</strong></span></div><button type="button" className="primary-action enel-save" disabled={saving || !draft.periodStart || !draft.periodEnd || calculatedKwh <= 0 || draft.amountClp === '' || Number(draft.amountClp) < 0} onClick={() => void save()}><Save/>{saving ? 'Guardando…' : 'Guardar cuenta y comparar'}</button></section> : null}
    {message ? <p className="enel-bill-message" role="status">{message}</p> : null}
    {loading ? <div className="chart-loading">Consultando cuentas guardadas…</div> : bills.length ? <div className="enel-bill-list">{bills.map((bill) => {
      const variancePct = bill.theoreticalGridKwh > 0 ? bill.differenceKwh / bill.theoreticalGridKwh * 100 : 0;
      return <article className="panel enel-bill-card" key={bill.id}><header><div><small>Cuenta más reciente primero</small><h3>{dateLabel(bill.periodStart)} → {dateLabel(bill.periodEnd)}</h3></div><strong>{clp(bill.amountClp)}</strong></header><div className="enel-bill-kpis"><span><small>Consumo Enel</small><b>{kwh(bill.billedKwh)}</b></span><span><small>Cálculo Mi Solar</small><b>{kwh(bill.theoreticalGridKwh)}</b></span><span><small>Diferencia</small><b className={Math.abs(variancePct) <= 10 ? 'good' : 'warn'}>{bill.differenceKwh >= 0 ? '+' : ''}{bill.differenceKwh.toFixed(2)} kWh · {variancePct >= 0 ? '+' : ''}{variancePct.toFixed(1)}%</b></span><span><small>Valor efectivo</small><b>{clp(bill.effectiveRateClp)} / kWh</b></span></div><div className="enel-comparison" aria-label={`Enel ${bill.billedKwh.toFixed(2)} kWh; Mi Solar ${bill.theoreticalGridKwh.toFixed(2)} kWh`}><span><i style={{ width: `${bill.billedKwh / largestKwh * 100}%` }}/><small>Cuenta real</small></span><span><i style={{ width: `${bill.theoreticalGridKwh / largestKwh * 100}%` }}/><small>Mi Solar</small></span></div><footer><CalendarRange/><span>Lecturas: {bill.previousReading.toLocaleString('es-CL')} → {bill.currentReading.toLocaleString('es-CL')} kWh</span><small>Respaldo disponible: {bill.archiveCoveragePct.toFixed(1)}%</small></footer></article>;
    })}</div> : <section className="panel enel-empty"><FilePlus2/><div><strong>Aún no hay cuentas guardadas</strong><p>Agrega la primera para comenzar el comparativo mensual.</p></div></section>}
  </section>;
}
