import { api } from './api';
export type WeatherData={temperature?:number;humidity?:number;weatherCode?:number;windSpeed?:number;isDay?:number};
export async function fetchWeather(site:string){
 const s=site.toLowerCase();
 const lat=s.includes('puerto')?-41.4693:-33.347;
 const lon=s.includes('puerto')?-72.9424:-70.515;
 try{return await api<WeatherData>(`weather?lat=${lat}&lon=${lon}`)}catch{return {}}
}
