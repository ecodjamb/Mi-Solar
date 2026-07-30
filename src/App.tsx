import { useEffect, useMemo, useState } from 'react';
import { Battery, CircleDollarSign, House, RadioTower, RefreshCw, Sun } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import KpiCard from './components/KpiCard';
import LivingHome from './components/living/LivingHome';
import DailyQuote from './components/DailyQuote';
import FunModeToggle from './components/FunModeToggle';
import EChart from './components/EChart';
import PowerGauge from './components/PowerGauge';
import EnergyMetricChart from './components/EnergyMetricChart';
import SolarForecastPage from './components/SolarForecastPage';
import { api } from './services/api';
import { fetchWeather, type WeatherData } from './services/weather';
import { weatherCodeToMood } from './utils/living';
import { accumulatedTheoreticalToday, calibrateSolarModel, expectedPowerNow } from './utils/solarForecast';
import type { DailyEnergy, Device, HistoryRow, PageKey, Realtime } from './types';
import { cumulativeDays, dayGrid, dayLoad, daySolar } from './utils/charts';
import {
  batteryChargePower,batteryDischargePower,batterySoc,batteryVoltage,chileDayApiRange,chileMonthApiRange,chileWeekApiRange,clp,dailyEnergy,dataQuality,
  detectPvCount,filterRowsForSiteDate,filterRowsForSiteMonth,filterRowsForSiteRange,formatClock,formatDate,formatSiteDate,gridFrequency,gridPower,gridVoltage,
  groupDailyEnergy,health,inverterTemperature,kwh,loadPower,outputFrequency,outputVoltage,parseApiTime,pvPower,technicalCatalog,watts
} from './utils/energy';

function Login({done}:{done:()=>void}){
  const [u,setU]=useState(''),[p,setP]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <main className="login"><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('login',{method:'POST',body:JSON.stringify({username:u,password:p})});done()}catch(err){setError(err instanceof Error?err.message:'Error')}finally{setBusy(false)}}}>
    <Sun size={38}/><h1>Mi Solar</h1><p>Centro inteligente de energía</p><input placeholder="Usuario" value={u} onChange={e=>setU(e.target.value)}/><input placeholder="Contraseña" type="password" value={p} onChange={e=>setP(e.target.value)}/>{error&&<span className="error">{error}</span>}<button disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button>
  </form></main>;
}

const emptyEnergy={solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,charge:0,discharge:0,samples:0};
const sumDays=(days:DailyEnergy[])=>days.reduce((a,d)=>({solar:a.solar+d.solar,pv1:a.pv1+d.pv1,pv2:a.pv2+d.pv2,load:a.load+d.load,grid:a.grid+d.grid,gridImport:a.gridImport+d.gridImport,gridExport:a.gridExport+d.gridExport,charge:a.charge+d.charge,discharge:a.discharge+d.discharge,samples:a.samples+d.samples}),{...emptyEnergy});

