import { useEffect,useMemo,useState } from 'react';
import { Activity,ChevronDown,ChevronUp,Gauge,PlugZap,RefreshCw,Zap } from 'lucide-react';
import { api } from '../services/api';

type TuyaStatus={configured:boolean;region:string|null;uidHint:string|null};
type Dp={code:string;value?:unknown;type?:string;name?:string;desc?:string;values?:string};
type DailyConsumption={available:boolean;value:number|null;unit:string;code:string|null};
type Device={id:string;name:string;category:string;productName?:string;online:boolean;status:Dp[];dailyConsumption:DailyConsumption};
type Profile={device:Device&{status:Dp[]};specification:{category:string;functions:Dp[];status:Dp[]}};

const LABELS:Record<string,string>={
  switch:'Encendido',switch_1:'Encendido',switch_2:'Encendido secundario',switch_3:'Encendido 3',switch_4:'Encendido 4',switch_led:'Luz',power:'Encendido',
  countdown:'Temporizador',countdown_1:'Temporizador',countdown_2:'Temporizador secundario',child_lock:'Bloqueo infantil',fault:'Avisos',
  work_mode:'Modo de funcionamiento',mode:'Modo',fan_speed:'Velocidad del ventilador',fan_speed_enum:'Velocidad del ventilador',windspeed:'Velocidad del ventilador',
  temp_set:'Temperatura deseada',temp_current:'Temperatura actual',temperature:'Temperatura',humidity_value:'Humedad',humidity:'Humedad',
  cur_power:'Potencia actual',cur_current:'Corriente actual',cur_voltage:'Voltaje actual',add_ele:'Energía consumida',energy:'Energía consumida',total_energy:'Energía total',
  total_forward_energy:'Energía total',forward_energy_total:'Energía total',ele_usage:'Consumo eléctrico',electricity:'Electricidad',
  bright_value:'Brillo',bright_value_v2:'Brillo',colour_data:'Color',colour_data_v2:'Color',light:'Luz',switch_horizontal:'Oscilación horizontal',switch_vertical:'Oscilación vertical',
  battery_percentage:'Batería',battery_state:'Estado de batería',charge_state:'Estado de carga',remaining_time:'Tiempo restante',eco:'Modo ahorro',sleep:'Modo noche',
  mute:'Silencio',anion:'Ionizador',cleaning:'Limpieza',filter_reset:'Reiniciar filtro',filter_life:'Vida útil del filtro',machine_state:'Estado del equipo'
};
const CATEGORIES:Record<string,string>={cz:'Enchufe',pc:'Regleta',kg:'Interruptor',dj:'Iluminación',dd:'Luz',kt:'Aire acondicionado',kfj:'Ventilador',
  wsdcg:'Sensor de temperatura y humedad',wsdcgq:'Sensor de temperatura y humedad',wk:'Termostato',dsj:'Televisor',ykq:'Control remoto',cl:'Cortina',sd:'Detector',
  rqbj:'Calefactor',fs:'Ventilador',jsq:'Humidificador',cs:'Sensor',qt:'Dispositivo inteligente'};
const ENUMS:Record<string,string>={on:'Encendido',off:'Apagado',auto:'Automático',automatic:'Automático',manual:'Manual',cold:'Frío',cool:'Frío',heat:'Calor',hot:'Calor',
  wind:'Ventilación',fan:'Ventilación',dry:'Deshumidificar',low:'Bajo',middle:'Medio',mid:'Medio',high:'Alto',sleep:'Noche',eco:'Ahorro',normal:'Normal',
  opened:'Abierto',closed:'Cerrado',opening:'Abriendo',closing:'Cerrando',charging:'Cargando',full:'Carga completa',standby:'En espera'};
const PRIORITY=['switch','switch_1','switch_led','power','work_mode','mode','temp_set','fan_speed_enum','fan_speed','windspeed','bright_value','bright_value_v2','countdown','countdown_1','child_lock'];

