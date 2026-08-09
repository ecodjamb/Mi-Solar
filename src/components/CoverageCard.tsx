import type { DailyEnergy } from '../types';

const SITE_TZ='America/Santiago';
const MINUTES_PER_DAY=24*60;
const NOMINAL_SAMPLE_MINUTES=5;

function minutesInChile(date:Date){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:SITE_TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const hour=Number(parts.find(part=>part.type==='hour')?.value||0);
  const minute=Number(parts.find(part=>part.type==='minute')?.value||0);
  return hour*60+minute;
}

function format24(date?:Date|null){
  return date?date.toLocaleTimeString('es-CL',{timeZone:SITE_TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'—';
}

export default function CoverageCard({today,first,last,siteLabel}:{today:DailyEnergy;first?:Date|null;last?:Date|null;siteLabel:string}){
  const elapsed=Math.max(1,minutesInChile(new Date()));
  const firstMinutes=first?minutesInChile(first):0;
  const lastMinutes=last?minutesInChile(last):0;
  const covered=Math.max(0,lastMinutes-firstMinutes);
  const temporalPct=Math.min(100,Math.max(0,covered/elapsed*100));
  const dayPct=Math.min(100,Math.max(0,elapsed/MINUTES_PER_DAY*100));
  const expectedNow=Math.max(1,Math.floor(elapsed/NOMINAL_SAMPLE_MINUTES)+1);
  const expectedFullDay=Math.floor(MINUTES_PER_DAY/NOMINAL_SAMPLE_MINUTES);
  const samplePct=Math.min(100,Math.max(0,today.samples/expectedNow*100));
  const status=temporalPct>=95&&samplePct>=90?'Excelente':temporalPct>=80&&samplePct>=75?'Buena':temporalPct>=60?'Parcial':'Incompleta';

  return <section className={`panel coverage-card ${temporalPct>=85?'ok':'warn'}`}>
    <header>
      <div>
        <small>Avance del día · {siteLabel}</small>
        <h3>{dayPct.toFixed(0)}% del día transcurrido</h3>
      </div>
      <div className="coverage-score"><strong>{today.samples}</strong><small>muestras</small></div>
    </header>
    <div className="coverage-track"><i style={{width:`${dayPct}%`}}/></div>
    <div className="coverage-sample-summary">
      <span><b>{today.samples}</b> recibidas</span>
      <span><b>≈{expectedNow}</b> esperadas hasta ahora</span>
      <span><b>{expectedFullDay}</b> en un día completo</span>
    </div>
    <div className="coverage-times">
      <span>Primera muestra <b>{format24(first)}</b></span>
      <span>Última muestra <b>{format24(last)}</b></span>
    </div>
    <p><strong>{status}.</strong> Son las {format24(new Date())}: ha transcurrido {dayPct.toFixed(1)}% de las 24 horas. El registro disponible cubre {temporalPct.toFixed(0)}% del tiempo transcurrido y permite evaluar si los acumulados están completos.</p>
  </section>;
}
