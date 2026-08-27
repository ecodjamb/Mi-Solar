import { useEffect, useMemo, useRef, useState } from 'react';
import { Battery, CircleDollarSign, House, RadioTower, RefreshCw, ShieldCheck, Sun } from 'lucide-react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import KpiCard from './components/KpiCard';
import SimpleEnergyFlow from './components/SimpleEnergyFlow';
import DailyQuote from './components/DailyQuote';
import FunModeToggle from './components/FunModeToggle';
import PowerGauge from './components/PowerGauge';
import DualSolarGauge from './components/DualSolarGauge';
import PvStringComparisonChart from './components/PvStringComparisonChart';
import PvAccumulatedBar from './components/PvAccumulatedBar';
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
import DailyConsumptionChart from './components/DailyConsumptionChart';
import EquipmentPage from './components/EquipmentPage';
import WaterCostsPage from './components/WaterCostsPage';
import UsersPage from './components/UsersPage';
import FamilyFinancePage from './components/FamilyFinancePage';
import { api, apiFast, apiLive } from './services/api';
import { fetchWeather, type WeatherData } from './services/weather';
import { accumulatedTheoreticalToday, calibrateSolarModel, expectedPowerNow, theoreticalDayKwh } from './utils/solarForecast';
import type { DailyEnergy, Device, HistoryRow, PageKey, Realtime } from './types';
import { siteProfile,siteStorageKey } from './utils/site';
import { APP_VERSION, REFRESH_POLICY, SESSION_POLICY } from './config';
import { readSiteCache, writeSiteCache } from './services/siteCache';
import {
  batteryChargePower,batteryDischargePower,batterySoc,batteryVoltage,chileDayApiChunks,chileSiteRangeApiRange,chileWeekApiRange,clp,dailyEnergy,dataQuality,
  detectPvCount,effectiveGridPower,filterRowsForSiteDate,filterRowsForSiteMonth,filterRowsForSiteRange,formatClock,formatDate,formatSiteDate,gridFrequency,gridVoltage,solarSystemToLoadPower,solarToLoadPower,
  groupDailyEnergy,health,inverterTemperature,kwh,loadPower,outputFrequency,outputVoltage,parseApiTime,pvPower,siteRangeUtc,watts
} from './utils/energy';

const SESSION_IDLE_MS=SESSION_POLICY.idleMs;
const ACTIVITY_PING_MS=SESSION_POLICY.activityPingMs;
const LAST_ACTIVITY_KEY=SESSION_POLICY.storageKey;
const REFRESH_MS=REFRESH_POLICY;
const PROVIDER_ACTIVE_REFRESH_MS=2*60_000;
type RealtimeRefreshMode='cache'|'if-stale'|'force';
const requestedPage=()=>{const value=new URLSearchParams(window.location.search).get('page');if(value==='technical')return'equipment';return(['home','charts','solar','costs','equipment','programming','integrations','water','users','family'] as PageKey[]).includes(value as PageKey)?value as PageKey:'home'};
const emptyEnergy:DailyEnergy={date:'',solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,gridToLoad:0,charge:0,discharge:0,solarToLoad:0,batteryToLoad:0,solarToBattery:0,samples:0};
type StoredSolarForecast={date:string;forecastKwh:number;radiationKwhM2:number;locked:boolean;lockedAt:string|null;rawForecastKwh?:number;accuracyFactor?:number;accuracySampleDays?:number};
type ForecastRevision={date:string;forecastKwh:number;radiationKwhM2:number;observedAt:string};
type SolarForecastResponse={today:StoredSolarForecast;tomorrow:StoredSolarForecast;days?:StoredSolarForecast[];revisions:Record<string,ForecastRevision[]>;lockTimeChile:string};
type LiveResponse={realtime:Realtime;summary:Realtime;partial?:boolean;receivedAt?:string;source?:string};
type ProviderName='isolar'|'watchpower';
type ProviderSite={id:number;name:string;siteKey:string;deviceSuffix:string;providers:{provider:ProviderName;enabled:boolean;status:string;lastSuccessAt:string|null;lastAttemptAt:string|null;readOnly:boolean}[]};
type ProviderCatalog={sites:ProviderSite[];defaultProvider:ProviderName};
type AppIdentity={authenticated:boolean;authRequired:boolean;user?:{id:string;username:string;displayName:string;mustChangePassword:boolean}|null;access:{role:string;permissions:string[];menus:Record<string,boolean>;actions:Record<string,boolean>}};
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
  return <main className="login"><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('app-auth/login',{method:'POST',body:JSON.stringify({username:u,password:p})});done()}catch(err){setError(err instanceof Error?err.message:'Error')}finally{setBusy(false)}}}>
    <Sun size={38}/><h1>Mi Solar</h1><p>Centro inteligente de energía · v{APP_VERSION}</p><input placeholder="Usuario" value={u} onChange={e=>setU(e.target.value)}/><input placeholder="Contraseña" type="password" value={p} onChange={e=>setP(e.target.value)}/>{error&&<span className="error">{error}</span>}<button disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button>
  </form></main>;
}

