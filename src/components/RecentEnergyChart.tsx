import { useMemo } from 'react';
import EChart from './EChart';
import type { HistoryRow } from '../types';
import { batteryChargePower,batteryDischargePower,loadPower,parseApiTime,pvPower } from '../utils/energy';

export default function RecentEnergyChart({rows,siteLabel}:{rows:HistoryRow[];siteLabel:string}){
 const recent=useMemo(()=>{
  const parsed=rows.map(row=>({row,date:parseApiTime(row.currentTime??row.createTime??row.collectTime??row.dataTime??row.time)})).filter((item):item is {row:HistoryRow;date:Date}=>Boolean(item.date)).sort((a,b)=>a.date.getTime()-b.date.getTime());
  const end=parsed.at(-1)?.date.getTime()??Date.now();
  return parsed.filter(item=>item.date.getTime()>=end-3*60*60*1000);
 },[rows]);
 const option=useMemo(()=>({
  backgroundColor:'transparent',
  tooltip:{trigger:'axis',confine:true,formatter:(params:any[])=>{const p=params?.[0];if(!p)return '';return `<strong>${p.axisValue}</strong><br/>${params.map(x=>`${x.marker}${x.seriesName}: <b>${Number(x.value).toLocaleString('es-CL')} W</b>`).join('<br/>')}`}},
  legend:{top:0,textStyle:{color:'#a9bdc3'}},
  grid:{left:50,right:20,top:60,bottom:38,containLabel:true},
  xAxis:{type:'category',data:recent.map(item=>item.date.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'})),axisLabel:{color:'#789099',hideOverlap:true},axisLine:{lineStyle:{color:'#27404a'}}},
  yAxis:{type:'value',name:'W',nameTextStyle:{color:'#789099'},axisLabel:{color:'#789099'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
  series:[
   {name:'Consumo total casa',type:'line',smooth:true,showSymbol:false,data:recent.map(item=>loadPower(item.row)),lineStyle:{width:3,color:'#a96fff'},itemStyle:{color:'#a96fff'},areaStyle:{opacity:.06,color:'#a96fff'}},
   {name:'Generación PV1 + PV2',type:'line',smooth:true,showSymbol:false,data:recent.map(item=>pvPower(item.row,1)+pvPower(item.row,2)),lineStyle:{width:3,color:'#efbd34'},itemStyle:{color:'#efbd34'},areaStyle:{opacity:.05,color:'#efbd34'}},
   {name:'Batería (+ entrega / − carga)',type:'line',smooth:true,showSymbol:false,data:recent.map(item=>batteryDischargePower(item.row)-batteryChargePower(item.row)),lineStyle:{width:2,color:'#4bd98a'},itemStyle:{color:'#4bd98a'}},
   {name:'Referencia 0 W',type:'line',showSymbol:false,silent:true,data:recent.map(()=>0),lineStyle:{width:1,color:'rgba(210,225,230,.28)',type:'dashed'}}
  ]
 }),[recent]);
 return <section className="panel recent-energy-panel"><header className="section-head"><div><small>Últimas tres horas · {siteLabel}</small><h2>Consumo, solar y batería</h2></div><span className="recent-chart-note">Batería positiva = entrega · negativa = carga</span></header>{recent.length>1?<EChart option={option}/>:<div className="empty-chart">Todavía no hay suficientes muestras para mostrar tres horas.</div>}</section>;
}
