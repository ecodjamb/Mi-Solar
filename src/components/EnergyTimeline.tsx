import { History, Radio } from 'lucide-react';
import type { HistoryRow } from '../types';
import { parseApiTime } from '../utils/energy';

export default function EnergyTimeline({rows,index,onChange}:{rows:HistoryRow[];index:number|null;onChange:(index:number|null)=>void}){
  if(rows.length<2)return null;
  const selected=rows[index===null?rows.length-1:index];
  const selectedTime=parseApiTime(selected.currentTime??selected.createTime??selected.collectTime??selected.dataTime??selected.time);
  return <section className="energy-timeline" aria-label="Línea de tiempo del día">
    <div className="timeline-heading"><History size={18}/><div><strong>Explorar el día</strong><small>{index===null?'Datos en tiempo real':`Vista histórica · ${selectedTime?.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})||'—'}`}</small></div></div>
    <div className="timeline-control"><span>00:00</span><input aria-label="Hora histórica" type="range" min="0" max={rows.length-1} value={index??rows.length-1} onChange={event=>{const next=Number(event.target.value);onChange(next===rows.length-1?null:next)}}/><span>Ahora</span></div>
    <button type="button" className={index===null?'is-live':''} onClick={()=>onChange(null)}><Radio size={15}/>{index===null?'En vivo':'Volver a ahora'}</button>
  </section>;
}
