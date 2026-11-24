import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CircleDollarSign, Download, Monitor as MonitorIcon, RefreshCw, ShieldCheck, Sun } from 'lucide-react';
import Sidebar from './components/Sidebar';
import { lazySection } from './components/lazySection';
import MobileNav from './components/MobileNav';
import KpiCard from './components/KpiCard';
import SimpleEnergyFlow from './components/SimpleEnergyFlow';
import DailyQuote from './components/DailyQuote';
import AppNotificationCenter from './components/AppNotificationCenter';
import SpecificYieldCard from './components/SpecificYieldCard';
import HomeWeatherTimeline from './components/HomeWeatherTimeline';
import HouseIllustration from './components/HouseIllustration';
import CoverageCard from './components/CoverageCard';
import DataQualityCard from './components/DataQualityCard';
import LoadCoverageBar from './components/LoadCoverageBar';
import WeatherOutlook from './components/WeatherOutlook';
import HomeDateNavigator from './components/HomeDateNavigator';
import MonitorView from './components/MonitorView';
import { api, apiFast, apiLive, apiSingle } from './services/api';
import { fetchWeather, type WeatherData } from './services/weather';
import { calibrateLegacySolarModel, calibrateSolarModel, isReliableSolarAnalysisDay, theoreticalDayKwh } from './utils/solarForecast';
import type { DailyEnergy, Device, HistoryRow, PageKey, Realtime } from './types';
import { siteProfile,siteStorageKey } from './utils/site';
import { specificYieldReferenceForDate } from './utils/specificYield';
import { ARRAYAN_BATTERY_BANK, ARRAYAN_INVERTER } from './utils/equipmentElectrical';
import { APP_VERSION, REFRESH_POLICY, SESSION_POLICY } from './config';
import { readSiteCache, writeSiteCache } from './services/siteCache';
import { needsMonthRefresh, nextProviderRefreshDelay, withCurrentDay } from './utils/refresh';
import { fetchProviderRawHistory, fetchProviderSeries } from './services/providerHistory';
import {
  batteryChargePower,batteryDischargePower,batterySoc,batteryVoltage,chileDayApiChunks,chileSiteRangeApiRange,chileWeekApiRange,clp,dailyEnergy,dataQuality,
  detectPvCount,effectiveGridPower,filterRowsForSiteDate,filterRowsForSiteMonth,filterRowsForSiteRange,formatClock,formatDate,formatSiteDate,gridFrequency,gridVoltage,solarSystemToLoadPower,solarToLoadPower,
  groupDailyEnergy,health,inverterTemperature,isEnergyBalanceCoherent,kwh,loadPower,outputFrequency,outputVoltage,parseApiTime,pvPower,siteRangeUtc,watts
} from './utils/energy';

const SESSION_IDLE_MS=SESSION_POLICY.idleMs;
const ACTIVITY_PING_MS=SESSION_POLICY.activityPingMs;
const LAST_ACTIVITY_KEY=SESSION_POLICY.storageKey;
const REFRESH_MS=REFRESH_POLICY;
type RealtimeRefreshMode='cache'|'if-stale'|'force';
const requestedPage=()=>{const value=new URLSearchParams(window.location.search).get('page');if(value==='technical')return'equipment';if(value==='charts')return'home';return(['home','ai','solar','costs','equipment','programming','integrations','water','users','family'] as PageKey[]).includes(value as PageKey)?value as PageKey:'home'};
const emptyEnergy:DailyEnergy={date:'',solar:0,pv1:0,pv2:0,load:0,grid:0,gridImport:0,gridExport:0,gridToLoad:0,charge:0,discharge:0,solarToLoad:0,batteryToLoad:0,solarToBattery:0,samples:0};
type StoredSolarForecast={date:string;forecastKwh:number;legacyForecastKwh?:number|null;radiationKwhM2:number;locked:boolean;lockedAt:string|null;rawForecastKwh?:number;accuracyFactor?:number;accuracySampleDays?:number;sourceLabel?:string;calibrationMethod?:string;referenceDate?:string|null;referenceRadiationKwhM2?:number|null;referenceEnergyKwh?:number|null};
type ForecastRevision={date:string;forecastKwh:number;legacyForecastKwh?:number|null;radiationKwhM2:number;observedAt:string};
type SolarForecastResponse={today:StoredSolarForecast|null;tomorrow:StoredSolarForecast|null;days?:StoredSolarForecast[];revisions:Record<string,ForecastRevision[]>;lockTimeChile:string;revisionIntervalHours?:number};
type LiveResponse={realtime:Realtime;summary:Realtime;partial?:boolean;receivedAt?:string;source?:string};
type ProviderName='isolar'|'watchpower';
type ProviderSite={id:number;name:string;siteKey:string;deviceSuffix:string;providers:{provider:ProviderName;enabled:boolean;status:string;lastSuccessAt:string|null;lastAttemptAt:string|null;readOnly:boolean}[]};
type ProviderCatalog={sites:ProviderSite[];defaultProvider:ProviderName};
type AppIdentity={authenticated:boolean;authRequired:boolean;user?:{id:string;username:string;displayName:string;mustChangePassword:boolean}|null;access:{role:string;permissions:string[];menus:Record<string,boolean>;actions:Record<string,boolean>}};
type HistoryRepairResult={ok:boolean;queriedProvider:boolean;reason:string;received:number;inserted:number;audit:{from:string;to:string;missingCount:number;coveragePercent:number;lookbackDays?:number;gaps?:{from:string;to:string;minutes:number}[]}};
type ForceRealtimeResponse=LiveResponse&{ok:boolean;forced:boolean;freshAfterCommand:boolean;waitedMs:number;sampledAt:string|null;archived:number};
type DayArchiveResult={ok:boolean;date:string;providerRange:{start:string;end:string};sites:{site:{id:number;name:string};received:number;saved:number;newSamples:number;truncated:boolean;audit:{coveragePercent:number;missingCount:number};analysis:{samples:number;solarKwh:number;loadKwh:number;gridImportKwh:number;batteryChargeKwh:number;batteryDischargeKwh:number;lastSampleAt:string|null}}[]};
type InverterConfigurationSummary={outputPriority?:'Utility'|'SOL'|'SBU'|null;outputPriorityObservedAt?:string|null};
const TECHNICAL_KEYS=['deviceModel','model','mainCpuFirmware','mainVersion','secondaryCpuFirmware','remoteVersion','loggerFirmware','wifiVersion','ratedOutputPowerW','ratedOutputPowerVa','mpptTrackerCount','firmwareObservedAt','batteryRedischargePercent','maximumChargeCurrent'] as const;
function preserveTechnicalFields(previous:Realtime,next:Realtime){
  const merged={...next};
  for(const key of TECHNICAL_KEYS)if((merged[key]===undefined||merged[key]===null||merged[key]==='')&&previous[key]!==undefined)merged[key]=previous[key];
  return merged;
}
const SolarForecastPage=lazySection(()=>import('./components/SolarForecastPage'));
const CostsPage=lazySection(()=>import('./components/CostsPage'));
const ProgrammingPage=lazySection(()=>import('./components/ProgrammingPage'));
const IntegrationsPage=lazySection(()=>import('./components/IntegrationsPage'));
const EquipmentPage=lazySection(()=>import('./components/EquipmentPage'));
const WaterCostsPage=lazySection(()=>import('./components/WaterCostsPage'));
const UsersPage=lazySection(()=>import('./components/UsersPage'));
const FamilyFinancePage=lazySection(()=>import('./components/FamilyFinancePage'));
const AiChatPage=lazySection(()=>import('./components/AiChatPage'));
const PowerGauge=lazySection(()=>import('./components/PowerGauge'));
const DualSolarGauge=lazySection(()=>import('./components/DualSolarGauge'));
const PvStringComparisonChart=lazySection(()=>import('./components/PvStringComparisonChart'));
const PvAccumulatedBar=lazySection(()=>import('./components/PvAccumulatedBar'));
const RecentEnergyChart=lazySection(()=>import('./components/RecentEnergyChart'));
const EnergyTimeline=lazySection(()=>import('./components/EnergyTimeline'));
const HistoryExplorer=lazySection(()=>import('./components/HistoryExplorer'));
const EnergyRangeChart=lazySection(()=>import('./components/EnergyRangeChart'));
const DailyConsumptionChart=lazySection(()=>import('./components/DailyConsumptionChart'));
const sumDays=(days:DailyEnergy[])=>days.reduce((a,d)=>({...a,solar:a.solar+d.solar,pv1:a.pv1+d.pv1,pv2:a.pv2+d.pv2,load:a.load+d.load,grid:a.grid+d.grid,gridImport:a.gridImport+d.gridImport,gridExport:a.gridExport+d.gridExport,gridToLoad:a.gridToLoad+d.gridToLoad,charge:a.charge+d.charge,discharge:a.discharge+d.discharge,solarToLoad:a.solarToLoad+d.solarToLoad,batteryToLoad:a.batteryToLoad+d.batteryToLoad,solarToBattery:a.solarToBattery+d.solarToBattery,samples:a.samples+d.samples}),{...emptyEnergy});
function EnergyPeriodCard({label,energy,tariff,gridLabel}:{label:string;energy:DailyEnergy;tariff:number;gridLabel:string}){
  return <article className="panel energy-period-card"><small>{label}</small><strong>{kwh(energy.solar)}</strong><div className="energy-period-values">
    <span><em>Solar</em><b>{kwh(energy.solar)}</b><i>{clp(energy.solar*tariff)}</i></span>
    <span><em>Consumo</em><b>{kwh(energy.load)}</b><i>{clp(energy.load*tariff)}</i></span>
    <span><em>{gridLabel}</em><b>{kwh(energy.gridImport)}</b><i>{clp(energy.gridImport*tariff)}</i></span>
  </div><p>Ahorro solar valorizado {clp(energy.solar*tariff)} · producción fotovoltaica real {kwh(energy.solar)}</p></article>;
}