function parsedValues(dp:Dp){try{return JSON.parse(dp.values||'{}')}catch{return {}}}
function currentValue(profile:Profile,code:string){return profile.device.status?.find(item=>item.code===code)?.value}
function containsChinese(value:string){return /[\u3400-\u9fff]/.test(value)}
function humanize(code:string){return code.replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase())}
function label(dp:Dp){return LABELS[dp.code]||(!containsChinese(dp.name||'')&&dp.name)||humanize(dp.code)}
function categoryLabel(category:string){return CATEGORIES[category]||(!containsChinese(category)&&category)||'Dispositivo inteligente'}
function enumLabel(value:string){return ENUMS[value.toLowerCase()]||humanize(value)}
function priority(dp:Dp){const exact=PRIORITY.indexOf(dp.code);if(exact>=0)return exact;return dp.type==='Boolean'?30:dp.type==='Enum'?40:dp.type==='Integer'?50:60}
function mainSwitch(device:Device){return device.status.find(item=>typeof item.value==='boolean'&&/^(switch|power)(_|$)/.test(item.code))}
function displayValue(dp:Dp){
  if(dp.value==null)return '—';
  if(typeof dp.value==='boolean')return dp.value?'Sí':'No';
  if(typeof dp.value==='string')return enumLabel(dp.value);
  const schema=parsedValues(dp),scale=Number(schema.scale||0),unit=String(schema.unit||'').replace('℃','°C');
  if(typeof dp.value==='number')return `${(dp.value/10**scale).toLocaleString('es-CL',{maximumFractionDigits:Math.max(0,scale)})}${unit?` ${unit}`:''}`;
  return JSON.stringify(dp.value);
}

function Control({deviceId,dp,value,onDone,onError}:{deviceId:string;dp:Dp;value:unknown;onDone:()=>void;onError:(message:string)=>void}){
  const schema=parsedValues(dp),[draft,setDraft]=useState(String(value??schema.min??'')),[busy,setBusy]=useState(false);
  async function send(next:unknown){
    if(!window.confirm(`¿Confirmas cambiar “${label(dp)}” en este dispositivo?`))return;
    setBusy(true);onError('');
    try{await api(`tuya/devices/${encodeURIComponent(deviceId)}/commands`,{method:'POST',body:JSON.stringify({code:dp.code,value:next})});onDone()}
    catch(error){onError(error instanceof Error?error.message:'No se pudo cambiar el dispositivo.')}
    finally{setBusy(false)}
  }
  if(dp.type==='Boolean')return <button className={value?'tuya-switch on':'tuya-switch'} disabled={busy} onClick={()=>send(!value)}>{busy?'Enviando…':value?'Encendido':'Apagado'}</button>;
  if(dp.type==='Enum'&&Array.isArray(schema.range))return <select value={String(value??'')} disabled={busy} onChange={event=>send(event.target.value)}>{schema.range.map((item:string)=><option key={item} value={item}>{enumLabel(item)}</option>)}</select>;
  if(dp.type==='Integer')return <span className="tuya-number-control"><input aria-label={label(dp)} type="number" min={schema.min} max={schema.max} step={schema.step||1} value={draft} onChange={event=>setDraft(event.target.value)}/><button disabled={busy} onClick={()=>send(Number(draft))}>Aplicar</button></span>;
  if(dp.type==='String')return <span className="tuya-number-control"><input aria-label={label(dp)} value={draft} onChange={event=>setDraft(event.target.value)}/><button disabled={busy} onClick={()=>send(draft)}>Aplicar</button></span>;
  return <code>{displayValue({...dp,value})}</code>;
}

