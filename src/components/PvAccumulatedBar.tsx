import type { DailyEnergy } from '../types';
import { kwh } from '../utils/energy';

export default function PvAccumulatedBar({ energy, title, compact = false }: { energy: DailyEnergy; title: string; compact?: boolean }) {
  const total = Math.max(0, energy.pv1) + Math.max(0, energy.pv2);
  const pv1Pct = total > 0 ? energy.pv1 / total * 100 : 0;
  const pv2Pct = total > 0 ? energy.pv2 / total * 100 : 0;
  return <section className={`panel pv-accumulated-card ${compact ? 'compact' : ''}`}>
    <header><div><small>Aporte fotovoltaico acumulado</small><h2>{title}</h2></div><strong>{kwh(total)}</strong></header>
    <div className="pv-stacked-track" role="img" aria-label={`PV1 ${kwh(energy.pv1)} y PV2 ${kwh(energy.pv2)}`}>
      <i className="pv1" style={{ width: `${pv1Pct}%` }}/><i className="pv2" style={{ width: `${pv2Pct}%` }}/>
    </div>
    <div className="pv-accumulated-values"><span><i className="pv1"/><small>PV1</small><b>{kwh(energy.pv1)}</b><em>{pv1Pct.toFixed(1)}%</em></span><span><i className="pv2"/><small>PV2</small><b>{kwh(energy.pv2)}</b><em>{pv2Pct.toFixed(1)}%</em></span></div>
    {!compact ? <p>Energía generada por cada string durante el período consultado.</p> : null}
  </section>;
}
