import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CircleDollarSign, Leaf, Landmark, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import { api } from '../services/api';
import type { DailyEnergy, HistoryRow } from '../types';
import { clp, dailyEnergy, formatSiteDate, kwh, siteRangeUtc } from '../utils/energy';

const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const empty:DailyEnergy={date:'',solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,gridToLoad:0,charge:0,discharge:0,solarToLoad:0,batteryToLoad:0,solarToBattery:0,samples:0};

function monthBounds(period:string){
  const [year,month]=period.split('-').map(Number);
  const start=`${year}-${String(month).padStart(2,'0')}-01`;
  const end=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);
  return {start,end,days:new Date(Date.UTC(year,month,0)).getUTCDate()};
}

function CostMetric({icon:Icon,label,value,detail,tone='blue'}:{icon:LucideIcon;label:string;value:string;detail:string;tone?:'blue'|'green'|'yellow'}){
  return <article className={`panel cost-metric cost-metric-${tone}`}><span><Icon size={20}/></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function EnergyBreakdown({label,total,sources}:{label:string;total:number;sources:Array<{key:string;label:string;value:number;percent:number}>}){
  return <section className="panel energy-breakdown"><header><div><small>Consumo total del período</small><h2>{label}</h2></div><strong>{kwh(total)}</strong></header><div className="energy-flow-bar" role="img" aria-label={sources.map(source=>`${source.label}: ${source.percent.toFixed(1)}%`).join(', ')}>{sources.map(source=><i className={`energy-${source.key}`} key={source.key} style={{width:`${source.percent}%`}} title={`${source.label}: ${source.percent.toFixed(1)}%`}/>)}</div><div className="energy-source-list">{sources.map(source=><article className={`energy-source energy-source-${source.key}`} key={source.key}><div className="energy-source-heading"><span><i/>{source.label}</span><strong>{kwh(source.value)}</strong><b>{source.percent.toFixed(1)}%</b></div><div className="energy-source-track"><i style={{width:`${source.percent}%`}}/></div></article>)}</div></section>;
}

export default function CostsPage({deviceSn,siteLabel,gridLabel='Red activa',today,week,currentMonth,tariff,onTariffChange}:{deviceSn:string;siteLabel:string;gridLabel?:string;today:DailyEnergy;week:DailyEnergy;currentMonth:DailyEnergy;tariff:number;onTariffChange:(value:number)=>void}){
  const currentPeriod=formatSiteDate().slice(0,7);
  const [period,setPeriod]=useState(currentPeriod);
  const [selectedEnergy,setSelectedEnergy]=useState<DailyEnergy>(currentMonth);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('Mes en curso · datos actualizados automáticamente.');
  const years=useMemo(()=>{const current=Number(currentPeriod.slice(0,4));return Array.from({length:5},(_,index)=>current-index)},[currentPeriod]);
  const currentArchiveTick=period===currentPeriod?currentMonth.lastSample:'';

  useEffect(()=>{if(period===currentPeriod){setSelectedEnergy(currentMonth);setMessage('Mes en curso · verificando el respaldo permanente.')}},[period,currentPeriod]);
  useEffect(()=>{
    if(!deviceSn)return;
    let active=true;
    const bounds=monthBounds(period);
    const utc=siteRangeUtc(bounds.start,bounds.end);
    setLoading(true);setMessage('Consultando el respaldo permanente de Mi Solar…');
    api<{list:HistoryRow[]}>(`devices/${deviceSn}/archive-series?start=${encodeURIComponent(utc.start)}&end=${encodeURIComponent(utc.end)}&resolution=hour`)
      .then(result=>{if(!active)return;const energy=dailyEnergy(result.list||[]);setSelectedEnergy(result.list?.length?energy:period===currentPeriod?currentMonth:empty);setMessage(result.list?.length?`${result.list.length.toLocaleString('es-CL')} horas consolidadas verificadas en el respaldo permanente.`:period===currentPeriod?'Datos recientes disponibles; el respaldo se completará automáticamente.':'No existen muestras guardadas para este mes.')})
      .catch(error=>{if(active){setSelectedEnergy(period===currentPeriod?currentMonth:empty);setMessage(error instanceof Error?error.message:'No fue posible consultar el mes.')}})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[deviceSn,period,currentPeriod,currentArchiveTick]);

  const bounds=monthBounds(period);
  const closed=period<currentPeriod;
  const localDay=Number(formatSiteDate().slice(8,10));
  const lastSample=selectedEnergy.lastSample?new Date(selectedEnergy.lastSample):null;
  const sampleParts=lastSample&&Number.isFinite(lastSample.getTime())?Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Santiago',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(lastSample).map(part=>[part.type,part.value])):null;
  const elapsedDays=sampleParts?Number(sampleParts.day)-1+(Number(sampleParts.hour)+Number(sampleParts.minute)/60)/24:localDay;
  const factor=closed?1:Math.max(1,bounds.days/Math.max(1,elapsedDays));
  const grid=Math.max(0,selectedEnergy.gridToLoad);
  const solar=Math.max(0,selectedEnergy.solarToLoad);
  const battery=Math.max(0,selectedEnergy.batteryToLoad);
  const total=grid+solar+battery;
  const pct=(value:number)=>total>0?value/total*100:0;
  const projectedGrid=grid*factor;
  const projectedSolar=solar*factor;
  const projectedBattery=battery*factor;
  const projectedSystem=projectedSolar+projectedBattery;
  const monthSaving=(solar+battery)*tariff;
  const projectedBill=projectedGrid*tariff;
  const selectedLabel=`${MONTHS[Number(period.slice(5,7))-1]} ${period.slice(0,4)}`;
  const energySources=[{key:'solar',label:'Paneles hacia la casa',value:solar,percent:pct(solar)},{key:'battery',label:'Batería hacia la casa',value:battery,percent:pct(battery)},{key:'grid',label:`${gridLabel} hacia la casa`,value:grid,percent:pct(grid)}];

  return <section className="solar-forecast-page costs-page">
    <header className="page-heading"><div><small>Balance económico · {siteLabel}</small><h1>{gridLabel==='Generador'?'Costo del generador y ahorro solar':'Cuenta eléctrica y ahorro solar'}</h1><p>Cada kWh consumido por la casa se asigna a una sola fuente: {gridLabel.toLocaleLowerCase('es-CL')}, paneles solares directos o descarga de batería.</p></div></header>
    <section className="panel cost-toolbar" aria-label="Período de costos">
      <div className="cost-selectors"><label>Mes<select value={period.slice(5,7)} onChange={event=>setPeriod(`${period.slice(0,4)}-${event.target.value}`)}>{MONTHS.map((name,index)=>{const value=String(index+1).padStart(2,'0');const future=`${period.slice(0,4)}-${value}`>currentPeriod;return <option key={name} value={value} disabled={future}>{name}</option>})}</select></label><label>Año<select value={period.slice(0,4)} onChange={event=>{const candidate=`${event.target.value}-${period.slice(5,7)}`;setPeriod(candidate>currentPeriod?currentPeriod:candidate)}}>{years.map(year=><option key={year}>{year}</option>)}</select></label></div>
      <div className="cost-period-status"><CalendarDays size={22}/><span><small>Período seleccionado</small><strong>{selectedLabel}</strong><em>{loading?'Actualizando…':message}</em></span></div>
    </section>
    <div className="cost-overview-grid">
      <EnergyBreakdown label={selectedLabel} total={total} sources={energySources}/>
      <aside className="cost-side-stack"><section className="panel cost-tariff"><label>{gridLabel==='Generador'?'Costo estimado del generador':'Tarifa de compra eléctrica'} <span>Pesos chilenos por kWh</span><span className="cost-tariff-input"><b aria-hidden="true">$</b><input aria-label="Tarifa en pesos chilenos por kWh" type="number" min="0" inputMode="decimal" value={tariff} onChange={event=>onTariffChange(Math.max(0,Number(event.target.value)))}/><small>/kWh</small></span></label></section><CostMetric icon={Leaf} label={`Ahorro en ${selectedLabel}`} value={clp(monthSaving)} detail={`${kwh(solar+battery)} cubiertos por paneles y batería`} tone="green"/><CostMetric icon={Landmark} label={`Costo de ${gridLabel.toLocaleLowerCase('es-CL')}`} value={clp(grid*tariff)} detail={`${kwh(grid)} entregados a la casa`}/></aside>
    </div>
    <section className="cost-section"><header><div><small>Avance reciente</small><h2>Hoy y esta semana</h2></div></header><div className="cost-metric-grid two"><CostMetric icon={Zap} label="Ahorro conseguido hoy" value={clp((today.solarToLoad+today.batteryToLoad)*tariff)} detail={`Paneles ${kwh(today.solarToLoad)} + batería ${kwh(today.batteryToLoad)}`} tone="yellow"/><CostMetric icon={TrendingUp} label="Ahorro conseguido esta semana" value={clp((week.solarToLoad+week.batteryToLoad)*tariff)} detail={`${kwh(week.solarToLoad+week.batteryToLoad)} cubiertos por el sistema solar`} tone="green"/></div></section>
    <section className="cost-section"><header><div><small>{closed?'Resultado consolidado':'Estimación según el avance del mes'}</small><h2>{closed?'Cierre real del mes':'Proyección para final de mes'}</h2></div></header><div className="cost-metric-grid"><CostMetric icon={CircleDollarSign} label={gridLabel==='Generador'?'Costo del generador':'Cuenta eléctrica'} value={clp(projectedBill)} detail={`${kwh(projectedGrid)} desde ${gridLabel.toLocaleLowerCase('es-CL')}`}/><CostMetric icon={Leaf} label="Ahorro del sistema solar" value={clp(projectedSystem*tariff)} detail={`Paneles + batería: ${kwh(projectedSystem)}`} tone="green"/><CostMetric icon={Zap} label="Paneles hacia la casa" value={kwh(projectedSolar)} detail={`Equivalente a ${clp(projectedSolar*tariff)}`} tone="yellow"/><CostMetric icon={TrendingUp} label="Batería hacia la casa" value={kwh(projectedBattery)} detail={`Equivalente a ${clp(projectedBattery*tariff)}`} tone="green"/></div></section>
  </section>;
}