export default function IntegrationsPage({siteLabel}:{siteLabel:string}){
  const [tuya,setTuya]=useState<TuyaStatus|null>(null),[devices,setDevices]=useState<Device[]>([]),[selected,setSelected]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function loadDevices(){setBusy(true);setError('');try{const status=await api<TuyaStatus>('tuya/status');setTuya(status);if(status.configured){const data=await api<{devices:Device[]}>('tuya/devices');setDevices(data.devices||[])}}catch(cause){setError(cause instanceof Error?cause.message:'No se pudo consultar Tuya.')}finally{setBusy(false)}}
  async function loadProfile(id:string){setSelected(id);setProfile(null);setError('');try{const data=await api<Profile>(`tuya/devices/${encodeURIComponent(id)}/profile`);setProfile(data)}catch(cause){setError(cause instanceof Error?cause.message:'No se pudo leer el dispositivo.')}}
  useEffect(()=>{void loadDevices()},[]);
  const availableDaily=devices.filter(device=>device.dailyConsumption?.available&&device.dailyConsumption.value!=null);
  const totalDaily=availableDaily.reduce((total,device)=>total+(device.dailyConsumption.value||0),0);
  const sortedDevices=useMemo(()=>[...devices].sort((a,b)=>Number(b.online)-Number(a.online)||a.name.localeCompare(b.name,'es')),[devices]);
  const functionCodes=new Set(profile?.specification.functions.map(item=>item.code)||[]);
  const functions=[...(profile?.specification.functions||[])].sort((a,b)=>priority(a)-priority(b)||label(a).localeCompare(label(b),'es'));
  const readable=(profile?.specification.status.map(dp=>({...dp,value:currentValue(profile,dp.code)}))||[]).sort((a,b)=>priority(a)-priority(b)||label(a).localeCompare(label(b),'es'));
  return <section className="settings-page"><header className="page-heading"><div><small>Conexiones · {siteLabel}</small><h1>Integraciones</h1><p>Tuya y Smart Life reunidos, con consumo diario y controles prioritarios.</p></div><button className="refresh-button" onClick={loadDevices} disabled={busy}><RefreshCw className={busy?'spin':''}/><span>Actualizar</span></button></header>{error&&<div className="data-warning-banner">{error}</div>}
    {tuya?.configured&&<section className="panel tuya-daily-summary"><header><div><small>Resumen de hoy</small><h2>Consumo por artefacto</h2></div><strong>{availableDaily.length?`${totalDaily.toLocaleString('es-CL',{maximumFractionDigits:3})} kWh`:'Sin mediciones'}</strong></header><div className="tuya-daily-grid">{sortedDevices.map(device=><article key={device.id}><span className={device.dailyConsumption?.available?'has-energy':''}><Zap size={17}/></span><div><b>{device.name}</b><small>{device.dailyConsumption?.available?'Consumo informado por el equipo':'Este equipo no publica consumo diario'}</small></div><strong>{device.dailyConsumption?.available&&device.dailyConsumption.value!=null?`${device.dailyConsumption.value.toLocaleString('es-CL',{maximumFractionDigits:3})} kWh`:'—'}</strong></article>)}</div></section>}
    <section className="integration-grid"><article className="panel integration-card integration-ok"><PlugZap/><div><b>{tuya?.configured?'Conectadas':'Pendiente de configurar'}</b><h2>Tuya + Smart Life</h2><p>{tuya?.configured?`${devices.length} dispositivos vinculados al proyecto · servidor ${tuya.region?.toUpperCase()}.`:'Requiere las credenciales oficiales en Vercel.'}</p></div></article><article className="panel integration-card"><Activity/><div><b>{availableDaily.length?'Activo':'Según compatibilidad'}</b><h2>Medición diaria</h2><p>{availableDaily.length?`${availableDaily.length} artefactos informan energía hoy.`:'Los equipos sin medidor seguirán mostrando sus controles.'}</p></div></article></section>
    {tuya?.configured&&<section className="tuya-full-list"><div className="tuya-section-title"><div><small>Control rápido</small><h2>Todos los artefactos</h2></div><span><Gauge size={16}/> En línea primero</span></div>{sortedDevices.map(device=>{const quick=mainSwitch(device);return <article className="panel tuya-full-device" key={device.id}><div className="tuya-device-heading"><button className="tuya-expand" onClick={()=>selected===device.id?(setSelected(''),setProfile(null)):loadProfile(device.id)}><span><b>{device.name}</b><small>{categoryLabel(device.category)} · {device.online?'En línea':'Sin conexión'}</small></span></button><div className="tuya-heading-actions">{quick&&<Control deviceId={device.id} dp={{...quick,type:'Boolean'}} value={quick.value} onDone={loadDevices} onError={setError}/>}<button className="tuya-chevron" aria-label={selected===device.id?'Cerrar opciones':'Mostrar opciones'} onClick={()=>selected===device.id?(setSelected(''),setProfile(null)):loadProfile(device.id)}>{selected===device.id?<ChevronUp/>:<ChevronDown/>}</button></div></div>{selected===device.id&&<div className="tuya-options">{!profile?<p>Cargando todas las opciones…</p>:<><h3>Acciones principales</h3>{functions.length?<div className="tuya-option-grid">{functions.map(dp=><div className="tuya-option" key={dp.code}><span><b>{label(dp)}</b><small>{dp.code} · {dp.type}</small></span><Control deviceId={device.id} dp={dp} value={currentValue(profile,dp.code)} onDone={()=>loadProfile(device.id)} onError={setError}/></div>)}</div>:<p>Este equipo no publica controles compatibles.</p>}<details className="tuya-all-status"><summary>Ver todos los estados y sensores</summary><div className="tuya-option-grid">{readable.map(dp=><div className="tuya-option" key={dp.code}><span><b>{label(dp)}</b><small>{dp.code}{functionCodes.has(dp.code)?' · Controlable':''}</small></span><code>{displayValue(dp)}</code></div>)}</div></details></>}</div>}</article>})}</section>}
  </section>;
}
