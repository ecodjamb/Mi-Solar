import crypto from 'node:crypto';

const REGION_HOSTS = { us:'https://openapi.tuyaus.com', eu:'https://openapi.tuyaeu.com', cn:'https://openapi.tuyacn.com', in:'https://openapi.tuyain.com' };
let tokenCache = null;
let tokenPromise = null;

export function tuyaConfiguration(){
  const region=String(process.env.TUYA_API_REGION||'').trim().toLowerCase();
  const clientId=String(process.env.TUYA_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.TUYA_CLIENT_SECRET||'').trim();
  const uid=String(process.env.TUYA_USER_UID||'').trim();
  return {configured:Boolean(clientId&&clientSecret&&uid&&REGION_HOSTS[region]),region,uid,clientId,clientSecret,host:REGION_HOSTS[region]||''};
}

export function canonicalQuery(query={}){
  const encode=value=>encodeURIComponent(String(value)).replace(/%2C/gi,',');
  return Object.entries(query).filter(([,v])=>v!==undefined&&v!==null&&v!=='').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=${encode(v)}`).join('&');
}

export function signTuyaRequest({clientId,clientSecret,accessToken='',method='GET',path,query={},body='',timestamp,nonce=''}){
  const qs=canonicalQuery(query);const target=qs?`${path}?${qs}`:path;
  const contentHash=crypto.createHash('sha256').update(body||'','utf8').digest('hex');
  const stringToSign=`${method.toUpperCase()}\n${contentHash}\n\n${target}`;
  return crypto.createHmac('sha256',clientSecret).update(`${clientId}${accessToken}${timestamp}${nonce}${stringToSign}`,'utf8').digest('hex').toUpperCase();
}

async function rawTuyaRequest(path,{method='GET',query={},body,accessToken=''}={}){
  const config=tuyaConfiguration();
  if(!config.configured){const error=new Error('La integración Tuya todavía no está configurada en el servidor.');error.status=503;throw error}
  const timestamp=String(Date.now()),nonce=crypto.randomUUID(),encodedBody=body==null?'':JSON.stringify(body),qs=canonicalQuery(query);
  const sign=signTuyaRequest({clientId:config.clientId,clientSecret:config.clientSecret,accessToken,method,path,query,body:encodedBody,timestamp,nonce});
  const response=await fetch(`${config.host}${path}${qs?`?${qs}`:''}`,{method,headers:{client_id:config.clientId,sign,t:timestamp,nonce,sign_method:'HMAC-SHA256',...(accessToken?{access_token:accessToken}:{}),...(encodedBody?{'Content-Type':'application/json'}:{}),Accept:'application/json'},body:encodedBody||undefined,signal:AbortSignal.timeout(15000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.success===false){const error=new Error(payload.msg||`Tuya respondió HTTP ${response.status}`);error.status=response.status>=400?response.status:502;error.tuyaCode=payload.code;throw error}
  return payload;
}

async function accessToken(){
  if(tokenCache?.value&&tokenCache.expiresAt>Date.now()+60_000)return tokenCache.value;
  if(tokenPromise)return tokenPromise;
  tokenPromise=(async()=>{
    const payload=await rawTuyaRequest('/v1.0/token',{query:{grant_type:1}}),result=payload.result||{};
    if(!result.access_token)throw new Error('Tuya no devolvió un token de acceso.');
    tokenCache={value:result.access_token,expiresAt:Date.now()+Math.max(60,Number(result.expire_time||3600))*1000};
    return tokenCache.value;
  })();
  try{return await tokenPromise}finally{tokenPromise=null}
}

export async function tuyaRequest(path,options={}){
  let token=await accessToken();
  try{return await rawTuyaRequest(path,{...options,accessToken:token})}catch(error){if(!['1004','1010','1011','1012'].includes(String(error.tuyaCode||'')))throw error;tokenCache=null;token=await accessToken();return rawTuyaRequest(path,{...options,accessToken:token})}
}

function rowsFrom(payload){
  const result=payload?.result||{};
  return Array.isArray(result)?result:(result.list||result.devices||[]);
}

async function projectDeviceRows(){
  const all=[];
  let lastId='';
  for(let page=0;page<10;page+=1){
    const payload=await tuyaRequest('/v2.0/cloud/thing/device',{query:{page_size:20,last_id:lastId}}),rows=rowsFrom(payload);
    all.push(...rows);
    const next=String(rows.at(-1)?.id||'');
    if(rows.length<20||!next||next===lastId)break;
    lastId=next;
  }
  return all;
}

async function associatedDeviceRows(){
  const all=[];
  let lastRowKey='';
  for(let page=0;page<10;page+=1){
    const payload=await tuyaRequest('/v1.0/iot-01/associated-users/devices',{query:{size:100,last_row_key:lastRowKey}}),result=payload.result||{},rows=rowsFrom(payload);
    all.push(...rows);
    const next=String(result.last_row_key||'');
    if(!result.has_more||!next||next===lastRowKey)break;
    lastRowKey=next;
  }
  return all;
}

async function configuredUserRows(){
  const {uid}=tuyaConfiguration();
  const payload=await tuyaRequest(`/v1.0/users/${encodeURIComponent(uid)}/devices`,{query:{page_no:1,page_size:100}});
  return rowsFrom(payload);
}

function combineRows(groups){
  const devices=new Map();
  for(const group of groups)for(const row of group){const id=row.id||row.device_id;if(id)devices.set(id,{...(devices.get(id)||{}),...row})}
  return [...devices.values()];
}

async function attachStatuses(devices){
  const byId=new Map();
  for(let index=0;index<devices.length;index+=20){
    const ids=devices.slice(index,index+20).map(device=>device.id).filter(Boolean);
    if(!ids.length)continue;
    try{
      const payload=await tuyaRequest('/v1.0/iot-03/devices/status',{query:{device_ids:ids.join(',')}});
      for(const row of Array.isArray(payload.result)?payload.result:[])byId.set(row.id,Array.isArray(row.status)?row.status:[]);
    }catch(error){console.warn('[tuya/devices] estados masivos no disponibles',{code:String(error?.tuyaCode||''),message:String(error?.message||error)})}
  }
  return devices.map(device=>({...device,status:byId.get(device.id)||device.status||[]}));
}

export async function listTuyaDevices(){
  const groups=[],counts={project:null,associated:null,user:null};
  let firstError=null;
  for(const [name,load] of [['project',projectDeviceRows],['associated',associatedDeviceRows],['user',configuredUserRows]]){
    try{const rows=await load();groups.push(rows);counts[name]=rows.length}
    catch(error){firstError||=error;console.warn('[tuya/devices] fuente no disponible',{source:name,code:String(error?.tuyaCode||''),message:String(error?.message||error)})}
  }
  const rows=combineRows(groups);
  if(!groups.length||(!rows.length&&firstError))throw firstError||new Error('Tuya no permitió consultar los dispositivos vinculados.');
  console.info('[tuya/devices] inventario combinado',{...counts,total:rows.length});
  const base=rows.map(d=>({id:d.id||d.device_id,name:d.customName||d.name||d.device_name||'Dispositivo Tuya',category:d.category||d.category_code||'',productName:d.productName||d.product_name||'',online:Boolean(d.isOnline??d.online),icon:d.icon||'',status:Array.isArray(d.status)?d.status:[]}));
  return attachStatuses(base);
}

export async function getTuyaDevice(deviceId){
  if(!/^[A-Za-z0-9_-]{4,64}$/.test(deviceId)){const error=new Error('ID de dispositivo Tuya inválido.');error.status=400;throw error}
  const payload=await tuyaRequest(`/v1.0/devices/${encodeURIComponent(deviceId)}`);return payload.result||{};
}

export async function getTuyaDeviceProfile(deviceId){
  const device=await getTuyaDevice(deviceId);
  const payload=await tuyaRequest(`/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/specification`);
  const specification=payload.result||{};
  return {device,specification:{category:specification.category||device.category||'',functions:Array.isArray(specification.functions)?specification.functions:[],status:Array.isArray(specification.status)?specification.status:[]}};
}

export async function sendTuyaCommand(deviceId,code,value){
  const {specification}=await getTuyaDeviceProfile(deviceId);
  const fn=specification.functions.find(item=>item.code===code);
  if(!fn){const error=new Error('Esta función no está autorizada para el dispositivo.');error.status=400;throw error}
  const payload=await tuyaRequest(`/v1.0/iot-03/devices/${encodeURIComponent(deviceId)}/commands`,{method:'POST',body:{commands:[{code,value}]}});
  return Boolean(payload.result);
}
