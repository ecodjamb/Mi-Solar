import { Battery, House, PanelsTopLeft, RadioTower, Server, type LucideIcon } from 'lucide-react';
import type { DailyEnergy, HistoryRow, Realtime } from '../types';
import {
  batteryChargePower,
  batteryDischargePower,
  batterySoc,
  detectPvCount,
  gridPower,
  kwh,
  loadPower,
  pvPower,
  watts
} from '../utils/energy';

function Node({ className, icon: Icon, title, value, status, accumulated }: {
  className: string;
  icon: LucideIcon;
  title: string;
  value: string;
  status: string;
  accumulated: string;
}) {
  return <article className={`simple-flow-node ${className}`}>
    <div className="simple-flow-node-main"><Icon size={30}/><div><small>{title}</small><strong>{value}</strong><span>{status}</span></div></div>
    <div className="simple-flow-daily">{accumulated}</div>
  </article>;
}

export default function SimpleEnergyFlow({ data, history, today }: { data: Realtime; history: HistoryRow[]; today: DailyEnergy }) {
  const p1 = pvPower(data, 1), p2 = pvPower(data, 2), solar = p1 + p2;
  const load = loadPower(data), grid = gridPower(data);
  const charge = batteryChargePower(data), discharge = batteryDischargePower(data), soc = batterySoc(data);
  const pvCount = detectPvCount(data, history);
  const batteryStatus = charge > discharge ? `Cargando ${watts(charge)}` : discharge > 0 ? `Entregando ${watts(discharge)}` : 'En espera';
  const gridStatus = grid < 0 ? 'Exportando' : grid > 0 ? 'Importando' : 'Sin intercambio';
  const inverterPower = Math.max(load, solar + Math.max(grid, 0) + discharge);
  const solarStatus = pvCount === 2 ? `PV1 ${watts(p1)} · PV2 ${watts(p2)}` : 'Un MPPT detectado';

  return <section className="panel simple-flow-panel">
    <header className="section-head"><div><small>Flujo instantáneo</small><h2>Tu sistema ahora</h2></div><span className="status-dot">{Object.keys(data).length ? 'En línea' : 'Esperando datos'}</span></header>
    <div className="simple-energy-flow">
      <Node className="simple-solar" icon={PanelsTopLeft} title={pvCount === 2 ? 'Paneles · PV1 + PV2' : 'Paneles'} value={watts(solar)} status={solarStatus} accumulated={`Hoy: ${kwh(today.solar)} · PV1 ${kwh(today.pv1)}${pvCount === 2 ? ` · PV2 ${kwh(today.pv2)}` : ''}`}/>
      <Node className="simple-battery" icon={Battery} title={`Batería · ${soc.toFixed(0)}%`} value={watts(Math.max(charge, discharge))} status={batteryStatus} accumulated={`Hoy: cargada ${kwh(today.charge)} · entregada ${kwh(today.discharge)}`}/>
      <article className="simple-inverter">
        <Server size={39}/><small>Inversor</small><strong>{watts(inverterPower)}</strong><span>Operando</span>
      </article>
      <Node className="simple-house" icon={House} title="Consumo de la casa" value={watts(load)} status="Consumo instantáneo" accumulated={`Acumulado hoy: ${kwh(today.load)}`}/>
      <Node className="simple-grid" icon={RadioTower} title="Red eléctrica" value={watts(Math.abs(grid))} status={gridStatus} accumulated={`Hoy: importado ${kwh(today.gridImport)} · exportado ${kwh(today.gridExport)}`}/>
      <svg className="simple-flow-lines" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id="arrowSolar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path fill="#efbd34" d="M0,0 L0,6 L7,3 z"/></marker><marker id="arrowGreen" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path fill="#45dc80" d="M0,0 L0,6 L7,3 z"/></marker><marker id="arrowPurple" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path fill="#a66dff" d="M0,0 L0,6 L7,3 z"/></marker><marker id="arrowBlue" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path fill="#4e9fff" d="M0,0 L0,6 L7,3 z"/></marker></defs>
        <path className={`sf-line sf-solar ${solar > 5 ? 'active' : ''}`} d="M270 145 C390 145 410 270 480 300" markerEnd="url(#arrowSolar)"/>
        <path className={`sf-line sf-battery ${Math.max(charge, discharge) > 5 ? 'active' : ''}`} d={charge > discharge ? "M480 325 C410 355 390 485 270 485" : "M270 485 C390 485 410 355 480 325"} markerEnd="url(#arrowGreen)"/>
        <path className={`sf-line sf-house ${load > 5 ? 'active' : ''}`} d="M535 300 C610 270 630 145 745 145" markerEnd="url(#arrowPurple)"/>
        <path className={`sf-line sf-grid ${Math.abs(grid) > 5 ? 'active' : ''}`} d={grid >= 0 ? "M745 485 C630 485 610 355 535 325" : "M535 325 C610 355 630 485 745 485"} markerEnd="url(#arrowBlue)"/>
      </svg>
    </div>
  </section>;
}
