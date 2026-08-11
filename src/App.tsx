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
import SolarForecastPage from './components/SolarForecastPage';
import HouseIllustration from './components/HouseIllustration';
import RecentEnergyChart from './components/RecentEnergyChart';
import CoverageCard from './components/CoverageCard';
import DataQualityCard from './components/DataQualityCard';
import EnergyTimeline from './components/EnergyTimeline';
import HistoryExplorer from './components/HistoryExplorer';
import EnergyRangeChart from './components/EnergyRangeChart';
import HistoricalBackfill from './components/HistoricalBackfill';
import LoadCoverageBar from './components/LoadCoverageBar';
import WeatherOutlook from './components/WeatherOutlook';
import CostsPage from './components/CostsPage';
import HomeDateNavigator from './components/HomeDateNavigator';
import ProgrammingPage from './components/ProgrammingPage';
import IntegrationsPage from './components/IntegrationsPage';
import { api } from './services/api';
import { fetchWeather, type WeatherData } from './services/weather';
import { accumulatedTheoreticalToday, calibrateSolarModel, expectedPowerNow, theoreticalDayKwh } from './utils/solarForecast';
import type { DailyEnergy, Device, HistoryRow, PageKey, Realtime } from './types';
import { siteProfile,siteStorageKey } from './utils/site';
import { APP_VERSION, REFRESH_POLICY, SESSION_POLICY } from './config';
import { readSiteCache, writeSiteCache } from './services/siteCache';
import {
  batteryChargePower,batteryDischargePower,batterySoc,batteryVoltage,chileDayApiChunks,chileSiteRangeApiRange,chileWeekApiRange,clp,dailyEnergy,dataQuality,
  detectPvCount,effectiveGridPower,filterRowsForSiteDate,filterRowsForSiteMonth,filterRowsForSiteRange,formatClock,formatDate,formatSiteDate,gridFrequency,gridVoltage,solarSystemToLoadPower,solarToLoadPower,
  groupDailyEnergy,health,inverterTemperature,kwh,loadPower,outputFrequency,outputVoltage,parseApiTime,pvPower,siteRangeUtc,technicalCatalog,watts
} from './utils/energy';

