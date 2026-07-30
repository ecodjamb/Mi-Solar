import { useEffect, useMemo, useState } from 'react';
import { Battery, CircleDollarSign, House, RadioTower, RefreshCw, Sun } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import KpiCard from './components/KpiCard';
import LivingHome from './components/living/LivingHome';
import DailyQuote from './components/DailyQuote';
import FunModeToggle from './components/FunModeToggle';
import EChart from './components/EChart';
import { api } from './services/api';
import { fetchWeather, type WeatherData } from './services/weather';
import { weatherCodeToMood } from './utils/living';
import type { DailyEnergy, Device, HistoryRow, PageKey, Realtime } from './types';
import {
  batteryChargePower,batteryDischargePower,batterySoc,batteryVoltage,chileDayApiRange,chileMonthApiRange,clp,dailyEnergy,dataQuality,
  detectPvCount,filterRowsForSiteDate,filterRowsForSiteMonth,formatClock,formatDate,formatSiteDate,gridFrequency,gridPower,gridVoltage,
  health,inverterTemperature,kwh,loadPower,n,outputFrequency,outputVoltage,parseApiTime,pvPower,technicalCatalog,watts
} from './utils/energy';

function Login({done}:{done:()=>void}){
  const [u,setU]=useState(''),[p,setP]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <main className="login"><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('login',{method:'POST',body:JSON.stringify({username:u,password:p})});done()}catch(err){setError(err instanceof Error?err.message:'Error')}finally{setBusy(false)}}}>
    <Sun size={38}/><h1>Mi Solar</h1><p>Centro inteligente de energía</p><input placeholder="Usuario" value={u} onChange={e=>setU(e.target.value)}/><input placeholder="Contraseña" type="password" value={p} onChange={e=>setP(e.target.value)}/>{error&&<span className="error">{error}</span>}<button disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button>
  </form></main>;
}

const emptyMonth={solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,charge:0,discharge:0,samples:0};

