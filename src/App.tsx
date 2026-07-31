import { useEffect, useMemo, useState } from 'react';
import { Battery, CircleDollarSign, House, RadioTower, RefreshCw, Sun } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import KpiCard from './components/KpiCard';
import SimpleEnergyFlow from './components/SimpleEnergyFlow';
import DailyQuote from './components/DailyQuote';
import FunModeToggle from './components/FunModeToggle';
import EChart from './components/EChart';
import PowerGauge from './components/PowerGauge';
import EnergyMetricChart from './components/EnergyMetricChart';
import SolarForecastPage from './components/SolarForecastPage';
import HouseIllustration from './components/HouseIllustration';
import RecentEnergyChart from './components/RecentEnergyChart';
import CoverageCard from './components/CoverageCard';
import { api } from './services/api';
import { fetchWeather, type WeatherData } from './services/weather';
import { accumulatedTheoreticalToday, calibrateSolarModel, expectedPowerNow, theoreticalDayKwh } from './utils/solarForecast';
import type { DailyEnergy, Device, HistoryRow, PageKey, Realtime } from './types';
import { cumulativeDays, dayGrid, dayLoad, daySolar } from './utils/charts';
import { siteProfile,siteStorageKey } from './utils/site';
import {
  batteryChargePower,batteryDischargePower,batterySoc,batteryVoltage,chileDayApiChunks,chileSiteRangeApiRange,chileWeekApiRange,clp,dailyEnergy,dataQuality,
  detectPvCount,filterRowsForSiteDate,filterRowsForSiteMonth,filterRowsForSiteRange,formatClock,formatDate,formatSiteDate,gridFrequency,gridPower,gridVoltage,
  groupDailyEnergy,health,inverterTemperature,kwh,loadPower,outputFrequency,outputVoltage,parseApiTime,pvPower,technicalCatalog,watts
} from './utils/energy';

const APP_VERSION='6.10.0';
const SESSION_IDLE_MS=24*60*60_000;
const ACTIVITY_PING_MS=5*60_000;
const LAST_ACTIVITY_KEY='miSolarLastUserActivity';
const REFRESH_MS={realtime:30_000,day:5*60_000,week:30*60_000,month:2*60*60_000,weather:15*60_000,radiation:60*60_000} as const;
const emptyEnergy={solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,charge:0,discharge:0,samples:0};
const sumDays=(days:DailyEnergy[])=>days.reduce((a,d)=>({solar:a.solar+d.solar,pv1:a.pv1+d.pv1,pv2:a.pv2+d.pv2,load:a.load+d.load,grid:a.grid+d.grid,gridImport:a.gridImport+d.gridImport,gridExport:a.gridExport+d.gridExport,charge:a.charge+d.charge,discharge:a.discharge+d.discharge,samples:a.samples+d.samples}),{...emptyEnergy});

function addDays(date:string,days:number){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)}
function monthChunkRanges(date:string,chunkDays=4){
  const start=`${date.slice(0,7)}-01`;
  const end=addDays(date,1);
  const ranges:{siteStart:string;siteEnd:string}[]=[];
  let cursor=start;
  while(cursor<end){const nextCandidate=addDays(cursor,chunkDays);const next=nextCandidate<end?nextCandidate:end;ranges.push({siteStart:cursor,siteEnd:next});cursor=next;}
  return ranges;
}

function Login({done}:{done:()=>void}){
  const [u,setU]=useState(''),[p,setP]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <main className="login"><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('login',{method:'POST',body:JSON.stringify({username:u,password:p})});done()}catch(err){setError(err instanceof Error?err.message:'Error')}finally{setBusy(false)}}}>
    <Sun size={38}/><h1>Mi Solar</h1><p>Centro inteligente de energía · v{APP_VERSION}</p><input placeholder="Usuario" value={u} onChange={e=>setU(e.target.value)}/><input placeholder="Contraseña" type="password" value={p} onChange={e=>setP(e.target.value)}/>{error&&<span className="error">{error}</span>}<button disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button>
  </form></main>;
}

