// Componente legado conservado para compatibilidad V6; Inicio usa LivingHome.
import { Battery, House, PanelsTopLeft, RadioTower, Server } from 'lucide-react';
import { batteryChargePower, batteryDischargePower, batterySoc, detectPvCount, effectiveGridPower, loadPower, n, pvCurrent, pvPower, pvVoltage, watts } from '../utils/energy';
import type { HistoryRow, Realtime } from '../types';

function Node({className,title,value,sub,icon:Icon}:{className:string;title:string;value:string;sub:string;icon:any}){return <article className={`flow-node ${className}`}><Icon size={30}/><div><small>{title}</small><strong>{value}</strong><em>{sub}</em></div></article>}
export default function EnergyFlow({data,history}:{data:Realtime;history:HistoryRow[]}){
 const p1=pvPower(data,1),p2=pvPower(data,2),solar=p1+p2,grid=effectiveGridPower(data),load=loadPower(data),charge=batteryChargePower(data),discharge=batteryDischargePower(data),soc=batterySoc(data),pvCount=detectPvCount(data,history);
 const gridReverse=grid<0,battReverse=charge>discharge;
 return <section className="panel flow-panel"><header className="section-head"><div><small>Flujo de energía</small><h2>En tiempo real</h2></div><span className="status-dot">Normal</span></header>
 <div className={`flow-stage pv-${pvCount}`}>
   <div className="pv-stack">
    <Node className="solar pv1" title={pvCount===2?'PV1 · MPPT 1':'Paneles'} value={watts(p1)} sub={`${pvVoltage(data,1).toFixed(0)} V · ${pvCurrent(data,1).toFixed(1)} A`} icon={PanelsTopLeft}/>
    {pvCount===2&&<Node className="solar pv2" title="PV2 · MPPT 2" value={watts(p2)} sub={`${pvVoltage(data,2).toFixed(0)} V · ${pvCurrent(data,2).toFixed(1)} A`} icon={PanelsTopLeft}/>} 
    {pvCount===2&&<article className="total-solar"><small>Total solar</small><strong>{watts(solar)}</strong><div><span>PV1 {solar?Math.round(p1/solar*100):0}%</span><span>PV2 {solar?Math.round(p2/solar*100):0}%</span></div></article>}
   </div>
   <Node className="grid" title="Red eléctrica · estado 1" value={watts(Math.abs(grid))} sub={gridReverse?'Exportando':'Importando'} icon={RadioTower}/>
   <Node className="inverter" title="Inversor" value={watts(Math.max(load,solar+Math.max(grid,0)+discharge))} sub={n(data.statusInverter)===1?'Normal':'Revisar'} icon={Server}/>
   <Node className="home" title="Casa" value={watts(load)} sub="Consumiendo" icon={House}/>
   <Node className="battery" title={`Batería · ${soc.toFixed(0)}%`} value={watts(Math.max(charge,discharge))} sub={battReverse?'Cargando':'Entregando'} icon={Battery}/>
   <div className="mobile-connectors" aria-hidden="true">
    <span className={`connector solar-c ${solar>5?'active':''}`}>Paneles → Inversor</span>
    <span className={`connector grid-c ${Math.abs(grid)>5?'active':''}`}>{gridReverse?'Inversor → Red':'Red → Inversor'}</span>
    <span className={`connector batt-c ${Math.max(charge,discharge)>5?'active':''}`}>{battReverse?'Inversor → Batería':'Batería → Inversor'}</span>
    <span className={`connector home-c ${load>5?'active':''}`}>Inversor → Casa</span>
   </div>
   <svg className="flow-lines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
    <path className={`line solar-line ${solar>5?'active':''}`} d="M 260 170 C 365 170, 390 265, 500 265"/><path className={`line grid-line ${Math.abs(grid)>5?'active':''} ${gridReverse?'reverse':''}`} d="M 260 430 C 365 430, 390 330, 500 330"/>
    <path className={`line home-line ${load>5?'active':''}`} d="M 560 300 C 690 300, 710 300, 800 300"/><path className={`line battery-line ${Math.max(charge,discharge)>5?'active':''} ${battReverse?'reverse':''}`} d="M 530 360 C 530 430, 530 455, 530 505"/>
   </svg>
 </div></section>
}
