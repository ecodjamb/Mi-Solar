import type { DailyEnergy } from '../types';

export default function CoverageCard({today,first,last,siteLabel}:{today:DailyEnergy;first?:Date|null;last?:Date|null;siteLabel:string}){
 const now=new Date();
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
 const hour=Number(parts.find(p=>p.type==='hour')?.value||0);const minute=Number(parts.find(p=>p.type==='minute')?.value||0);
 const elapsed=Math.max(1,hour*60+minute);
 const firstMinutes=first?Number(first.toLocaleTimeString('en-GB',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}).slice(0,2))*60+Number(first.toLocaleTimeString('en-GB',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}).slice(3,5)):0;
 const lastMinutes=last?Number(last.toLocaleTimeString('en-GB',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}).slice(0,2))*60+Number(last.toLocaleTimeString('en-GB',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}).slice(3,5)):0;
 const covered=Math.max(0,lastMinutes-firstMinutes);
 const pct=Math.min(100,Math.max(0,covered/elapsed*100));
 const format=(d?:Date|null)=>d?d.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}):'—';
 return <section className={`panel coverage-card ${pct>=85?'ok':'warn'}`}>
  <header><div><small>Cobertura del registro diario · {siteLabel}</small><h3>{pct.toFixed(0)}% del periodo transcurrido</h3></div><strong>{today.samples}</strong></header>
  <div className="coverage-track"><i style={{width:`${pct}%`}}/></div>
  <div className="coverage-times"><span>Primera muestra <b>{format(first)}</b></span><span>Última muestra <b>{format(last)}</b></span></div>
  <p>Indica cuánto del día transcurrido tiene muestras del inversor. Si baja, los acumulados pueden quedar incompletos.</p>
 </section>;
}
