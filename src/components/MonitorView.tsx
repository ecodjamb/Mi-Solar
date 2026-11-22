import { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Minimize2, Monitor as MonitorIcon, RefreshCw, X } from 'lucide-react';
import SimpleEnergyFlow from './SimpleEnergyFlow';
import type { BatteryBank, InverterProfile } from './SimpleEnergyFlow';
import type { DailyEnergy, Device, HistoryRow, Realtime } from '../types';

type WakeLockSentinelLike={released:boolean;release:()=>Promise<void>;addEventListener:(type:'release',listener:()=>void)=>void};
type WakeLockNavigator=Navigator&{wakeLock?:{request:(type:'screen')=>Promise<WakeLockSentinelLike>}};
type AudioContextWindow=Window&{webkitAudioContext?:typeof AudioContext};

function silkDisplayProfile(){
  const userAgent=window.navigator.userAgent;
  const silk=/Silk\//i.test(userAgent);
  const physicalWidth=Math.round(window.screen.width*(window.devicePixelRatio||1));
  const physicalHeight=Math.round(window.screen.height*(window.devicePixelRatio||1));
  const longSide=Math.max(physicalWidth,physicalHeight);
  const shortSide=Math.min(physicalWidth,physicalHeight);
  const echoShow11=silk&&longSide>=1800&&longSide<=2040&&shortSide>=1100&&shortSide<=1280;
  return {silk,echoShow11};
}

