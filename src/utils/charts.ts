import type { DailyEnergy, HistoryRow } from '../types';
import { batteryDischargePower, gridPower, loadPower, parseApiTime, pvPower } from './energy';

export function cumulativeRows(rows:HistoryRow[],selector:(row:HistoryRow)=>number){
  const sorted=[...rows].map(row=>({row,time:parseApiTime(row.currentTime??row.createTime??row.collectTime??row.dataTime??row.time)})).filter((x):x is {row:HistoryRow;time:Date}=>Boolean(x.time)).sort((a,b)=>a.time.getTime()-b.time.getTime());
  const labels:string[]=[];const values:number[]=[];let totalWh=0;
  for(let i=0;i<sorted.length;i++){
    if(i>0){const hours=(sorted[i].time.getTime()-sorted[i-1].time.getTime())/36e5;if(hours>0&&hours<=0.5){const p1=Math.max(0,selector(sorted[i-1].row));const p2=Math.max(0,selector(sorted[i].row));totalWh+=(p1+p2)/2*hours;}}
    labels.push(sorted[i].time.toLocaleTimeString('es-CL',{timeZone:'America/Santiago',hour:'2-digit',minute:'2-digit'}));values.push(Number((totalWh/1000).toFixed(3)));
  }
  return {labels,values};
}

export function cumulativeDays(days:DailyEnergy[],key:'solar'|'load'|'gridImport'){
  let total=0;return {labels:days.map(d=>new Date(`${d.date}T12:00:00`).toLocaleDateString('es-CL',{timeZone:'America/Santiago',day:'2-digit',month:'short'})),values:days.map(d=>Number((total+=d[key]).toFixed(3)))};
}

export const daySolar=(rows:HistoryRow[])=>cumulativeRows(rows,r=>pvPower(r,1)+pvPower(r,2));
export const dayLoad=(rows:HistoryRow[])=>cumulativeRows(rows,loadPower);
export const dayGrid=(rows:HistoryRow[])=>cumulativeRows(rows,r=>Math.max(0,gridPower(r)));
export const dayBattery=(rows:HistoryRow[])=>cumulativeRows(rows,batteryDischargePower);
