import { useMemo, useState } from 'react';
import { CalendarSearch, Database } from 'lucide-react';
import EChart from './EChart';
import { api } from '../services/api';
import type { HistoryRow } from '../types';
import { chileSiteRangeApiRange,dailyEnergy,effectiveGridPower,formatSiteDate,loadPower,parseApiTime,pvPower,siteRangeUtc,siteWeekDateRange,kwh,solarToLoadPower } from '../utils/energy';

type Mode='day'|'week'|'month'|'year'|'range';
const addDays=(date:string,days:number)=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)};
function rangeFor(mode:Mode,date:string,customEnd:string){
  if(mode==='day')return {start:date,end:addDays(date,1)};
  if(mode==='week')return siteWeekDateRange(date);
  if(mode==='month'){const [y,m]=date.split('-').map(Number);return {start:`${date.slice(0,7)}-01`,end:new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)}}
  if(mode==='year'){const year=date.slice(0,4);return {start:`${year}-01-01`,end:`${Number(year)+1}-01-01`}}
  return {start:date,end:addDays(customEnd||date,1)};
}

export default function HistoryExplorer({deviceSn,siteLabel}:{deviceSn:string;siteLabel:string}){
  const [mode,setMode]=useState<Mode>('day'),[date,setDate]=useState(formatSiteDate()),[endDate,setEndDate]=useState(formatSiteDate());
  const [rows,setRows]=useState<HistoryRow[]>([]),[source,setSource]=useState(''),[message,setMessage]=useState('Elige un período para consultar y respaldar sus datos.'),[loading,setLoading]=useState(false);
  const energy=useMemo(()=>dailyEnergy(rows),[rows]);
  const parsed=useMemo(()=>rows.map(row=>({row,time:parseApiTime(row.currentTime??row.createTime??row.collectTime??row.dataTime??row.time)})).filter((item):item is {row:HistoryRow;time:Date}=>Boolean(item.time)),[rows]);
  const option=useMemo(()=>({tooltip:{trigger:'axis',confine:true},legend:{textStyle:{color:'#a9bdc3'}},grid:{left:48,right:18,top:54,bottom:42,containLabel:true},xAxis:{type:'category',data:parsed.map(item=>item.time.toLocaleString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})),axisLabel:{color:'#789099',hideOverlap:true}},yAxis:{type:'value',name:'W',axisLabel:{color:'#789099'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},series:[{name:'Producción solar total',type:'line',showSymbol:false,data:parsed.map(item=>pvPower(item.row,1)+pvPower(item.row,2)),lineStyle:{color:'#efbd34'},itemStyle:{color:'#efbd34'}},{name:'Solar directo estimado',type:'line',showSymbol:false,data:parsed.map(item=>solarToLoadPower(item.row)),lineStyle:{color:'#49d984'},itemStyle:{color:'#49d984'}},{name:'Consumo',type:'line',showSymbol:false,data:parsed.map(item=>loadPower(item.row)),lineStyle:{color:'#a96fff'},itemStyle:{color:'#a96fff'}},{name:'Red activa',type:'line',showSymbol:false,data:parsed.map(item=>effectiveGridPower(item.row)),lineStyle:{color:'#4f9fff'},itemStyle:{color:'#4f9fff'}}]}),[parsed]);
  async function search(){
    if(!deviceSn)return;const range=rangeFor(mode,date,endDate);if(range.end<=range.start){setMessage('La fecha final debe ser igual o posterior a la inicial.');return}
    setLoading(true);setMessage('Consultando Tumcapp y respaldando en Mi Solar…');
    try{const apiRange=chileSiteRangeApiRange(range.start,range.end);const fresh=await api<{list:HistoryRow[]}>(`devices/${deviceSn}/history?start=${encodeURIComponent(apiRange.start)}&end=${encodeURIComponent(apiRange.end)}&maxPages=50`);setRows(fresh.list||[]);setSource('Tumcapp · respaldado en Mi Solar');setMessage(`${fresh.list?.length||0} muestras encontradas.`)}
    catch{try{const utc=siteRangeUtc(range.start,range.end);const stored=await api<{list:HistoryRow[]}>(`devices/${deviceSn}/archive?start=${encodeURIComponent(utc.start)}&end=${encodeURIComponent(utc.end)}`);setRows(stored.list||[]);setSource('Archivo permanente Mi Solar');setMessage(`${stored.list?.length||0} muestras recuperadas del respaldo.`)}catch(error){setRows([]);setSource('');setMessage(error instanceof Error?error.message:'No fue posible consultar el período.')}}finally{setLoading(false)}
  }
  const dateType=mode==='month'?'month':mode==='year'?'number':'date';
  return <section className="panel history-explorer"><header><div><small>Histórico permanente · {siteLabel}</small><h2><CalendarSearch size={22}/> Día · semana · mes · año</h2></div>{source&&<span><Database size={14}/>{source}</span>}</header><div className="history-search-form"><label>Período<select value={mode} onChange={event=>setMode(event.target.value as Mode)}><option value="day">Día</option><option value="week">Semana</option><option value="month">Mes</option><option value="year">Año</option><option value="range">Rango personalizado</option></select></label><label>{mode==='month'?'Mes':mode==='year'?'Año':'Fecha'}<input type={dateType} min={mode==='year'?'2020':undefined} max={mode==='year'?'2100':undefined} value={mode==='month'?date.slice(0,7):mode==='year'?date.slice(0,4):date} onChange={event=>setDate(mode==='month'?`${event.target.value}-01`:mode==='year'?`${event.target.value}-01-01`:event.target.value)}/></label>{mode==='range'&&<label>Hasta<input type="date" value={endDate} min={date} onChange={event=>setEndDate(event.target.value)}/></label>}<button type="button" onClick={search} disabled={loading}>{loading?'Buscando…':'Buscar y respaldar'}</button></div><p className="history-search-message">{message}</p>{rows.length>1&&<><div className="history-result-kpis"><span><small>Muestras</small><strong>{rows.length.toLocaleString('es-CL')}</strong></span><span><small>Solar</small><strong>{kwh(energy.solar)}</strong></span><span><small>Consumo</small><strong>{kwh(energy.load)}</strong></span><span><small>Red activa importada</small><strong>{kwh(energy.gridImport)}</strong></span></div><EChart option={option}/></>}</section>;
}
