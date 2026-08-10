import { useEffect,useState } from 'react';
import { ChevronDown,ChevronUp,Home,PlugZap,RefreshCw } from 'lucide-react';
import { api } from '../services/api';

type TuyaStatus={configured:boolean;region:string|null;uidHint:string|null};
type Dp={code:string;value?:unknown;type?:string;name?:string;desc?:string;values?:string};
type Device={id:string;name:string;category:string;online:boolean;status:Dp[]};
type Profile={device:Device&{status:Dp[]};specification:{category:string;functions:Dp[];status:Dp[]}};

function parsedValues(dp:Dp){try{return JSON.parse(dp.values||'{}')}catch{return {}}}
function currentValue(profile:Profile,code:string){return profile.device.status?.find(item=>item.code===code)?.value}
function label(dp:Dp){return dp.name||dp.code.replaceAll('_',' ')}

function Control({deviceId,dp,value,onDone}:{deviceId:string;dp:Dp;value:unknown;onDone:()=>void}){
  const schema=parsedValues(dp),[draft,setDraft]=useState(String(value??schema.min??'')),[busy,setBusy]=useState(false);
  async function send(next:unknown){if(!window.confirm(`¿Confirmas cambiar “${label(dp)}” en este dispositivo?`))return;setBusy(true);try{await api(`tuya/devices/${encodeURIComponent(deviceId)}/commands`,{method:'POST',body:JSON.stringify({code:dp.code,value:next})});onDone()}finally{setBusy(false)}}
  if(dp.type==='Boolean')return <button className={value?'tuya-switch on':'tuya-switch'} disabled={busy} onClick={()=>send(!value)}>{value?'Encendido':'Apagado'}</button>;
  if(dp.type==='Enum'&&Array.isArray(schema.range))return <select value={String(value??'')} disabled={busy} onChange={e=>send(e.target.value)}>{schema.range.map((v:string)=><option key={v} value={v}>{dp.desc&&parsedValues({...dp,values:dp.desc})[v]||v}</option>)}</select>;
  if(dp.type==='Integer')return <span className="tuya-number-control"><input type="number" min={schema.min} max={schema.max} step={schema.step||1} value={draft} onChange={e=>setDraft(e.target.value)}/><button disabled={busy} onClick={()=>send(Number(draft))}>Aplicar</button></span>;
  if(dp.type==='String')return <span className="tuya-number-control"><input value={draft} onChange={e=>setDraft(e.target.value)}/><button disabled={busy} onClick={()=>send(draft)}>Aplicar</button></span>;
  return <code>{value==null?'—':JSON.stringify(value)}</code>;
}

export default function IntegrationsPage({siteLabel}:{siteLabel:string}){
  const [tuya,setTuya]=useState<TuyaStatus|null>(null),[devices,setDevices]=useState<Device[]>([]),[selected,setSelected]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function loadDevices(){setBusy(true);setError('');try{const status=await api<TuyaStatus>('tuya/status');setTuya(status);if(status.configured){const data=await api<{devices:Device[]}>('tuya/devices');setDevices(data.devices||[])}}catch(e){setError(e instanceof Error?e.message:'No se pudo consultar Tuya.')}finally{setBusy(false)}}
  async function loadProfile(id:string){setSelected(id);setProfile(null);setError('');try{const data=await api<Profile>(`tuya/devices/${encodeURIComponent(id)}/profile`);setProfile(data)}catch(e){setError(e instanceof Error?e.message:'No se pudo leer el dispositivo.')}}
  useEffect(()=>{void loadDevices()},[]);
  const functionCodes=new Set(profile?.specification.functions.map(item=>item.code)||[]);
  const readable=profile?.specification.status.map(dp=>({...dp,value:currentValue(profile,dp.code)}))||[];
  return <section className="settings-page"><header className="page-heading"><div><small>Conexiones · {siteLabel}</small><h1>Integraciones</h1><p>Consulta y control de todas las funciones publicadas por cada dispositivo.</p></div><button className="refresh-button" onClick={loadDevices} disabled={busy}><RefreshCw className={busy?'spin':''}/><span>Actualizar</span></button></header>{error&&<div className="data-warning-banner">{error}</div>}
    <section className="integration-grid"><article className="panel integration-card"><PlugZap/><div><b>{tuya?.configured?'Conectada':'Pendiente de configurar'}</b><h2>Tuya</h2><p>{tuya?.configured?`${devices.length} dispositivos · servidor ${tuya.region?.toUpperCase()} · usuario ${tuya.uidHint}.`:'Requiere las credenciales oficiales en Vercel.'}</p></div></article><article className="panel integration-card"><Home/><div><b>Pendiente</b><h2>Mi Casa</h2><p>Integración doméstica independiente.</p></div></article></section>
    {tuya?.configured&&<section className="tuya-full-list">{devices.map(device=><article className="panel tuya-full-device" key={device.id}><button className="tuya-device-heading" onClick={()=>selected===device.id?(setSelected(''),setProfile(null)):loadProfile(device.id)}><span><b>{device.name}</b><small>{device.category||'Tuya'} · {device.online?'En línea':'Sin conexión'}</small></span>{selected===device.id?<ChevronUp/>:<ChevronDown/>}</button>{selected===device.id&&<div className="tuya-options">{!profile?<p>Cargando todas las opciones…</p>:<><h3>Controles disponibles</h3>{profile.specification.functions.length?<div className="tuya-option-grid">{profile.specification.functions.map(dp=><div className="tuya-option" key={dp.code}><span><b>{label(dp)}</b><small>{dp.code} · {dp.type}</small></span><Control deviceId={device.id} dp={dp} value={currentValue(profile,dp.code)} onDone={()=>loadProfile(device.id)}/></div>)}</div>:<p>Este equipo no publica controles compatibles.</p>}<h3>Todos los estados y sensores</h3><div className="tuya-option-grid">{readable.map(dp=><div className="tuya-option" key={dp.code}><span><b>{label(dp)}</b><small>{dp.code} · {dp.type}{functionCodes.has(dp.code)?' · controlable':''}</small></span><code>{dp.value==null?'—':JSON.stringify(dp.value)}</code></div>)}</div></>}</div>}</article>)}</section>}
  </section>;
}
