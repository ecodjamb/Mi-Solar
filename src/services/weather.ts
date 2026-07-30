import { api } from './api';

export type RadiationDay={date:string;shortwaveKwhM2:number;weatherCode?:number};
export type RadiationHour={time:string;shortwaveWm2:number;cloudCover?:number;precipitation?:number};
export type WeatherData={
 temperature?:number;humidity?:number;weatherCode?:number;windSpeed?:number;isDay?:number;
 cloudCover?:number;precipitation?:number;provider?:string;updatedAt?:string;error?:string;
 sunrise?:string;sunset?:string;hourly?:RadiationHour[];dailyRadiation?:RadiationDay[];
};

export function siteCoordinates(site:string){
 const s=site.toLowerCase();
 if(s.includes('puerto'))return {lat:-41.4693,lon:-72.9424,label:'Puerto Montt'};
 return {lat:-33.347,lon:-70.515,label:'El Arrayán'};
}

export async function fetchWeather(site:string){
 const {lat,lon}=siteCoordinates(site);
 return api<WeatherData>(`weather?lat=${lat}&lon=${lon}`);
}
