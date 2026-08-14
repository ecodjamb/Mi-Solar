import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Sun } from 'lucide-react';
import EChart from './EChart';
import { api } from '../services/api';
import type { HistoryRow } from '../types';
import { groupDailyEnergy } from '../utils/energy';

const PERIODS=[{key:'7d',label:'7 días',days:7},{key:'1m',label:'1 mes',days:31},{key:'6m',label:'6 meses',days:183},{key:'12m',label:'12 meses',days:366}] as const;
type Period=(typeof PERIODS)[number]['key'];

export default function DailyConsumptionChart({deviceSn,siteLabel}:{deviceSn:string;siteLabel:string}){
  const [period,setPeriod]=useState<Period>('1m');
  const [rows,setRows]=useState<HistoryRow[]>([]);
  const [loading,setLoading]=useState(false);
  const selected=PERIODS.find(item=>item.key===period)||PERIODS[1];
  useEffect(()=>{
    if(!deviceSn)return;
    let active=true;const end=new Date();const start=new Date(end.getTime()-selected.days*86400000);
    setLoading(true);
    api<{list:HistoryRow[]}>(`devices/${deviceSn}/archive-series?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&resolution=day`)
      .then(result=>active&&setRows(result.list||[])).catch(()=>active&&setRows([])).finally(()=>active&&setLoading(false));
    return()=>{active=false};
  },[deviceSn,selected.days]);
  const days=useMemo(()=>groupDailyEnergy(rows),[rows]);
  const average=days.length?days.reduce((sum,day)=>sum+day.load,0)/days.length:0;
  const solarAverage=days.length?days.reduce((sum,day)=>sum+day.solar,0)/days.length:0;
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
  const selector=(label:string)=><div className="period-selector" role="group" aria-label={label}>{PERIODS.map(item=><button type="button" className={period===item.key?'active':''} aria-pressed={period===item.key} onClick={()=>setPeriod(item.key)} key={item.key}>{item.label}</button>)}</div>;
  return <div className="daily-energy-charts">
    <section className="panel daily-consumption-chart"><header><div><small>Histórico respaldado · {siteLabel}</small><h2><BarChart3/> Consumo diario y promedio</h2></div><strong>{average.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/día</strong></header>{selector('Período del consumo diario')}{loading?<div className="chart-loading">Cargando consumo diario…</div>:days.length?<EChart option={option}/>:<div className="chart-loading">Todavía no hay datos diarios guardados para este período.</div>}</section>
    <section className="panel daily-consumption-chart daily-solar-chart"><header><div><small>Generación respaldada · {siteLabel}</small><h2><Sun/> Producción solar diaria y promedio</h2></div><strong>{solarAverage.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh/día</strong></header>{selector('Período de la producción solar diaria')}{loading?<div className="chart-loading">Cargando producción solar…</div>:days.length?<EChart option={solarOption}/>:<div className="chart-loading">Todavía no hay producción solar guardada para este período.</div>}</section>
  </div>;
}
