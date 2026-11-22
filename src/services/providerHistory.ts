import { api } from './api';
import type { HistoryRow } from '../types';

export type EnergyProvider = 'isolar'|'watchpower';

export async function fetchProviderSeries({deviceSn,provider,start,end,resolution}:{deviceSn:string;provider:EnergyProvider;start:string;end:string;resolution:'hour'|'day'}){
  const query=new URLSearchParams({start,end,resolution,provider});
  return await api<{list:HistoryRow[];provider:EnergyProvider;source:string}>(`devices/${deviceSn}/archive-series?${query.toString()}`);
}

export async function fetchProviderRawHistory({siteId,provider,start,end}:{siteId:number;provider:EnergyProvider;start:string;end:string}){
  const query=new URLSearchParams({from:start,to:end});
  const result=await api<{samples:Array<{legacy?:HistoryRow}>}>(`sites/${siteId}/providers/${provider}/history?${query.toString()}`);
  return (result.samples||[]).map(sample=>sample.legacy||{});
}
