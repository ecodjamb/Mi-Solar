import { useCallback, useEffect, useRef, useState } from 'react';
import { Expand, Minimize2, Monitor as MonitorIcon, RefreshCw, X } from 'lucide-react';
import SimpleEnergyFlow from './SimpleEnergyFlow';
import type { BatteryBank, InverterProfile } from './SimpleEnergyFlow';
import type { DailyEnergy, Device, HistoryRow, Realtime } from '../types';

type WakeLockSentinelLike={released:boolean;release:()=>Promise<void>;addEventListener:(type:'release',listener:()=>void)=>void};
type WakeLockNavigator=Navigator&{wakeLock?:{request:(type:'screen')=>Promise<WakeLockSentinelLike>}};

function monitorToneUrl(){
  const sampleRate=8_000;
  const seconds=2;
  const samples=sampleRate*seconds;
  const buffer=new ArrayBuffer(44+samples*2);
  const view=new DataView(buffer);
  const write=(offset:number,value:string)=>{for(let index=0;index<value.length;index+=1)view.setUint8(offset+index,value.charCodeAt(index))};
  write(0,'RIFF');
  view.setUint32(4,36+samples*2,true);
  write(8,'WAVE');
  write(12,'fmt ');
  view.setUint32(16,16,true);
  view.setUint16(20,1,true);
  view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true);
  view.setUint16(34,16,true);
  write(36,'data');
  view.setUint32(40,samples*2,true);
  for(let index=0;index<samples;index+=1){
    // 30 Hz y un nivel de un solo paso PCM: activa la canalización multimedia sin ser perceptible.
    view.setInt16(44+index*2,Math.round(Math.sin(2*Math.PI*30*index/sampleRate)),true);
  }
  return URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
}

