import crypto from 'node:crypto';

const REGION_HOSTS = { us:'https://openapi.tuyaus.com', eu:'https://openapi.tuyaeu.com', cn:'https://openapi.tuyacn.com', in:'https://openapi.tuyain.com' };
let tokenCache = null;

export function tuyaConfiguration(){
  const region=String(process.env.TUYA_API_REGION||'').trim().toLowerCase();
  const clientId=String(process.env.TUYA_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.TUYA_CLIENT_SECRET||'').trim();
  const uid=String(process.env.TUYA_USER_UID||'').trim();
  return {configured:Boolean(clientId&&clientSecret&&uid&&REGION_HOSTS[region]),region,uid,clientId,clientSecret,host:REGION_HOSTS[region]||''};
}

export function canonicalQuery(query={}){
  return Object.entries(query).filter(([,v])=>v!==undefined&&v!==null&&v!=='').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
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
  const payload=await rawTuyaRequest('/v1.0/token',{query:{grant_type:1}}),result=payload.result||{};
  if(!result.access_token)throw new Error('Tuya no devolvió un token de acceso.');
  tokenCache={value:result.access_token,expiresAt:Date.now()+Math.max(60,Number(result.expire_time||3600))*1000};return tokenCache.value;
}

export async function tuyaRequest(path,options={}){
  let token=await accessToken();
  try{return await rawTuyaRequest(path,{...options,accessToken:token})}catch(error){if(!['1010','1011','1012'].includes(String(error.tuyaCode||'')))throw error;tokenCache=null;token=await accessToken();return rawTuyaRequest(path,{...options,accessToken:token})}
}

export async function listTuyaDevices(){
  const {uid}=tuyaConfiguration();
  const payload=await tuyaRequest('/v1.3/iot-03/devices',{query:{source_type:'tuyaUser',source_id:uid,page_size:100}}),result=payload.result||{},rows=Array.isArray(result)?result:(result.list||result.devices||[]);
  return rows.map(d=>({id:d.id||d.device_id,name:d.name||d.device_name||'Dispositivo Tuya',category:d.category||d.category_code||'',online:Boolean(d.online),icon:d.icon||'',status:Array.isArray(d.status)?d.status:[]}));
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
