import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, ZoomIn } from 'lucide-react';
import EChart from './EChart';
import { api } from '../services/api';
import type { HistoryRow } from '../types';
import { batteryDischargePower, effectiveGridPower, loadPower, parseApiTime, pvPower, solarToLoadPower } from '../utils/energy';

type Period='5h'|'12h'|'24h'|'7d'|'14d'|'1m'|'6m'|'1y';
const PERIODS:{key:Period;label:string;hours:number}[]=[
  {key:'5h',label:'5 h',hours:5},{key:'12h',label:'12 h',hours:12},{key:'24h',label:'24 h',hours:24},
  {key:'7d',label:'7 días',hours:24*7},{key:'14d',label:'14 días',hours:24*14},{key:'1m',label:'1 mes',hours:24*31},
  {key:'6m',label:'6 meses',hours:24*183},{key:'1y',label:'1 año',hours:24*366}
];

export default function EnergyRangeChart({deviceSn,siteLabel}:{deviceSn:string;siteLabel:string}){
  const [period,setPeriod]=useState<Period>('24h');
  const [rows,setRows]=useState<HistoryRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const selected=PERIODS.find(item=>item.key===period)||PERIODS[2];

  useEffect(()=>{
    if(!deviceSn)return;
    const end=new Date();
    const start=new Date(end.getTime()-selected.hours*3600000);
    const resolution=selected.hours>24*14?'day':'hour';
    setLoading(true);setMessage('');
    api<{list:HistoryRow[]}>(`devices/${deviceSn}/archive-series?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&resolution=${resolution}`)
      .then(result=>{setRows(result.list||[]);if(!result.list?.length)setMessage('Este período aún no tiene datos respaldados. Usa “Carga histórica” para importarlos desde el origen.');})
      .catch(error=>{setRows([]);setMessage(error instanceof Error?error.message:'No fue posible cargar el período.');})
      .finally(()=>setLoading(false));
  },[deviceSn,period,selected.hours]);

  const seriesRows=useMemo(()=>rows.map(row=>({row,time:parseApiTime(row.currentTime??row.createTime??row.collectTime??row.dataTime??row.time)})).filter((item):item is {row:HistoryRow;time:Date}=>Boolean(item.time)),[rows]);
  const option=useMemo(()=>({
    animationDuration:350,
    tooltip:{trigger:'axis',confine:true,valueFormatter:(value:unknown)=>`${Number(value).toLocaleString('es-CL',{maximumFractionDigits:0})} W`},
    legend:{type:'scroll',top:4,left:8,right:8,textStyle:{color:'#a9bdc3'}},
    grid:{left:54,right:22,top:62,bottom:72,containLabel:true},
    dataZoom:[{type:'inside',xAxisIndex:0,filterMode:'none'},{type:'slider',xAxisIndex:0,height:22,bottom:18,borderColor:'#29444e',backgroundColor:'#07171d',fillerColor:'rgba(58,144,255,.2)',textStyle:{color:'#8ba0a8'}}],
    xAxis:{type:'time',axisLabel:{color:'#8ba0a8',hideOverlap:true},axisLine:{lineStyle:{color:'#29444e'}}},
    yAxis:{type:'value',name:'W',nameTextStyle:{color:'#8ba0a8'},axisLabel:{color:'#8ba0a8'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[
      {name:'Solar',type:'line',showSymbol:false,smooth:true,data:seriesRows.map(item=>[item.time.getTime(),pvPower(item.row,1)+pvPower(item.row,2)]),lineStyle:{width:3,color:'#efbd34'},itemStyle:{color:'#efbd34'}},
      {name:'Consumo',type:'line',showSymbol:false,smooth:true,data:seriesRows.map(item=>[item.time.getTime(),loadPower(item.row)]),lineStyle:{width:2,color:'#a96fff'},itemStyle:{color:'#a96fff'}},
      {name:'Red activa',type:'line',showSymbol:false,smooth:true,data:seriesRows.map(item=>[item.time.getTime(),effectiveGridPower(item.row)]),lineStyle:{width:2,color:'#4f9fff'},itemStyle:{color:'#4f9fff'}},
      {name:'Solar directo estimado',type:'line',showSymbol:false,smooth:true,data:seriesRows.map(item=>[item.time.getTime(),solarToLoadPower(item.row)]),lineStyle:{width:2,color:'#49d984'},itemStyle:{color:'#49d984'}},
      {name:'Batería',type:'line',showSymbol:false,smooth:true,data:seriesRows.map(item=>[item.time.getTime(),batteryDischargePower(item.row)]),lineStyle:{width:2,color:'#4bd98a'},itemStyle:{color:'#4bd98a'}}
    ]
  }),[seriesRows]);

  return <section className="panel range-chart-panel"><header><div><small>Exploración flexible · {siteLabel}</small><h2><CalendarRange size={21}/> Energía en el tiempo</h2></div><span><ZoomIn size={15}/> Arrastra la barra inferior o usa dos dedos para ampliar</span></header><div className="period-selector" role="group" aria-label="Período del gráfico">{PERIODS.map(item=><button type="button" key={item.key} className={period===item.key?'active':''} onClick={()=>setPeriod(item.key)}>{item.label}</button>)}</div>{loading?<div className="chart-loading">Cargando {selected.label}…</div>:message?<div className="chart-loading">{message}</div>:<EChart className="range-energy-chart" option={option}/>}</section>;
}
