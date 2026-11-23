import { useMemo, useState } from 'react';
import { BarChart3, CircleGauge, Sigma, Sun } from 'lucide-react';
import EChart from './EChart';
import type { EnergyProvider } from '../services/providerHistory';
import type { DailyEnergy } from '../types';
import { clp, kwh } from '../utils/energy';
import { isReliableSolarAnalysisDay } from '../utils/solarForecast';
import { specificYieldReference } from '../utils/specificYield';

const PERIODS=[{key:'7d',label:'7 días',days:7},{key:'1m',label:'1 mes · 31 días',days:31},{key:'6m',label:'6 meses',days:183},{key:'365d',label:'365 días',days:365}] as const;
type Period=(typeof PERIODS)[number]['key'];
type YieldString={key:'pv1'|'pv2';label:string;installedKwp:number};

function addDays(date:string,days:number){const [year,month,day]=date.split('-').map(Number);return new Date(Date.UTC(year,month-1,day+days)).toISOString().slice(0,10)}

export default function DailyConsumptionChart({siteLabel,siteKey,provider,installedWp,strings,tariff,dailyHistory,siteDate,loading}:{siteLabel:string;siteKey:'arrayan'|'puerto-montt';provider:EnergyProvider;installedWp:number;strings:YieldString[];tariff:number;dailyHistory:DailyEnergy[];siteDate:string;loading:boolean}){
  const [period,setPeriod]=useState<Period>('1m');
  const selected=PERIODS.find(item=>item.key===period)||PERIODS[1];
  const periodStart=addDays(siteDate,-(selected.days-1));
  const allDays=useMemo(()=>dailyHistory.filter(day=>day.date>=periodStart&&day.date<=siteDate),[dailyHistory,periodStart,siteDate]);
  const days=useMemo(()=>allDays.filter(day=>isReliableSolarAnalysisDay(day,siteKey)),[allDays,siteKey]);
  const excludedDays=allDays.length-days.length;
  const totals=useMemo(()=>days.reduce((result,day)=>({
    load:result.load+day.load,
    solar:result.solar+day.solar,
    gridImport:result.gridImport+day.gridImport,
  }),{load:0,solar:0,gridImport:0}),[days]);
  const average=days.length?totals.load/days.length:0;
  const solarAverage=days.length?totals.solar/days.length:0;
  const installedKwp=Math.max(.001,installedWp/1000);
  const yieldReference=specificYieldReference(siteKey);
  const referenceDaily=yieldReference.dailyKwhPerKwp;
  const averageSpecificYield=days.length?days.reduce((sum,day)=>sum+day.solar/installedKwp,0)/days.length:0;
  const averageDeviation=referenceDaily>0?(averageSpecificYield/referenceDaily-1)*100:0;
  const coveredDates=days.length?`${new Date(`${days[0].date}T12:00:00`).toLocaleDateString('es-CL',{day:'numeric',month:'short'})} → ${new Date(`${days.at(-1)?.date}T12:00:00`).toLocaleDateString('es-CL',{day:'numeric',month:'short',year:'numeric'})}`:'';
  const option=useMemo(()=>({
    tooltip:{trigger:'axis',confine:true,valueFormatter:(value:unknown)=>`${Number(value).toLocaleString('es-CL',{maximumFractionDigits:2})} kWh`},
    legend:{top:4,textStyle:{color:'#a9bdc3'}},grid:{left:52,right:20,top:58,bottom:60,containLabel:true},
    dataZoom:days.length>35?[{type:'inside'},{type:'slider',height:18,bottom:14,borderColor:'#29444e',backgroundColor:'#07171d',fillerColor:'rgba(169,111,255,.18)'}]:undefined,
    xAxis:{type:'category',data:days.map(day=>day.date),axisLabel:{color:'#8ba0a8',hideOverlap:true},axisLine:{lineStyle:{color:'#29444e'}}},
    yAxis:{type:'value',name:'kWh',axisLabel:{color:'#8ba0a8'},nameTextStyle:{color:'#8ba0a8'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[{name:'Consumo diario',type:'bar',data:days.map(day=>Number(day.load.toFixed(3))),itemStyle:{color:'#a96fff',borderRadius:[5,5,0,0]}},{name:`Promedio ${average.toFixed(1)} kWh`,type:'line',showSymbol:false,data:days.map(()=>Number(average.toFixed(3))),lineStyle:{color:'#f0c34d',type:'dashed',width:2},itemStyle:{color:'#f0c34d'}}]
  }),[days,average]);
  const solarOption=useMemo(()=>({
    tooltip:{trigger:'axis',confine:true,valueFormatter:(value:unknown)=>`${Number(value).toLocaleString('es-CL',{maximumFractionDigits:2})} kWh`},
    legend:{top:4,textStyle:{color:'#a9bdc3'}},grid:{left:52,right:20,top:58,bottom:60,containLabel:true},
    dataZoom:days.length>35?[{type:'inside'},{type:'slider',height:18,bottom:14,borderColor:'#29444e',backgroundColor:'#07171d',fillerColor:'rgba(255,205,54,.18)'}]:undefined,
    xAxis:{type:'category',data:days.map(day=>day.date),axisLabel:{color:'#8ba0a8',hideOverlap:true},axisLine:{lineStyle:{color:'#29444e'}}},
    yAxis:{type:'value',name:'kWh',axisLabel:{color:'#8ba0a8'},nameTextStyle:{color:'#8ba0a8'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[{name:'Producción solar diaria',type:'bar',data:days.map(day=>Number(day.solar.toFixed(3))),itemStyle:{color:'#f1bd32',borderRadius:[5,5,0,0]}},{name:`Promedio ${solarAverage.toFixed(1)} kWh`,type:'line',showSymbol:false,data:days.map(()=>Number(solarAverage.toFixed(3))),lineStyle:{color:'#49d58b',type:'dashed',width:2},itemStyle:{color:'#49d58b'}}]
  }),[days,solarAverage]);
  const yieldOption=useMemo(()=>({
    tooltip:{trigger:'axis',confine:true,valueFormatter:(value:unknown)=>`${Number(value).toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/kWp`},
    legend:{top:4,textStyle:{color:'#a9bdc3'}},grid:{left:58,right:22,top:58,bottom:60,containLabel:true},
    dataZoom:days.length>35?[{type:'inside'},{type:'slider',height:18,bottom:14,borderColor:'#29444e',backgroundColor:'#07171d',fillerColor:'rgba(73,213,139,.18)'}]:undefined,
    xAxis:{type:'category',data:days.map(day=>day.date),axisLabel:{color:'#8ba0a8',hideOverlap:true},axisLine:{lineStyle:{color:'#29444e'}}},
    yAxis:{type:'value',name:'kWh/kWp',axisLabel:{color:'#8ba0a8'},nameTextStyle:{color:'#8ba0a8'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[
      {name:'Instalación completa',type:'bar',data:days.map(day=>Number((day.solar/installedKwp).toFixed(3))),itemStyle:{color:'#49d58b',borderRadius:[5,5,0,0]}},
      ...strings.map((string,index)=>({name:string.label,type:'line',showSymbol:false,data:days.map(day=>Number(((string.key==='pv1'?day.pv1:day.pv2)/Math.max(.001,string.installedKwp)).toFixed(3))),lineStyle:{width:2,color:index===0?'#ffd43b':'#38a8ff'},itemStyle:{color:index===0?'#ffd43b':'#38a8ff'}})),
      {name:`Referencia ${siteKey==='puerto-montt'?'Puerto Montt':'Santiago'} · ${referenceDaily.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}`,type:'line',showSymbol:false,data:days.map(()=>referenceDaily),lineStyle:{color:'#f09b52',type:'dashed',width:2},itemStyle:{color:'#f09b52'}}
    ]
  }),[days,installedKwp,referenceDaily,siteKey,strings]);
  const selector=(label:string)=><div className="period-selector" role="group" aria-label={label}>{PERIODS.map(item=><button type="button" className={period===item.key?'active':''} aria-pressed={period===item.key} onClick={()=>setPeriod(item.key)} key={item.key}>{item.label}</button>)}</div>;
  return <div className="daily-energy-charts">
    {excludedDays>0?<div className="data-warning-banner history-status-ok">Calidad estadística: se excluyeron {excludedDays} día{excludedDays===1?'':'s'} de El Arrayán con producción o consumo inferior a 5 kWh, o cobertura insuficiente. Los registros originales permanecen respaldados.</div>:null}
    <section className="panel daily-consumption-chart"><header><div><small>Histórico respaldado · {siteLabel} · {provider==='watchpower'?'WatchPower':'i.Solar'}</small><h2><BarChart3/> Consumo diario y promedio</h2></div><strong>{average.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/día</strong></header>{selector('Período del consumo diario')}{loading?<div className="chart-loading">Cargando consumo diario…</div>:days.length?<><EChart option={option}/><footer className="daily-period-total"><Sigma/><span><small>Total consumido · {selected.label}</small><strong>{kwh(totals.load)}</strong><em>{clp(totals.load*tariff)} valorizados · {days.length} días respaldados · {coveredDates}</em></span></footer></>:<div className="chart-loading">Todavía no hay datos diarios guardados para este período.</div>}</section>
    <section className="panel daily-consumption-chart daily-specific-yield-chart"><header><div><small>Indicador normalizado · {siteLabel}</small><h2><Sun/> Producción específica diaria</h2><p>Producción solar dividida por la potencia instalada; en El Arrayán también se compara cada string.</p></div><strong>{averageSpecificYield.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/kWp/día</strong></header>{selector('Período de la producción específica')}{loading?<div className="chart-loading">Calculando producción específica…</div>:days.length?<><EChart option={yieldOption}/><footer className="daily-period-total yield"><CircleGauge/><span><small>Comparación del promedio del período</small><strong>{averageDeviation>=0?'+':''}{averageDeviation.toLocaleString('es-CL',{maximumFractionDigits:0})} %</strong><em>Referencia diaria: {referenceDaily.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})} kWh/kWp. Los registros históricos originales se conservan sin cambios.</em></span></footer></>:<div className="chart-loading">Todavía no hay producción respaldada para calcular el ratio.</div>}</section>
    <section className="panel daily-consumption-chart daily-solar-chart"><header><div><small>Generación respaldada · {siteLabel} · {provider==='watchpower'?'WatchPower':'i.Solar'}</small><h2><Sun/> Producción solar diaria y promedio</h2></div><strong>{solarAverage.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/día</strong></header>{selector('Período de la producción solar diaria')}{loading?<div className="chart-loading">Cargando producción solar…</div>:days.length?<><EChart option={solarOption}/><footer className="daily-period-total solar"><Sigma/><span><small>Total producido · {selected.label}</small><strong>{kwh(totals.solar)}</strong><em>Ahorro solar valorizado {clp(totals.solar*tariff)} · {days.length} días respaldados · {coveredDates}</em></span></footer></>:<div className="chart-loading">Todavía no hay producción solar guardada para este período.</div>}</section>
  </div>;
}
