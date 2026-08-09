import { siteProfile } from '../utils/site';
import { api } from './api';

export type RadiationDay={date:string;shortwaveKwhM2:number;weatherCode?:number};
export type RadiationHour={time:string;shortwaveWm2:number;cloudCover?:number;precipitation?:number};
export type WeatherData={
 temperature?:number;humidity?:number;weatherCode?:number;windSpeed?:number;isDay?:number;
 cloudCover?:number;precipitation?:number;provider?:string;updatedAt?:string;error?:string;
 sunrise?:string;sunset?:string;hourly?:RadiationHour[];dailyRadiation?:RadiationDay[];
};

export function siteCoordinates(site:string){
 const profile=siteProfile(site);
 return {lat:profile.latitude,lon:profile.longitude,label:profile.shortLabel};
}

function normalizeOpenMeteo(payload:any, provider='Open-Meteo directo'):WeatherData{
 const c=payload.current||{};
 const hourly=(payload.hourly?.time||[]).map((time:string,i:number)=>({
  time,
  shortwaveWm2:Number(payload.hourly?.shortwave_radiation?.[i]||0),
  cloudCover:Number(payload.hourly?.cloud_cover?.[i]||0),
  precipitation:Number(payload.hourly?.precipitation?.[i]||0)
 }));
 const dailyRadiation=(payload.daily?.time||[]).map((date:string,i:number)=>({
  date,
  shortwaveKwhM2:Number(payload.daily?.shortwave_radiation_sum?.[i]||0),
  weatherCode:Number(payload.daily?.weather_code?.[i]||0)
 }));
 return {
  temperature:Number(c.temperature_2m),humidity:Number(c.relative_humidity_2m),weatherCode:Number(c.weather_code),
  windSpeed:Number(c.wind_speed_10m),isDay:Number(c.is_day),cloudCover:Number(c.cloud_cover),precipitation:Number(c.precipitation),
  sunrise:payload.daily?.sunrise?.[0],sunset:payload.daily?.sunset?.[0],hourly,dailyRadiation,provider,updatedAt:c.time||new Date().toISOString()
 };
}

async function directOpenMeteo(lat:number,lon:number):Promise<WeatherData>{
 const url=new URL('https://api.open-meteo.com/v1/forecast');
 url.searchParams.set('latitude',String(lat));url.searchParams.set('longitude',String(lon));
 url.searchParams.set('current','temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day,cloud_cover,precipitation');
 url.searchParams.set('hourly','shortwave_radiation,cloud_cover,precipitation,weather_code');
 url.searchParams.set('daily','sunrise,sunset,shortwave_radiation_sum,weather_code');
 url.searchParams.set('past_days','60');url.searchParams.set('forecast_days','14');url.searchParams.set('timezone','America/Santiago');
 const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error(`Open-Meteo directo HTTP ${response.status}`);
 return normalizeOpenMeteo(await response.json());
}

export async function fetchWeather(site:string){
 const {lat,lon}=siteCoordinates(site);
 // Open-Meteo directo funciona con CORS y evita depender de una función Netlify adicional.
 try{
  return await directOpenMeteo(lat,lon);
 }catch(directError){
  try{
   const proxied=await api<WeatherData>(`weather?lat=${lat}&lon=${lon}`);
   if(proxied.temperature!=null||proxied.hourly?.length)return {...proxied,error:undefined};
   throw new Error(proxied.error||'El proxy meteorológico respondió vacío');
  }catch(proxyError){
   throw new Error(`Clima no disponible. Directo: ${directError instanceof Error?directError.message:'error'}; proxy: ${proxyError instanceof Error?proxyError.message:'error'}`);
  }
 }
}
