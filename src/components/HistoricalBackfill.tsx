import { useState } from 'react';
import { CloudDownload, Database } from 'lucide-react';
import type { Device, HistoryRow } from '../types';
import { api } from '../services/api';
import { chileSiteRangeApiRange, formatSiteDate } from '../utils/energy';
import { siteProfile } from '../utils/site';

const addDays=(date:string,days:number)=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)};
const oneYearAgo=(date:string)=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y-1,m-1,d)).toISOString().slice(0,10)};

export default function HistoricalBackfill({devices}:{devices:Device[]}){
  const [active,setActive]=useState('');
  const [progress,setProgress]=useState<Record<string,string>>({});

  async function importDevice(device:Device){
    const profile=siteProfile(device.nickName||'');
    const end=addDays(formatSiteDate(),1);
    const start=profile.key==='arrayan'?'2026-07-01':oneYearAgo(formatSiteDate());
    const ranges:{start:string;end:string}[]=[];
    for(let cursor=start;cursor<end;){const next=addDays(cursor,14)<end?addDays(cursor,14):end;ranges.push({start:cursor,end:next});cursor=next;}
    setActive(device.deviceSn);
    let samples=0;let warnings=0;
    for(let index=0;index<ranges.length;index+=1){
      const range=chileSiteRangeApiRange(ranges[index].start,ranges[index].end);
      setProgress(previous=>({...previous,[device.deviceSn]:`Bloque ${index+1} de ${ranges.length} · ${samples.toLocaleString('es-CL')} muestras guardadas`}));
      try{const result=await api<{list:HistoryRow[];truncated?:boolean}>(`devices/${device.deviceSn}/history?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}&maxPages=50`);samples+=result.list?.length||0;if(result.truncated)warnings+=1;}
      catch{warnings+=1;}
    }
    setProgress(previous=>({...previous,[device.deviceSn]:`${samples.toLocaleString('es-CL')} muestras procesadas${warnings?` · ${warnings} bloques requieren reintento`:''}`}));
    setActive('');
  }

  return <section className="panel backfill-panel"><header><div><small>Respaldo permanente</small><h2><Database size={21}/> Carga histórica desde Tumcapp</h2></div><p>El Arrayán desde julio de 2026 · Puerto Montt últimos 12 meses</p></header><div className="backfill-devices">{devices.map(device=>{const profile=siteProfile(device.nickName||'');const isActive=active===device.deviceSn;return <article key={device.deviceSn}><div><strong>{device.nickName||profile.shortLabel}</strong><small>{profile.key==='arrayan'?'Desde 1 de julio de 2026':'Últimos 12 meses completos'}</small>{progress[device.deviceSn]&&<em>{progress[device.deviceSn]}</em>}</div><button type="button" disabled={Boolean(active)} onClick={()=>importDevice(device)}><CloudDownload size={17}/>{isActive?'Descargando…':'Descargar y respaldar'}</button></article>})}</div></section>;
}
