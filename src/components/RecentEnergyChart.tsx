import { useMemo, useState } from 'react';
import EChart from './EChart';
import type { HistoryRow } from '../types';
import { batteryChargePower,batteryDischargePower,effectiveGridPower,loadPower,parseApiTime,pvPower,solarSystemToLoadPower } from '../utils/energy';

const RANGES=[3,7,12,24] as const;
export default function RecentEnergyChart({rows,siteLabel,gridLabel='Red activa'}:{rows:HistoryRow[];siteLabel:string;gridLabel?:string}){
 const [hours,setHours]=useState<(typeof RANGES)[number]>(3);
 const recent=useMemo(()=>{
  const parsed=rows.map(row=>({row,date:parseApiTime(row.currentTime??row.createTime??row.collectTime??row.dataTime??row.time)})).filter((item):item is {row:HistoryRow;date:Date}=>Boolean(item.date)).sort((a,b)=>a.date.getTime()-b.date.getTime());
  const end=parsed.at(-1)?.date.getTime()??Date.now();
  return parsed.filter(item=>item.date.getTime()>=end-hours*60*60*1000);
 },[rows,hours]);
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
   {name:gridLabel,type:'line',smooth:true,showSymbol:false,data:recent.map(item=>Math.max(0,effectiveGridPower(item.row))),lineStyle:{width:2,color:'#4f9fff'},itemStyle:{color:'#4f9fff'}},
   {name:'Sistema solar hacia la casa',type:'line',smooth:true,showSymbol:false,data:recent.map(item=>solarSystemToLoadPower(item.row)),lineStyle:{width:2,color:'#49d984'},itemStyle:{color:'#49d984'}},
   {name:'Batería (+ entrega / − carga)',type:'line',smooth:true,showSymbol:false,data:recent.map(item=>batteryDischargePower(item.row)-batteryChargePower(item.row)),lineStyle:{width:2,color:'#4bd98a'},itemStyle:{color:'#4bd98a'}},
   {name:'Referencia 0 W',type:'line',showSymbol:false,silent:true,data:recent.map(()=>0),lineStyle:{width:1,color:'rgba(210,225,230,.28)',type:'dashed'}}
  ]
 }),[recent,gridLabel]);
 return <section className="panel recent-energy-panel"><header className="section-head"><div><small>Producción y consumo · {siteLabel}</small><h2>Todos los flujos en un solo gráfico</h2></div><span className="recent-chart-note">Batería positiva = entrega · negativa = carga</span></header><div className="period-selector compact" role="group" aria-label="Rango del gráfico principal">{RANGES.map(value=><button type="button" className={hours===value?'active':''} onClick={()=>setHours(value)} key={value}>{value} h</button>)}</div>{recent.length>1?<EChart option={option}/>:<div className="empty-chart">Todavía no hay suficientes muestras para mostrar este período.</div>}</section>;
}