function ChangeInitialPassword({done}:{done:()=>void}){
  const [currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <main className="login"><form onSubmit={async event=>{event.preventDefault();if(Array.from(newPassword).length!==8){setError('La contraseña debe tener exactamente 8 caracteres.');return}if(newPassword!==confirmPassword){setError('La confirmación no coincide.');return}setBusy(true);setError('');try{await api('app-auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});done()}catch(cause){setError(cause instanceof Error?cause.message:'No fue posible cambiar la contraseña.')}finally{setBusy(false)}}}>
    <ShieldCheck size={38}/><h1>Protege Mi Solar</h1><p>Confirma una contraseña de exactamente 8 caracteres. Puede ser igual a la clave anterior.</p><input autoComplete="current-password" placeholder="Contraseña actual" type="password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/><input autoComplete="new-password" placeholder="Contraseña · exactamente 8 caracteres" type="password" value={newPassword} onChange={event=>setNewPassword(event.target.value)}/><input autoComplete="new-password" placeholder="Confirmar contraseña" type="password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/>{error&&<span className="error">{error}</span>}<button disabled={busy}>{busy?'Guardando…':'Confirmar contraseña'}</button>
  </form></main>;
}

export default function App(){
  const [clock,setClock]=useState(formatClock());
  const [auth,setAuth]=useState<boolean|null>(null);
  const [legacyAuth,setLegacyAuth]=useState(false);
  const [page,setPage]=useState<PageKey>(requestedPage);
  const [devices,setDevices]=useState<Device[]>([]);
  const [selected,setSelected]=useState('');
  const [providerCatalog,setProviderCatalog]=useState<ProviderCatalog|null>(null);
  const [appIdentity,setAppIdentity]=useState<AppIdentity|null>(null);
  const [source,setSource]=useState<ProviderName>('isolar');
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
  const [storedForecast,setStoredForecast]=useState<SolarForecastResponse|null>(null);
  const selectedRef=useRef('');
  const sourceRef=useRef<ProviderName>('isolar');
  const liveRequestsRef=useRef(new Map<string,Promise<void>>());
  const markUpdated=(key:string)=>setLastSectionUpdate(prev=>({...prev,[key]:new Date()}));

  const siteDate=formatSiteDate();
  const weekRange=useMemo(()=>chileWeekApiRange(siteDate),[siteDate]);
  const history=useMemo(()=>filterRowsForSiteDate(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const combinedMonthRows=useMemo(()=>rawMonthRows.some(row=>Number(row.aggregateSamples||0)>0)?rawMonthRows:[...rawMonthRows,...rawDayRows],[rawMonthRows,rawDayRows]);
  const monthRows=useMemo(()=>filterRowsForSiteMonth(combinedMonthRows,siteDate.slice(0,7)),[combinedMonthRows,siteDate]);
  const combinedWeekRows=useMemo(()=>rawWeekRows.some(row=>Number(row.aggregateSamples||0)>0)?rawWeekRows:[...rawWeekRows,...rawDayRows],[rawWeekRows,rawDayRows]);
  const weekRows=useMemo(()=>filterRowsForSiteRange(combinedWeekRows,weekRange.siteStart,weekRange.siteEnd),[combinedWeekRows,weekRange.siteStart,weekRange.siteEnd]);
  const device=devices.find(d=>d.deviceSn===selected);
  const providerSiteFor=(value:string)=>providerCatalog?.sites.find(site=>site.siteKey===value||(site.deviceSuffix&&value.endsWith(site.deviceSuffix)));
  const selectedProviderSite=providerSiteFor(selected);
  const selectedProviderStatus=selectedProviderSite?.providers.find(item=>item.provider===source);
  const profile=siteProfile(device?.nickName||'');
  const waterEnabled=profile.key==='arrayan';
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
  const liveForecastToday=theoreticalDayKwh(todayRadiation,solarModel,true);
  const tomorrowDate=addDays(siteDate,1);
  const tomorrowRadiation=weather.dailyRadiation?.find(d=>d.date===tomorrowDate)?.shortwaveKwhM2;
  const liveForecastTomorrow=tomorrowRadiation&&tomorrowRadiation>0?theoreticalDayKwh(tomorrowRadiation,solarModel,false,tomorrowDate):null;
  const forecastToday=storedForecast?.today?.date===siteDate&&storedForecast.today.locked?storedForecast.today.forecastKwh:liveForecastToday;
  const forecastTomorrow=storedForecast?.tomorrow?.date===tomorrowDate?storedForecast.tomorrow.forecastKwh:liveForecastTomorrow;
  const realtimeSampleAt=parseApiTime(realtime.currentTime??realtime.createTime??realtime.collectTime??realtime.dataTime??realtime.time);
  const queryAgeMs=lastFetch?Date.now()-lastFetch.getTime():Infinity;
  const sampleAgeMs=realtimeSampleAt?Date.now()-realtimeSampleAt.getTime():null;
  const liveFresh=Object.keys(realtime).length>0&&queryAgeMs<=75_000&&(sampleAgeMs===null||sampleAgeMs<=5*60_000);
  const liveStatus=isHistoricalDay?'Sin animación':loading?'Sincronizando…':liveFresh?'En línea':Object.keys(realtime).length?'Dato atrasado':'Esperando datos';

  useEffect(()=>{if(page==='water'&&!waterEnabled)setPage('home')},[page,waterEnabled]);

  async function fetchHistoryRange(sn:string,start:string,end:string,maxPages=18){
    return api<{list:HistoryRow[];total:number;truncated?:boolean;pages?:number}>(`devices/${sn}/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&maxPages=${maxPages}`);
  }

  function refreshRealtime(sn=selectedRef.current||selected,refreshMode:RealtimeRefreshMode='cache'){
    if(!sn)return Promise.resolve();
    const requestedProvider=sourceRef.current;
    const requestKey=`${sn}:${requestedProvider}`;
    const pending=liveRequestsRef.current.get(requestKey);
    if(pending)return pending;
    const request=(async()=>{
      if(selectedRef.current===sn)setLoading(true);
      try{
        const provider=requestedProvider;
        const providerSite=providerSiteFor(sn);
        let originError='';
        if(refreshMode!=='cache'&&providerSite&&appIdentity?.authenticated){
          const action=refreshMode==='force'?'sync':'refresh';
          try{await apiLive(`sites/${providerSite.id}/providers/${provider}/${action}`,{method:'POST'})}
          catch(cause){originError=cause instanceof Error?cause.message:'El proveedor no respondió.'}
        }
        const useCanonical=Boolean(providerSite);
        const result:LiveResponse=useCanonical&&providerSite
          ? await apiLive<{legacy:Realtime|null;sample?:{received_at?:string}}>(`sites/${providerSite.id}/providers/${provider}/latest`).then(value=>({realtime:value.legacy||{},summary:value.legacy||{},receivedAt:value.sample?.received_at,source:provider}))
          : await apiLive<LiveResponse>(`devices/${sn}/live`);
        const value=result.realtime||{};
        const summaryValue=result.summary||{};
        writeSiteCache(sn,{realtime:value,summary:summaryValue});
        if(selectedRef.current!==sn||sourceRef.current!==provider)return;
        setRealtime(value);
        setSummary(summaryValue);
        setLastFetch(new Date());
        markUpdated('realtime');
        setSyncMessage(originError?`No se pudo consultar ${provider==='isolar'?'i.Solar':'WatchPower'} ahora: ${originError}. Se conserva la última muestra respaldada.`:result.partial?'Datos instantáneos actualizados; el resumen del equipo se completará en el próximo ciclo.':'');
      }catch{
        if(selectedRef.current===sn)setSyncMessage('No se pudo actualizar ahora. La app conserva el último dato identificado como anterior y reintentará en 30 segundos.');
      }finally{
        liveRequestsRef.current.delete(requestKey);
        if(selectedRef.current===sn)setLoading(false);
      }
    })();
    liveRequestsRef.current.set(requestKey,request);
    return request;
  }

  async function refreshDayHistory(sn=selected){
    if(!sn)return;
    const chunks=chileDayApiChunks(siteDate,new Date(),6);
    const rows:HistoryRow[]=[];
    const warnings:string[]=[];
    try{
      const archiveRange=siteRangeUtc(siteDate,addDays(siteDate,1));
      try{
        const archived=await api<{list:HistoryRow[]}>(`devices/${sn}/archive?start=${encodeURIComponent(archiveRange.start)}&end=${encodeURIComponent(archiveRange.end)}`);
        if(archived.list?.length){
          const archivedRows=filterRowsForSiteDate(archived.list,siteDate);
          setRawDayRows(archivedRows);
          writeSiteCache(sn,{dayRows:archivedRows});
          markUpdated('day');
          const lastRow=archivedRows[archivedRows.length-1];
          const last=lastRow?parseApiTime(lastRow.currentTime??lastRow.createTime??lastRow.collectTime??lastRow.dataTime??lastRow.time):null;
          const lastLabel=last?last.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'sin muestras';
          setHistoryMessage(`Día cargado desde el respaldo permanente · última muestra ${lastLabel}.`);
          return;
        }
      }catch{ /* Si el respaldo aún no tiene el día, se consulta el origen. */ }
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
    selectedRef.current=sn;
    setSelected(sn);
    const preferred=(localStorage.getItem(`misolar-provider:${sn}`) as ProviderName)||'isolar';
    const configured=providerSiteFor(sn)?.providers.find(item=>item.provider===preferred)?.enabled;
    sourceRef.current=configured?preferred:'isolar';setSource(sourceRef.current);
    const cached=readSiteCache(sn);
    const cachedRealtimeFresh=Boolean(cached?.realtimeSavedAt&&Date.now()-cached.realtimeSavedAt<=2*60_000);
    setRealtime(cachedRealtimeFresh?cached?.realtime||{}:{});setSummary(cachedRealtimeFresh?cached?.summary||{}:{});
    setRawDayRows(cached?.dayRows||[]);setRawWeekRows(cached?.weekRows||[]);setRawMonthRows(cached?.monthRows||[]);
    setSyncMessage(cachedRealtimeFresh?'Verificando el último dato con el inversor…':'Sincronizando datos actuales con el inversor…');
    setHistoryMessage('');setHistoryProgress('');setWeather({});setLastFetch(cachedRealtimeFresh&&cached?.realtimeSavedAt?new Date(cached.realtimeSavedAt):null);
    setTimelineIndex(null);
    setProjectionHistory([]);
    setHomeDate(formatSiteDate());setHistoricalDayRows([]);
    void refreshAll(sn,appIdentity?.authenticated?'if-stale':'cache');
  }

  async function refreshAll(sn=selected,refreshMode:RealtimeRefreshMode='cache'){
    if(!sn)return;
    setSyncMessage('');
    // La lectura viva se atiende primero; el histórico queda en segundo plano.
    await refreshRealtime(sn,refreshMode);
    await refreshDayHistory(sn);
    await refreshWeekHistory(sn);
    void refreshMonthHistory(sn);
  }

  function switchProvider(provider:ProviderName){
    if(provider===sourceRef.current)return;
    sourceRef.current=provider;setSource(provider);localStorage.setItem(`misolar-provider:${selected}`,provider);
    setRealtime({});setSummary({});setTimelineIndex(null);
    setSyncMessage(provider==='watchpower'?'Cargando exclusivamente datos de WatchPower…':'Cargando exclusivamente datos de i.Solar…');
    void refreshAll(selected,appIdentity?.authenticated?'if-stale':'cache');
  }

  useEffect(()=>{const timer=setInterval(()=>setClock(formatClock()),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{
    const boot=async()=>{
      const identity=await apiFast<typeof appIdentity>('app-auth/session').catch(()=>null);
      setAppIdentity(identity);
      const legacy=await apiFast<{authenticated:boolean}>('session').catch(()=>({authenticated:false}));
      setLegacyAuth(legacy.authenticated);
      setAuth(identity?.authRequired===false?true:Boolean(identity?.authenticated));
    };
    void boot();
    const expired=()=>setAppIdentity(current=>{
      setAuth(current?.authRequired===false);
      return current?{...current,authenticated:false}:current;
    });
    window.addEventListener('misolar:auth-expired',expired);
    return()=>window.removeEventListener('misolar:auth-expired',expired);
  },[]);
  useEffect(()=>{if(!auth)return;api<ProviderCatalog>('providers/catalog').then(setProviderCatalog).catch(()=>setProviderCatalog(null))},[auth]);
  useEffect(()=>{const changed=(event:Event)=>{const value=(event as CustomEvent).detail;setAppIdentity(value);setAuth(value?.authRequired===false||value?.authenticated===true)};window.addEventListener('misolar:app-auth-changed',changed);return()=>window.removeEventListener('misolar:app-auth-changed',changed)},[]);
  useEffect(()=>{
    if(!auth||!legacyAuth)return;
    let lastPing=0;
    const registerActivity=()=>{
      const now=Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY,String(now));
      if(now-lastPing>=ACTIVITY_PING_MS){
        lastPing=now;
        void api<{ok:boolean;expiresAt:number}>('activity',{method:'POST'}).catch(()=>undefined);
      }
    };
    const checkIdle=()=>{
      const last=Number(localStorage.getItem(LAST_ACTIVITY_KEY)||0);
      if(last&&Date.now()-last>=SESSION_IDLE_MS){
        void api('logout',{method:'POST'}).catch(()=>undefined).finally(()=>setLegacyAuth(false));
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
    const refreshOnResume=()=>{const sn=selectedRef.current;if(sn)void refreshRealtime(sn,appIdentity?.authenticated?'if-stale':'cache')};
    const onVisibility=()=>{if(document.visibilityState==='visible'){registerActivity();void apiFast<{authenticated:boolean}>('session').then(value=>{setLegacyAuth(value.authenticated);refreshOnResume()}).catch(()=>refreshOnResume())}};
    const onOnline=()=>refreshOnResume();
    const onPageShow=()=>refreshOnResume();
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('online',onOnline);
    window.addEventListener('pageshow',onPageShow);
    const idleTimer=window.setInterval(checkIdle,60_000);
    return()=>{
      events.forEach(([name,handler,options])=>window.removeEventListener(name,handler,options));
      document.removeEventListener('visibilitychange',onVisibility);
      window.removeEventListener('online',onOnline);
      window.removeEventListener('pageshow',onPageShow);
      window.clearInterval(idleTimer);
    };
  },[auth,legacyAuth]);
  useEffect(()=>{if(!auth||!providerCatalog)return;const fallback=()=>{const list=providerCatalog.sites.map(site=>({deviceSn:site.siteKey,nickName:site.name,onlineStatus:site.providers.some(item=>item.status==='connected')?1:0}));setDevices(list);if(!selected&&list[0])switchDevice(list[0].deviceSn)};if(!legacyAuth){fallback();return}api<{devices:Device[]}>('devices').then(x=>{const list=x.devices||[];if(!list.length){fallback();return}setDevices(list);const sn=list[0]?.deviceSn||'';if(sn&&!selected)switchDevice(sn)}).catch(fallback)},[auth,legacyAuth,providerCatalog]);
  useEffect(()=>{if(!device)return;setTariff(Number(localStorage.getItem(siteStorageKey('tariffCLP',device.nickName||'')))||profile.defaultTariff)},[device?.deviceSn]);
  useEffect(()=>{if(!auth||!selected)return;const t=setInterval(()=>void refreshRealtime(selected),REFRESH_MS.realtime);return()=>clearInterval(t)},[auth,selected]);
  useEffect(()=>{
    if(!auth||!selected||page!=='home'||!appIdentity?.authenticated)return;
    const t=setInterval(()=>void refreshRealtime(selected,'if-stale'),PROVIDER_ACTIVE_REFRESH_MS);
    return()=>clearInterval(t);
  },[auth,selected,source,page,appIdentity?.authenticated]);
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
        const peerProviderSite=providerSiteFor(peerDevice.deviceSn);
        const result=peerProviderSite
          ? await api<{legacy:Realtime|null}>(`sites/${peerProviderSite.id}/providers/isolar/latest`).then(value=>({data:value.legacy||{}}))
          : await api<{data:Realtime}>(`devices/${peerDevice.deviceSn}/realtime`);
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
  useEffect(()=>{if(!auth||!selected||!weather.dailyRadiation?.length){setStoredForecast(null);return}let active=true;api<SolarForecastResponse>(`devices/${selected}/solar-forecast`).then(value=>active&&setStoredForecast(value)).catch(()=>active&&setStoredForecast(null));return()=>{active=false}},[auth,selected,weather.updatedAt]);
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

  if(auth===null)return <div className="boot">Cargando Mi Solar…</div>;
  if(!auth)return <Login done={()=>{apiFast<NonNullable<typeof appIdentity>>('app-auth/session').then(value=>{setAppIdentity(value);setAuth(value.authenticated)}).catch(()=>setAuth(false))}}/>;
  if(appIdentity?.authenticated&&appIdentity.user?.mustChangePassword)return <ChangeInitialPassword done={()=>{setAuth(false);setAppIdentity(null)}}/>;

  const systemToLoad=(energy:DailyEnergy)=>Math.max(0,energy.solarToLoad)+Math.max(0,energy.batteryToLoad);
  const savings=systemToLoad(homeEnergy)*tariff;
  const isSuperadmin=appIdentity?.authenticated===true&&appIdentity.access.role==='superadmin';
  const actionAllowed=(key:string)=>{const explicit=appIdentity?.access.actions?.[key];return Boolean(isSuperadmin||(explicit===undefined?appIdentity?.access.permissions.includes(key):explicit===true))};
  const menuAllowed=(key:PageKey,fallback:boolean)=>Boolean(isSuperadmin||(Object.prototype.hasOwnProperty.call(appIdentity?.access.menus||{},key)?appIdentity?.access.menus?.[key]===true:fallback));
  const solarView=actionAllowed('solar.view');
  const showUsers=appIdentity?.authenticated===true&&actionAllowed('users.manage')&&menuAllowed('users',false);
  const showFamily=appIdentity?.authenticated===true&&actionAllowed('family.view')&&menuAllowed('family',true);
  const allowedMenus:Partial<Record<PageKey,boolean>>={home:menuAllowed('home',solarView)&&solarView,charts:menuAllowed('charts',solarView)&&solarView,solar:menuAllowed('solar',solarView)&&solarView,costs:menuAllowed('costs',solarView)&&solarView,equipment:menuAllowed('equipment',solarView)&&solarView,programming:menuAllowed('programming',solarView)&&solarView,integrations:menuAllowed('integrations',solarView)&&solarView,water:menuAllowed('water',solarView)&&solarView,family:showFamily,users:showUsers};
  const solarChrome=page!=='family'&&page!=='users'&&page!=='water';

  return <div className="shell">
    <Sidebar page={page} setPage={setPage} site={device?.nickName||'Mi instalación'} waterEnabled={waterEnabled} showUsers={showUsers} showFamily={showFamily} allowedMenus={allowedMenus} onLogout={async()=>{await Promise.allSettled([api('logout',{method:'POST'}),api('app-auth/logout',{method:'POST'})]);setAuth(false);setAppIdentity(null)}}/>
    <main className="content">
      {solarChrome&&<header className="topbar">
        <div className="source-controls"><label><small>Instalación</small><select value={selected} onChange={e=>switchDevice(e.target.value)}>{devices.map(d=><option key={d.deviceSn} value={d.deviceSn}>{d.nickName||d.deviceSn}</option>)}</select></label><label><small>Fuente instantánea</small><select value={source} onChange={e=>switchProvider(e.target.value as ProviderName)}><option value="isolar">i.Solar</option><option value="watchpower" disabled={!selectedProviderSite?.providers.find(item=>item.provider==='watchpower')?.enabled}>WatchPower{!selectedProviderSite?.providers.find(item=>item.provider==='watchpower')?.enabled?' · pendiente':''}</option></select></label><span className={`online ${liveFresh?'is-fresh':'is-stale'}`}>● {selectedProviderStatus?.status==='temporarily_blocked'?'Bloqueado temporalmente':liveStatus}</span>{source==='watchpower'&&<em className="read-only-chip">Solo lectura</em>}</div>
        <div className="time-box"><strong>{clock}</strong><small>Hora de Chile</small><small>Último dato: {formatDate(realtime.currentTime||realtime.createTime)}</small><small>Consulta: {lastFetch?lastFetch.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'—'} · v{APP_VERSION}</small></div>
        {appIdentity?.authenticated&&<button className="account-chip" onClick={()=>setPage(showUsers?'users':'integrations')} title={showUsers?'Ver usuarios y credenciales':'Ver domótica'}><ShieldCheck/><span><b>{appIdentity.user?.displayName||'Mi Solar'}</b><small>@{appIdentity.user?.username}</small></span></button>}
        <FunModeToggle value={funMode} onChange={v=>{setFunMode(v);localStorage.setItem('funMode',v?'on':'off')}}/>
        <button className="refresh-button" onClick={()=>void refreshRealtime(undefined,'force')} disabled={loading} title="Consultar el proveedor y guardar el último dato del flujo instantáneo"><RefreshCw className={loading?'spin':''}/><span>{loading?'Actualizando flujo…':'Actualizar'}</span></button>
      </header>}
      {page==='family'&&appIdentity?.authenticated&&<header className="non-solar-context"><button className="account-chip" onClick={()=>setPage(showUsers?'users':'integrations')} title="Ver mi sesión"><ShieldCheck/><span><b>{appIdentity.user?.displayName||'Superadministrador'}</b><small>@{appIdentity.user?.username}</small></span></button></header>}
      {page==='water'&&<header className="non-solar-context water-context"><span><small>Instalación</small><b>El Arrayán</b></span></header>}
      {solarChrome&&syncMessage&&<div className="data-warning-banner">{syncMessage}</div>}
      {solarChrome&&historyMessage&&<div className={`data-warning-banner ${historyMessage.startsWith('Mes completo')?'history-status-ok':'history-status-warn'}`}>{historyMessage}</div>}
      {solarChrome&&historyProgress&&<div className="history-progress">{historyProgress}</div>}

      {page==='home'&&<>
        {peerDevice&&<aside className="peer-solar-strip" aria-live="polite">
          <span className="peer-solar-dot" aria-hidden="true"/>
          <span><b>{siteProfile(peerDevice.nickName||'').shortLabel}</b> está produciendo</span>
          <strong>{peerSolar?.deviceSn===peerDevice.deviceSn?watts(peerSolar.power):'Consultando…'}</strong>
          {peerSolar?.updatedAt&&<small>ahora</small>}
        </aside>}
        <HomeDateNavigator value={homeDate} max={siteDate} loading={historicalDayLoading} onChange={date=>{setHomeDate(date);setTimelineIndex(null)}}/>
        <SimpleEnergyFlow data={displayedData} history={homeRows} today={homeEnergy} gridLabel={gridSourceLabel} pvCountOverride={pvCount} historical={isHistoricalDay} dateLabel={new Date(`${homeDate}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'})} liveStatus={liveStatus}/>
        <PvAccumulatedBar energy={homeEnergy} title={isHistoricalDay ? `PV1 y PV2 · ${new Date(`${homeDate}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'})}` : 'PV1 y PV2 · hoy'} compact/>
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
        <RecentEnergyChart rows={homeRows} siteLabel={siteLabel} gridLabel={gridSourceLabel}/>
        {!isHistoricalDay&&<HouseIllustration weather={weather} funMode={funMode} siteName={device?.nickName||'Casa ECO Arrayán'}/>}
        <div className="home-grid secondary-home-grid"><aside className="side-stack">
          <section className="panel health-card"><small>Estado del sistema</small><strong>{health(realtime)}/100</strong><p>{health(realtime)>90?'Excelente · sin anomalías relevantes':'Conviene revisar algunos parámetros'}</p></section>
          <section className="panel best-card"><small>Mejor día del mes · {siteLabel}</small><strong>{best?kwh(best.solar):'—'}</strong><p>{best?new Date(`${best.date}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'}):'Aún sin histórico suficiente'}</p></section>
        </aside><CoverageCard today={today} first={quality.first} last={quality.last} siteLabel={siteLabel}/><WeatherOutlook weather={weather}/></div>
        <DataQualityCard realtimeAvailable={Object.keys(realtime).length>0} daySamples={today.samples} weekSamples={week.samples} monthSamples={month.samples} weatherAvailable={weather.temperature!=null} radiationAvailable={Boolean(weather.hourly?.length||weather.dailyRadiation?.length)} updates={lastSectionUpdate}/>
      </>}

      {page==='charts'&&<section className="analytics-page">
        <div className="data-warning-banner history-status-ok">Históricos desde la base permanente de Mi Solar · independientes de la sesión activa del proveedor.</div>
        <header className="analytics-title"><div><small>Análisis energético</small><h1>Gráficos y acumulados</h1><p>Todos los cortes pertenecen exclusivamente a la instalación seleccionada y usan el día calendario de Chile.</p></div><section className="instant-gauge-grid two-gauges"><article className="panel gauge-card"><small>Demanda actual</small><PowerGauge value={load} label="Consumo instantáneo"/><div className="gauge-note"><span className="safe-dot"/>normal <span className="danger-dot"/>carga alta</div></article><article className="panel gauge-card solar-gauge"><small>{pvCount===2?'Producción instantánea · PV1 y PV2':'Producción instantánea · PV1'}</small>{pvCount===2?<DualSolarGauge pv1={pvPower(realtime,1)} pv2={pvPower(realtime,2)} max={Math.max(3000,installedWp/2)}/>:<PowerGauge value={pvPower(realtime,1)} max={Math.max(3000,installedWp)} label="PV1 instantáneo" color="#efbd34"/>}</article></section></header>
        {pvCount===2&&<PvStringComparisonChart deviceSn={selected} siteLabel={siteLabel}/>}
        <EnergyRangeChart deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel}/>
        <DailyConsumptionChart deviceSn={selected} siteLabel={siteLabel}/>
        <section className="analytics-period-summary"><article className="panel"><small>Hoy</small><strong>{kwh(today.solar)}</strong><p>Solar · consumo {kwh(today.load)} · {gridSourceLabel.toLocaleLowerCase('es-CL')} {kwh(today.gridImport)}</p></article><article className="panel"><small>Esta semana</small><strong>{kwh(week.solar)}</strong><p>Solar · consumo {kwh(week.load)} · {gridSourceLabel.toLocaleLowerCase('es-CL')} {kwh(week.gridImport)}</p></article><article className="panel"><small>Este mes</small><strong>{kwh(month.solar)}</strong><p>Solar · consumo {kwh(month.load)} · {gridSourceLabel.toLocaleLowerCase('es-CL')} {kwh(month.gridImport)}</p></article></section>
        <HistoricalBackfill devices={devices}/>
        <HistoryExplorer deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel}/>
        <section className="analytics-summary-grid"><article className="panel stat"><small>Consumo semana</small><strong>{kwh(week.load)}</strong></article><article className="panel stat"><small>Solar semana</small><strong>{kwh(week.solar)}</strong></article><article className="panel stat"><small>{gridSourceLabel} semana</small><strong>{kwh(week.gridImport)}</strong></article><article className="panel stat"><small>Consumo mes</small><strong>{kwh(month.load)}</strong></article><article className="panel stat"><small>Solar mes</small><strong>{kwh(month.solar)}</strong></article><article className="panel stat"><small>{gridSourceLabel} mes</small><strong>{kwh(month.gridImport)}</strong></article>{profile.gridConnected&&<article className="panel stat"><small>Red exportada mes</small><strong>{kwh(month.gridExport)}</strong></article>}<article className="panel stat"><small>Carga batería mes</small><strong>{kwh(month.charge)}</strong></article><article className="panel stat"><small>Descarga batería mes</small><strong>{kwh(month.discharge)}</strong></article></section>
      </section>}

      {page==='solar'&&<SolarForecastPage actual={projectionActual} hourlyActual={history} liveData={realtime} weather={weather} model={solarModel} deviceSn={selected} siteLabel={siteLabel} siteKey={profile.key} storedForecast={storedForecast}/>}

      {page==='costs'&&<CostsPage key={selected} deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel} today={today} week={week} currentMonth={month} tariff={tariff} onTariffChange={value=>{setTariff(value);localStorage.setItem(siteStorageKey('tariffCLP',device?.nickName||''),String(value))}}/>}

      {page==='equipment'&&<EquipmentPage deviceSn={selected} siteLabel={siteLabel} realtime={realtime} summary={summary} gridLabel={gridSourceLabel} today={today} week={week} month={month} lastSectionUpdate={lastSectionUpdate} quality={quality} solarModel={solarModel}/>}
      {page==='programming'&&(source==='watchpower'?<section className="panel provider-readonly-notice"><h2>WatchPower: solo lectura</h2><p>La programación conocida puede consultarse, pero no se enviará ningún comando. Para editar la programación, seleccione i.Solar.</p></section>:<ProgrammingPage deviceSn={selected} siteLabel={siteLabel} currentTime={clock} tomorrowDate={tomorrowDate} tomorrowForecast={forecastTomorrow}/>)}
      {page==='integrations'&&<IntegrationsPage siteLabel={siteLabel} siteId={selectedProviderSite?.id} mode="domotics"/>}
      {page==='water'&&waterEnabled&&<WaterCostsPage key={selected} deviceSn={selected} siteLabel={siteLabel}/>}
      {page==='users'&&showUsers&&<UsersPage siteLabel={siteLabel} siteId={selectedProviderSite?.id}/>}
      {page==='family'&&showFamily&&<FamilyFinancePage/>}
    </main>
    <MobileNav page={page} setPage={setPage} waterEnabled={waterEnabled} showUsers={showUsers} showFamily={showFamily} allowedMenus={allowedMenus}/>
  </div>;
}
