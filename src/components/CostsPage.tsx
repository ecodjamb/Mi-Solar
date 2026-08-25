import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, CircleDollarSign, Leaf, Landmark, RadioTower, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import { api } from '../services/api';
import type { DailyEnergy, HistoryRow } from '../types';
import { clp, dailyEnergy, formatSiteDate, groupDailyEnergy, kwh, siteRangeUtc, siteWeekDateRange } from '../utils/energy';
import EChart from './EChart';
import EnelBillsSection from './EnelBillsSection';

const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const empty:DailyEnergy={date:'',solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,gridToLoad:0,charge:0,discharge:0,solarToLoad:0,batteryToLoad:0,solarToBattery:0,samples:0};
type UtilityBill={id:number;periodStart:string;periodEnd:string};
type CostRange={key:string;label:string;start:string;endInclusive:string;endExclusive:string;current:boolean};

function addDays(value:string,days:number){const [year,month,day]=value.split('-').map(Number);return new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10)}
function nextMonthSameDay(value:string){const [year,month,day]=value.split('-').map(Number);return new Date(Date.UTC(year,month,day)).toISOString().slice(0,10)}
function monthBounds(period:string){const [year,month]=period.split('-').map(Number);const start=`${year}-${String(month).padStart(2,'0')}-01`;const end=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);return {start,endInclusive:addDays(end,-1),endExclusive:end}}
function dateLabel(value:string){return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric'})}
function monthLabel(value:string){const date=new Date(`${value}T12:00:00`);const label=date.toLocaleDateString('es-CL',{month:'long',year:'numeric'});return label.charAt(0).toUpperCase()+label.slice(1)}
function rangeDays(range:CostRange){return Math.max(1,Math.round((Date.parse(`${range.endExclusive}T12:00:00Z`)-Date.parse(`${range.start}T12:00:00Z`))/86_400_000))}

function CostMetric({icon:Icon,label,value,detail,tone='blue'}:{icon:LucideIcon;label:string;value:string;detail:string;tone?:'blue'|'green'|'yellow'}){
  return <article className={`panel cost-metric cost-metric-${tone}`}><span><Icon size={20}/></span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>;
}

function EnergyBreakdown({label,total,sources}:{label:string;total:number;sources:Array<{key:string;label:string;value:number;percent:number}>}){
  return <section className="panel energy-breakdown"><header><div><small>Consumo total del período</small><h2>{label}</h2></div><strong>{kwh(total)}</strong></header><div className="energy-flow-bar" role="img" aria-label={sources.map(source=>`${source.label}: ${source.percent.toFixed(1)}%`).join(', ')}>{sources.map(source=><i className={`energy-${source.key}`} key={source.key} style={{width:`${source.percent}%`}} title={`${source.label}: ${source.percent.toFixed(1)}%`}/>)}</div><div className="energy-source-list">{sources.map(source=><article className={`energy-source energy-source-${source.key}`} key={source.key}><div className="energy-source-heading"><span><i/>{source.label}</span><strong>{kwh(source.value)}</strong><b>{source.percent.toFixed(1)}%</b></div><div className="energy-source-track"><i style={{width:`${source.percent}%`}}/></div></article>)}</div></section>;
}

export default function CostsPage({deviceSn,siteLabel,gridLabel='Red activa',today,week,currentMonth,tariff,onTariffChange}:{deviceSn:string;siteLabel:string;gridLabel?:string;today:DailyEnergy;week:DailyEnergy;currentMonth:DailyEnergy;tariff:number;onTariffChange:(value:number)=>void}){
  const todayKey=formatSiteDate();
  const currentCalendar=monthBounds(todayKey.slice(0,7));
  const [bills,setBills]=useState<UtilityBill[]>([]);
  const [billsLoaded,setBillsLoaded]=useState(false);
  const [selectedRangeKey,setSelectedRangeKey]=useState('current');
  const [chartMode,setChartMode]=useState<'calendar'|'billing'>('billing');
  const [selectedEnergy,setSelectedEnergy]=useState<DailyEnergy>(currentMonth);
  const [chartRows,setChartRows]=useState<HistoryRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [chartLoading,setChartLoading]=useState(false);
  const [message,setMessage]=useState('Período en curso · datos actualizados automáticamente.');

  useEffect(()=>{let active=true;setBillsLoaded(false);api<{list:UtilityBill[]}>(`devices/${deviceSn}/utility-bills`).then(result=>{if(active)setBills(result.list||[])}).catch(()=>{if(active)setBills([])}).finally(()=>{if(active)setBillsLoaded(true)});return()=>{active=false}},[deviceSn]);

  const billingRanges=useMemo<CostRange[]>(()=>{
    const ordered=[...bills].sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd));
    const latest=ordered[0];
    const currentStart=latest?addDays(latest.periodEnd,1):currentCalendar.start;
    const currentEnd=latest?nextMonthSameDay(currentStart):currentCalendar.endInclusive;
    const current:CostRange={key:'current',label:`${monthLabel(currentEnd)} · período actual`,start:currentStart,endInclusive:currentEnd,endExclusive:addDays(currentEnd,1),current:true};
    const seen=new Set<string>();
    const history=ordered.filter(bill=>{const key=`${bill.periodStart}:${bill.periodEnd}`;if(seen.has(key))return false;seen.add(key);return true}).map(bill=>({key:`bill-${bill.id}`,label:monthLabel(bill.periodEnd),start:bill.periodStart,endInclusive:bill.periodEnd,endExclusive:addDays(bill.periodEnd,1),current:false}));
    return [current,...history];
  },[bills,currentCalendar.start,currentCalendar.endInclusive]);
  const selectedRange=billingRanges.find(range=>range.key===selectedRangeKey)||billingRanges[0];
  const calendarRange:CostRange={key:'calendar',label:`${monthLabel(currentCalendar.endInclusive)} · mes calendario`,start:currentCalendar.start,endInclusive:currentCalendar.endInclusive,endExclusive:currentCalendar.endExclusive,current:true};
  const chartRange=chartMode==='calendar'?calendarRange:billingRanges[0];
  const selectedArchiveTick=selectedRange?.current?currentMonth.lastSample:'';

  useEffect(()=>{
    if(!deviceSn||!selectedRange)return;
    let active=true;const utc=siteRangeUtc(selectedRange.start,selectedRange.endExclusive);setLoading(true);setMessage('Consultando el respaldo permanente de Mi Solar…');
    api<{list:HistoryRow[]}>(`devices/${deviceSn}/archive-series?start=${encodeURIComponent(utc.start)}&end=${encodeURIComponent(utc.end)}&resolution=hour`)
      .then(result=>{if(!active)return;const energy=dailyEnergy(result.list||[]);setSelectedEnergy(result.list?.length?energy:empty);setMessage(result.list?.length?`${result.list.length.toLocaleString('es-CL')} horas respaldadas entre ${dateLabel(selectedRange.start)} y ${dateLabel(selectedRange.endInclusive)}.`:'No existen muestras guardadas para este período.')})
      .catch(error=>{if(active){setSelectedEnergy(empty);setMessage(error instanceof Error?error.message:'No fue posible consultar el período.')}}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[deviceSn,selectedRange?.key,selectedRange?.start,selectedRange?.endExclusive,selectedArchiveTick]);

  useEffect(()=>{
    if(!deviceSn||!chartRange||!billsLoaded)return;
    let active=true;const tomorrow=addDays(todayKey,1);const queryEnd=chartRange.endExclusive<tomorrow?chartRange.endExclusive:tomorrow;const utc=siteRangeUtc(chartRange.start,queryEnd);setChartLoading(true);
    api<{list:HistoryRow[]}>(`devices/${deviceSn}/archive-series?start=${encodeURIComponent(utc.start)}&end=${encodeURIComponent(utc.end)}&resolution=hour`)
      .then(result=>{if(active)setChartRows(result.list||[])}).catch(()=>{if(active)setChartRows([])}).finally(()=>{if(active)setChartLoading(false)});
    return()=>{active=false};
  },[deviceSn,chartMode,chartRange?.start,chartRange?.endExclusive,billsLoaded,currentMonth.lastSample,todayKey]);

  const chartDays=useMemo(()=>groupDailyEnergy(chartRows),[chartRows]);
  const chartGrid=useMemo(()=>chartDays.reduce((sum,day)=>sum+day.gridImport,0),[chartDays]);
  const chartSolar=useMemo(()=>chartDays.reduce((sum,day)=>sum+day.solar,0),[chartDays]);
  const chartAverage=chartDays.length?chartGrid/chartDays.length:0;
  const chartProjection=chartAverage*30;
  const chartOption=useMemo(()=>({
    tooltip:{trigger:'axis',confine:true,valueFormatter:(value:unknown)=>`${Number(value||0).toFixed(2)} kWh`},
    legend:{top:4,textStyle:{color:'#a9bdc3'}},grid:{left:46,right:18,top:58,bottom:48,containLabel:true},
    xAxis:{type:'category',data:chartDays.map(day=>day.date.slice(5)),axisLabel:{color:'#8ba0a8',hideOverlap:true},axisLine:{lineStyle:{color:'#29444e'}}},
    yAxis:{type:'value',name:'kWh',axisLabel:{color:'#8ba0a8'},nameTextStyle:{color:'#8ba0a8'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[
      {name:'Red activa · estado 1',type:'bar',data:chartDays.map(day=>Number(day.gridImport.toFixed(3))),itemStyle:{color:'#4e9dff',borderRadius:[5,5,0,0]}},
      {name:'Producción solar total',type:'bar',data:chartDays.map(day=>Number(day.solar.toFixed(3))),itemStyle:{color:'#f0bf34',borderRadius:[5,5,0,0]}}
    ]
  }),[chartDays]);

  const totalDays=rangeDays(selectedRange);
  const closed=selectedRange.endExclusive<=todayKey;
  const lastSample=selectedEnergy.lastSample?new Date(selectedEnergy.lastSample):null;
  const elapsedFromRange=lastSample&&Number.isFinite(lastSample.getTime())?Math.max(1,(lastSample.getTime()-Date.parse(siteRangeUtc(selectedRange.start,selectedRange.endExclusive).start))/86_400_000):1;
  const factor=closed?1:Math.max(1,totalDays/elapsedFromRange);
  // Costos usa el acumulado autoritativo de red efectiva: statusGrid=1.
  const grid=Math.max(0,selectedEnergy.gridImport);
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
  const selectedLabel=`${selectedRange.label} · ${dateLabel(selectedRange.start)} → ${dateLabel(selectedRange.endInclusive)}`;
  const energySources=[{key:'solar',label:'Paneles hacia la casa',value:solar,percent:pct(solar)},{key:'battery',label:'Batería hacia la casa',value:battery,percent:pct(battery)},{key:'grid',label:`${gridLabel} hacia la casa`,value:grid,percent:pct(grid)}];
  const weekStart=siteWeekDateRange(formatSiteDate()).start;
  const recentLastSample=[today.lastSample,week.lastSample].filter(Boolean).sort().at(-1);
  const recentUpdateLabel=recentLastSample?new Date(recentLastSample).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'}):'sin muestras';

  return <section className="solar-forecast-page costs-page">
    <header className="page-heading"><div><small>Balance económico · {siteLabel}</small><h1>{gridLabel==='Generador'?'Costo del generador y ahorro solar':'Cuenta eléctrica y ahorro solar'}</h1><p>Cada kWh consumido por la casa se asigna a una sola fuente: {gridLabel.toLocaleLowerCase('es-CL')}, paneles solares directos o descarga de batería.</p></div></header>
    {gridLabel!=='Generador'?<section className="panel cost-daily-grid-card"><header><div><small>Histórico respaldado · estado de red validado</small><h2><BarChart3/> Consumo diario de red y producción solar</h2><p>{dateLabel(chartRange.start)} → {dateLabel(chartRange.endInclusive)}</p></div><div className="cost-range-toggle" aria-label="Rango del gráfico"><button type="button" className={chartMode==='calendar'?'active':''} onClick={()=>setChartMode('calendar')}>Mes calendario actual</button><button type="button" className={chartMode==='billing'?'active':''} onClick={()=>setChartMode('billing')}>Período Enel actual</button></div></header>{chartLoading?<div className="cost-chart-loading">Actualizando consumo diario…</div>:chartDays.length?<EChart option={chartOption} className="cost-daily-grid-chart"/>:<div className="cost-chart-loading">No hay datos respaldados para este período.</div>}<footer><article><small>Promedio diario de red</small><strong>{kwh(chartAverage)}</strong><span>{chartDays.length} días con datos</span></article><article><small>Red total del período</small><strong>{kwh(chartGrid)}</strong><span>Estado 1</span></article><article><small>Monto a la fecha</small><strong>{clp(chartGrid*tariff)}</strong><span>{clp(tariff)} por kWh</span></article><article><small>Producción solar total</small><strong>{kwh(chartSolar)}</strong><span>PV1 + PV2</span></article><article><small>Proyección de red · 30 días</small><strong>{kwh(chartProjection)}</strong><span>Promedio diario × 30</span></article><article><small>Monto proyectado · 30 días</small><strong>{clp(chartProjection*tariff)}</strong><span>{clp(tariff)} por kWh</span></article></footer><p className="cost-grid-rule">La barra azul integra potencia de red únicamente cuando <b>Estado de red = 1</b>. Ese mismo total alimenta los costos y las proyecciones.</p></section>:null}
    <section className="panel cost-toolbar" aria-label="Período de costos entre boletas Enel">
      <div className="cost-selectors billing"><label>Período entre boletas<select value={selectedRange.key} onChange={event=>setSelectedRangeKey(event.target.value)}>{billingRanges.map(range=><option key={range.key} value={range.key}>{range.label}</option>)}</select></label></div>
      <div className="cost-period-status"><CalendarDays size={22}/><span><small>Rango comercial seleccionado</small><strong>{dateLabel(selectedRange.start)} → {dateLabel(selectedRange.endInclusive)}</strong><em>{loading?'Actualizando…':message}</em></span></div>
    </section>
    <div className="cost-overview-grid">
      <EnergyBreakdown label={selectedLabel} total={total} sources={energySources}/>
      <aside className="cost-side-stack"><section className="panel cost-tariff"><label>{gridLabel==='Generador'?'Costo estimado del generador':'Tarifa de compra eléctrica'} <span>Pesos chilenos por kWh</span><span className="cost-tariff-input"><b aria-hidden="true">$</b><input aria-label="Tarifa en pesos chilenos por kWh" type="number" min="0" inputMode="decimal" value={tariff} onChange={event=>onTariffChange(Math.max(0,Number(event.target.value)))}/><small>/kWh</small></span></label></section><CostMetric icon={Leaf} label={`Ahorro en ${selectedRange.label}`} value={clp(monthSaving)} detail={`${kwh(solar+battery)} cubiertos por paneles y batería`} tone="green"/><CostMetric icon={Landmark} label={`Costo de ${gridLabel.toLocaleLowerCase('es-CL')}`} value={clp(grid*tariff)} detail={`${kwh(grid)} entregados a la casa`}/></aside>
    </div>
    <section className="cost-section"><header><div><small>Avance reciente</small><h2>Hoy y esta semana</h2></div><span className="cost-recent-update">Último dato: {recentUpdateLabel}</span></header><div className="cost-metric-grid two"><CostMetric icon={Zap} label="Ahorro conseguido hoy · desde las 00:00" value={clp((today.solarToLoad+today.batteryToLoad)*tariff)} detail={`Paneles ${kwh(today.solarToLoad)} + batería ${kwh(today.batteryToLoad)}`} tone="yellow"/><CostMetric icon={TrendingUp} label={`Ahorro de esta semana · desde ${new Date(`${weekStart}T12:00:00`).toLocaleDateString('es-CL',{weekday:'long'})}`} value={clp((week.solarToLoad+week.batteryToLoad)*tariff)} detail={`Paneles ${kwh(week.solarToLoad)} + batería ${kwh(week.batteryToLoad)}`} tone="green"/></div><p className="cost-reset-note">Los acumulados diarios se reinician a medianoche. La semana comienza el lunes; por eso, durante la madrugada del lunes, ambos valores todavía son bajos y normalmente corresponden solo a batería.</p></section>
    <section className="cost-section"><header><div><small>{closed?'Resultado consolidado':'Estimación según el avance del período'}</small><h2>{closed?'Cierre real del período':'Proyección para el cierre de la boleta'}</h2></div></header><div className="cost-metric-grid"><CostMetric icon={CircleDollarSign} label={gridLabel==='Generador'?'Costo del generador':'Cuenta eléctrica'} value={clp(projectedBill)} detail={`${kwh(projectedGrid)} desde ${gridLabel.toLocaleLowerCase('es-CL')}`}/><CostMetric icon={Leaf} label="Ahorro del sistema solar" value={clp(projectedSystem*tariff)} detail={`Paneles + batería: ${kwh(projectedSystem)}`} tone="green"/><CostMetric icon={RadioTower} label={`${gridLabel} hacia la casa`} value={kwh(projectedGrid)} detail={`Equivalente a ${clp(projectedGrid*tariff)}`}/><CostMetric icon={Zap} label="Paneles hacia la casa" value={kwh(projectedSolar)} detail={`Equivalente a ${clp(projectedSolar*tariff)}`} tone="yellow"/><CostMetric icon={TrendingUp} label="Batería hacia la casa" value={kwh(projectedBattery)} detail={`Equivalente a ${clp(projectedBattery*tariff)}`} tone="green"/></div></section>
    {gridLabel !== 'Generador' ? <EnelBillsSection deviceSn={deviceSn} siteLabel={siteLabel}/> : null}
  </section>;
}