export default function MonitorView({
  devices,selected,onSelect,clock,lastDataLabel,liveStatus,refreshing,onRefresh,onClose,
  data,history,today,gridLabel,pvCount,outputPriority,batteryBank,inverterProfile,forecastTodayKwh
}:{
  devices:Device[];selected:string;onSelect:(deviceSn:string)=>void;clock:string;
  lastDataLabel:string;liveStatus:string;refreshing:boolean;onRefresh:()=>void;onClose:()=>void;data:Realtime;history:HistoryRow[];
  today:DailyEnergy;gridLabel:string;pvCount:1|2;outputPriority:string|null;batteryBank:BatteryBank|null;
  inverterProfile:InverterProfile|null;forecastTodayKwh:number|null;
}){
  const wakeLockRef=useRef<WakeLockSentinelLike|null>(null);
  const mediaContextRef=useRef<AudioContext|null>(null);
  const mediaOscillatorRef=useRef<OscillatorNode|null>(null);
  const displayProfile=useRef(silkDisplayProfile()).current;
  const [wakeState,setWakeState]=useState<'active'|'media'|'unavailable'|'blocked'>('blocked');
  const [fullscreen,setFullscreen]=useState(Boolean(document.fullscreenElement));
  const sampleTimestamp=Date.parse(String(data.currentTime||''));
  const sampleAgeMinutes=Number.isFinite(sampleTimestamp)?Math.max(0,(Date.now()-sampleTimestamp)/60_000):Number.POSITIVE_INFINITY;
  const transmissionTone=sampleAgeMinutes>10?'is-critical':refreshing||sampleAgeMinutes>6?'is-warning':'is-fresh';

  const startMediaKeepAlive=useCallback(async()=>{
    try{
      const AudioContextConstructor=window.AudioContext||(window as AudioContextWindow).webkitAudioContext;
      if(!AudioContextConstructor)return false;
      if(!mediaContextRef.current){
        const context=new AudioContextConstructor();
        const oscillator=context.createOscillator();
        const gain=context.createGain();
        oscillator.type='sine';
        oscillator.frequency.value=30;
        gain.gain.value=.00001;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        mediaContextRef.current=context;
        mediaOscillatorRef.current=oscillator;
      }
      if(mediaContextRef.current.state==='suspended')await mediaContextRef.current.resume();
      const running=mediaContextRef.current.state==='running';
      if(running)setWakeState('media');
      return running;
    }catch{return false}
  },[]);

  const keepScreenAwake=useCallback(async()=>{
    const wakeLock=(navigator as WakeLockNavigator).wakeLock;
    if(document.visibilityState!=='visible')return false;
    if(wakeLock){
      try{
        const sentinel=await wakeLock.request('screen');
        wakeLockRef.current=sentinel;
        setWakeState('active');
        sentinel.addEventListener('release',()=>{wakeLockRef.current=null;setWakeState('blocked')});
        return true;
      }catch{/* Silk puede no implementar Screen Wake Lock aunque el sitio sea HTTPS. */}
    }
    const mediaActive=await startMediaKeepAlive();
    setWakeState(mediaActive?'media':wakeLock?'blocked':'unavailable');
    return mediaActive;
  },[startMediaKeepAlive]);

  const enterFullscreen=useCallback(async()=>{
    if(document.fullscreenElement)return;
    try{await document.documentElement.requestFullscreen({navigationUI:'hide'})}catch{/* Silk puede exigir la primera pulsación del usuario. */}
  },[]);

  useEffect(()=>{
    void keepScreenAwake();
    const resume=()=>{if(document.visibilityState==='visible'&&!wakeLockRef.current)void keepScreenAwake()};
    const fullscreenChanged=()=>setFullscreen(Boolean(document.fullscreenElement));
    const silkFullscreen=()=>{
      if(displayProfile.silk&&!document.fullscreenElement)void enterFullscreen();
      if(displayProfile.silk&&!wakeLockRef.current)void startMediaKeepAlive();
    };
    document.addEventListener('visibilitychange',resume);
    document.addEventListener('fullscreenchange',fullscreenChanged);
    if(displayProfile.silk){
      void enterFullscreen();
      document.addEventListener('pointerup',silkFullscreen);
      document.addEventListener('keydown',silkFullscreen);
    }
    return()=>{
      document.removeEventListener('visibilitychange',resume);
      document.removeEventListener('fullscreenchange',fullscreenChanged);
      document.removeEventListener('pointerup',silkFullscreen);
      document.removeEventListener('keydown',silkFullscreen);
      void wakeLockRef.current?.release().catch(()=>undefined);
      wakeLockRef.current=null;
      try{mediaOscillatorRef.current?.stop()}catch{/* El oscilador puede haberse detenido previamente. */}
      mediaOscillatorRef.current=null;
      void mediaContextRef.current?.close().catch(()=>undefined);
      mediaContextRef.current=null;
    };
  },[displayProfile.silk,enterFullscreen,keepScreenAwake,startMediaKeepAlive]);

  const toggleFullscreen=async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await enterFullscreen();
    }catch{/* El navegador puede reservar pantalla completa para su propio menú. */}
  };

  return <main className={`monitor-mode${displayProfile.silk?' is-silk':''}${displayProfile.echoShow11?' is-echo-show-11':''}`}>
    <header className="monitor-toolbar monitor-toolbar-minimal">
      <div className="monitor-minimal-status" aria-live="polite"><i className={transmissionTone} aria-label={sampleAgeMinutes>10?'Transmisión atrasada':sampleAgeMinutes>6?'Transmisión en espera':'Transmisión al día'}/><strong>{clock}</strong><small>Último dato {lastDataLabel}</small><label className="monitor-compact-site"><span>Instalación</span><select value={selected} onChange={event=>onSelect(event.target.value)}>{devices.map(device=><option key={device.deviceSn} value={device.deviceSn}>{device.nickName||device.deviceSn}</option>)}</select></label></div>
      <div className="monitor-actions">
        <button type="button" onClick={()=>void keepScreenAwake()} className={wakeState==='active'||wakeState==='media'?'is-active':''} title="Mantener la pantalla encendida"><MonitorIcon/><span>{wakeState==='active'?'Pantalla activa':wakeState==='media'?'Modo multimedia activo':wakeState==='unavailable'?'Toca para activar multimedia':'Mantener activa'}</span></button>
        <button type="button" onClick={onRefresh} disabled={refreshing} title="Actualizar el estado"><RefreshCw className={refreshing?'spin':''}/><span>Actualizar</span></button>
        <button type="button" onClick={()=>void toggleFullscreen()} title={fullscreen?'Salir de pantalla completa':'Usar pantalla completa'}>{fullscreen?<Minimize2/>:<Expand/>}<span>{fullscreen?'Restaurar':'Pantalla completa'}</span></button>
        <button type="button" className="monitor-close" onClick={onClose} title="Cerrar Estado monitor"><X/><span>Salir</span></button>
      </div>
    </header>
    {displayProfile.silk&&!fullscreen?<button type="button" className="monitor-silk-fullscreen" onClick={()=>void enterFullscreen()}><Expand/> Toca una vez para usar toda la pantalla</button>:null}
    <section className="monitor-stage">
      <div className="monitor-flow-column">
        <SimpleEnergyFlow data={data} history={history} today={today} gridLabel={gridLabel} pvCountOverride={pvCount} liveStatus={liveStatus} hideHeader presentationMode outputPriorityOverride={outputPriority} batteryBank={batteryBank} inverterProfile={inverterProfile} daySolarPotentialKwh={forecastTodayKwh}/>
      </div>
    </section>
  </main>;
}
