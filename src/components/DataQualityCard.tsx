import { CheckCircle2, CircleAlert, CircleHelp, DatabaseZap } from 'lucide-react';

type Status='ok'|'warning'|'pending';
type SectionStatus={label:string;status:Status;detail:string};

function StatusIcon({status}:{status:Status}){
  if(status==='ok')return <CheckCircle2 size={18}/>;
  if(status==='warning')return <CircleAlert size={18}/>;
  return <CircleHelp size={18}/>;
}

function formatTime(date?:Date|null){
  return date?date.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'Sin sincronizar';
}

export default function DataQualityCard({
  realtimeAvailable,
  daySamples,
  weekSamples,
  monthSamples,
  weatherAvailable,
  radiationAvailable,
  updates
}:{
  realtimeAvailable:boolean;
  daySamples:number;
  weekSamples:number;
  monthSamples:number;
  weatherAvailable:boolean;
  radiationAvailable:boolean;
  updates:Record<string,Date|null>;
}){
  const sections:SectionStatus[]=[
    {label:'Tiempo real',status:realtimeAvailable?'ok':'warning',detail:formatTime(updates.realtime)},
    {label:'Histórico diario',status:daySamples>1?'ok':'warning',detail:daySamples>1?`${daySamples} muestras`:'Sin muestras suficientes'},
    {label:'Histórico semanal',status:weekSamples>1?'ok':'pending',detail:weekSamples>1?`${weekSamples} muestras`:'Pendiente de sincronización'},
    {label:'Histórico mensual',status:monthSamples>1?'ok':'pending',detail:monthSamples>1?`${monthSamples} muestras`:'Pendiente de sincronización'},
    {label:'Clima',status:weatherAvailable?'ok':'warning',detail:weatherAvailable?formatTime(updates.weather):'Proveedor sin respuesta'},
    {label:'Radiación',status:radiationAvailable?'ok':'pending',detail:radiationAvailable?formatTime(updates.radiation):'Pendiente de sincronización'}
  ];
  const okCount=sections.filter(section=>section.status==='ok').length;
  const overall=okCount===sections.length?'Todos los servicios sincronizados':okCount>=4?'Datos principales disponibles':'Sincronización parcial';
  const latest=Object.values(updates).filter((value):value is Date=>value instanceof Date).sort((a,b)=>b.getTime()-a.getTime())[0]||null;

  return <section className="panel data-quality-card">
    <header>
      <div><small>Diagnóstico de sincronización</small><h3>Calidad de datos</h3></div>
      <div className={`quality-overall ${okCount===sections.length?'ok':'warning'}`}><DatabaseZap size={20}/><span>{overall}</span></div>
    </header>
    <div className="quality-service-grid">
      {sections.map(section=><article className={`quality-service ${section.status}`} key={section.label}>
        <StatusIcon status={section.status}/><div><strong>{section.label}</strong><small>{section.detail}</small></div>
      </article>)}
    </div>
    <footer><span>Última sincronización registrada</span><strong>{formatTime(latest)}</strong></footer>
  </section>;
}