export default function App(){
  const [clock,setClock]=useState(formatClock()),[auth,setAuth]=useState<boolean|null>(null),[page,setPage]=useState<PageKey>('home'),[devices,setDevices]=useState<Device[]>([]),[selected,setSelected]=useState(''),[realtime,setRealtime]=useState<Realtime>({}),[summary,setSummary]=useState<Realtime>({}),[rawDayRows,setRawDayRows]=useState<HistoryRow[]>([]),[rawMonthRows,setRawMonthRows]=useState<HistoryRow[]>([]),[loading,setLoading]=useState(false),[tariff,setTariff]=useState(Number(localStorage.getItem('tariffCLP'))||250),[lastFetch,setLastFetch]=useState<Date|null>(null),[fetchError,setFetchError]=useState(''),[weather,setWeather]=useState<WeatherData>({}),[funMode,setFunMode]=useState(localStorage.getItem('funMode')!=='off');
  const siteDate=formatSiteDate();
  const history=useMemo(()=>filterRowsForSiteDate(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const monthRows=useMemo(()=>filterRowsForSiteMonth(rawMonthRows,siteDate.slice(0,7)),[rawMonthRows,siteDate]);
  const device=devices.find(d=>d.deviceSn===selected);
  const solar=pvPower(realtime,1)+pvPower(realtime,2),load=loadPower(realtime),grid=gridPower(realtime),charge=batteryChargePower(realtime),discharge=batteryDischargePower(realtime),soc=batterySoc(realtime);
  const today=useMemo(()=>({...dailyEnergy(history),date:siteDate}),[history,siteDate]);
  const quality=useMemo(()=>dataQuality(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const daily=useMemo(()=>{
    const groups=new Map<string,HistoryRow[]>();
    monthRows.forEach(r=>{const d=parseApiTime(r.currentTime??r.createTime??r.collectTime??r.dataTime??r.time);if(!d)return;const key=d.toLocaleDateString('en-CA',{timeZone:'America/Santiago'});groups.set(key,[...(groups.get(key)||[]),r]);});
    return [...groups].map(([date,rows])=>({...dailyEnergy(rows),date})).sort((a,b)=>a.date.localeCompare(b.date));
  },[monthRows]);
  const best=useMemo(()=>daily.reduce<DailyEnergy|null>((a,b)=>!a||b.solar>a.solar?b:a,null),[daily]);
  const month=useMemo(()=>daily.reduce((a,d)=>({solar:a.solar+d.solar,pv1:a.pv1+d.pv1,pv2:a.pv2+d.pv2,load:a.load+d.load,grid:a.grid+d.grid,gridImport:a.gridImport+d.gridImport,gridExport:a.gridExport+d.gridExport,charge:a.charge+d.charge,discharge:a.discharge+d.discharge,samples:a.samples+d.samples}),{...emptyMonth}),[daily]);

  async function refresh(sn=selected){
    if(!sn)return; setLoading(true); setFetchError('');
    try{
      const dayRange=chileDayApiRange(),monthRange=chileMonthApiRange();
      const [r,s,h,m]=await Promise.all([
        api<{data:Realtime}>(`devices/${sn}/realtime`),
        api<{data:Realtime}>(`devices/${sn}/summary`),
        api<{list:HistoryRow[];total:number;truncated?:boolean}>(`devices/${sn}/history?start=${encodeURIComponent(dayRange.start)}&end=${encodeURIComponent(dayRange.end)}&maxPages=50`),
        api<{list:HistoryRow[];total:number;truncated?:boolean}>(`devices/${sn}/history?start=${encodeURIComponent(monthRange.start)}&end=${encodeURIComponent(monthRange.end)}&maxPages=50`)
      ]);
      setRealtime(r.data||{});setSummary(s.data||{});setRawDayRows(h.list||[]);setRawMonthRows(m.list||[]);setLastFetch(new Date());
      if(h.truncated||m.truncated)setFetchError('El histórico llegó truncado; revisa el límite de páginas.');
    }catch(err){setFetchError(err instanceof Error?err.message:'No fue posible actualizar los datos.');}finally{setLoading(false);}
  }

  useEffect(()=>{const timer=setInterval(()=>setClock(formatClock()),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{api<{authenticated:boolean}>('session').then(x=>setAuth(x.authenticated)).catch(()=>setAuth(false))},[]);
  useEffect(()=>{if(!auth)return;api<{devices:Device[]}>('devices').then(x=>{setDevices(x.devices||[]);const sn=x.devices?.[0]?.deviceSn||'';setSelected(sn);if(sn)refresh(sn)})},[auth]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>refresh(selected),15000);return()=>clearInterval(t)},[auth,selected]);
  useEffect(()=>{if(!auth||!device)return;const loadWeather=()=>fetchWeather(device.nickName||'').then(setWeather).catch(()=>setWeather({}));loadWeather();const t=setInterval(loadWeather,10*60*1000);return()=>clearInterval(t)},[auth,device?.deviceSn]);

  const chartOption=useMemo(()=>({backgroundColor:'transparent',tooltip:{trigger:'axis'},legend:{textStyle:{color:'#9fb2ba'}},grid:{left:48,right:18,top:42,bottom:40},xAxis:{type:'category',data:history.map(r=>{const d=parseApiTime(r.currentTime??r.createTime??r.collectTime??r.dataTime??r.time);return d?d.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}):''}),axisLabel:{color:'#789099'},axisLine:{lineStyle:{color:'#27404a'}}},yAxis:{type:'value',name:'W',nameTextStyle:{color:'#789099'},axisLabel:{color:'#789099'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},series:[{name:'Solar',type:'line',smooth:true,showSymbol:false,data:history.map(r=>pvPower(r,1)+pvPower(r,2)),lineStyle:{width:2},areaStyle:{opacity:.12}},{name:'Casa',type:'line',smooth:true,showSymbol:false,data:history.map(loadPower)},{name:'Red importada',type:'line',smooth:true,showSymbol:false,data:history.map(r=>Math.max(0,gridPower(r)))},{name:'Batería descarga',type:'line',smooth:true,showSymbol:false,data:history.map(batteryDischargePower)}]}),[history]);

  if(auth===null)return <div className="boot">Cargando Mi Solar…</div>;
  if(!auth)return <Login done={()=>setAuth(true)}/>;
  const site=device?.nickName||'Instalación';
  const updated=formatDate(realtime.currentTime??realtime.createTime??realtime.collectTime??realtime.dataTime??realtime.time);
  const savings=Math.min(today.solar,today.load)*tariff;
  const catalog=technicalCatalog(realtime,summary);
  const rawUnknown=Object.keys({...summary,...realtime}).filter(key=>!catalog.some(section=>section.items.some(item=>item.source===key))).sort();

  return <div className="shell"><Sidebar page={page} setPage={setPage} site={site} onLogout={async()=>{await api('logout',{method:'POST'});setAuth(false)}}/><main className="content">
    <header className="topbar"><div><select value={selected} onChange={e=>{setSelected(e.target.value);refresh(e.target.value)}}>{devices.map(d=><option key={d.deviceSn} value={d.deviceSn}>{d.nickName||d.deviceSn}</option>)}</select><span className="online">● En línea</span></div><div className="time-box"><strong>{clock}</strong><small>Hora de Santiago</small><small>Último dato del inversor: {updated}</small>{lastFetch&&<small>Consulta de la app: {lastFetch.toLocaleTimeString('es-CL',{timeZone:'America/Santiago'})}</small>}</div><FunModeToggle value={funMode} onChange={v=>{setFunMode(v);localStorage.setItem('funMode',v?'on':'off')}}/><button className="refresh-button" onClick={()=>refresh()} aria-label="Actualizar datos"><RefreshCw className={loading?'spin':''} size={18}/></button></header>
    {fetchError&&<div className="data-warning">{fetchError}</div>}
    {page==='home'&&<><section className="kpi-grid"><KpiCard icon={Sun} label="Producción solar" value={watts(solar)} detail={`Hoy: ${kwh(today.solar)}`} tone="solar"/><KpiCard icon={House} label="Consumo actual" value={watts(load)} detail={`Hoy: ${kwh(today.load)}`}/><KpiCard icon={RadioTower} label={grid<0?'Hacia la red':'Desde la red'} value={watts(Math.abs(grid))} detail={`Hoy importado: ${kwh(today.gridImport)}`}/><KpiCard icon={Battery} label="Batería" value={`${soc.toFixed(0)}%`} detail={`${charge>discharge?'Cargando':'Entregando'} ${watts(Math.max(charge,discharge))}`} tone="green"/><KpiCard icon={CircleDollarSign} label="Ahorro estimado" value={clp(savings)} detail="Hoy, vs. sin solar" tone="green"/></section>
      <DailyQuote/><LivingHome data={realtime} history={monthRows} weather={weatherCodeToMood(weather.weatherCode)} funMode={funMode}/><div className="home-grid secondary-home-grid"><aside className="side-stack"><section className="panel health-card"><small>Estado del sistema</small><strong>{health(realtime)}/100</strong><p>{health(realtime)>90?'Excelente · sin anomalías relevantes':'Conviene revisar algunos parámetros'}</p></section><section className="panel best-card"><small>Mejor día de producción</small><strong>{best?kwh(best.solar):'—'}</strong><p>{best?new Date(`${best.date}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'}):'Aún sin histórico suficiente'}</p></section><section className={`panel quality-card ${quality.complete?'ok':'warn'}`}><small>Cobertura del día Santiago</small><strong>{today.samples} muestras</strong><p>{quality.complete?'Histórico continuo y actualizado':'Cobertura parcial: el total del día puede estar incompleto'}</p>{quality.first&&quality.last&&<small>{quality.first.toLocaleTimeString('es-CL',{timeZone:'America/Santiago'})} → {quality.last.toLocaleTimeString('es-CL',{timeZone:'America/Santiago'})}</small>}</section></aside><section className="panel weather-card"><small>Condición actual</small><strong>{weather.temperature!=null?`${weather.temperature.toFixed(1)} °C`:'Sin dato climático'}</strong><p>{weather.humidity!=null?`Humedad ${weather.humidity}% · Viento ${Number(weather.windSpeed||0).toFixed(0)} km/h`:'La ambientación usa la hora local mientras llega el clima.'}</p></section></div>
      <section className="panel chart-panel"><header className="section-head"><div><small>Producción y consumo</small><h2>Hoy · horario de Santiago</h2></div></header><EChart option={chartOption}/></section></>}
    {page==='charts'&&<section className="page-grid"><section className="panel wide"><h2>Histórico diario del mes</h2><EChart option={{tooltip:{trigger:'axis'},legend:{textStyle:{color:'#9fb2ba'}},grid:{left:48,right:18,top:48,bottom:38},xAxis:{type:'category',data:daily.map(d=>d.date.slice(8)),axisLabel:{color:'#789099'}},yAxis:{type:'value',name:'kWh',nameTextStyle:{color:'#789099'},axisLabel:{color:'#789099'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},series:[{name:'Solar',type:'bar',data:daily.map(d=>Number(d.solar.toFixed(2)))},{name:'Consumo',type:'bar',data:daily.map(d=>Number(d.load.toFixed(2)))},{name:'Red importada',type:'line',smooth:true,data:daily.map(d=>Number(d.gridImport.toFixed(2)))},{name:'Red exportada',type:'line',smooth:true,data:daily.map(d=>Number(d.gridExport.toFixed(2)))}]}}/></section>
      <section className="panel pv-day-card"><header><div><small>Aporte fotovoltaico de hoy</small><h2>PV1 vs. PV2</h2></div><strong>{kwh(today.solar)}</strong></header><div className="pv-day-row"><span>PV1</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv1/today.solar*100):0}%`}}/></div><b>{kwh(today.pv1)}</b></div>{detectPvCount(realtime,monthRows)===2&&<div className="pv-day-row pv2-day"><span>PV2</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv2/today.solar*100):0}%`}}/></div><b>{kwh(today.pv2)}</b></div>}<p>Resumen integrado exclusivamente con muestras del día calendario de Santiago.</p></section>
      <section className="panel stat"><small>Producción del mes</small><strong>{kwh(month.solar)}</strong></section><section className="panel stat"><small>Mejor día</small><strong>{best?kwh(best.solar):'—'}</strong></section><section className="panel stat"><small>Exportación del mes</small><strong>{kwh(month.gridExport)}</strong></section><section className="panel stat"><small>Carga de batería del mes</small><strong>{kwh(month.charge)}</strong></section></section>}
    {page==='costs'&&<section className="page-grid"><section className="panel form-card"><h2>Tarifa eléctrica</h2><label>CLP por kWh<input type="number" value={tariff} onChange={e=>{const v=Number(e.target.value);setTariff(v);localStorage.setItem('tariffCLP',String(v))}}/></label></section><section className="panel stat"><small>Ahorro hoy</small><strong>{clp(savings)}</strong></section><section className="panel stat"><small>Ahorro mensual estimado</small><strong>{clp(Math.min(month.solar,month.load)*tariff)}</strong></section><section className="panel stat"><small>Costo de red del mes</small><strong>{clp(month.gridImport*tariff)}</strong></section></section>}
    {page==='equipment'&&<section className="equipment-grid">{[['Paneles',`PV1 ${watts(pvPower(realtime,1))}${detectPvCount(realtime,monthRows)===2?` · PV2 ${watts(pvPower(realtime,2))}`:''}`],['Inversor',String(summary.workMode||realtime.workMode||'—')],['Batería',`${soc.toFixed(0)}% · ${batteryVoltage(realtime).toFixed(1)} V`],['Red',`${watts(Math.abs(grid))} · ${gridVoltage(realtime).toFixed(1)} V · ${gridFrequency(realtime).toFixed(1)} Hz`],['Salida AC',`${outputVoltage(realtime).toFixed(1)} V · ${outputFrequency(realtime).toFixed(1)} Hz`],['Temperatura',`${inverterTemperature(realtime).toFixed(1)} °C`]].map(([a,b])=><article className="panel equipment-card" key={a}><h2>{a}</h2><p>{b}</p></article>)}</section>}
    {page==='technical'&&<section className="technical-page"><section className="technical-grid">{catalog.map(section=><article className="panel technical-section" key={section.title}><h2>{section.title}</h2>{section.items.map(item=><div className="technical-row" key={item.key}><span>{item.label}</span><strong>{item.value===null?'—':`${typeof item.value==='number'?item.value.toLocaleString('es-CL',{maximumFractionDigits:2}):item.value}${item.unit?` ${item.unit}`:''}`}</strong><small>{item.source||'campo no disponible'}</small></div>)}</article>)}</section><section className="panel technical"><h2>Auditoría de datos</h2><p>Muestras del día: {today.samples}. Muestras del mes: {month.samples}. Campos adicionales detectados: {rawUnknown.length}.</p><details><summary>Campos no catalogados</summary><pre>{JSON.stringify(Object.fromEntries(rawUnknown.map(k=>[k,(realtime as Record<string,unknown>)[k]??(summary as Record<string,unknown>)[k]])),null,2)}</pre></details><details><summary>JSON completo</summary><pre>{JSON.stringify({realtime,summary,today,month,quality},null,2)}</pre></details></section></section>}
  </main><MobileNav page={page} setPage={setPage}/></div>;
}
