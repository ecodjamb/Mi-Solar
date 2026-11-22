import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Sun } from 'lucide-react';
import MonitorView from './MonitorView';
import type { Device, HistoryRow, Realtime } from '../types';
import { dailyEnergy, formatClock, formatDate, inverterOutputPriority } from '../utils/energy';
import { ARRAYAN_BATTERY_BANK, ARRAYAN_INVERTER } from '../utils/equipmentElectrical';
import { siteProfile } from '../utils/site';

type PublicMonitorSite={
  id:number;
  key:string;
  name:string;
  available:boolean;
  provider?:'isolar'|'watchpower';
  sampledAt?:string|null;
  realtime:Realtime;
  history:HistoryRow[];
  forecastTodayKwh:number|null;
};
type PublicMonitorPayload={
  readOnly:true;
  generatedAt:string;
  date:string;
  refreshAfterSeconds:number;
  sites:PublicMonitorSite[];
};

function sampleAgeMs(site:PublicMonitorSite){
  const parsed=Date.parse(String(site.sampledAt||site.realtime.currentTime||''));
  return Number.isFinite(parsed)?Math.max(0,Date.now()-parsed):Number.POSITIVE_INFINITY;
}

export default function PublicMonitorApp(){
  const [payload,setPayload]=useState<PublicMonitorPayload|null>(null);
  const [selected,setSelected]=useState(()=>{try{return localStorage.getItem('miSolarPublicMonitorSite')||''}catch{return ''}});
  const [clock,setClock]=useState(()=>formatClock());
  const [refreshing,setRefreshing]=useState(true);
  const [error,setError]=useState('');
  const requestRef=useRef<Promise<void>|null>(null);

  const load=useCallback(async()=>{
    if(requestRef.current)return requestRef.current;
    const request=(async()=>{
      setRefreshing(true);
      try{
        const response=await fetch('/api/public/monitor',{headers:{Accept:'application/json'},credentials:'omit'});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const next=await response.json() as PublicMonitorPayload;
        if(!next?.readOnly||!Array.isArray(next.sites))throw new Error('Respuesta pública inválida.');
        setPayload(next);
        setError('');
        setSelected(current=>{
          const valid=next.sites.some(site=>site.key===current&&site.available);
          const fallback=next.sites.find(site=>site.available)?.key||next.sites[0]?.key||'';
          return valid?current:fallback;
        });
      }catch{
        setError('No fue posible leer el estado respaldado de Mi Solar.');
      }finally{
        setRefreshing(false);
        requestRef.current=null;
      }
    })();
    requestRef.current=request;
    return request;
  },[]);

  useEffect(()=>{
    document.title='Estado monitor · Mi Solar';
    void load();
    const clockTimer=window.setInterval(()=>setClock(formatClock()),1_000);
    const refreshTimer=window.setInterval(()=>void load(),60_000);
    const resume=()=>{if(document.visibilityState==='visible')void load()};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('online',resume);
    return()=>{
      window.clearInterval(clockTimer);
      window.clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('online',resume);
    };
  },[load]);

  useEffect(()=>{if(selected)try{localStorage.setItem('miSolarPublicMonitorSite',selected)}catch{/* El monitor también funciona en navegación privada. */}},[selected]);

  const site=payload?.sites.find(item=>item.key===selected&&item.available)||payload?.sites.find(item=>item.available);
  const devices=useMemo<Device[]>(()=>payload?.sites.filter(item=>item.available).map(item=>({deviceSn:item.key,nickName:item.name,onlineStatus:sampleAgeMs(item)<=15*60_000?1:0}))||[],[payload]);
  const profile=siteProfile(site?.name||'');
  const today=useMemo(()=>({...dailyEnergy(site?.history||[]),date:payload?.date||''}),[site?.history,payload?.date]);

  if(!payload||!site){
    return <main className="public-monitor-state">
      <div><span><Sun/></span><small>Mi Solar · acceso público</small><h1>Estado monitor</h1>
        {error?<><AlertTriangle/><p>{error}</p><button type="button" onClick={()=>void load()}><RefreshCw/> Reintentar</button></>:<><RefreshCw className="spin"/><p>Preparando la última información respaldada…</p></>}
      </div>
    </main>;
  }

  const liveStatus=sampleAgeMs(site)<=15*60_000?'En línea':'Dato atrasado';
  const priority=inverterOutputPriority(site.realtime);
  return <MonitorView
    devices={devices}
    selected={site.key}
    onSelect={setSelected}
    clock={clock}
    lastDataLabel={formatDate(site.sampledAt||site.realtime.currentTime)}
    liveStatus={liveStatus}
    refreshing={refreshing}
    onRefresh={()=>void load()}
    onClose={()=>{window.location.href='/'}}
    data={site.realtime}
    history={site.history}
    today={today}
    gridLabel={profile.gridConnected?'Red activa':'Generador'}
    pvCount={profile.key==='arrayan'?2:1}
    outputPriority={priority==='—'?null:priority}
    batteryBank={profile.key==='arrayan'?ARRAYAN_BATTERY_BANK:null}
    inverterProfile={profile.key==='arrayan'?ARRAYAN_INVERTER:null}
    forecastTodayKwh={site.forecastTodayKwh}
  />;
}