function silkDisplayProfile(){
  const userAgent=window.navigator.userAgent;
  const silk=/Silk\//i.test(userAgent);
  const physicalWidth=Math.round(window.screen.width*(window.devicePixelRatio||1));
  const physicalHeight=Math.round(window.screen.height*(window.devicePixelRatio||1));
  const longSide=Math.max(physicalWidth,physicalHeight);
  const shortSide=Math.min(physicalWidth,physicalHeight);
  const viewportLong=Math.max(window.innerWidth,window.innerHeight);
  const viewportShort=Math.min(window.innerWidth,window.innerHeight);
  const viewportRatio=viewportShort>0?viewportLong/viewportShort:0;
  const wideSilk=silk&&viewportLong>=900&&viewportRatio>=1.45;
  const physicalEchoShow11=longSide>=1800&&longSide<=2040&&shortSide>=1050&&shortSide<=1280;
  const echoShow11=silk&&(physicalEchoShow11||(viewportLong>=1180&&viewportRatio>=1.5&&viewportRatio<=1.85));
  return {silk,wideSilk,echoShow11};
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
  const mediaRef=useRef<HTMLAudioElement|null>(null);
  const mediaUrlRef=useRef('');
  const [displayProfile,setDisplayProfile]=useState(()=>silkDisplayProfile());
  const [wakeState,setWakeState]=useState<'active'|'media'|'unavailable'|'blocked'>('blocked');
  const [fullscreen,setFullscreen]=useState(Boolean(document.fullscreenElement));
  const sampleTimestamp=Date.parse(String(data.currentTime||''));
  const sampleAgeMinutes=Number.isFinite(sampleTimestamp)?Math.max(0,(Date.now()-sampleTimestamp)/60_000):Number.POSITIVE_INFINITY;
  const transmissionTone=sampleAgeMinutes>10?'is-critical':refreshing||sampleAgeMinutes>6?'is-warning':'is-fresh';

  const startMediaKeepAlive=useCallback(async()=>{
    try{
      if(!mediaRef.current){
        const media=new Audio();
        mediaUrlRef.current=monitorToneUrl();
        media.src=mediaUrlRef.current;
        media.loop=true;
        media.preload='auto';
        media.setAttribute('playsinline','');
        media.volume=1;
        media.setAttribute('aria-hidden','true');
        media.style.display='none';
        document.body.append(media);
        mediaRef.current=media;
      }
      await mediaRef.current.play();
      const running=!mediaRef.current.paused;
      if('mediaSession' in navigator&&navigator.mediaSession){
        navigator.mediaSession.metadata=new MediaMetadata({title:'Mi Solar · Estado monitor',artist:'Mi Solar',album:'Monitor público'});
        navigator.mediaSession.playbackState=running?'playing':'paused';
        navigator.mediaSession.setActionHandler('play',()=>{void mediaRef.current?.play()});
        navigator.mediaSession.setActionHandler('pause',()=>{mediaRef.current?.pause();setWakeState('blocked')});
      }
      if(running)setWakeState('media');
      return running;
    }catch{return false}
  },[]);

  const keepScreenAwake=useCallback(async()=>{
    const wakeLock=(navigator as WakeLockNavigator).wakeLock;
    if(document.visibilityState!=='visible')return false;
    const mediaPromise=startMediaKeepAlive();
    let wakeActive=Boolean(wakeLockRef.current&&!wakeLockRef.current.released);
    if(wakeLock){
      if(!wakeActive)try{
          const sentinel=await wakeLock.request('screen');
          wakeLockRef.current=sentinel;
          wakeActive=true;
          sentinel.addEventListener('release',()=>{wakeLockRef.current=null;setWakeState(mediaRef.current&&!mediaRef.current.paused?'media':'blocked')});
        }catch{/* Silk puede no implementar Screen Wake Lock aunque el sitio sea HTTPS. */}
    }
    const mediaActive=await mediaPromise;
    setWakeState(wakeActive?'active':mediaActive?'media':wakeLock?'blocked':'unavailable');
    return wakeActive||mediaActive;
  },[startMediaKeepAlive]);

  const enterFullscreen=useCallback(async()=>{
    if(document.fullscreenElement)return;
    try{await document.documentElement.requestFullscreen({navigationUI:'hide'})}catch{/* Silk puede exigir la primera pulsación del usuario. */}
  },[]);

  useEffect(()=>{
    void keepScreenAwake();
    const resume=()=>{if(document.visibilityState==='visible')void keepScreenAwake()};
    const fullscreenChanged=()=>setFullscreen(Boolean(document.fullscreenElement));
    const silkFullscreen=()=>{
      if(displayProfile.silk&&!document.fullscreenElement)void enterFullscreen();
      if(displayProfile.silk)void keepScreenAwake();
    };
    document.addEventListener('visibilitychange',resume);
    document.addEventListener('fullscreenchange',fullscreenChanged);
    window.addEventListener('focus',resume);
    window.addEventListener('pageshow',resume);
    if(displayProfile.silk){
      void enterFullscreen();
      document.addEventListener('pointerup',silkFullscreen);
      document.addEventListener('keydown',silkFullscreen);
    }
    return()=>{
      document.removeEventListener('visibilitychange',resume);
      document.removeEventListener('fullscreenchange',fullscreenChanged);
      window.removeEventListener('focus',resume);
      window.removeEventListener('pageshow',resume);
      document.removeEventListener('pointerup',silkFullscreen);
      document.removeEventListener('keydown',silkFullscreen);
      void wakeLockRef.current?.release().catch(()=>undefined);
      wakeLockRef.current=null;
      mediaRef.current?.pause();
      mediaRef.current?.remove();
      mediaRef.current=null;
      if(mediaUrlRef.current)URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current='';
    };
  },[displayProfile.silk,enterFullscreen,keepScreenAwake]);

  useEffect(()=>{
    let frame=0;
    const updateProfile=()=>{
      window.cancelAnimationFrame(frame);
      frame=window.requestAnimationFrame(()=>setDisplayProfile(silkDisplayProfile()));
    };
    window.addEventListener('resize',updateProfile);
    window.addEventListener('orientationchange',updateProfile);
    return()=>{
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize',updateProfile);
      window.removeEventListener('orientationchange',updateProfile);
    };
  },[]);

  const toggleFullscreen=async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await enterFullscreen();
    }catch{/* El navegador puede reservar pantalla completa para su propio menú. */}
  };

  return <main className={`monitor-mode${displayProfile.silk?' is-silk':''}${displayProfile.wideSilk?' is-wide-silk':''}${displayProfile.echoShow11?' is-echo-show-11':''}`}>
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