export default function App(){
  const [clock,setClock]=useState(formatClock()),[auth,setAuth]=useState<boolean|null>(null),[page,setPage]=useState<PageKey>('home'),[devices,setDevices]=useState<Device[]>([]),[selected,setSelected]=useState(''),[realtime,setRealtime]=useState<Realtime>({}),[summary,setSummary]=useState<Realtime>({}),[rawDayRows,setRawDayRows]=useState<HistoryRow[]>([]),[rawWeekRows,setRawWeekRows]=useState<HistoryRow[]>([]),[rawMonthRows,setRawMonthRows]=useState<HistoryRow[]>([]),[loading,setLoading]=useState(false),[tariff,setTariff]=useState(Number(localStorage.getItem('tariffCLP'))||250),[lastFetch,setLastFetch]=useState<Date|null>(null),[fetchError,setFetchError]=useState(''),[weather,setWeather]=useState<WeatherData>({}),[funMode,setFunMode]=useState(localStorage.getItem('funMode')!=='off');
  const siteDate=formatSiteDate();
  const weekRange=useMemo(()=>chileWeekApiRange(siteDate),[siteDate]);
  const history=useMemo(()=>filterRowsForSiteDate(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const weekRows=useMemo(()=>filterRowsForSiteRange(rawWeekRows,weekRange.siteStart,weekRange.siteEnd),[rawWeekRows,weekRange.siteStart,weekRange.siteEnd]);
  const monthRows=useMemo(()=>filterRowsForSiteMonth(rawMonthRows,siteDate.slice(0,7)),[rawMonthRows,siteDate]);
  const device=devices.find(d=>d.deviceSn===selected);
  const solar=pvPower(realtime,1)+pvPower(realtime,2),load=loadPower(realtime),grid=gridPower(realtime),charge=batteryChargePower(realtime),discharge=batteryDischargePower(realtime),soc=batterySoc(realtime);
  const today=useMemo(()=>({...dailyEnergy(history),date:siteDate}),[history,siteDate]);
  const quality=useMemo(()=>dataQuality(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const weekDaily=useMemo(()=>groupDailyEnergy(weekRows),[weekRows]);
  const daily=useMemo(()=>groupDailyEnergy(monthRows),[monthRows]);
  const best=useMemo(()=>daily.reduce<DailyEnergy|null>((a,b)=>!a||b.solar>a.solar?b:a,null),[daily]);
  const week=useMemo(()=>sumDays(weekDaily),[weekDaily]);
  const month=useMemo(()=>sumDays(daily),[daily]);
  const installedWp=Number(localStorage.getItem('installedWp'))||8680;
  const solarModel=useMemo(()=>calibrateSolarModel(daily,weather.dailyRadiation||[],installedWp),[daily,weather.dailyRadiation,installedWp]);
  const expectedSolarNow=useMemo(()=>expectedPowerNow(weather.hourly,solarModel),[weather.hourly,solarModel,clock]);
  const theoreticalToday=useMemo(()=>accumulatedTheoreticalToday(weather.hourly,solarModel),[weather.hourly,solarModel,clock]);

  async function refresh(sn=selected){
    if(!sn)return; setLoading(true); setFetchError('');
    try{
      const dayRange=chileDayApiRange(),weekApi=chileWeekApiRange(),monthRange=chileMonthApiRange();
      const [r,s,h,w,m]=await Promise.all([
        api<{data:Realtime}>(`devices/${sn}/realtime`),
        api<{data:Realtime}>(`devices/${sn}/summary`),
        api<{list:HistoryRow[];total:number;truncated?:boolean}>(`devices/${sn}/history?start=${encodeURIComponent(dayRange.start)}&end=${encodeURIComponent(dayRange.end)}&maxPages=60`),
        api<{list:HistoryRow[];total:number;truncated?:boolean}>(`devices/${sn}/history?start=${encodeURIComponent(weekApi.start)}&end=${encodeURIComponent(weekApi.end)}&maxPages=100`),
        api<{list:HistoryRow[];total:number;truncated?:boolean}>(`devices/${sn}/history?start=${encodeURIComponent(monthRange.start)}&end=${encodeURIComponent(monthRange.end)}&maxPages=250`)
      ]);
      setRealtime(r.data||{});setSummary(s.data||{});setRawDayRows(h.list||[]);setRawWeekRows(w.list||[]);setRawMonthRows(m.list||[]);setLastFetch(new Date());
      if(h.truncated||w.truncated||m.truncated)setFetchError('El histórico llegó truncado; algunos acumulados podrían estar incompletos.');
    }catch(err){setFetchError(err instanceof Error?err.message:'No fue posible actualizar los datos.');}finally{setLoading(false);}
  }

  useEffect(()=>{const timer=setInterval(()=>setClock(formatClock()),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{api<{authenticated:boolean}>('session').then(x=>setAuth(x.authenticated)).catch(()=>setAuth(false))},[]);
  useEffect(()=>{if(!auth)return;api<{devices:Device[]}>('devices').then(x=>{setDevices(x.devices||[]);const sn=x.devices?.[0]?.deviceSn||'';setSelected(sn);if(sn)refresh(sn)})},[auth]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>refresh(selected),15000);return()=>clearInterval(t)},[auth,selected]);
  useEffect(()=>{if(!auth||!device)return;const loadWeather=()=>fetchWeather(device.nickName||'').then(setWeather).catch(()=>setWeather({}));loadWeather();const t=setInterval(loadWeather,10*60*1000);return()=>clearInterval(t)},[auth,device?.deviceSn]);

  const chartOption=useMemo(()=>({backgroundColor:'transparent',tooltip:{trigger:'axis'},legend:{textStyle:{color:'#9fb2ba'}},grid:{left:48,right:18,top:42,bottom:40},xAxis:{type:'category',data:history.map(r=>{const d=parseApiTime(r.currentTime??r.createTime??r.collectTime??r.dataTime??r.time);return d?d.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}):''}),axisLabel:{color:'#789099'},axisLine:{lineStyle:{color:'#27404a'}}},yAxis:{type:'value',name:'W',nameTextStyle:{color:'#789099'},axisLabel:{color:'#789099'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},series:[{name:'Solar',type:'line',smooth:true,showSymbol:false,data:history.map(r=>pvPower(r,1)+pvPower(r,2)),lineStyle:{width:2,color:'#efbd34'},areaStyle:{opacity:.1,color:'#efbd34'}},{name:'Casa',type:'line',smooth:true,showSymbol:false,data:history.map(loadPower),lineStyle:{color:'#a96fff'}},{name:'Red importada',type:'line',smooth:true,showSymbol:false,data:history.map(r=>Math.max(0,gridPower(r))),lineStyle:{color:'#4f9fff'}},{name:'Batería descarga',type:'line',smooth:true,showSymbol:false,data:history.map(batteryDischargePower),lineStyle:{color:'#4bdd80'}}]}),[history]);

  const daySolarSeries=useMemo(()=>daySolar(history),[history]);
  const dayLoadSeries=useMemo(()=>dayLoad(history),[history]);
  const dayGridSeries=useMemo(()=>dayGrid(history),[history]);
  const weekSolarSeries=useMemo(()=>cumulativeDays(weekDaily,'solar'),[weekDaily]);
  const weekLoadSeries=useMemo(()=>cumulativeDays(weekDaily,'load'),[weekDaily]);
  const weekGridSeries=useMemo(()=>cumulativeDays(weekDaily,'gridImport'),[weekDaily]);
  const monthSolarSeries=useMemo(()=>cumulativeDays(daily,'solar'),[daily]);
  const monthLoadSeries=useMemo(()=>cumulativeDays(daily,'load'),[daily]);
  const monthGridSeries=useMemo(()=>cumulativeDays(daily,'gridImport'),[daily]);

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
    {page==='home'&&<><section className="kpi-grid kpi-grid-six"><KpiCard icon={Sun} label="Producción solar" value={watts(solar)} detail={`Hoy: ${kwh(today.solar)} · esperado ahora ${watts(expectedSolarNow)}`} tone="solar"/><KpiCard icon={Sun} label="Solar acumulado del día" value={kwh(today.solar)} detail={`Teórico acumulado: ${kwh(theoreticalToday)} · ${weather.provider||'sin proveedor'}`} tone="solar"/><KpiCard icon={House} label="Consumo actual" value={watts(load)} detail={`Hoy: ${kwh(today.load)}`}/><KpiCard icon={RadioTower} label={grid<0?'Hacia la red':'Desde la red'} value={watts(Math.abs(grid))} detail={`Hoy importado: ${kwh(today.gridImport)}`}/><KpiCard icon={Battery} label="Batería" value={`${soc.toFixed(0)}%`} detail={`${charge>discharge?'Cargando':'Entregando'} ${watts(Math.max(charge,discharge))}`} tone="green"/><KpiCard icon={CircleDollarSign} label="Ahorro estimado" value={clp(savings)} detail="Hoy, vs. sin solar" tone="green"/></section>
      <DailyQuote/><LivingHome data={realtime} history={monthRows} weather={weatherCodeToMood(weather.weatherCode)} funMode={funMode}/><div className="home-grid secondary-home-grid"><aside className="side-stack"><section className="panel health-card"><small>Estado del sistema</small><strong>{health(realtime)}/100</strong><p>{health(realtime)>90?'Excelente · sin anomalías relevantes':'Conviene revisar algunos parámetros'}</p></section><section className="panel best-card"><small>Mejor día de producción</small><strong>{best?kwh(best.solar):'—'}</strong><p>{best?new Date(`${best.date}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'}):'Aún sin histórico suficiente'}</p></section><section className={`panel quality-card ${quality.complete?'ok':'warn'}`}><small>Cobertura del día Santiago</small><strong>{today.samples} muestras</strong><p>{quality.complete?'Histórico continuo y actualizado':'Cobertura parcial: el total del día puede estar incompleto'}</p>{quality.first&&quality.last&&<small>{quality.first.toLocaleTimeString('es-CL',{timeZone:'America/Santiago'})} → {quality.last.toLocaleTimeString('es-CL',{timeZone:'America/Santiago'})}</small>}</section></aside><section className={`panel weather-card ${weather.error?'weather-warning':''}`}><small>Condición actual · {weather.provider||'sin proveedor'}</small><strong>{weather.temperature!=null?`${weather.temperature.toFixed(1)} °C`:'Sin dato climático'}</strong><p>{weather.humidity!=null?`Humedad ${weather.humidity}% · Nubes ${Number(weather.cloudCover||0).toFixed(0)}% · Lluvia ${Number(weather.precipitation||0).toFixed(1)} mm · Viento ${Number(weather.windSpeed||0).toFixed(0)} km/h`:'No llegó información meteorológica. Revisa la función weather en Netlify.'}</p>{weather.updatedAt&&<small>Actualizado: {new Date(weather.updatedAt).toLocaleString('es-CL',{timeZone:'America/Santiago'})}</small>}{weather.error&&<small className="error-text">{weather.error}</small>}</section></div>
      <section className="panel chart-panel"><header className="section-head"><div><small>Producción y consumo</small><h2>Hoy · horario de Santiago</h2></div></header><EChart option={chartOption}/></section></>}
    {page==='charts'&&<section className="analytics-page">
      <header className="analytics-title"><div><small>Análisis energético</small><h1>Gráficos y acumulados</h1><p>Todos los cortes diarios se calculan con el día calendario de Santiago de Chile.</p></div><section className="panel gauge-card"><PowerGauge value={load}/><div className="gauge-note"><span className="safe-dot"/>0–5 kW normal <span className="danger-dot"/>más de 5 kW alto</div></section></header>
      <section className="panel pv-day-card"><header><div><small>Aporte fotovoltaico acumulado de hoy</small><h2>PV1 vs. PV2</h2></div><strong>{kwh(today.solar)}</strong></header><div className="pv-day-row"><span>PV1</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv1/today.solar*100):0}%`}}/></div><b>{kwh(today.pv1)}</b></div>{detectPvCount(realtime,monthRows)===2&&<div className="pv-day-row pv2-day"><span>PV2</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv2/today.solar*100):0}%`}}/></div><b>{kwh(today.pv2)}</b></div>}<p>Datos integrados desde las 00:00 de Santiago; no son los watts instantáneos.</p></section>
      <div className="analytics-section"><h2>Consumo acumulado</h2><div className="metric-chart-grid"><EnergyMetricChart title="Consumo del día" subtitle="Desde las 00:00" labels={dayLoadSeries.labels} values={dayLoadSeries.values} color="#aa73ff"/><EnergyMetricChart title="Consumo de la semana" subtitle="Semana actual" labels={weekLoadSeries.labels} values={weekLoadSeries.values} color="#aa73ff"/><EnergyMetricChart title="Consumo del mes" subtitle="Mes en curso" labels={monthLoadSeries.labels} values={monthLoadSeries.values} color="#aa73ff"/></div></div>
      <div className="analytics-section"><h2>Generación solar acumulada</h2><div className="metric-chart-grid"><EnergyMetricChart title="Generación del día" subtitle="PV1 + PV2" labels={daySolarSeries.labels} values={daySolarSeries.values} color="#efbd34"/><EnergyMetricChart title="Generación de la semana" subtitle="PV1 + PV2" labels={weekSolarSeries.labels} values={weekSolarSeries.values} color="#efbd34"/><EnergyMetricChart title="Generación del mes" subtitle="PV1 + PV2" labels={monthSolarSeries.labels} values={monthSolarSeries.values} color="#efbd34"/></div></div>
      <div className="analytics-section"><h2>Aporte acumulado de la red</h2><div className="metric-chart-grid"><EnergyMetricChart title="Red del día" subtitle="Energía importada" labels={dayGridSeries.labels} values={dayGridSeries.values} color="#4f9fff"/><EnergyMetricChart title="Red de la semana" subtitle="Energía importada" labels={weekGridSeries.labels} values={weekGridSeries.values} color="#4f9fff"/><EnergyMetricChart title="Red del mes" subtitle="Energía importada" labels={monthGridSeries.labels} values={monthGridSeries.values} color="#4f9fff"/></div></div>
      <section className="analytics-summary-grid"><article className="panel stat"><small>Consumo semana</small><strong>{kwh(week.load)}</strong></article><article className="panel stat"><small>Solar semana</small><strong>{kwh(week.solar)}</strong></article><article className="panel stat"><small>Red semana</small><strong>{kwh(week.gridImport)}</strong></article><article className="panel stat"><small>Consumo mes</small><strong>{kwh(month.load)}</strong></article><article className="panel stat"><small>Solar mes</small><strong>{kwh(month.solar)}</strong></article><article className="panel stat"><small>Red importada mes</small><strong>{kwh(month.gridImport)}</strong></article><article className="panel stat"><small>Red exportada mes</small><strong>{kwh(month.gridExport)}</strong></article><article className="panel stat"><small>Carga batería mes</small><strong>{kwh(month.charge)}</strong></article><article className="panel stat"><small>Descarga batería mes</small><strong>{kwh(month.discharge)}</strong></article></section>
    </section>}
    {page==='solar'&&<SolarForecastPage actual={daily} weather={weather} installedWp={installedWp}/>}
    {page==='costs'&&<section className="page-grid"><section className="panel form-card"><h2>Tarifa eléctrica</h2><label>CLP por kWh<input type="number" value={tariff} onChange={e=>{const v=Number(e.target.value);setTariff(v);localStorage.setItem('tariffCLP',String(v))}}/></label></section><section className="panel stat"><small>Ahorro hoy</small><strong>{clp(savings)}</strong></section><section className="panel stat"><small>Ahorro semanal estimado</small><strong>{clp(Math.min(week.solar,week.load)*tariff)}</strong></section><section className="panel stat"><small>Ahorro mensual estimado</small><strong>{clp(Math.min(month.solar,month.load)*tariff)}</strong></section><section className="panel stat"><small>Costo de red del mes</small><strong>{clp(month.gridImport*tariff)}</strong></section></section>}
    {page==='equipment'&&<section className="equipment-grid">{[['Paneles',`PV1 ${watts(pvPower(realtime,1))}${detectPvCount(realtime,monthRows)===2?` · PV2 ${watts(pvPower(realtime,2))}`:''}`],['Inversor',String(summary.workMode||realtime.workMode||'—')],['Batería',`${soc.toFixed(0)}% · ${batteryVoltage(realtime).toFixed(1)} V`],['Red',`${watts(Math.abs(grid))} · ${gridVoltage(realtime).toFixed(1)} V · ${gridFrequency(realtime).toFixed(1)} Hz`],['Salida AC',`${outputVoltage(realtime).toFixed(1)} V · ${outputFrequency(realtime).toFixed(1)} Hz`],['Temperatura',`${inverterTemperature(realtime).toFixed(1)} °C`]].map(([a,b])=><article className="panel equipment-card" key={a}><h2>{a}</h2><p>{b}</p></article>)}</section>}
    {page==='technical'&&<section className="technical-page"><section className="technical-summary"><article className="panel"><small>Datos catalogados</small><strong>{catalog.reduce((n,s)=>n+s.items.filter(i=>i.value!==null).length,0)}</strong></article><article className="panel"><small>Muestras hoy</small><strong>{today.samples}</strong></article><article className="panel"><small>Muestras semana</small><strong>{week.samples}</strong></article><article className="panel"><small>Muestras mes</small><strong>{month.samples}</strong></article></section><section className="technical-grid">{catalog.map(section=><article className="panel technical-section" key={section.title}><h2>{section.title}</h2>{section.items.map(item=><div className="technical-row" key={item.key}><span>{item.label}</span><strong>{item.value===null?'—':`${typeof item.value==='number'?item.value.toLocaleString('es-CL',{maximumFractionDigits:2}):item.value}${item.unit?` ${item.unit}`:''}`}</strong><small>{item.source||'campo no disponible'}</small></div>)}</article>)}</section><section className="panel technical"><h2>Parámetros disponibles no usados en el dashboard</h2><p>Se muestran aquí para mantener el inicio limpio y facilitar futuras estadísticas.</p><div className="unknown-parameter-grid">{rawUnknown.map(key=><div className="unknown-parameter" key={key}><span>{key}</span><strong>{String((realtime as Record<string,unknown>)[key]??(summary as Record<string,unknown>)[key]??'—')}</strong></div>)}</div><details><summary>Auditoría completa en JSON</summary><pre>{JSON.stringify({realtime,summary,today,week,month,quality},null,2)}</pre></details></section></section>}
  </main><MobileNav page={page} setPage={setPage}/></div>;
}