function addDays(date:string,days:number){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)}
function monthChunkRanges(date:string,chunkDays=4){
  const start=`${date.slice(0,7)}-01`;
  const end=addDays(date,1);
  const ranges:{siteStart:string;siteEnd:string}[]=[];
  let cursor=start;
  while(cursor<end){const nextCandidate=addDays(cursor,chunkDays);const next=nextCandidate<end?nextCandidate:end;ranges.push({siteStart:cursor,siteEnd:next});cursor=next;}
  return ranges;
}

function expectedAccumulatedFromDay(forecastKwh:number,sunrise:string|undefined,sunset:string|undefined,clock:string){
  if(!(forecastKwh>0))return 0;
  const minutes=(value:string)=>{const match=value.match(/(?:T|^)(\d{2}):(\d{2})/);return match?Number(match[1])*60+Number(match[2]):NaN};
  const current=minutes(clock),start=minutes(sunrise||'07:00'),end=minutes(sunset||'20:00');
  if(!Number.isFinite(current)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0;
  if(current<=start)return 0;
  if(current>=end)return forecastKwh;
  const progress=(current-start)/(end-start);
  // Integral normalizada de una curva solar senoidal: evita comparar una hora
  // temprana contra la producción esperada del día completo.
  return forecastKwh*(.5-.5*Math.cos(Math.PI*progress));
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
  const [visible,setVisible]=useState(document.visibilityState==='visible');
  useEffect(()=>{const update=()=>setVisible(document.visibilityState==='visible');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update)},[]);
  const [auth,setAuth]=useState<boolean|null>(null);
  const [legacyAuth,setLegacyAuth]=useState(false);
  const [page,setPage]=useState<PageKey>(requestedPage);
  const [monitorMode,setMonitorMode]=useState(()=>new URLSearchParams(window.location.search).get('monitor')==='1');
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
  const [daySyncing,setDaySyncing]=useState(false);
  const [tariff,setTariff]=useState(250);
  const [lastFetch,setLastFetch]=useState<Date|null>(null);
  const [syncMessage,setSyncMessage]=useState('');
  const [historyMessage,setHistoryMessage]=useState('');
  const [historyRepairNotice,setHistoryRepairNotice]=useState('');
  const [historyProgress,setHistoryProgress]=useState('');
  const [weather,setWeather]=useState<WeatherData>({});
  const funMode=true;
  const [lastSectionUpdate,setLastSectionUpdate]=useState<Record<string,Date|null>>({realtime:null,day:null,week:null,month:null,weather:null,radiation:null});
  const [timelineIndex,setTimelineIndex]=useState<number|null>(null);
  const [homeDate,setHomeDate]=useState(formatSiteDate());
  const [historicalDayRows,setHistoricalDayRows]=useState<HistoryRow[]>([]);
  const [historicalDayLoading,setHistoricalDayLoading]=useState(false);
  const [peerSolar,setPeerSolar]=useState<{deviceSn:string;siteLabel:string;power:number;soc:number|null;updatedAt:Date|null}|null>(null);
  const [projectionHistory,setProjectionHistory]=useState<DailyEnergy[]>([]);
  const [rollingHistory,setRollingHistory]=useState<DailyEnergy[]>([]);
  const [rollingHistoryLoading,setRollingHistoryLoading]=useState(false);
  const [storedForecast,setStoredForecast]=useState<SolarForecastResponse|null>(null);
  const [storedOutputPriority,setStoredOutputPriority]=useState<'Utility'|'SOL'|'SBU'|null>(null);
  const [homeAnalyticsReady,setHomeAnalyticsReady]=useState(false);
  const selectedRef=useRef('');
  const sourceRef=useRef<ProviderName>('isolar');
  const historyRequestsRef=useRef(new Map<string,Promise<void>>());
  const liveRequestsRef=useRef(new Map<string,Promise<void>>());
  const historyRepairChecksRef=useRef(new Map<string,number>());
  const providerSampleAtRef=useRef(new Map<string,number>());
  const fullDayHydratedRef=useRef(new Set<string>());
  const markUpdated=(key:string)=>setLastSectionUpdate(prev=>({...prev,[key]:new Date()}));

  const siteDate=formatSiteDate();
  const weekRange=useMemo(()=>chileWeekApiRange(siteDate),[siteDate]);
  const history=useMemo(()=>filterRowsForSiteDate(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const combinedMonthRows=useMemo(()=>[...rawMonthRows.filter(row=>filterRowsForSiteDate([row],siteDate).length===0),...rawDayRows],[rawMonthRows,rawDayRows,siteDate]);
  const monthRows=useMemo(()=>filterRowsForSiteMonth(combinedMonthRows,siteDate.slice(0,7)),[combinedMonthRows,siteDate]);
  const combinedWeekRows=useMemo(()=>[...rawWeekRows.filter(row=>filterRowsForSiteDate([row],siteDate).length===0),...rawDayRows],[rawWeekRows,rawDayRows,siteDate]);
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
  const validatedRealtime=useMemo(()=>{
    if(!Object.keys(realtime).length||isEnergyBalanceCoherent(realtime))return realtime;
    return [...history].reverse().find(row=>isEnergyBalanceCoherent(row))||{};
  },[realtime,history]);
  const domoticsTelemetry=useMemo(()=>{
    const charge=Math.max(0,batteryChargePower(validatedRealtime)),discharge=Math.max(0,batteryDischargePower(validatedRealtime));
    return {
      solar_power_w:Math.max(0,pvPower(validatedRealtime,1)+pvPower(validatedRealtime,2)),
      battery_power_w:discharge-charge,
      battery_direction:charge>discharge?'charging' as const:discharge>charge?'discharging' as const:'neutral' as const,
      soc:batterySoc(validatedRealtime),
      grid_power_w:Math.max(0,effectiveGridPower(validatedRealtime))
    };
  },[validatedRealtime]);
  const displayedData=isHistoricalDay?(homeRows[timelineIndex??homeRows.length-1]||{}):timelineIndex===null?validatedRealtime:(homeRows[timelineIndex]||validatedRealtime);
  const load=loadPower(displayedData);
  const today=useMemo(()=>({...dailyEnergy(history),date:siteDate}),[history,siteDate]);
  const homeEnergy=useMemo(()=>({...dailyEnergy(homeRows),date:homeDate}),[homeRows,homeDate]);
  const pvCount:1|2=profile.key==='arrayan'?2:detectPvCount(validatedRealtime,[...history,...monthRows]);
  const quality=useMemo(()=>dataQuality(rawDayRows,siteDate),[rawDayRows,siteDate]);
  const weekDaily=useMemo(()=>withCurrentDay(groupDailyEnergy(rawWeekRows),today,weekRange.siteStart,weekRange.siteEnd),[rawWeekRows,today,weekRange.siteStart,weekRange.siteEnd]);
  const daily=useMemo(()=>withCurrentDay(groupDailyEnergy(rawMonthRows),today,`${siteDate.slice(0,7)}-01`,addDays(siteDate,1)),[rawMonthRows,today,siteDate]);
  const best=useMemo(()=>daily.reduce<DailyEnergy|null>((a,b)=>!a||b.solar>a.solar?b:a,null),[daily]);
  const week=useMemo(()=>sumDays(weekDaily),[weekDaily]);
  const month=useMemo(()=>sumDays(daily),[daily]);
  const rollingDays=useMemo(()=>{
    const byDate=new Map<string,DailyEnergy>();
    [...rollingHistory,today].forEach(day=>{if(day.date)byDate.set(day.date,day)});
    return [...byDate.values()].filter(day=>day.date>=addDays(siteDate,-364)&&day.date<=siteDate).sort((a,b)=>a.date.localeCompare(b.date));
  },[rollingHistory,today,siteDate]);
  // Fuente canónica de todos los acumulados históricos visibles. Es el
  // mismo rollup diario permanente que alimenta los gráficos inferiores; en
  // El Arrayán conserva el filtro histórico de días inválidos solicitado.
  const rollingAnalysisDays=useMemo(()=>rollingDays.filter(day=>isReliableSolarAnalysisDay(day,profile.key)),[rollingDays,profile.key]);
  const last30Days=useMemo(()=>rollingAnalysisDays.filter(day=>day.date>=addDays(siteDate,-29)),[rollingAnalysisDays,siteDate]);
  const last30=useMemo(()=>sumDays(last30Days),[last30Days]);
  const last365=useMemo(()=>sumDays(rollingAnalysisDays),[rollingAnalysisDays]);
  // La potencia instalada es inventario técnico canónico. No permitir que un
  // valor antiguo de localStorage (Puerto Montt tenía 1,845 kWp) prevalezca.
  const installedWp=profile.installedWp;
  const projectionActual=useMemo(()=>{const byDate=new Map<string,DailyEnergy>();[...projectionHistory,...daily].forEach(day=>byDate.set(day.date,day));return[...byDate.values()].filter(day=>isReliableSolarAnalysisDay(day,profile.key)).sort((a,b)=>a.date.localeCompare(b.date))},[projectionHistory,daily,profile.key]);
  const solarModel=useMemo(()=>calibrateSolarModel(projectionActual,weather.dailyRadiation||[],installedWp,today,profile.key),[projectionActual,weather.dailyRadiation,installedWp,today,profile.key]);
  const legacySolarModel=useMemo(()=>calibrateLegacySolarModel(projectionActual,weather.dailyRadiation||[],profile.key),[projectionActual,weather.dailyRadiation,profile.key]);
  const tomorrowDate=addDays(siteDate,1);
  const tomorrowRadiation=weather.dailyRadiation?.find(d=>d.date===tomorrowDate)?.shortwaveKwhM2;
  const liveForecastTomorrow=tomorrowRadiation&&tomorrowRadiation>0?theoreticalDayKwh(tomorrowRadiation,solarModel,false,tomorrowDate):null;
  const yieldReference=specificYieldReferenceForDate(profile.key,homeDate);
  const benchmarkDayKwh=yieldReference.dailyKwhPerKwp*(installedWp/1000);
  const benchmarkAccumulatedToday=expectedAccumulatedFromDay(benchmarkDayKwh,weather.sunrise,weather.sunset,clock);
  const specificYieldExpectedKwh=isHistoricalDay?benchmarkDayKwh:benchmarkAccumulatedToday;
  const todayRadiationKwhM2=weather.dailyRadiation?.find(day=>day.date===siteDate)?.shortwaveKwhM2??(storedForecast?.today?.date===siteDate?storedForecast.today.radiationKwhM2:null);
  // Debe coincidir con “Producción prevista para hoy · configuración actual”:
  // usa el corte oficial de las 22:00 cuando está bloqueado y, mientras no
  // exista ese corte, el mismo modelo calibrado de la página Radiación.
  const officialTodayForecast=storedForecast?.today?.date===siteDate?storedForecast.today.forecastKwh:null;
  const liveTodayForecast=todayRadiationKwhM2==null?null:theoreticalDayKwh(todayRadiationKwhM2,solarModel,true,siteDate);
  // Inicio y Radiación comparten una única cifra. El backend meteorológico es
  // autoritativo incluso antes del corte de las 22:00 porque incorpora más
  // variables (consenso de modelos, orientación por string, nubosidad por
  // capas, opacidad, lluvia, temperatura y viento) que el cálculo local.
  const forecastTodayKwh=officialTodayForecast??liveTodayForecast;
  const daySolarPotentialKwh=!isHistoricalDay?forecastTodayKwh:null;
  const forecastTomorrow=storedForecast?.tomorrow?.date===tomorrowDate?storedForecast.tomorrow.forecastKwh:liveForecastTomorrow;
  const realtimeSampleAt=parseApiTime(validatedRealtime.currentTime??validatedRealtime.createTime??validatedRealtime.collectTime??validatedRealtime.dataTime??validatedRealtime.time);
  const queryAgeMs=lastFetch?Date.now()-lastFetch.getTime():Infinity;
  const sampleAgeMs=realtimeSampleAt?Date.now()-realtimeSampleAt.getTime():null;
  const liveFresh=Object.keys(validatedRealtime).length>0&&queryAgeMs<=6*60_000&&(sampleAgeMs===null||sampleAgeMs<=6*60_000);
  const liveStatus=isHistoricalDay?'Sin animación':loading?'Sincronizando…':liveFresh?'En línea':Object.keys(validatedRealtime).length?'Dato atrasado':'Esperando datos';

  useEffect(()=>{if(page==='water'&&!waterEnabled)setPage('home')},[page,waterEnabled]);
  useEffect(()=>{
    let active=true;
    if(!auth||!selected){setStoredOutputPriority(null);return()=>{active=false}};
    const cacheKey=`misolar-output-priority:${selected}`;
    const cached=localStorage.getItem(cacheKey);
    setStoredOutputPriority(cached==='Utility'||cached==='SOL'||cached==='SBU'?cached:null);
    api<InverterConfigurationSummary>(`devices/${selected}/automation`).then((value)=>{
      if(!active)return;
      const next=value.outputPriority;
      if(next==='Utility'||next==='SOL'||next==='SBU'){
        setStoredOutputPriority(next);
        localStorage.setItem(cacheKey,next);
      }
    }).catch(()=>{});
    return()=>{active=false};
  },[auth,selected]);
  useEffect(()=>{
    if(page!=='home'){setHomeAnalyticsReady(false);return}
    // Los gráficos extensos están bajo el primer pliegue. Se montan después
    // para que el teléfono pinte y actualice primero el flujo instantáneo.
    const timer=window.setTimeout(()=>setHomeAnalyticsReady(true),900);
    return()=>window.clearTimeout(timer);
  },[page,selected,source]);

  async function fetchHistoryRange(sn:string,start:string,end:string,maxPages=18){
    return api<{list:HistoryRow[];total:number;truncated?:boolean;pages?:number}>(`devices/${sn}/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&maxPages=${maxPages}`);
  }

  function refreshRealtime(sn=selectedRef.current||selected,refreshMode:RealtimeRefreshMode='cache'){
    if(!sn||document.visibilityState!=='visible')return Promise.resolve();
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
        const applyResult=(result:LiveResponse,fromProvider=false,sample?:{sampled_at?:string;received_at?:string})=>{
          const sampledAt=Date.parse(String(sample?.sampled_at||''));
          if(Number.isFinite(sampledAt))providerSampleAtRef.current.set(requestKey,sampledAt);
          const incoming=result.realtime||{},incomingSummary=result.summary||incoming;
          const cached=readSiteCache(sn,provider);
          const value=preserveTechnicalFields(cached?.realtime||{},incoming);
          const summaryValue=preserveTechnicalFields(cached?.summary||cached?.realtime||{},incomingSummary);
          if(!Object.keys(value).length)return false;
          if(!isEnergyBalanceCoherent(value)){
            if(fromProvider)setSyncMessage(`${provider==='isolar'?'i.Solar':'WatchPower'} entregó una combinación de potencias físicamente inconsistente. Se descartó esa muestra y se conserva únicamente el último flujo coherente.`);
            return false;
          }
          writeSiteCache(sn,{realtime:value,summary:summaryValue},provider);
          if(selectedRef.current!==sn||sourceRef.current!==provider)return false;
          setRealtime(value);setSummary(summaryValue);setLastFetch(new Date());markUpdated('realtime');
          return true;
        };
        if(providerSite){
          // Primero se pinta la última muestra de la base propia. Esta consulta
          // no toca al proveedor y normalmente responde en cientos de ms.
          const latest=await apiFast<{legacy:Realtime|null;sample?:{sampled_at?:string;received_at?:string}}>(`sites/${providerSite.id}/providers/${provider}/latest`,{},10_000).catch(()=>null);
          if(latest?.legacy)applyResult({realtime:latest.legacy,summary:latest.legacy,receivedAt:latest.sample?.received_at,source:provider},false,latest.sample);
          if(refreshMode!=='cache'){
            const refreshPath=`sites/${providerSite.id}/providers/${provider}/refresh${refreshMode==='force'?'?force=1':''}`;
            try{
              const refreshed=await apiLive<{legacy?:Realtime|null;sample?:{sampled_at?:string;received_at?:string}}>(refreshPath,{method:'POST'});
              if(refreshed?.legacy)applyResult({realtime:refreshed.legacy,summary:refreshed.legacy,receivedAt:refreshed.sample?.received_at,source:provider},true,refreshed.sample);
            }catch(cause){originError=cause instanceof Error?cause.message:'El proveedor no respondió.'}
          }
        }else{
          applyResult(await apiLive<LiveResponse>(`devices/${sn}/live`),true);
        }
        if(selectedRef.current===sn&&sourceRef.current===provider)setSyncMessage(originError?`No se pudo consultar ${provider==='isolar'?'i.Solar':'WatchPower'} ahora: ${originError}. Se conserva la última muestra respaldada.`:'');
      }catch{
        if(selectedRef.current===sn)setSyncMessage('No se pudo actualizar ahora. La app conserva el último dato identificado como anterior y reintentará en cinco minutos o al pulsar Actualizar.');
      }finally{
        liveRequestsRef.current.delete(requestKey);
        if(selectedRef.current===sn)setLoading(false);
      }
    })();
    liveRequestsRef.current.set(requestKey,request);
    return request;
  }

  function refreshDayHistory(sn=selected){
    if(!sn||document.visibilityState!=='visible')return Promise.resolve();
    const key=`day:${sn}:${siteDate}`;
    const pending=historyRequestsRef.current.get(key);
    if(pending)return pending;
    const request=loadDayHistory(sn).finally(()=>historyRequestsRef.current.delete(key));
    historyRequestsRef.current.set(key,request);
    return request;
  }

  async function loadDayHistory(sn=selected){
    if(!sn)return;
    const provider=sourceRef.current;
    const providerSite=providerSiteFor(sn);
    const cachedDay=filterRowsForSiteDate(readSiteCache(sn,provider)?.dayRows||[],siteDate);
    const hydrationKey=`${provider}:${sn}:${siteDate}`;
    const requiresFullDay=!fullDayHydratedRef.current.has(hydrationKey);
    const chunks=chileDayApiChunks(siteDate,new Date(),6);
    const rows:HistoryRow[]=[];
    const warnings:string[]=[];
    try{
      const archiveRange=siteRangeUtc(siteDate,addDays(siteDate,1));
      const latestCached=cachedDay.map(row=>parseApiTime(row.currentTime??row.createTime??row.collectTime??row.dataTime??row.time)?.getTime()||0).reduce((a,b)=>Math.max(a,b),0);
      // La primera lectura de cada sesión siempre hidrata el día completo.
      // Antes se partía desde la última fila del caché: si ese caché tenía
      // huecos antiguos, la base ya reparada nunca volvía a entregarlos y los
      // kWh acumulados quedaban permanentemente por debajo del valor real.
      if(latestCached&&!requiresFullDay)archiveRange.start=new Date(Math.max(Date.parse(archiveRange.start),latestCached-10*60_000)).toISOString();
      if(provider==='watchpower'&&providerSite){
        const providerRows=await fetchProviderRawHistory({siteId:providerSite.id,provider,start:archiveRange.start,end:archiveRange.end});
        const dayRows=filterRowsForSiteDate(providerRows,siteDate);
        if(sourceRef.current!==provider||selectedRef.current!==sn)return;
        setRawDayRows(dayRows);
        writeSiteCache(sn,{dayRows},provider);
        fullDayHydratedRef.current.add(hydrationKey);
        markUpdated('day');
        const last=dayRows.length?parseApiTime(dayRows.at(-1)?.currentTime):null;
        const lastLabel=last?last.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'sin muestras';
        setHistoryMessage(`Día cargado desde el respaldo WatchPower · última muestra ${lastLabel}.`);
        return;
      }
      try{
        const archived=await api<{list:HistoryRow[]}>(`devices/${sn}/archive?start=${encodeURIComponent(archiveRange.start)}&end=${encodeURIComponent(archiveRange.end)}`);
        if(archived.list?.length){
          const byTime=new Map([...cachedDay,...archived.list].map(row=>[String(row.currentTime??row.createTime??row.collectTime??row.dataTime??row.time),row]));
          const archivedRows=filterRowsForSiteDate([...byTime.values()],siteDate).sort((a,b)=>(parseApiTime(a.currentTime??a.createTime)?.getTime()||0)-(parseApiTime(b.currentTime??b.createTime)?.getTime()||0));
          if(selectedRef.current!==sn)return;
          setRawDayRows(archivedRows);
          writeSiteCache(sn,{dayRows:archivedRows},provider);
          fullDayHydratedRef.current.add(hydrationKey);
          markUpdated('day');
          const lastRow=archivedRows[archivedRows.length-1];
          const last=lastRow?parseApiTime(lastRow.currentTime??lastRow.createTime??lastRow.collectTime??lastRow.dataTime??lastRow.time):null;
          const lastLabel=last?last.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'sin muestras';
          setHistoryMessage(`Día cargado desde el respaldo permanente · última muestra ${lastLabel}.`);
          return;
        }
        if(cachedDay.length)return;
      }catch{if(cachedDay.length){setHistoryMessage('No se pudo actualizar el respaldo diario; se conservan los totales anteriores.');return}}
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
      if(rows.length){setRawDayRows(rows);writeSiteCache(sn,{dayRows:rows},provider);}
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


  function refreshWeekHistory(sn=selected){
    if(!sn||document.visibilityState!=='visible')return Promise.resolve();
    const key=`week:${sn}:${siteDate}`;
    const pending=historyRequestsRef.current.get(key);
    if(pending)return pending;
    const request=loadWeekHistory(sn).finally(()=>historyRequestsRef.current.delete(key));
    historyRequestsRef.current.set(key,request);
    return request;
  }

  async function loadWeekHistory(sn=selected){
    if(!sn)return;
    const provider=sourceRef.current;
    try{
      const utc=siteRangeUtc(weekRange.siteStart,weekRange.siteEnd);
      try{
        const archived=await fetchProviderSeries({deviceSn:sn,provider,start:utc.start,end:utc.end,resolution:'hour'});
        if(archived.list?.length){if(sourceRef.current!==provider)return;setRawWeekRows(archived.list);writeSiteCache(sn,{weekRows:archived.list},provider);markUpdated('week');return}
      }catch{ /* Si el respaldo no responde, se consulta el origen. */ }
      if(provider==='watchpower'){if(sourceRef.current===provider)setRawWeekRows([]);return}
      const range=chileSiteRangeApiRange(weekRange.siteStart,weekRange.siteEnd);
      const response=await fetchHistoryRange(sn,range.start,range.end,24);
      if(response.list?.length){setRawWeekRows(response.list);writeSiteCache(sn,{weekRows:response.list},provider);}
      markUpdated('week');
      if(response.truncated)setHistoryMessage('La semana llegó parcial; se completará automáticamente en la próxima actualización.');
    }catch(error){
      setHistoryMessage(`Histórico semanal temporalmente no disponible: ${error instanceof Error?error.message:'error'}`);
    }
  }

  function refreshMonthHistory(sn=selected){
    if(!sn||document.visibilityState!=='visible')return Promise.resolve();
    const key=`month:${sn}:${siteDate}`;
    const pending=historyRequestsRef.current.get(key);
    if(pending)return pending;
    const request=loadMonthHistory(sn).finally(()=>historyRequestsRef.current.delete(key));
    historyRequestsRef.current.set(key,request);
    return request;
  }

  async function loadMonthHistory(sn=selected){
    if(!sn)return;
    const provider=sourceRef.current;
    const cached=readSiteCache(sn,provider);
    const cachedRows=filterRowsForSiteMonth(cached?.monthRows||[],siteDate.slice(0,7));
    const dates=cachedRows.map(row=>formatSiteDate(parseApiTime(row.currentTime??row.createTime) || new Date(0)));
    if(!needsMonthRefresh(siteDate,dates,cached?.monthCheckedAt))return;
    writeSiteCache(sn,{monthCheckedAt:Date.now()},provider);
    const chunks=monthChunkRanges(siteDate,4);
    const archiveRange=siteRangeUtc(chunks[0].siteStart,chunks[chunks.length-1].siteEnd);
    try{
      const archived=await fetchProviderSeries({deviceSn:sn,provider,start:archiveRange.start,end:archiveRange.end,resolution:'hour'});
      if(archived.list?.length){if(sourceRef.current!==provider)return;setRawMonthRows(archived.list);writeSiteCache(sn,{monthRows:archived.list,monthCheckedAt:Date.now()},provider);markUpdated('month');setHistoryMessage('Información energética mensual actualizada.');return}
    }catch{ /* Si el archivo no responde, se consulta el origen por bloques. */ }
    if(provider==='watchpower'){if(sourceRef.current===provider)setRawMonthRows([]);setHistoryMessage('WatchPower aún no tiene muestras respaldadas para este mes.');return}
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
    if(rows.length){setRawMonthRows(rows);writeSiteCache(sn,{monthRows:rows,monthCheckedAt:Date.now()},provider);markUpdated('month');}
    setHistoryProgress('');
    setHistoryMessage(warnings.length?`Histórico mensual parcial: ${warnings.join(', ')}.`:'Mes completo descargado y ajustado a Santiago.');
  }

  async function repairTodaySilently(sn:string){
    const providerSite=providerSiteFor(sn);
    const isolarConfigured=providerSite?.providers.some(item=>item.provider==='isolar'&&item.enabled);
    if(!providerSite||!isolarConfigured)return;
    const key=String(providerSite.id);
    const now=Date.now();
    // Una revisión por entrada o reanudación. Este margen evita que pageshow
    // y visibilitychange dupliquen la misma acción del usuario.
    if(now-(historyRepairChecksRef.current.get(key)||0)<60_000)return;
    historyRepairChecksRef.current.set(key,now);
    try{
      const result=await apiSingle<HistoryRepairResult>(`sites/${providerSite.id}/providers/isolar/history-repair`,{method:'POST'},90_000);
      if(result.inserted>0)console.info('[history/repair] Histórico reciente completado desde i.Solar.',{siteId:providerSite.id,inserted:result.inserted,coverage:result.audit.coveragePercent});
      if(result.inserted>0&&selectedRef.current===sn){
        fullDayHydratedRef.current.delete(`isolar:${sn}:${siteDate}`);
        await refreshDayHistory(sn);await refreshWeekHistory(sn);void refreshMonthHistory(sn)
      }
      if(result.ok){setHistoryRepairNotice('');return}
      if(result.reason==='manually_paused')setHistoryRepairNotice('El histórico reciente está incompleto y las consultas a i.Solar están pausadas. Se volverá a revisar una sola vez cuando ingreses nuevamente después de reanudarlas.');
      else if(result.queriedProvider)setHistoryRepairNotice('No fue posible completar toda la información de las últimas 72 horas porque i.Solar no entregó todas las muestras disponibles. Mi Solar guardó lo recuperado y volverá a comprobar una sola vez cuando ingreses nuevamente.');
      else setHistoryRepairNotice('El histórico reciente está incompleto, pero otra actualización de i.Solar estaba en curso. No se insistirá ahora; se volverá a comprobar una sola vez cuando ingreses nuevamente.');
    }catch(error){
      console.warn('[history/repair] La revisión silenciosa no pudo completarse.',{message:error instanceof Error?error.message:'error'});
      setHistoryRepairNotice('No fue posible comprobar ahora si las últimas 72 horas están completas. No se realizarán reintentos continuos; Mi Solar volverá a revisarlo una sola vez cuando ingreses nuevamente.');
    }
  }

  async function updateRealtimeNow(){
    const sn=selectedRef.current||selected;
    const provider=sourceRef.current;
    const providerSite=providerSiteFor(sn);
    if(!sn)return;
    if(provider!=='isolar'||!providerSite){
      await refreshRealtime(sn,'force');
      await refreshDayHistory(sn);
      return;
    }
    setLoading(true);setSyncMessage('Solicitando una muestra nueva directamente al inversor…');
    try{
      const result=await apiLive<ForceRealtimeResponse>(`sites/${providerSite.id}/providers/isolar/force-transmit`,{method:'POST'});
      const cached=readSiteCache(sn,'isolar');
      const value=preserveTechnicalFields(cached?.realtime||{},result.realtime||{});
      if(Object.keys(value).length&&isEnergyBalanceCoherent(value)){
        const summaryValue=preserveTechnicalFields(cached?.summary||cached?.realtime||{},result.summary||value);
        setRealtime(value);setSummary(summaryValue);setLastFetch(new Date());
        writeSiteCache(sn,{realtime:value,summary:summaryValue},'isolar');
        markUpdated('realtime');
      }
      fullDayHydratedRef.current.delete(`isolar:${sn}:${siteDate}`);
      await refreshDayHistory(sn);
      setSyncMessage(result.freshAfterCommand?'Dato instantáneo renovado desde el inversor y guardado en Mi Solar.':'i.Solar aceptó la actualización, pero todavía devolvió una muestra anterior. Se conserva el último dato válido.');
    }catch(error){
      setSyncMessage(`No fue posible forzar una muestra nueva: ${error instanceof Error?error.message:'error'}. Se conserva el último dato respaldado.`);
    }finally{setLoading(false)}
  }

  async function completeTodayNow(){
    const sn=selectedRef.current||selected;
    const providerSite=providerSiteFor(sn);
    if(!sn||!providerSite||sourceRef.current!=='isolar')return;
    setDaySyncing(true);setHistoryProgress('Consultando el día completo en horario Chile y guardando las muestras faltantes…');
    try{
      const result=await apiSingle<DayArchiveResult>(`sites/${providerSite.id}/providers/isolar/history-day`,{method:'POST'},90_000);
      const current=result.sites.find(item=>Number(item.site.id)===Number(providerSite.id))||result.sites[0];
      fullDayHydratedRef.current.delete(`isolar:${sn}:${siteDate}`);
      await refreshDayHistory(sn);
      await refreshWeekHistory(sn);
      void refreshMonthHistory(sn);
      if(current){
        setHistoryMessage(`Día ${result.date} guardado · ${current.analysis.samples} muestras · ${current.audit.coveragePercent}% de cobertura · solar ${current.analysis.solarKwh.toLocaleString('es-CL',{maximumFractionDigits:2})} kWh. Inicio, Enel, Radiación y batería fueron recalculados.`);
      }else setHistoryMessage('La descarga terminó, pero i.Solar no entregó muestras para esta instalación.');
    }catch(error){
      setHistoryMessage(`No fue posible completar el día desde i.Solar: ${error instanceof Error?error.message:'error'}. No se realizarán reintentos automáticos continuos.`);
    }finally{setHistoryProgress('');setDaySyncing(false)}
  }

  function switchDevice(sn:string){
    selectedRef.current=sn;
    setSelected(sn);
    // Nunca mostrar, ni siquiera durante la carga, el pronóstico oficial de
    // la instalación anterior. Cada sitio recupera su propio corte de las
    // 22:00 desde el backend.
    setStoredForecast(null);
    const preferred=(localStorage.getItem(`misolar-provider:${sn}`) as ProviderName)||'isolar';
    const configured=providerSiteFor(sn)?.providers.find(item=>item.provider===preferred)?.enabled;
    sourceRef.current=configured?preferred:'isolar';setSource(sourceRef.current);
    const cached=readSiteCache(sn,sourceRef.current);
    const cachedRealtimeAvailable=Boolean(cached?.realtimeSavedAt&&isEnergyBalanceCoherent(cached?.realtime||{}));
    const cachedRealtimeFresh=Boolean(cachedRealtimeAvailable&&cached?.realtimeSavedAt&&Date.now()-cached.realtimeSavedAt<=2*60_000);
    setRealtime(cachedRealtimeAvailable?cached?.realtime||{}:{});setSummary(cachedRealtimeAvailable?cached?.summary||{}:{});
    setRawDayRows(cached?.dayRows||[]);setRawWeekRows(cached?.weekRows||[]);setRawMonthRows(cached?.monthRows||[]);
    setSyncMessage(cachedRealtimeFresh?'Verificando el último dato con el inversor…':'Sincronizando datos actuales con el inversor…');
    setHistoryMessage('');setHistoryRepairNotice('');setHistoryProgress('');setWeather({});setLastFetch(cachedRealtimeFresh&&cached?.realtimeSavedAt?new Date(cached.realtimeSavedAt):null);
    setTimelineIndex(null);
    setProjectionHistory([]);
    setHomeDate(formatSiteDate());setHistoricalDayRows([]);
    // El flujo visible siempre entra primero. La reparación histórica comienza
    // después y nunca vuelve a dejar el diagrama esperando hasta 90 segundos.
    void refreshAll(sn,'if-stale');
    window.setTimeout(()=>void repairTodaySilently(sn),10_000);
  }

  async function refreshAll(sn=selected,refreshMode:RealtimeRefreshMode='cache'){
    if(!sn)return;
    setSyncMessage('');
    // La lectura viva se atiende primero; los tres rangos históricos son
    // independientes y se completan en paralelo desde la base propia.
    await refreshRealtime(sn,refreshMode);
    void Promise.allSettled([refreshDayHistory(sn),refreshWeekHistory(sn),refreshMonthHistory(sn)]);
  }

  function switchProvider(provider:ProviderName){
    if(provider===sourceRef.current)return;
    sourceRef.current=provider;setSource(provider);localStorage.setItem(`misolar-provider:${selected}`,provider);
    const cached=readSiteCache(selected,provider);
    setRealtime(cached?.realtime||{});setSummary(cached?.summary||{});setRawDayRows(cached?.dayRows||[]);setRawWeekRows(cached?.weekRows||[]);setRawMonthRows(cached?.monthRows||[]);setTimelineIndex(null);
    setSyncMessage(provider==='watchpower'?'Cargando exclusivamente datos de WatchPower…':'Cargando exclusivamente datos de i.Solar…');
    void refreshAll(selected,'if-stale');
  }

  useEffect(()=>{const timer=setInterval(()=>setClock(formatClock()),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{
    const boot=async()=>{
      const [identity,legacy]=await Promise.all([
        apiFast<typeof appIdentity>('app-auth/session').catch(()=>null),
        apiFast<{authenticated:boolean}>('session').catch(()=>({authenticated:false}))
      ]);
      setAppIdentity(identity);
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
    const refreshOnResume=()=>{if(document.visibilityState!=='visible')return;const sn=selectedRef.current;if(sn){void repairTodaySilently(sn);void refreshRealtime(sn,appIdentity?.authenticated?'if-stale':'cache')}};
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
  useEffect(()=>{
    if(!auth||!selected||!visible)return;
    const update=async()=>{if(document.visibilityState!=='visible')return;await refreshRealtime(selected,appIdentity?.authenticated?'if-stale':'cache');await refreshDayHistory(selected)};
    let cancelled=false;
    let timer:number|undefined;
    const run=async()=>{
      await update();
      if(cancelled)return;
      const sampledAt=providerSampleAtRef.current.get(`${selected}:${source}`);
      // La sesión abierta sigue la fase observada del proveedor: si la última
      // muestra fue xx:02:45, consulta la siguiente cerca de xx:07:55. El
      // regulador distribuido sigue impidiendo cualquier superposición.
      timer=window.setTimeout(()=>void run(),nextProviderRefreshDelay(source,sampledAt));
    };
    void run();
    return()=>{cancelled=true;if(timer!==undefined)window.clearTimeout(timer)};
  },[auth,selected,source,visible,appIdentity?.authenticated,siteDate]);
  useEffect(()=>{if(!auth||!selected||!visible)return;const t=setInterval(()=>void refreshWeekHistory(selected),REFRESH_MS.week);return()=>clearInterval(t)},[auth,selected,visible,weekRange.siteStart,weekRange.siteEnd]);
  useEffect(()=>{if(!auth||!selected||!visible)return;void refreshMonthHistory(selected);const t=setInterval(()=>void refreshMonthHistory(selected),REFRESH_MS.month);return()=>clearInterval(t)},[auth,selected,visible,siteDate]);
  useEffect(()=>{
    if(!auth||!visible||page!=='home'||!peerDevice){setPeerSolar(null);return}
    let active=true;
    const siteLabel=siteProfile(peerDevice.nickName||'').shortLabel;
    const cached=readSiteCache(peerDevice.deviceSn,'isolar')?.realtime;
    if(cached)setPeerSolar({deviceSn:peerDevice.deviceSn,siteLabel,power:pvPower(cached,1)+pvPower(cached,2),soc:Number.isFinite(batterySoc(cached))?batterySoc(cached):null,updatedAt:null});
    const loadPeerSolar=async()=>{
      if(document.visibilityState!=='visible')return;
      try{
        const peerProviderSite=providerSiteFor(peerDevice.deviceSn);
        const result=peerProviderSite
          ? await api<{legacy:Realtime|null}>(`sites/${peerProviderSite.id}/providers/isolar/latest`).then(value=>({data:value.legacy||{}}))
          : await api<{data:Realtime}>(`devices/${peerDevice.deviceSn}/realtime`);
        if(!active)return;
        const value=result.data||{};
        writeSiteCache(peerDevice.deviceSn,{realtime:value},'isolar');
        const soc=batterySoc(value);
        setPeerSolar({deviceSn:peerDevice.deviceSn,siteLabel,power:pvPower(value,1)+pvPower(value,2),soc:Number.isFinite(soc)?soc:null,updatedAt:new Date()});
      }catch{
        // Se conserva el último valor válido de la otra instalación.
      }
    };
    const initialTimer=window.setTimeout(()=>void loadPeerSolar(),4_000);
    const refreshTimer=window.setInterval(()=>void loadPeerSolar(),REFRESH_MS.realtime);
    return()=>{active=false;window.clearTimeout(initialTimer);window.clearInterval(refreshTimer)};
  },[auth,visible,page,peerDevice?.deviceSn]);
  useEffect(()=>{if(!auth||!selected||!isHistoricalDay){setHistoricalDayRows([]);return}let active=true;setHistoricalDayLoading(true);setTimelineIndex(null);const utc=siteRangeUtc(homeDate,addDays(homeDate,1));fetchProviderSeries({deviceSn:selected,provider:source,start:utc.start,end:utc.end,resolution:'hour'}).then(result=>{if(active){const rows=filterRowsForSiteDate(result.list||[],homeDate);setHistoricalDayRows(rows);setTimelineIndex(rows.length?rows.length-1:null)}}).catch(error=>active&&setHistoryMessage(`No fue posible cargar ${homeDate}: ${error instanceof Error?error.message:'error'}.`)).finally(()=>active&&setHistoricalDayLoading(false));return()=>{active=false}},[auth,selected,source,homeDate,isHistoricalDay]);
  useEffect(()=>{const start=weather.dailyRadiation?.[0]?.date;if(!auth||!selected||!start){setProjectionHistory([]);return}let active=true;const utc=siteRangeUtc(start,addDays(siteDate,1));fetchProviderSeries({deviceSn:selected,provider:source,start:utc.start,end:utc.end,resolution:'day'}).then(result=>{if(active)setProjectionHistory(groupDailyEnergy(result.list||[]))}).catch(()=>active&&setProjectionHistory([]));return()=>{active=false}},[auth,selected,source,weather.dailyRadiation?.[0]?.date,siteDate]);
  useEffect(()=>{
    if(!auth||!selected||page!=='home'||!homeAnalyticsReady){setRollingHistory([]);setRollingHistoryLoading(false);return}
    let active=true;
    const range=siteRangeUtc(addDays(siteDate,-364),addDays(siteDate,1));
    setRollingHistoryLoading(true);
    fetchProviderSeries({deviceSn:selected,provider:source,start:range.start,end:range.end,resolution:'day'})
      .then(result=>{if(active)setRollingHistory(groupDailyEnergy(result.list||[]))})
      .catch(()=>{if(active)setRollingHistory([])})
      .finally(()=>{if(active)setRollingHistoryLoading(false)});
    return()=>{active=false};
  },[auth,selected,source,page,homeAnalyticsReady,siteDate]);
  // El corte oficial pertenece a la instalación, no a cada refresco del
  // clima. Relanzar esta consulta cuando cambia weather.updatedAt cancelaba
  // la respuesta correcta y dejaba visible el cálculo vivo.
  useEffect(()=>{if(!auth||!selected){setStoredForecast(null);return}let active=true;api<SolarForecastResponse>(`devices/${selected}/solar-forecast`).then(value=>active&&setStoredForecast(value)).catch(()=>active&&setStoredForecast(null));return()=>{active=false}},[auth,selected]);
  useEffect(()=>{
    if(!auth||!visible||!device)return;
    const loadFull=()=>fetchWeather(device.nickName||'').then(data=>{setWeather({...data,error:undefined});markUpdated('weather');markUpdated('radiation')}).catch(err=>setWeather(prev=>({...prev,error:err instanceof Error?err.message:'Clima no disponible'})));
    void loadFull();
    const weatherTimer=setInterval(()=>void loadFull(),REFRESH_MS.weather);
    return()=>clearInterval(weatherTimer);
  },[auth,visible,device?.deviceSn]);

  if(auth===null)return <div className="boot">Cargando Mi Solar…</div>;
  if(!auth)return <Login done={()=>{apiFast<NonNullable<typeof appIdentity>>('app-auth/session').then(value=>{setAppIdentity(value);setAuth(value.authenticated)}).catch(()=>setAuth(false))}}/>;
  if(appIdentity?.authenticated&&appIdentity.user?.mustChangePassword)return <ChangeInitialPassword done={()=>{setAuth(false);setAppIdentity(null)}}/>;

  const setMonitor=(active:boolean)=>{
    setMonitorMode(active);
    const url=new URL(window.location.href);
    if(active)url.searchParams.set('monitor','1');else url.searchParams.delete('monitor');
    window.history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`);
  };

  if(monitorMode)return <MonitorView devices={devices} selected={selected} onSelect={switchDevice} clock={clock} lastDataLabel={formatDate(realtime.currentTime||realtime.createTime)} liveStatus={liveStatus} refreshing={loading} onRefresh={()=>void updateRealtimeNow()} onClose={()=>setMonitor(false)} data={validatedRealtime} history={history} today={today} gridLabel={gridSourceLabel} pvCount={pvCount} outputPriority={storedOutputPriority} batteryBank={profile.key==='arrayan'?ARRAYAN_BATTERY_BANK:null} inverterProfile={profile.key==='arrayan'?ARRAYAN_INVERTER:null} forecastTodayKwh={forecastTodayKwh}/>;

  const savings=homeEnergy.solar*tariff;
  const weekSavings=week.solar*tariff;
  const last30Savings=last30.solar*tariff;
  const last365Savings=last365.solar*tariff;
  const isSuperadmin=appIdentity?.authenticated===true&&appIdentity.access.role==='superadmin';
  const actionAllowed=(key:string)=>{const explicit=appIdentity?.access.actions?.[key];return Boolean(isSuperadmin||(explicit===undefined?appIdentity?.access.permissions.includes(key):explicit===true))};
  const menuAllowed=(key:PageKey,fallback:boolean)=>Boolean(isSuperadmin||(Object.prototype.hasOwnProperty.call(appIdentity?.access.menus||{},key)?appIdentity?.access.menus?.[key]===true:fallback));
  const solarView=actionAllowed('solar.view');
  const showUsers=appIdentity?.authenticated===true&&actionAllowed('users.manage')&&menuAllowed('users',false);
  const showFamily=appIdentity?.authenticated===true&&actionAllowed('family.view')&&menuAllowed('family',true);
  const allowedMenus:Partial<Record<PageKey,boolean>>={home:(menuAllowed('home',solarView)||menuAllowed('charts',false))&&solarView,charts:false,ai:menuAllowed('ai',solarView)&&solarView,solar:menuAllowed('solar',solarView)&&solarView,costs:menuAllowed('costs',solarView)&&solarView,equipment:menuAllowed('equipment',solarView)&&solarView,programming:menuAllowed('programming',solarView)&&solarView,integrations:menuAllowed('integrations',solarView)&&solarView,water:menuAllowed('water',solarView)&&solarView,family:showFamily,users:showUsers};
  const solarChrome=page!=='family'&&page!=='users'&&page!=='water';

  return <div className="shell">
    <Sidebar page={page} setPage={setPage} site={device?.nickName||'Mi instalación'} waterEnabled={waterEnabled} showUsers={showUsers} showFamily={showFamily} allowedMenus={allowedMenus} onLogout={async()=>{await Promise.allSettled([api('logout',{method:'POST'}),api('app-auth/logout',{method:'POST'})]);setAuth(false);setAppIdentity(null)}}/>
    <main className="content">
      {solarChrome&&<header className="topbar">
        <div className="source-controls"><label><small>Instalación</small><select value={selected} onChange={e=>switchDevice(e.target.value)}>{devices.map(d=><option key={d.deviceSn} value={d.deviceSn}>{d.nickName||d.deviceSn}</option>)}</select></label><label><small>Fuente instantánea</small><select value={source} onChange={e=>switchProvider(e.target.value as ProviderName)}><option value="isolar">i.Solar</option><option value="watchpower" disabled={!selectedProviderSite?.providers.find(item=>item.provider==='watchpower')?.enabled}>WatchPower{!selectedProviderSite?.providers.find(item=>item.provider==='watchpower')?.enabled?' · pendiente':''}</option></select></label><span className={`online ${liveFresh?'is-fresh':'is-stale'}`}>● {selectedProviderStatus?.status==='temporarily_blocked'?'Bloqueado temporalmente':liveStatus}</span>{source==='watchpower'&&<em className="read-only-chip">Solo lectura</em>}</div>
        <div className="time-box time-box-compact"><div><strong>{clock}</strong><span>Último dato: {formatDate(realtime.currentTime||realtime.createTime)}</span></div><small>Consulta {lastFetch?lastFetch.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}):'—'} <b>· v{APP_VERSION}</b></small></div>
        {appIdentity?.authenticated&&<button className="account-chip" onClick={()=>setPage(showUsers?'users':'integrations')} title={showUsers?'Ver usuarios y credenciales':'Ver domótica'}><ShieldCheck/><span><b>{appIdentity.user?.displayName||'Mi Solar'}</b><small>@{appIdentity.user?.username}</small></span></button>}
        {appIdentity?.authenticated?<AppNotificationCenter/>:null}
        <button className="refresh-button monitor-launch-button" onClick={()=>setMonitor(true)} title="Abrir una vista permanente y responsiva del estado del sistema"><MonitorIcon/><span>Estado monitor</span></button>
        <button className="refresh-button day-sync-button" onClick={()=>void completeTodayNow()} disabled={daySyncing||loading||source!=='isolar'||!selectedProviderSite?.providers.some(item=>item.provider==='isolar'&&item.enabled)} title="Traer el día de hoy desde i.Solar, guardar las muestras faltantes y recalcular acumulados"><Download className={daySyncing?'spin':''}/><span>{daySyncing?'Completando día…':'Completar día'}</span></button>
        <button className="refresh-button" onClick={()=>void updateRealtimeNow()} disabled={loading||daySyncing} title={source==='isolar'?'Forzar una transmisión nueva del inversor y actualizar el flujo':'Consultar WatchPower y guardar el último flujo'}><RefreshCw className={loading?'spin':''}/><span>{loading?'Actualizando flujo…':'Actualizar ahora'}</span></button>
      </header>}
      {!solarChrome&&<header className={`non-solar-context ${page==='water'?'water-context':''}`}>{page==='water'&&<span><small>Instalación</small><b>El Arrayán</b></span>}{appIdentity?.authenticated&&<div className="account-chip session-chip" title="Sesión actual de Mi Solar"><ShieldCheck/><span><b>{appIdentity.user?.displayName||'Mi Solar'}</b><small>@{appIdentity.user?.username} · sesión activa</small></span></div>}</header>}
      {solarChrome&&syncMessage&&<div className="data-warning-banner">{syncMessage}</div>}
      {solarChrome&&page!=='home'&&page!=='costs'&&historyMessage&&<div className={`data-warning-banner ${historyMessage.startsWith('Mes completo')?'history-status-ok':'history-status-warn'}`}>{historyMessage}</div>}
      {solarChrome&&historyProgress&&<div className="history-progress">{historyProgress}</div>}

      {page==='home'&&<>
        {peerDevice&&<aside className="peer-solar-strip" aria-live="polite">
          <span className="peer-solar-dot" aria-hidden="true"/>
          <span><b>{siteProfile(peerDevice.nickName||'').shortLabel}</b><small>Producción y batería</small></span>
          <strong>{peerSolar?.deviceSn===peerDevice.deviceSn?watts(peerSolar.power):'Consultando…'}<small>SOC {peerSolar?.deviceSn===peerDevice.deviceSn&&peerSolar.soc!=null?`${peerSolar.soc.toFixed(0)}%`:'—'}</small></strong>
          {peerSolar?.updatedAt&&<small>ahora</small>}
        </aside>}
        <SimpleEnergyFlow data={displayedData} history={homeRows} today={homeEnergy} gridLabel={gridSourceLabel} pvCountOverride={pvCount} historical={isHistoricalDay} dateLabel={new Date(`${homeDate}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'})} liveStatus={liveStatus} outputPriorityOverride={isHistoricalDay?null:storedOutputPriority} batteryBank={profile.key==='arrayan'?ARRAYAN_BATTERY_BANK:null} inverterProfile={profile.key==='arrayan'?ARRAYAN_INVERTER:null} daySolarPotentialKwh={daySolarPotentialKwh}/>
        {historyRepairNotice&&<div className="data-warning-banner home-history-message history-status-warn">{historyRepairNotice}</div>}
        {historyMessage&&<div className={`data-warning-banner home-history-message ${historyMessage.startsWith('Mes completo')?'history-status-ok':'history-status-warn'}`}>{historyMessage}</div>}
        {!isHistoricalDay&&<HomeWeatherTimeline weather={weather} date={siteDate} clock={clock}/>}
        <SpecificYieldCard energy={homeEnergy} installedWp={installedWp} strings={profile.strings} expectedKwh={specificYieldExpectedKwh} reference={yieldReference} isHistorical={isHistoricalDay} dateLabel={isHistoricalDay?new Date(`${homeDate}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'}):'hoy'}/>
        <PvAccumulatedBar energy={homeEnergy} title={isHistoricalDay ? `PV1 y PV2 · ${new Date(`${homeDate}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'})}` : 'PV1 y PV2 · hoy'} compact daySolarPotentialKwh={daySolarPotentialKwh}/>
        <EnergyTimeline rows={homeRows} index={timelineIndex} onChange={setTimelineIndex} historical={isHistoricalDay}/>
        <HomeDateNavigator value={homeDate} max={siteDate} loading={historicalDayLoading} onChange={date=>{setHomeDate(date);setTimelineIndex(null)}}/>
        <section className="kpi-grid home-savings-grid">
          <KpiCard icon={Sun} label="Solar acumulado del día" value={kwh(homeEnergy.solar)} detail={isHistoricalDay?`PV1 ${kwh(homeEnergy.pv1)} · PV2 ${kwh(homeEnergy.pv2)} · referencia ${benchmarkDayKwh.toFixed(2)} kWh`:`Referencia acumulada: ${benchmarkAccumulatedToday.toFixed(2)} kWh · meta diaria ${benchmarkDayKwh.toFixed(2)} kWh`} tone="solar"/>
          <KpiCard icon={CircleDollarSign} label="Ahorro del día" value={clp(savings)} detail={`Producción solar real ${kwh(homeEnergy.solar)}`} tone="green"/>
          <KpiCard icon={CircleDollarSign} label="Ahorro de la semana" value={clp(weekSavings)} detail={`Producción solar real ${kwh(week.solar)}`} tone="green"/>
          <KpiCard icon={CircleDollarSign} label="Ahorro últimos 30 días" value={clp(last30Savings)} detail={`Producción solar real ${kwh(last30.solar)}`} tone="green"/>
          <KpiCard icon={CircleDollarSign} label="Ahorro últimos 365 días" value={clp(last365Savings)} detail={`Producción solar real ${kwh(last365.solar)}`} tone="green"/>
        </section>
        <DailyQuote/>
        <LoadCoverageBar today={homeEnergy} month={month} lastUpdate={isHistoricalDay?parseApiTime(homeEnergy.lastSample):quality.last} gridLabel={gridSourceLabel} historical={isHistoricalDay}/>
        {homeAnalyticsReady&&<Suspense fallback={<section className="panel route-loading"><small>Preparando gráfico del día…</small></section>}><RecentEnergyChart rows={homeRows} siteLabel={siteLabel} gridLabel={gridSourceLabel}/></Suspense>}
        {!isHistoricalDay&&<HouseIllustration weather={weather} funMode={funMode} siteName={device?.nickName||'Casa ECO Arrayán'}/>}
        <div className="home-grid secondary-home-grid">
          <section className="panel best-card"><small>Mejor día del mes · {siteLabel}</small><strong>{best?kwh(best.solar):'—'}</strong><p>{best?new Date(`${best.date}T12:00`).toLocaleDateString('es-CL',{dateStyle:'long'}):'Aún sin histórico suficiente'}</p></section>
          <CoverageCard today={today} first={quality.first} last={quality.last} siteLabel={siteLabel}/>
          <WeatherOutlook weather={weather} locationLabel={profile.weatherLocationLabel}/>
          <section className="panel health-card"><small>Estado del sistema</small><strong>{health(validatedRealtime)}/100</strong><p>{health(validatedRealtime)>90?'Excelente · sin anomalías relevantes':'Conviene revisar algunos parámetros'}</p></section>
        </div>
        <DataQualityCard realtimeAvailable={Object.keys(validatedRealtime).length>0} daySamples={today.samples} weekSamples={week.samples} monthSamples={month.samples} weatherAvailable={weather.temperature!=null} radiationAvailable={Boolean(weather.hourly?.length||weather.dailyRadiation?.length)} updates={lastSectionUpdate}/>
      </>}

      {page==='home'&&homeAnalyticsReady&&<Suspense fallback={<section className="panel route-loading"><small>Preparando gráficos históricos…</small></section>}><section className="analytics-page home-analytics-section">
        <div className="data-warning-banner history-status-ok">Históricos desde la base permanente de Mi Solar · independientes de la sesión activa del proveedor.</div>
        <header className="analytics-title"><div><small>Análisis energético</small><h1>Gráficos y acumulados</h1><p>Todos los cortes pertenecen exclusivamente a la instalación seleccionada y usan el día calendario de Chile.</p></div><section className="instant-gauge-grid two-gauges"><article className="panel gauge-card"><small>Demanda actual</small><PowerGauge value={load} label="Consumo instantáneo"/><div className="gauge-note"><span className="safe-dot"/>normal <span className="danger-dot"/>carga alta</div></article><article className="panel gauge-card solar-gauge"><small>{pvCount===2?'Producción instantánea · PV1 y PV2':'Producción instantánea · PV1'}</small>{pvCount===2?<DualSolarGauge pv1={pvPower(validatedRealtime,1)} pv2={pvPower(validatedRealtime,2)} max={Math.max(3000,installedWp/2)}/>:<PowerGauge value={pvPower(validatedRealtime,1)} max={Math.max(3000,installedWp)} label="PV1 instantáneo" color="#efbd34"/>}</article></section></header>
        {pvCount===2&&<PvStringComparisonChart deviceSn={selected} siteLabel={siteLabel} siteKey={profile.key} provider={source}/>}
        <EnergyRangeChart deviceSn={selected} siteLabel={siteLabel} siteKey={profile.key} gridLabel={gridSourceLabel} provider={source}/>
        <DailyConsumptionChart siteLabel={siteLabel} siteKey={profile.key} provider={source} installedWp={installedWp} strings={profile.strings} tariff={tariff} dailyHistory={rollingDays} siteDate={siteDate} loading={rollingHistoryLoading}/>
        <section className="analytics-period-summary">
          <EnergyPeriodCard label="Hoy" energy={today} tariff={tariff} gridLabel={gridSourceLabel}/>
          <EnergyPeriodCard label="Esta semana" energy={week} tariff={tariff} gridLabel={gridSourceLabel}/>
          <EnergyPeriodCard label="Este mes" energy={month} tariff={tariff} gridLabel={gridSourceLabel}/>
          <EnergyPeriodCard label="Últimos 365 días" energy={last365} tariff={tariff} gridLabel={gridSourceLabel}/>
        </section>
        <HistoryExplorer deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel} provider={source}/>
        <section className="analytics-summary-grid"><article className="panel stat"><small>Consumo semana</small><strong>{kwh(week.load)}</strong></article><article className="panel stat"><small>Solar semana</small><strong>{kwh(week.solar)}</strong></article><article className="panel stat"><small>{gridSourceLabel} semana</small><strong>{kwh(week.gridImport)}</strong></article><article className="panel stat"><small>Consumo mes</small><strong>{kwh(month.load)}</strong></article><article className="panel stat"><small>Solar mes</small><strong>{kwh(month.solar)}</strong></article><article className="panel stat"><small>{gridSourceLabel} mes</small><strong>{kwh(month.gridImport)}</strong></article>{profile.gridConnected&&<article className="panel stat"><small>Red exportada mes</small><strong>{kwh(month.gridExport)}</strong></article>}<article className="panel stat"><small>Carga batería mes</small><strong>{kwh(month.charge)}</strong></article><article className="panel stat"><small>Descarga batería mes</small><strong>{kwh(month.discharge)}</strong></article></section>
      </section></Suspense>}

      <Suspense fallback={<section className="panel route-loading"><strong>Cargando sección…</strong><small>Se mostrará de inmediato el contenido guardado.</small></section>}>
        {page==='solar'&&<SolarForecastPage actual={projectionActual} hourlyActual={history} liveData={validatedRealtime} weather={weather} model={solarModel} legacyModel={legacySolarModel} deviceSn={selected} siteLabel={siteLabel} siteKey={profile.key} storedForecast={storedForecast} energyProvider={source} tariff={tariff}/>}

        {page==='ai'&&allowedMenus.ai&&<AiChatPage siteId={selectedProviderSite?.id} siteLabel={siteLabel} provider={source}/>}

        {page==='costs'&&<CostsPage key={`${selected}:${source}`} deviceSn={selected} siteLabel={siteLabel} gridLabel={gridSourceLabel} provider={source} today={today} week={week} currentMonth={month} tariff={tariff} onTariffChange={value=>{setTariff(value);localStorage.setItem(siteStorageKey('tariffCLP',device?.nickName||''),String(value))}}/>}

        {page==='equipment'&&<EquipmentPage deviceSn={selected} siteLabel={siteLabel} realtime={validatedRealtime} summary={summary} gridLabel={gridSourceLabel} today={today} week={week} month={month} lastSectionUpdate={lastSectionUpdate} quality={quality} solarModel={solarModel}/>}
        {page==='programming'&&<>{source==='watchpower'?<section className="panel provider-readonly-notice"><h2>WatchPower: solo lectura para el inversor</h2><p>Las automatizaciones de piscina pueden usar esta telemetría. Los cambios de Output y Redischarge requieren i.Solar.</p></section>:null}<ProgrammingPage deviceSn={selected} siteId={selectedProviderSite?.id} siteLabel={siteLabel} currentTime={clock} tomorrowDate={tomorrowDate} tomorrowForecast={forecastTomorrow} canManage={actionAllowed('credentials.manage')} activeProvider={source} liveTelemetry={domoticsTelemetry}/></>}
        {page==='integrations'&&<IntegrationsPage siteLabel={siteLabel} siteId={selectedProviderSite?.id} mode="domotics" activeProvider={source} liveTelemetry={domoticsTelemetry}/>}
        {page==='water'&&waterEnabled&&<WaterCostsPage key={selected} deviceSn={selected} siteLabel={siteLabel}/>}
        {page==='users'&&showUsers&&<UsersPage siteLabel={siteLabel} siteId={selectedProviderSite?.id}/>}
        {page==='family'&&showFamily&&<FamilyFinancePage key={appIdentity?.user?.id||'anonymous'} currentUserId={appIdentity?.user?.id||''}/>}
      </Suspense>
    </main>
    <MobileNav page={page} setPage={setPage} waterEnabled={waterEnabled} showUsers={showUsers} showFamily={showFamily} allowedMenus={allowedMenus}/>
  </div>;
}