export default function App(){
  const [clock,setClock]=useState(formatClock());
  const [auth,setAuth]=useState<boolean|null>(null);
  const [page,setPage]=useState<PageKey>('home');
  const [devices,setDevices]=useState<Device[]>([]);
  const [selected,setSelected]=useState('');
  const [realtime,setRealtime]=useState<Realtime>({});
  const [summary,setSummary]=useState<Realtime>({});
  const [rawDayRows,setRawDayRows]=useState<HistoryRow[]>([]);
  const [rawWeekRows,setRawWeekRows]=useState<HistoryRow[]>([]);
  const [rawMonthRows,setRawMonthRows]=useState<HistoryRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [tariff,setTariff]=useState(250);
  const [feedInTariff,setFeedInTariff]=useState(0);
  const [lastFetch,setLastFetch]=useState<Date|null>(null);
  const [syncMessage,setSyncMessage]=useState('');
  const [historyMessage,setHistoryMessage]=useState('');
  const [historyProgress,setHistoryProgress]=useState('');
  const [weather,setWeather]=useState<WeatherData>({});
  const [funMode,setFunMode]=useState(localStorage.getItem('funMode')!=='off');
  const [lastSectionUpdate,setLastSectionUpdate]=useState<Record<string,Date|null>>({realtime:null,day:null,week:null,month:null,weather:null,radiation:null});
  const markUpdated=(key:string)=>setLastSectionUpdate(prev=>({...prev,[key]:new Date()}));

  const siteDate=formatSiteDate();
  const weekRange=useMemo(()=>chileWeekApiRange(siteDate),[siteDate]);
  const history=useMemo(()=>filterRowsForSiteDate(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const combinedMonthRows=useMemo(()=>[...rawMonthRows,...rawDayRows],[rawMonthRows,rawDayRows]);
  const monthRows=useMemo(()=>filterRowsForSiteMonth(combinedMonthRows,siteDate.slice(0,7)),[combinedMonthRows,siteDate]);
  const combinedWeekRows=useMemo(()=>[...rawWeekRows,...rawDayRows],[rawWeekRows,rawDayRows]);
  const weekRows=useMemo(()=>filterRowsForSiteRange(combinedWeekRows,weekRange.siteStart,weekRange.siteEnd),[combinedWeekRows,weekRange.siteStart,weekRange.siteEnd]);
  const device=devices.find(d=>d.deviceSn===selected);
  const profile=siteProfile(device?.nickName||'');
  const siteLabel=profile.shortLabel;
  const solar=pvPower(realtime,1)+pvPower(realtime,2),load=loadPower(realtime),grid=gridPower(realtime),charge=batteryChargePower(realtime),discharge=batteryDischargePower(realtime),soc=batterySoc(realtime);
  const today=useMemo(()=>({...dailyEnergy(history),date:siteDate}),[history,siteDate]);
  const quality=useMemo(()=>dataQuality(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const weekDaily=useMemo(()=>groupDailyEnergy(weekRows),[weekRows]);
  const daily=useMemo(()=>groupDailyEnergy(monthRows),[monthRows]);
  const best=useMemo(()=>daily.reduce<DailyEnergy|null>((a,b)=>!a||b.solar>a.solar?b:a,null),[daily]);
  const week=useMemo(()=>sumDays(weekDaily),[weekDaily]);
  const month=useMemo(()=>sumDays(daily),[daily]);
  const installedWp=Number(localStorage.getItem(siteStorageKey('installedWp',device?.nickName||'')))||profile.installedWp;
  const solarModel=useMemo(()=>calibrateSolarModel(daily,weather.dailyRadiation||[],installedWp,today),[daily,weather.dailyRadiation,installedWp,today]);
  const expectedSolarNow=useMemo(()=>expectedPowerNow(weather.hourly,solarModel),[weather.hourly,solarModel,clock]);
  const theoreticalToday=useMemo(()=>accumulatedTheoreticalToday(weather.hourly,solarModel),[weather.hourly,solarModel,clock]);
  const todayRadiation=weather.dailyRadiation?.find(d=>d.date===siteDate)?.shortwaveKwhM2||0;
  const forecastToday=theoreticalDayKwh(todayRadiation,solarModel,true);

  async function fetchHistoryRange(sn:string,start:string,end:string,maxPages=18){
    return api<{list:HistoryRow[];total:number;truncated?:boolean;pages?:number}>(`devices/${sn}/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&maxPages=${maxPages}`);
  }

  async function refreshRealtime(sn=selected){
    if(!sn)return;
    setLoading(true);
    const realtimeResult=await Promise.allSettled([
      api<{data:Realtime}>(`devices/${sn}/realtime`),
      api<{data:Realtime}>(`devices/${sn}/summary`)
    ]);
    const rtOk=realtimeResult[0].status==='fulfilled';
    const summaryOk=realtimeResult[1].status==='fulfilled';
    if(realtimeResult[0].status==='fulfilled')setRealtime(realtimeResult[0].value.data||{});
    if(realtimeResult[1].status==='fulfilled')setSummary(realtimeResult[1].value.data||{});
    if(rtOk||summaryOk){setLastFetch(new Date());markUpdated('realtime');setSyncMessage(rtOk&&summaryOk?'':'Actualización parcial: se conservaron los últimos datos disponibles.');}
    else setSyncMessage('No se pudo actualizar ahora. La app mantiene los últimos valores y reintentará en 30 segundos.');
    setLoading(false);
  }

  async function refreshDayHistory(sn=selected){
    if(!sn)return;
    const chunks=chileDayApiChunks(siteDate,new Date(),6);
    const rows:HistoryRow[]=[];
    const warnings:string[]=[];
    try{
      for(let i=0;i<chunks.length;i+=1){
        const chunk=chunks[i];
        setHistoryProgress(`Actualizando el día hasta ahora: tramo ${i+1} de ${chunks.length}`);
        try{
          const response=await fetchHistoryRange(sn,chunk.start,chunk.end,8);
          rows.push(...(response.list||[]));
          if(response.truncated)warnings.push(`tramo ${i+1} parcial`);
        }catch(error){
          warnings.push(`tramo ${i+1} sin respuesta`);
        }
      }
      if(rows.length)setRawDayRows(rows);
      markUpdated('day');
      const filtered=filterRowsForSiteDate(rows,siteDate);
      const last=filtered.length?parseApiTime(filtered[filtered.length-1].currentTime??filtered[filtered.length-1].createTime??filtered[filtered.length-1].collectTime??filtered[filtered.length-1].dataTime??filtered[filtered.length-1].time):null;
      const lastLabel=last?last.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}):'sin muestras';
      setHistoryMessage(warnings.length?`Día actualizado hasta ${lastLabel}, con observaciones: ${warnings.join(', ')}.`:`Día completo hasta el momento de consulta · última muestra ${lastLabel}.`);
    }catch(error){
      setHistoryMessage(`Histórico diario temporalmente no disponible: ${error instanceof Error?error.message:'error'}`);
    }finally{
      setHistoryProgress('');
    }
  }


  async function refreshWeekHistory(sn=selected){
    if(!sn)return;
    try{
      const range=chileSiteRangeApiRange(weekRange.siteStart,weekRange.siteEnd);
      const response=await fetchHistoryRange(sn,range.start,range.end,24);
      if(response.list?.length)setRawWeekRows(response.list);
      markUpdated('week');
      if(response.truncated)setHistoryMessage('La semana llegó parcial; se completará automáticamente en la próxima actualización.');
    }catch(error){
      setHistoryMessage(`Histórico semanal temporalmente no disponible: ${error instanceof Error?error.message:'error'}`);
    }
  }

  async function refreshMonthHistory(sn=selected){
    if(!sn)return;
    const chunks=monthChunkRanges(siteDate,4);
    const rows:HistoryRow[]=[];
    const warnings:string[]=[];
    for(let i=0;i<chunks.length;i+=1){
      const chunk=chunks[i];
      setHistoryProgress(`Descargando mes: bloque ${i+1} de ${chunks.length}`);
      const range=chileSiteRangeApiRange(chunk.siteStart,chunk.siteEnd);
      try{
        const response=await fetchHistoryRange(sn,range.start,range.end,18);
        rows.push(...(response.list||[]));
        if(response.truncated)warnings.push(`${chunk.siteStart}–${addDays(chunk.siteEnd,-1)} parcial`);
      }catch(error){
        warnings.push(`${chunk.siteStart}–${addDays(chunk.siteEnd,-1)} sin respuesta`);
      }
    }
    if(rows.length){setRawMonthRows(rows);markUpdated('month');}
    setHistoryProgress('');
    setHistoryMessage(warnings.length?`Histórico mensual parcial: ${warnings.join(', ')}.`:'Mes completo descargado y ajustado a Santiago.');
  }

  function switchDevice(sn:string){
    setSelected(sn);
    setRealtime({});setSummary({});setRawDayRows([]);setRawWeekRows([]);setRawMonthRows([]);
    setSyncMessage('');setHistoryMessage('');setHistoryProgress('');setWeather({});setLastFetch(null);
    void refreshAll(sn);
  }

  async function refreshAll(sn=selected){
    if(!sn)return;
    setSyncMessage('');
    // Secuencial para proteger la sesión Tumcapp y evitar ráfagas de solicitudes.
    await refreshRealtime(sn);
    await refreshDayHistory(sn);
    await refreshWeekHistory(sn);
    void refreshMonthHistory(sn);
  }

  useEffect(()=>{const timer=setInterval(()=>setClock(formatClock()),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{api<{authenticated:boolean}>('session').then(x=>setAuth(x.authenticated)).catch(()=>setAuth(false))},[]);
  useEffect(()=>{
    if(!auth)return;
    let lastPing=0;
    const registerActivity=()=>{
      const now=Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY,String(now));
      if(now-lastPing>=ACTIVITY_PING_MS){
        lastPing=now;
        void api<{ok:boolean;expiresAt:number}>('activity',{method:'POST'}).catch((error)=>{
          if((error as {status?:number})?.status===401)setAuth(false);
        });
      }
    };
    const checkIdle=()=>{
      const last=Number(localStorage.getItem(LAST_ACTIVITY_KEY)||0);
      if(last&&Date.now()-last>=SESSION_IDLE_MS){
        void api('logout',{method:'POST'}).catch(()=>undefined).finally(()=>setAuth(false));
      }
    };
    registerActivity();
    const events:[keyof WindowEventMap,EventListenerOrEventListenerObject,AddEventListenerOptions?][]=[
      ['pointerdown',registerActivity,{passive:true}],
      ['keydown',registerActivity],
      ['touchstart',registerActivity,{passive:true}],
      ['scroll',registerActivity,{passive:true}]
    ];
    events.forEach(([name,handler,options])=>window.addEventListener(name,handler,options));
    const onVisibility=()=>{if(document.visibilityState==='visible')registerActivity()};
    document.addEventListener('visibilitychange',onVisibility);
    const idleTimer=window.setInterval(checkIdle,60_000);
    return()=>{
      events.forEach(([name,handler,options])=>window.removeEventListener(name,handler,options));
      document.removeEventListener('visibilitychange',onVisibility);
      window.clearInterval(idleTimer);
    };
  },[auth]);
  useEffect(()=>{if(!auth)return;api<{devices:Device[]}>('devices').then(x=>{setDevices(x.devices||[]);const sn=x.devices?.[0]?.deviceSn||'';setSelected(sn);if(sn)void refreshAll(sn)}).catch(()=>setSyncMessage('No fue posible cargar los equipos.'))},[auth]);
  useEffect(()=>{if(!device)return;const tariffKey=siteStorageKey('tariffCLP',device.nickName||'');const feedKey=siteStorageKey('feedInTariffCLP',device.nickName||'');setTariff(Number(localStorage.getItem(tariffKey))||profile.defaultTariff);setFeedInTariff(Number(localStorage.getItem(feedKey))||profile.defaultFeedInTariff)},[device?.deviceSn]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshRealtime(selected),REFRESH_MS.realtime);return()=>clearInterval(t)},[auth,selected]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshDayHistory(selected),REFRESH_MS.day);return()=>clearInterval(t)},[auth,selected]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshWeekHistory(selected),REFRESH_MS.week);return()=>clearInterval(t)},[auth,selected,weekRange.siteStart,weekRange.siteEnd]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshMonthHistory(selected),REFRESH_MS.month);return()=>clearInterval(t)},[auth,selected,siteDate]);
  useEffect(()=>{
    if(!auth||!device)return;
    const loadFull=()=>fetchWeather(device.nickName||'').then(data=>{setWeather({...data,error:undefined});markUpdated('weather');markUpdated('radiation')}).catch(err=>setWeather(prev=>({...prev,error:err instanceof Error?err.message:'Clima no disponible'})));
    const loadCurrent=()=>fetchWeather(device.nickName||'').then(data=>{setWeather(prev=>({...prev,temperature:data.temperature,humidity:data.humidity,weatherCode:data.weatherCode,windSpeed:data.windSpeed,isDay:data.isDay,cloudCover:data.cloudCover,precipitation:data.precipitation,provider:data.provider,updatedAt:data.updatedAt,error:undefined}));markUpdated('weather')}).catch(err=>setWeather(prev=>({...prev,error:err instanceof Error?err.message:'Clima no disponible'})));
    const loadRadiation=()=>fetchWeather(device.nickName||'').then(data=>{setWeather(prev=>({...prev,hourly:data.hourly,dailyRadiation:data.dailyRadiation,sunrise:data.sunrise,sunset:data.sunset,provider:data.provider,updatedAt:data.updatedAt,error:undefined}));markUpdated('radiation')}).catch(()=>{});
    void loadFull();
    const weatherTimer=setInterval(()=>void loadCurrent(),REFRESH_MS.weather);
    const radiationTimer=setInterval(()=>void loadRadiation(),REFRESH_MS.radiation);
    return()=>{clearInterval(weatherTimer);clearInterval(radiationTimer)};
  },[auth,device?.deviceSn]);

  const chartOption=useMemo(()=>({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis',confine:true,formatter:(params:any[])=>{const p=params?.[0];if(!p)return '';return `<strong>${p.axisValue}</strong><br/>${params.map(x=>`${x.marker}${x.seriesName}: <b>${Number(x.value).toLocaleString('es-CL')} W</b>`).join('<br/>')}`}},
    legend:{top:0,textStyle:{color:'#9fb2ba'}},grid:{left:48,right:18,top:58,bottom:40,containLabel:true},
    xAxis:{type:'category',data:history.map(r=>{const d=parseApiTime(r.currentTime??r.createTime??r.collectTime??r.dataTime??r.time);return d?d.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}):''}),axisLabel:{color:'#789099',hideOverlap:true},axisLine:{lineStyle:{color:'#27404a'}}},
    yAxis:{type:'value',name:'W',nameTextStyle:{color:'#789099'},axisLabel:{color:'#789099'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[
      {name:'Solar PV1 + PV2',type:'line',smooth:true,showSymbol:false,data:history.map(r=>pvPower(r,1)+pvPower(r,2)),lineStyle:{width:3,color:'#efbd34'},areaStyle:{opacity:.08,color:'#efbd34'}},
      {name:'Consumo casa',type:'line',smooth:true,showSymbol:false,data:history.map(loadPower),lineStyle:{width:2,color:'#a96fff'}},
      {name:'Red importada',type:'line',smooth:true,showSymbol:false,data:history.map(r=>Math.max(0,gridPower(r))),lineStyle:{width:2,color:'#4f9fff'}},
      {name:'Batería descargando',type:'line',smooth:true,showSymbol:false,data:history.map(batteryDischargePower),lineStyle:{width:2,color:'#4bd98a'}}
    ]
  }),[history]);

  if(auth===null)return <div className="boot">Cargando Mi Solar…</div>;
  if(!auth)return <Login done={()=>setAuth(true)}/>;

  const dayLoadSeries=dayLoad(history),daySolarSeries=daySolar(history),dayGridSeries=dayGrid(history);
  const weekLoadSeries=cumulativeDays(weekDaily,'load'),weekSolarSeries=cumulativeDays(weekDaily,'solar'),weekGridSeries=cumulativeDays(weekDaily,'gridImport');
  const monthLoadSeries=cumulativeDays(daily,'load'),monthSolarSeries=cumulativeDays(daily,'solar'),monthGridSeries=cumulativeDays(daily,'gridImport');
  const selfConsumed=(energy:DailyEnergy)=>Math.max(0,energy.solar-energy.gridExport);
  const avoided=(energy:DailyEnergy)=>selfConsumed(energy)*tariff+energy.gridExport*feedInTariff;
  const gross=(energy:DailyEnergy)=>energy.solar*tariff;
  const savings=avoided(today);
  const catalog=technicalCatalog(realtime,summary);
  const used=new Set(catalog.flatMap(s=>s.items.map(i=>i.source).filter(Boolean)) as string[]);
  const rawUnknown=[...new Set([...Object.keys(summary),...Object.keys(realtime)])].filter(k=>!used.has(k)).sort();

  return <div className="shell">
    <Sidebar page={page} setPage={setPage} site={device?.nickName||'Mi instalación'} onLogout={async()=>{await api('logout',{method:'POST'});setAuth(false)}}/>
    <main className="content">
      <header className="topbar">
        <div><select value={selected} onChange={e=>switchDevice(e.target.value)}>{devices.map(d=><option key={d.deviceSn} value={d.deviceSn}>{d.nickName||d.deviceSn}</option>)}</select><span className="online">● En línea</span></div>
        <div className="time-box"><strong>{clock}</strong><small>Hora de Chile</small><small>Último dato: {formatDate(realtime.currentTime||realtime.createTime)}</small><small>Consulta: {lastFetch?lastFetch.toLocaleTimeString('es-CL'):'—'} · v{APP_VERSION}</small></div>
        <FunModeToggle value={funMode} onChange={v=>{setFunMode(v);localStorage.setItem('funMode',v?'on':'off')}}/>
        <button className="refresh-button" onClick={()=>refreshAll()}><RefreshCw className={loading?'spin':''}/><span>Actualizar</span></button>
      </header>
      {syncMessage&&<div className="data-warning-banner">{syncMessage}</div>}
      {historyMessage&&<div className={`data-warning-banner ${historyMessage.startsWith('Mes completo')?'history-status-ok':'history-status-warn'}`}>{historyMessage}</div>}
      {historyProgress&&<div className="history-progress">{historyProgress}</div>}

      {page==='home'&&<>
        <section className="kpi-grid kpi-grid-six">
          <KpiCard icon={Sun} label="Producción solar" value={watts(solar)} detail={`Hoy: ${kwh(today.solar)} · esperado ahora ${watts(expectedSolarNow)}`} tone="solar"/>
          <KpiCard icon={Sun} label="Solar acumulado del día" value={kwh(today.solar)} detail={`Modelo ajustado: ${theoreticalToday.toFixed(2)} kWh · proyección día ${forecastToday.toFixed(2)} kWh`} tone="solar"/>
          <KpiCard icon={House} label="Consumo actual" value={watts(load)} detail={`Hoy: ${kwh(today.load)}`}/>
          <KpiCard icon={RadioTower} label={grid<0?'Hacia la red':'Desde la red'} value={watts(Math.abs(grid))} detail={`Hoy importado: ${kwh(today.gridImport)}`}/>
          <KpiCard icon={Battery} label="Batería" value={`${soc.toFixed(0)}%`} detail={`${charge>discharge?'Cargando':'Entregando'} ${watts(Math.max(charge,discharge))}`} tone="green"/>
          <KpiCard icon={CircleDollarSign} label="Ahorro real hoy" value={clp(savings)} detail={`Autoconsumo ${kwh(selfConsumed(today))}`} tone="green"/>
        </section>
        <DailyQuote/>
        <SimpleEnergyFlow data={realtime} history={monthRows} today={today}/>
        <RecentEnergyChart rows={history} siteLabel={siteLabel}/>
        <HouseIllustration weather={weather} funMode={funMode} siteName={device?.nickName||'Casa ECO Arrayán'}/>
        <div className="home-grid secondary-home-grid"><aside className="side-stack">
          <section className="panel health-card"><small>Estado del sistema</small><strong>{health(realtime)}/100</strong><p>{health(realtime)>90?'Excelente · sin anomalías relevantes':'Conviene revisar algunos parámetros'}</p></section>
          <section className="panel best-card"><small>Mejor día del mes · {siteLabel}</small><strong>{best?kwh(best.solar):'—'}</strong><p>{best?new Date(`${best.date}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'}):'Aún sin histórico suficiente'}</p></section>
        </aside><CoverageCard today={today} first={quality.first} last={quality.last} siteLabel={siteLabel}/><section className={`panel weather-card ${weather.error?'weather-warning':''}`}><small>Condición actual · {weather.provider||'sin proveedor'}</small><strong>{weather.temperature!=null?`${weather.temperature.toFixed(1)} °C`:'Sin dato climático'}</strong><p>{weather.humidity!=null?`Humedad ${weather.humidity}% · Nubes ${Number(weather.cloudCover||0).toFixed(0)}% · Lluvia ${Number(weather.precipitation||0).toFixed(1)} mm · Viento ${Number(weather.windSpeed||0).toFixed(0)} km/h`:'No llegó información meteorológica.'}</p>{weather.updatedAt&&<small>Actualizado: {new Date(weather.updatedAt).toLocaleString('es-CL',{timeZone:'America/Santiago'})}</small>}{weather.error&&<small className="error-text">{weather.error}</small>}</section></div>
        <section className="panel chart-panel"><header className="section-head"><div><small>Producción y consumo</small><h2>Hoy · {siteLabel} · horario de Chile</h2></div></header><EChart option={chartOption}/></section>
      </>}

      {page==='charts'&&<section className="analytics-page">
        <header className="analytics-title"><div><small>Análisis energético</small><h1>Gráficos y acumulados</h1><p>Todos los cortes pertenecen exclusivamente a la instalación seleccionada y usan el día calendario de Chile.</p></div><section className="panel gauge-card"><PowerGauge value={load}/><div className="gauge-note"><span className="safe-dot"/>0–5 kW normal <span className="danger-dot"/>más de 5 kW alto</div></section></header>
        <section className="panel pv-day-card"><header><div><small>Aporte fotovoltaico acumulado de hoy</small><h2>PV1 vs. PV2</h2></div><strong>{kwh(today.solar)}</strong></header><div className="pv-day-row"><span>PV1</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv1/today.solar*100):0}%`}}/></div><b>{kwh(today.pv1)}</b></div>{detectPvCount(realtime,monthRows)===2&&<div className="pv-day-row pv2-day"><span>PV2</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv2/today.solar*100):0}%`}}/></div><b>{kwh(today.pv2)}</b></div>}<p>Datos integrados desde las 00:00 de Chile; no son los watts instantáneos.</p></section>
        <div className="analytics-section"><h2>Consumo acumulado</h2><div className="metric-chart-grid"><EnergyMetricChart title="Consumo del día" subtitle="Desde las 00:00" labels={dayLoadSeries.labels} values={dayLoadSeries.values} color="#aa73ff"/><EnergyMetricChart title="Consumo de la semana" subtitle="Semana actual" labels={weekLoadSeries.labels} values={weekLoadSeries.values} color="#aa73ff"/><EnergyMetricChart title="Consumo del mes" subtitle="Mes en curso" labels={monthLoadSeries.labels} values={monthLoadSeries.values} color="#aa73ff"/></div></div>
        <div className="analytics-section"><h2>Generación solar acumulada</h2><div className="metric-chart-grid"><EnergyMetricChart title="Generación del día" subtitle="PV1 + PV2" labels={daySolarSeries.labels} values={daySolarSeries.values} color="#efbd34"/><EnergyMetricChart title="Generación de la semana" subtitle="PV1 + PV2" labels={weekSolarSeries.labels} values={weekSolarSeries.values} color="#efbd34"/><EnergyMetricChart title="Generación del mes" subtitle="PV1 + PV2" labels={monthSolarSeries.labels} values={monthSolarSeries.values} color="#efbd34"/></div></div>
        <div className="analytics-section"><h2>Aporte acumulado de la red</h2><div className="metric-chart-grid"><EnergyMetricChart title="Red del día" subtitle="Energía importada" labels={dayGridSeries.labels} values={dayGridSeries.values} color="#4f9fff"/><EnergyMetricChart title="Red de la semana" subtitle="Energía importada" labels={weekGridSeries.labels} values={weekGridSeries.values} color="#4f9fff"/><EnergyMetricChart title="Red del mes" subtitle="Energía importada" labels={monthGridSeries.labels} values={monthGridSeries.values} color="#4f9fff"/></div></div>
        <section className="analytics-summary-grid"><article className="panel stat"><small>Consumo semana</small><strong>{kwh(week.load)}</strong></article><article className="panel stat"><small>Solar semana</small><strong>{kwh(week.solar)}</strong></article><article className="panel stat"><small>Red semana</small><strong>{kwh(week.gridImport)}</strong></article><article className="panel stat"><small>Consumo mes</small><strong>{kwh(month.load)}</strong></article><article className="panel stat"><small>Solar mes</small><strong>{kwh(month.solar)}</strong></article><article className="panel stat"><small>Red importada mes</small><strong>{kwh(month.gridImport)}</strong></article><article className="panel stat"><small>Red exportada mes</small><strong>{kwh(month.gridExport)}</strong></article><article className="panel stat"><small>Carga batería mes</small><strong>{kwh(month.charge)}</strong></article><article className="panel stat"><small>Descarga batería mes</small><strong>{kwh(month.discharge)}</strong></article></section>
      </section>}

      {page==='solar'&&<SolarForecastPage actual={daily} weather={weather} installedWp={installedWp} today={today} siteLabel={siteLabel}/>} 

      {page==='costs'&&<section className="solar-forecast-page">
        <header className="page-heading"><div><small>Costos reales acumulados · {siteLabel}</small><h1>Costos y ahorro</h1><p>El ahorro usa solar autoconsumida: generación menos exportación. La energía exportada se valoriza con una tarifa independiente.</p></div></header>
        <section className="cost-form-grid"><section className="panel form-card"><h2>Tarifa de compra</h2><label>CLP por kWh<input type="number" value={tariff} onChange={e=>{const v=Number(e.target.value);setTariff(v);localStorage.setItem(siteStorageKey('tariffCLP',device?.nickName||''),String(v))}}/></label></section><section className="panel form-card"><h2>Tarifa de inyección</h2><label>CLP por kWh exportado<input type="number" value={feedInTariff} onChange={e=>{const v=Number(e.target.value);setFeedInTariff(v);localStorage.setItem(siteStorageKey('feedInTariffCLP',device?.nickName||''),String(v))}}/></label></section></section>
        <section className="cost-grid">
          <article className="panel stat"><small>Ahorro real hoy</small><strong>{clp(avoided(today))}</strong><p>{kwh(selfConsumed(today))} autoconsumidos</p></article>
          <article className="panel stat"><small>Ahorro real semana</small><strong>{clp(avoided(week))}</strong><p>{kwh(selfConsumed(week))} autoconsumidos</p></article>
          <article className="panel stat"><small>Ahorro real mes</small><strong>{clp(avoided(month))}</strong><p>{kwh(selfConsumed(month))} autoconsumidos</p></article>
          <article className="panel stat"><small>Valor bruto solar mes</small><strong>{clp(gross(month))}</strong><p>Referencia si toda la generación reemplazara compra de red.</p></article>
          <article className="panel stat"><small>Costo de red del mes</small><strong>{clp(month.gridImport*tariff)}</strong><p>{kwh(month.gridImport)} importados</p></article>
          <article className="panel stat"><small>Crédito por exportación</small><strong>{clp(month.gridExport*feedInTariff)}</strong><p>{kwh(month.gridExport)} exportados</p></article>
        </section>
        <section className="panel stat"><small>Balance energético auditado del mes</small><strong>Consumo {kwh(month.load)} · Solar {kwh(month.solar)} · Red {kwh(month.gridImport)}</strong><p className="cost-note">Carga batería {kwh(month.charge)} · Descarga batería {kwh(month.discharge)} · Exportación {kwh(month.gridExport)}. Los valores dependen de que la descarga mensual esté completa; arriba se informa el progreso.</p></section>
      </section>}

      {page==='equipment'&&<section className="equipment-grid">{[['Paneles',`PV1 ${watts(pvPower(realtime,1))}${detectPvCount(realtime,monthRows)===2?` · PV2 ${watts(pvPower(realtime,2))}`:''}`],['Inversor',String(summary.workMode||realtime.workMode||'—')],['Batería',`${soc.toFixed(0)}% · ${batteryVoltage(realtime).toFixed(1)} V`],['Red',`${watts(Math.abs(grid))} · ${gridVoltage(realtime).toFixed(1)} V · ${gridFrequency(realtime).toFixed(1)} Hz`],['Salida AC',`${outputVoltage(realtime).toFixed(1)} V · ${outputFrequency(realtime).toFixed(1)} Hz`],['Temperatura',`${inverterTemperature(realtime).toFixed(1)} °C`]].map(([a,b])=><article className="panel equipment-card" key={a}><h2>{a}</h2><p>{b}</p></article>)}</section>}

      {page==='technical'&&<section className="technical-page"><section className="technical-summary"><article className="panel"><small>Versión de la app</small><strong>v{APP_VERSION}</strong></article><article className="panel"><small>Política de actualización</small><strong>30 s · 5 min · 30 min · 2 h</strong><p>Tiempo real · día · semana · mes</p></article><article className="panel"><small>Datos catalogados</small><strong>{catalog.reduce((n,s)=>n+s.items.filter(i=>i.value!==null).length,0)}</strong></article><article className="panel"><small>Muestras hoy</small><strong>{today.samples}</strong></article><article className="panel"><small>Muestras mes</small><strong>{month.samples}</strong></article></section><section className="technical-grid">{catalog.map(section=><article className="panel technical-section" key={section.title}><h2>{section.title}</h2>{section.items.map(item=><div className="technical-row" key={item.key}><span>{item.label}</span><strong>{item.value===null?'—':`${typeof item.value==='number'?item.value.toLocaleString('es-CL',{maximumFractionDigits:2}):item.value}${item.unit?` ${item.unit}`:''}`}</strong><small>{item.source||'campo no disponible'}</small></div>)}</article>)}</section><section className="panel technical"><h2>Parámetros disponibles no usados en el dashboard</h2><p>Se muestran aquí para mantener el inicio limpio y facilitar futuras estadísticas.</p><div className="unknown-parameter-grid">{rawUnknown.map(key=><div className="unknown-parameter" key={key}><span>{key}</span><strong>{String((realtime as Record<string,unknown>)[key]??(summary as Record<string,unknown>)[key]??'—')}</strong></div>)}</div><details><summary>Auditoría completa en JSON</summary><pre>{JSON.stringify({version:APP_VERSION,refreshPolicyMs:REFRESH_MS,lastSectionUpdate,realtime,summary,today,week,month,quality,solarModel},null,2)}</pre></details></section></section>}
    </main>
    <MobileNav page={page} setPage={setPage}/>
  </div>;
}