const SESSION_IDLE_MS=SESSION_POLICY.idleMs;
const ACTIVITY_PING_MS=SESSION_POLICY.activityPingMs;
const LAST_ACTIVITY_KEY=SESSION_POLICY.storageKey;
const REFRESH_MS=REFRESH_POLICY;
const requestedPage=()=>{const value=new URLSearchParams(window.location.search).get('page');return(['home','charts','solar','costs','equipment','programming','integrations','technical'] as PageKey[]).includes(value as PageKey)?value as PageKey:'home'};
const emptyEnergy:DailyEnergy={date:'',solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,gridToLoad:0,charge:0,discharge:0,solarToLoad:0,batteryToLoad:0,solarToBattery:0,samples:0};
const sumDays=(days:DailyEnergy[])=>days.reduce((a,d)=>({...a,solar:a.solar+d.solar,pv1:a.pv1+d.pv1,pv2:a.pv2+d.pv2,load:a.load+d.load,grid:a.grid+d.grid,gridImport:a.gridImport+d.gridImport,gridExport:a.gridExport+d.gridExport,gridToLoad:a.gridToLoad+d.gridToLoad,charge:a.charge+d.charge,discharge:a.discharge+d.discharge,solarToLoad:a.solarToLoad+d.solarToLoad,batteryToLoad:a.batteryToLoad+d.batteryToLoad,solarToBattery:a.solarToBattery+d.solarToBattery,samples:a.samples+d.samples}),{...emptyEnergy});

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
  const [page,setPage]=useState<PageKey>(requestedPage);
  const [devices,setDevices]=useState<Device[]>([]);
  const [selected,setSelected]=useState('');
  const [realtime,setRealtime]=useState<Realtime>({});
  const [summary,setSummary]=useState<Realtime>({});
  const [rawDayRows,setRawDayRows]=useState<HistoryRow[]>([]);
  const [rawWeekRows,setRawWeekRows]=useState<HistoryRow[]>([]);
  const [rawMonthRows,setRawMonthRows]=useState<HistoryRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [tariff,setTariff]=useState(250);
  const [lastFetch,setLastFetch]=useState<Date|null>(null);
  const [syncMessage,setSyncMessage]=useState('');
  const [historyMessage,setHistoryMessage]=useState('');
  const [historyProgress,setHistoryProgress]=useState('');
  const [weather,setWeather]=useState<WeatherData>({});
  const [funMode,setFunMode]=useState(localStorage.getItem('funMode')!=='off');
  const [lastSectionUpdate,setLastSectionUpdate]=useState<Record<string,Date|null>>({realtime:null,day:null,week:null,month:null,weather:null,radiation:null});
  const [timelineIndex,setTimelineIndex]=useState<number|null>(null);
  const [homeDate,setHomeDate]=useState(formatSiteDate());
  const [historicalDayRows,setHistoricalDayRows]=useState<HistoryRow[]>([]);
  const [historicalDayLoading,setHistoricalDayLoading]=useState(false);
  const [peerSolar,setPeerSolar]=useState<{deviceSn:string;siteLabel:string;power:number;updatedAt:Date|null}|null>(null);
  const [projectionHistory,setProjectionHistory]=useState<DailyEnergy[]>([]);
  const markUpdated=(key:string)=>setLastSectionUpdate(prev=>({...prev,[key]:new Date()}));

  const siteDate=formatSiteDate();
  const weekRange=useMemo(()=>chileWeekApiRange(siteDate),[siteDate]);
  const history=useMemo(()=>filterRowsForSiteDate(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const combinedMonthRows=useMemo(()=>rawMonthRows.some(row=>Number(row.aggregateSamples||0)>0)?rawMonthRows:[...rawMonthRows,...rawDayRows],[rawMonthRows,rawDayRows]);
  const monthRows=useMemo(()=>filterRowsForSiteMonth(combinedMonthRows,siteDate.slice(0,7)),[combinedMonthRows,siteDate]);
  const combinedWeekRows=useMemo(()=>rawWeekRows.some(row=>Number(row.aggregateSamples||0)>0)?rawWeekRows:[...rawWeekRows,...rawDayRows],[rawWeekRows,rawDayRows]);
  const weekRows=useMemo(()=>filterRowsForSiteRange(combinedWeekRows,weekRange.siteStart,weekRange.siteEnd),[combinedWeekRows,weekRange.siteStart,weekRange.siteEnd]);
  const device=devices.find(d=>d.deviceSn===selected);
  const profile=siteProfile(device?.nickName||'');
  const peerDevice=useMemo(()=>{
    if(!device)return undefined;
    const currentKey=siteProfile(device.nickName||'').key;
    return devices.find(candidate=>candidate.deviceSn!==device.deviceSn&&siteProfile(candidate.nickName||'').key!==currentKey);
  },[devices,device]);
  const siteLabel=profile.shortLabel;
  const gridSourceLabel=profile.gridConnected?'Red activa':'Generador';
  const isHistoricalDay=homeDate!==siteDate;
  const homeRows=isHistoricalDay?historicalDayRows:history;
  const displayedData=isHistoricalDay?(homeRows[timelineIndex??homeRows.length-1]||{}):timelineIndex===null?realtime:(homeRows[timelineIndex]||realtime);
  const solar=pvPower(displayedData,1)+pvPower(displayedData,2),load=loadPower(displayedData),grid=effectiveGridPower(displayedData),charge=batteryChargePower(displayedData),discharge=batteryDischargePower(displayedData),soc=batterySoc(displayedData);
  const today=useMemo(()=>({...dailyEnergy(history),date:siteDate}),[history,siteDate]);
  const homeEnergy=useMemo(()=>({...dailyEnergy(homeRows),date:homeDate}),[homeRows,homeDate]);
  const pvCount:1|2=profile.key==='arrayan'?2:detectPvCount(realtime,[...history,...monthRows]);
  const quality=useMemo(()=>dataQuality(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const weekDaily=useMemo(()=>groupDailyEnergy(weekRows),[weekRows]);
  const daily=useMemo(()=>groupDailyEnergy(monthRows),[monthRows]);
  const best=useMemo(()=>daily.reduce<DailyEnergy|null>((a,b)=>!a||b.solar>a.solar?b:a,null),[daily]);
  const week=useMemo(()=>sumDays(weekDaily),[weekDaily]);
  const month=useMemo(()=>sumDays(daily),[daily]);
  const installedWp=Number(localStorage.getItem(siteStorageKey('installedWp',device?.nickName||'')))||profile.installedWp;
  const projectionActual=useMemo(()=>{const byDate=new Map<string,DailyEnergy>();[...projectionHistory,...daily].forEach(day=>byDate.set(day.date,day));return[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date))},[projectionHistory,daily]);
  const solarModel=useMemo(()=>calibrateSolarModel(projectionActual,weather.dailyRadiation||[],installedWp,today,profile.key),[projectionActual,weather.dailyRadiation,installedWp,today,profile.key]);
  const expectedSolarNow=useMemo(()=>expectedPowerNow(weather.hourly,solarModel),[weather.hourly,solarModel,clock]);
  const theoreticalToday=useMemo(()=>accumulatedTheoreticalToday(weather.hourly,solarModel),[weather.hourly,solarModel,clock]);
  const todayRadiation=weather.dailyRadiation?.find(d=>d.date===siteDate)?.shortwaveKwhM2||0;
  const forecastToday=theoreticalDayKwh(todayRadiation,solarModel,true);
  const tomorrowDate=addDays(siteDate,1);
  const tomorrowRadiation=weather.dailyRadiation?.find(d=>d.date===tomorrowDate)?.shortwaveKwhM2;
  const forecastTomorrow=tomorrowRadiation&&tomorrowRadiation>0?theoreticalDayKwh(tomorrowRadiation,solarModel,false,tomorrowDate):null;

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
    if(realtimeResult[0].status==='fulfilled'){const value=realtimeResult[0].value.data||{};setRealtime(value);writeSiteCache(sn,{realtime:value});}
    if(realtimeResult[1].status==='fulfilled'){const value=realtimeResult[1].value.data||{};setSummary(value);writeSiteCache(sn,{summary:value});}
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
      if(rows.length){setRawDayRows(rows);writeSiteCache(sn,{dayRows:rows});}
      markUpdated('day');
      const filtered=filterRowsForSiteDate(rows,siteDate);
      const last=filtered.length?parseApiTime(filtered[filtered.length-1].currentTime??filtered[filtered.length-1].createTime??filtered[filtered.length-1].collectTime??filtered[filtered.length-1].dataTime??filtered[filtered.length-1].time):null;
      const lastLabel=last?last.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'sin muestras';
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
      const utc=siteRangeUtc(weekRange.siteStart,weekRange.siteEnd);
      try{
        const archived=await api<{list:HistoryRow[]}>(`devices/${sn}/archive-series?start=${encodeURIComponent(utc.start)}&end=${encodeURIComponent(utc.end)}&resolution=hour`);
        if(archived.list?.length){setRawWeekRows(archived.list);writeSiteCache(sn,{weekRows:archived.list});markUpdated('week');return}
      }catch{ /* Si el respaldo no responde, se consulta el origen. */ }
      const range=chileSiteRangeApiRange(weekRange.siteStart,weekRange.siteEnd);
      const response=await fetchHistoryRange(sn,range.start,range.end,24);
      if(response.list?.length){setRawWeekRows(response.list);writeSiteCache(sn,{weekRows:response.list});}
      markUpdated('week');
      if(response.truncated)setHistoryMessage('La semana llegó parcial; se completará automáticamente en la próxima actualización.');
    }catch(error){
      setHistoryMessage(`Histórico semanal temporalmente no disponible: ${error instanceof Error?error.message:'error'}`);
    }
  }

  async function refreshMonthHistory(sn=selected){
    if(!sn)return;
    const chunks=monthChunkRanges(siteDate,4);
    const archiveRange=siteRangeUtc(chunks[0].siteStart,chunks[chunks.length-1].siteEnd);
    try{
      const archived=await api<{list:HistoryRow[]}>(`devices/${sn}/archive-series?start=${encodeURIComponent(archiveRange.start)}&end=${encodeURIComponent(archiveRange.end)}&resolution=hour`);
      if(archived.list?.length){setRawMonthRows(archived.list);writeSiteCache(sn,{monthRows:archived.list});markUpdated('month');setHistoryMessage('Mes cargado desde el respaldo permanente de Mi Solar.');return}
    }catch{ /* Si el archivo no responde, se consulta el origen por bloques. */ }
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
    if(rows.length){setRawMonthRows(rows);writeSiteCache(sn,{monthRows:rows});markUpdated('month');}
    setHistoryProgress('');
    setHistoryMessage(warnings.length?`Histórico mensual parcial: ${warnings.join(', ')}.`:'Mes completo descargado y ajustado a Santiago.');
  }

  function switchDevice(sn:string){
    setSelected(sn);
    const cached=readSiteCache(sn);
    setRealtime(cached?.realtime||{});setSummary(cached?.summary||{});
    setRawDayRows(cached?.dayRows||[]);setRawWeekRows(cached?.weekRows||[]);setRawMonthRows(cached?.monthRows||[]);
    setSyncMessage(cached?'Mostrando el último dato válido mientras se actualiza la instalación.':'');
    setHistoryMessage('');setHistoryProgress('');setWeather({});setLastFetch(cached?.savedAt?new Date(cached.savedAt):null);
    setTimelineIndex(null);
    setProjectionHistory([]);
    setHomeDate(formatSiteDate());setHistoricalDayRows([]);
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
  useEffect(()=>{if(!auth)return;api<{devices:Device[]}>('devices').then(x=>{setDevices(x.devices||[]);const sn=x.devices?.[0]?.deviceSn||'';if(sn)switchDevice(sn)}).catch(()=>setSyncMessage('No fue posible cargar los equipos.'))},[auth]);
  useEffect(()=>{if(!device)return;setTariff(Number(localStorage.getItem(siteStorageKey('tariffCLP',device.nickName||'')))||profile.defaultTariff)},[device?.deviceSn]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshRealtime(selected),REFRESH_MS.realtime);return()=>clearInterval(t)},[auth,selected]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshDayHistory(selected),REFRESH_MS.day);return()=>clearInterval(t)},[auth,selected]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshWeekHistory(selected),REFRESH_MS.week);return()=>clearInterval(t)},[auth,selected,weekRange.siteStart,weekRange.siteEnd]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshMonthHistory(selected),REFRESH_MS.month);return()=>clearInterval(t)},[auth,selected,siteDate]);
  useEffect(()=>{
    if(!auth||page!=='home'||!peerDevice){setPeerSolar(null);return}
    let active=true;
    const siteLabel=siteProfile(peerDevice.nickName||'').shortLabel;
    const cached=readSiteCache(peerDevice.deviceSn)?.realtime;
    if(cached)setPeerSolar({deviceSn:peerDevice.deviceSn,siteLabel,power:pvPower(cached,1)+pvPower(cached,2),updatedAt:null});
    const loadPeerSolar=async()=>{
      try{
        const result=await api<{data:Realtime}>(`devices/${peerDevice.deviceSn}/realtime`);
        if(!active)return;
        const value=result.data||{};
        writeSiteCache(peerDevice.deviceSn,{realtime:value});
        setPeerSolar({deviceSn:peerDevice.deviceSn,siteLabel,power:pvPower(value,1)+pvPower(value,2),updatedAt:new Date()});
      }catch{
        // Se conserva el último valor válido de la otra instalación.
      }
    };
    const initialTimer=window.setTimeout(()=>void loadPeerSolar(),4_000);
    const refreshTimer=window.setInterval(()=>void loadPeerSolar(),REFRESH_MS.realtime);
    return()=>{active=false;window.clearTimeout(initialTimer);window.clearInterval(refreshTimer)};
  },[auth,page,peerDevice?.deviceSn]);
  useEffect(()=>{if(!auth||!selected||!isHistoricalDay){setHistoricalDayRows([]);return}let active=true;setHistoricalDayLoading(true);setTimelineIndex(null);const utc=siteRangeUtc(homeDate,addDays(homeDate,1));api<{list:HistoryRow[]}>(`devices/${selected}/archive-series?start=${encodeURIComponent(utc.start)}&end=${encodeURIComponent(utc.end)}&resolution=hour`).then(result=>{if(active){const rows=filterRowsForSiteDate(result.list||[],homeDate);setHistoricalDayRows(rows);setTimelineIndex(rows.length?rows.length-1:null)}}).catch(error=>active&&setHistoryMessage(`No fue posible cargar ${homeDate}: ${error instanceof Error?error.message:'error'}.`)).finally(()=>active&&setHistoricalDayLoading(false));return()=>{active=false}},[auth,selected,homeDate,isHistoricalDay]);
  useEffect(()=>{const start=weather.dailyRadiation?.[0]?.date;if(!auth||!selected||!start){setProjectionHistory([]);return}let active=true;const utc=siteRangeUtc(start,addDays(siteDate,1));api<{list:HistoryRow[]}>(`devices/${selected}/archive-series?start=${encodeURIComponent(utc.start)}&end=${encodeURIComponent(utc.end)}&resolution=day`).then(result=>{if(active)setProjectionHistory(groupDailyEnergy(result.list||[]))}).catch(()=>active&&setProjectionHistory([]));return()=>{active=false}},[auth,selected,weather.dailyRadiation?.[0]?.date,siteDate]);
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
    xAxis:{type:'category',data:homeRows.map(r=>{const d=parseApiTime(r.currentTime??r.createTime??r.collectTime??r.dataTime??r.time);return d?d.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):''}),axisLabel:{color:'#789099',hideOverlap:true},axisLine:{lineStyle:{color:'#27404a'}}},
    yAxis:{type:'value',name:'W',nameTextStyle:{color:'#789099'},axisLabel:{color:'#789099'},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[
      {name:'Solar PV1 + PV2',type:'line',smooth:true,showSymbol:false,data:homeRows.map(r=>pvPower(r,1)+pvPower(r,2)),lineStyle:{width:3,color:'#efbd34'},itemStyle:{color:'#efbd34'},areaStyle:{opacity:.08,color:'#efbd34'}},
      {name:'Consumo casa',type:'line',smooth:true,showSymbol:false,data:homeRows.map(loadPower),lineStyle:{width:2,color:'#a96fff'},itemStyle:{color:'#a96fff'}},
      {name:gridSourceLabel,type:'line',smooth:true,showSymbol:false,data:homeRows.map(r=>Math.max(0,effectiveGridPower(r))),lineStyle:{width:2,color:'#4f9fff'},itemStyle:{color:'#4f9fff'}},
      {name:'Aporte sistema solar',type:'line',smooth:true,showSymbol:false,data:homeRows.map(solarSystemToLoadPower),lineStyle:{width:2,color:'#49d984'},itemStyle:{color:'#49d984'}},
      {name:'Batería descargando',type:'line',smooth:true,showSymbol:false,data:homeRows.map(batteryDischargePower),lineStyle:{width:2,color:'#4bd98a'},itemStyle:{color:'#4bd98a'}}
    ]
  }),[homeRows,gridSourceLabel]);

  if(auth===null)return <div className="boot">Cargando Mi Solar…</div>;
  if(!auth)return <Login done={()=>setAuth(true)}/>;

  const systemToLoad=(energy:DailyEnergy)=>Math.max(0,energy.solarToLoad)+Math.max(0,energy.batteryToLoad);
  const savings=systemToLoad(homeEnergy)*tariff;
  const catalog=technicalCatalog(realtime,summary,gridSourceLabel);
  const used=new Set(catalog.flatMap(s=>s.items.map(i=>i.source).filter(Boolean)) as string[]);
  const rawUnknown=[...new Set([...Object.keys(summary),...Object.keys(realtime)])].filter(k=>!used.has(k)).sort();

  return <div className="shell">
    <Sidebar page={page} setPage={setPage} site={device?.nickName||'Mi instalación'} onLogout={async()=>{await api('logout',{method:'POST'});setAuth(false)}}/>
    <main className="content">
      <header className="topbar">
        <div><select value={selected} onChange={e=>switchDevice(e.target.value)}>{devices.map(d=><option key={d.deviceSn} value={d.deviceSn}>{d.nickName||d.deviceSn}</option>)}</select><span className="online">● En línea</span></div>
        <div className="time-box"><strong>{clock}</strong><small>Hora de Chile</small><small>Último dato: {formatDate(realtime.currentTime||realtime.createTime)}</small><small>Consulta: {lastFetch?lastFetch.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'—'} · v{APP_VERSION}</small></div>
        <FunModeToggle value={funMode} onChange={v=>{setFunMode(v);localStorage.setItem('funMode',v?'on':'off')}}/>
        <button className="refresh-button" onClick={()=>refreshAll()}><RefreshCw className={loading?'spin':''}/><span>Actualizar</span></button>
      </header>
      {syncMessage&&<div className="data-warning-banner">{syncMessage}</div>}
      {historyMessage&&<div className={`data-warning-banner ${historyMessage.startsWith('Mes completo')?'history-status-ok':'history-status-warn'}`}>{historyMessage}</div>}
      {historyProgress&&<div className="history-progress">{historyProgress}</div>}

      {page==='home'&&<>
        {peerDevice&&<aside className="peer-solar-strip" aria-live="polite">
          <span className="peer-solar-dot" aria-hidden="true"/>
          <span><b>{siteProfile(peerDevice.nickName||'').shortLabel}</b> está produciendo</span>
          <strong>{peerSolar?.deviceSn===peerDevice.deviceSn?watts(peerSolar.power):'Consultando…'}</strong>
          {peerSolar?.updatedAt&&<small>ahora</small>}
        </aside>}
        <HomeDateNavigator value={homeDate} max={siteDate} loading={historicalDayLoading} onChange={date=>{setHomeDate(date);setTimelineIndex(null)}}/>
        <SimpleEnergyFlow data={displayedData} history={homeRows} today={homeEnergy} gridLabel={gridSourceLabel} pvCountOverride={pvCount} historical={isHistoricalDay} dateLabel={new Date(`${homeDate}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'})}/>
        <EnergyTimeline rows={homeRows} index={timelineIndex} onChange={setTimelineIndex} historical={isHistoricalDay}/>
        <section className="kpi-grid kpi-grid-six">
          <KpiCard icon={Sun} label="Producción solar" value={watts(solar)} detail={`Día: ${kwh(homeEnergy.solar)}${isHistoricalDay?'':` · esperado ahora ${watts(expectedSolarNow)}`}`} tone="solar"/>
          <KpiCard icon={Sun} label="Solar acumulado del día" value={kwh(homeEnergy.solar)} detail={isHistoricalDay?`PV1 ${kwh(homeEnergy.pv1)} · PV2 ${kwh(homeEnergy.pv2)}`:`Modelo ajustado: ${theoreticalToday.toFixed(2)} kWh · proyección día ${forecastToday.toFixed(2)} kWh`} tone="solar"/>
          <KpiCard icon={House} label="Consumo" value={watts(load)} detail={`Día: ${kwh(homeEnergy.load)}`}/>
          <KpiCard icon={RadioTower} label={profile.gridConnected?(grid<0?'Hacia la red':'Desde la red'):'Desde el generador'} value={watts(Math.abs(grid))} detail={`Día ${profile.gridConnected?'importado con estado 1':'aportado por generador'}: ${kwh(homeEnergy.gridImport)}`}/>
          <KpiCard icon={Battery} label="Batería" value={`${soc.toFixed(0)}%`} detail={`${charge>discharge?'Cargando':'Entregando'} ${watts(Math.max(charge,discharge))}`} tone="green"/>
          <KpiCard icon={CircleDollarSign} label="Ahorro del día" value={clp(savings)} detail={`Sistema a la casa ${kwh(systemToLoad(homeEnergy))}`} tone="green"/>
        </section>
        <DailyQuote/>
        <LoadCoverageBar today={homeEnergy} month={month} lastUpdate={isHistoricalDay?parseApiTime(homeEnergy.lastSample):quality.last} gridLabel={gridSourceLabel} historical={isHistoricalDay}/>
        <RecentEnergyChart rows={homeRows} siteLabel={siteLabel}/>
        {!isHistoricalDay&&<HouseIllustration weather={weather} funMode={funMode} siteName={device?.nickName||'Casa ECO Arrayán'}/>}
        <section className="panel chart-panel"><header className="section-head"><div><small>Producción y consumo</small><h2>{isHistoricalDay?homeDate:'Hoy'} · {siteLabel} · horario de Chile</h2></div></header><EChart option={chartOption}/></section>
        <div className="home-grid secondary-home-grid"><aside className="side-stack">
          <section className="panel health-card"><small>Estado del sistema</small><strong>{health(realtime)}/100</strong><p>{health(realtime)>90?'Excelente · sin anomalías relevantes':'Conviene revisar algunos parámetros'}</p></section>
          <section className="panel best-card"><small>Mejor día del mes · {siteLabel}</small><strong>{best?kwh(best.solar):'—'}</strong><p>{best?new Date(`${best.date}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'}):'Aún sin histórico suficiente'}</p></section>
        </aside><CoverageCard today={today} first={quality.first} last={quality.last} siteLabel={siteLabel}/><WeatherOutlook weather={weather}/></div>
        <DataQualityCard realtimeAvailable={Object.keys(realtime).length>0} daySamples={today.samples} weekSamples={week.samples} monthSamples={month.samples} weatherAvailable={weather.temperature!=null} radiationAvailable={Boolean(weather.hourly?.length||weather.dailyRadiation?.length)} updates={lastSectionUpdate}/>
      </>}

      {page==='charts'&&<section className="analytics-page">
        <header className="analytics-title"><div><small>Análisis energético</small><h1>Gráficos y acumulados</h1><p>Todos los cortes pertenecen exclusivamente a la instalación seleccionada y usan el día calendario de Chile.</p></div><section className={`instant-gauge-grid ${pvCount===1?'two-gauges':''}`}><article className="panel gauge-card"><small>Demanda actual</small><PowerGauge value={load} label="Consumo instantáneo"/><div className="gauge-note"><span className="safe-dot"/>normal <span className="danger-dot"/>carga alta</div></article><article className="panel gauge-card solar-gauge"><small>Producción string 1</small><PowerGauge value={pvPower(realtime,1)} max={Math.max(3000,installedWp/Math.max(1,pvCount))} label="PV1 instantáneo" color="#efbd34"/></article>{pvCount===2&&<article className="panel gauge-card solar-gauge"><small>Producción string 2</small><PowerGauge value={pvPower(realtime,2)} max={Math.max(3000,installedWp/2)} label="PV2 instantáneo" color="#f29b38"/></article>}</section></header>
        <EnergyRangeChart deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel}/>
        <section className="analytics-period-summary"><article className="panel"><small>Hoy</small><strong>{kwh(today.solar)}</strong><p>Solar · consumo {kwh(today.load)} · {gridSourceLabel.toLocaleLowerCase('es-CL')} {kwh(today.gridImport)}</p></article><article className="panel"><small>Esta semana</small><strong>{kwh(week.solar)}</strong><p>Solar · consumo {kwh(week.load)} · {gridSourceLabel.toLocaleLowerCase('es-CL')} {kwh(week.gridImport)}</p></article><article className="panel"><small>Este mes</small><strong>{kwh(month.solar)}</strong><p>Solar · consumo {kwh(month.load)} · {gridSourceLabel.toLocaleLowerCase('es-CL')} {kwh(month.gridImport)}</p></article></section>
        <HistoricalBackfill devices={devices}/>
        <HistoryExplorer deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel}/>
        <section className="panel pv-day-card"><header><div><small>Aporte fotovoltaico acumulado de hoy</small><h2>PV1 vs. PV2</h2></div><strong>{kwh(today.solar)}</strong></header><div className="pv-day-row"><span>PV1</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv1/today.solar*100):0}%`}}/></div><b>{kwh(today.pv1)}</b></div>{pvCount===2&&<div className="pv-day-row pv2-day"><span>PV2</span><div className="pv-day-track"><i style={{width:`${today.solar?Math.max(2,today.pv2/today.solar*100):0}%`}}/></div><b>{kwh(today.pv2)}</b></div>}<p>Datos integrados desde las 00:00 de Chile; no son los watts instantáneos.</p></section>
        <section className="analytics-summary-grid"><article className="panel stat"><small>Consumo semana</small><strong>{kwh(week.load)}</strong></article><article className="panel stat"><small>Solar semana</small><strong>{kwh(week.solar)}</strong></article><article className="panel stat"><small>{gridSourceLabel} semana</small><strong>{kwh(week.gridImport)}</strong></article><article className="panel stat"><small>Consumo mes</small><strong>{kwh(month.load)}</strong></article><article className="panel stat"><small>Solar mes</small><strong>{kwh(month.solar)}</strong></article><article className="panel stat"><small>{gridSourceLabel} mes</small><strong>{kwh(month.gridImport)}</strong></article>{profile.gridConnected&&<article className="panel stat"><small>Red exportada mes</small><strong>{kwh(month.gridExport)}</strong></article>}<article className="panel stat"><small>Carga batería mes</small><strong>{kwh(month.charge)}</strong></article><article className="panel stat"><small>Descarga batería mes</small><strong>{kwh(month.discharge)}</strong></article></section>
      </section>}

      {page==='solar'&&<SolarForecastPage actual={projectionActual} weather={weather} model={solarModel} siteLabel={siteLabel} siteKey={profile.key}/>}

      {page==='costs'&&<CostsPage key={selected} deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel} today={today} week={week} currentMonth={month} tariff={tariff} onTariffChange={value=>{setTariff(value);localStorage.setItem(siteStorageKey('tariffCLP',device?.nickName||''),String(value))}}/>}

      {page==='equipment'&&<section className="equipment-grid">{[['Paneles',`PV1 ${watts(pvPower(realtime,1))}${detectPvCount(realtime,monthRows)===2?` · PV2 ${watts(pvPower(realtime,2))}`:''}`],['Inversor',String(summary.workMode||realtime.workMode||'—')],['Batería',`${soc.toFixed(0)}% · ${batteryVoltage(realtime).toFixed(1)} V`],[profile.gridConnected?'Red activa · estado 1':'Generador de respaldo',`${watts(Math.abs(grid))} · ${gridVoltage(realtime).toFixed(1)} V · ${gridFrequency(realtime).toFixed(1)} Hz`],['Salida AC',`${outputVoltage(realtime).toFixed(1)} V · ${outputFrequency(realtime).toFixed(1)} Hz`],['Temperatura',`${inverterTemperature(realtime).toFixed(1)} °C`]].map(([a,b])=><article className="panel equipment-card" key={a}><h2>{a}</h2><p>{b}</p></article>)}</section>}

      {page==='technical'&&<section className="technical-page"><section className="technical-summary"><article className="panel"><small>Versión de la app</small><strong>v{APP_VERSION}</strong></article><article className="panel"><small>Política de actualización</small><strong>30 s · 5 min · 5 min · 5 min</strong><p>Tiempo real · día · semana · mes</p></article><article className="panel"><small>Datos catalogados</small><strong>{catalog.reduce((n,s)=>n+s.items.filter(i=>i.value!==null).length,0)}</strong></article><article className="panel"><small>Muestras hoy</small><strong>{today.samples}</strong></article><article className="panel"><small>Muestras mes</small><strong>{month.samples}</strong></article></section><section className="technical-grid">{catalog.map(section=><article className="panel technical-section" key={section.title}><h2>{section.title}</h2>{section.items.map(item=><div className="technical-row" key={item.key}><span>{item.label}</span><strong>{item.value===null?'—':`${typeof item.value==='number'?item.value.toLocaleString('es-CL',{maximumFractionDigits:2}):item.value}${item.unit?` ${item.unit}`:''}`}</strong><small>{item.source||'campo no disponible'}</small></div>)}</article>)}</section><section className="panel technical"><h2>Parámetros disponibles no usados en el dashboard</h2><p>Se muestran aquí para mantener el inicio limpio y facilitar futuras estadísticas.</p><div className="unknown-parameter-grid">{rawUnknown.map(key=><div className="unknown-parameter" key={key}><span>{key}</span><strong>{String((realtime as Record<string,unknown>)[key]??(summary as Record<string,unknown>)[key]??'—')}</strong></div>)}</div><details><summary>Auditoría completa en JSON</summary><pre>{JSON.stringify({version:APP_VERSION,architecture:'Vercel native · caché aislado por equipo',refreshPolicyMs:REFRESH_MS,lastSectionUpdate,realtime,summary,today,week,month,quality,solarModel},null,2)}</pre></details></section></section>}
      {page==='programming'&&<ProgrammingPage deviceSn={selected} siteLabel={siteLabel} currentTime={clock} tomorrowDate={tomorrowDate} tomorrowForecast={forecastTomorrow}/>}
      {page==='integrations'&&<IntegrationsPage siteLabel={siteLabel}/>}
    </main>
    <MobileNav page={page} setPage={setPage}/>
  </div>;
}
