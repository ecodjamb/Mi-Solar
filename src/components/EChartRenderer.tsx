import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Expand, Minimize2, RotateCcw, X } from 'lucide-react';
import * as echarts from 'echarts';

type ChartRecord=Record<string,unknown>;
type SelectedPoint={index:number;label:string;values:Array<{name:string;value:string;color:string}>};
const record=(value:unknown):ChartRecord=>value&&typeof value==='object'&&!Array.isArray(value)?value as ChartRecord:{};
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const firstRecord=(value:unknown)=>record(Array.isArray(value)?value[0]:value);
function pointValue(value:unknown){const raw=record(value).value??value;return Array.isArray(raw)?raw.at(-1):raw}
function displayValue(value:unknown,unit:string){const number=Number(value);if(Number.isFinite(number))return `${number.toLocaleString('es-CL',{maximumFractionDigits:3})}${unit?` ${unit}`:''}`;return value==null||value===''?'—':String(value)}

function chartMetadata(option:ChartRecord){
  const xAxis=firstRecord(option.xAxis),labels=list(xAxis.data);
  const yAxes=(Array.isArray(option.yAxis)?option.yAxis:[option.yAxis]).map(record);
  const series=list(option.series).map(record).filter(item=>['line','bar','scatter'].includes(String(item.type||''))&&list(item.data).length);
  const count=Math.max(labels.length,...series.map(item=>list(item.data).length),0);
  const select=(index:number):SelectedPoint|null=>{
    if(!count)return null;
    const safe=Math.max(0,Math.min(count-1,index)),firstSeries=series[0],fallback=pointValue(list(firstSeries?.data)[safe]);
    const label=labels[safe]??record(list(firstSeries?.data)[safe]).name??fallback??`Dato ${safe+1}`;
    const values=series.filter(item=>item.silent!==true).map(item=>{
      const color=String(record(item.itemStyle).color||record(item.lineStyle).color||'#79baff');
      const axis=yAxes[Number(item.yAxisIndex)||0]||yAxes[0]||{},unit=typeof axis.name==='string'?axis.name:'';
      return {name:String(item.name||'Valor'),value:displayValue(pointValue(list(item.data)[safe]),unit),color};
    });
    return {index:safe,label:String(label),values};
  };
  return {count,select};
}

export default function EChart({option,className='chart'}:{option:ChartRecord;className?:string}){
  const canvasRef=useRef<HTMLDivElement>(null),chartRef=useRef<echarts.ECharts|null>(null);
  const metadata=useMemo(()=>chartMetadata(option),[option]);
  const [selected,setSelected]=useState<SelectedPoint|null>(()=>metadata.select(metadata.count-1));
  const [expanded,setExpanded]=useState(false),[engaged,setEngaged]=useState(false);
  useEffect(()=>{setSelected(metadata.select(metadata.count-1));setEngaged(false)},[metadata]);
  useEffect(()=>{
    if(!canvasRef.current)return;
    const chart=echarts.init(canvasRef.current);chartRef.current=chart;
    chart.setOption({...option,aria:{enabled:true,...record(option.aria)},tooltip:{...record(option.tooltip),confine:true,show:true,showContent:false,triggerOn:'mousemove|click'},toolbox:{show:false}} as echarts.EChartsOption,true);
    const choose=(index:number)=>{const point=metadata.select(index);if(point){setSelected(point);setEngaged(true)}};
    chart.on('click',payload=>{const index=Number(payload.dataIndex);if(Number.isInteger(index))choose(index)});
    chart.on('updateAxisPointer',(payload:unknown)=>{const index=Number(record(payload).dataIndex);if(Number.isInteger(index))choose(index)});
    const observer=new ResizeObserver(()=>chart.resize());observer.observe(canvasRef.current);
    return()=>{observer.disconnect();chartRef.current=null;chart.dispose()};
  },[option,metadata]);
  useEffect(()=>{
    chartRef.current?.resize();if(!expanded)return;
    const original=document.body.style.overflow;document.body.style.overflow='hidden';
    const resize=()=>chartRef.current?.resize();window.setTimeout(resize,30);window.addEventListener('orientationchange',resize);
    return()=>{document.body.style.overflow=original;window.removeEventListener('orientationchange',resize)};
  },[expanded]);
  const selectIndex=(index:number)=>{const point=metadata.select(index);if(!point)return;setSelected(point);setEngaged(true);chartRef.current?.dispatchAction({type:'updateAxisPointer',xAxisIndex:0,dataIndex:point.index})};
  const reset=()=>{chartRef.current?.dispatchAction({type:'restore'});setSelected(metadata.select(metadata.count-1));setEngaged(false)};
  const download=()=>{const dataUrl=chartRef.current?.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#071c24'});if(!dataUrl)return;const link=document.createElement('a');link.href=dataUrl;link.download=`mi-solar-grafico-${new Date().toISOString().slice(0,10)}.png`;link.click()};
  return <div className={`chart-explorer${expanded?' is-expanded':''}`}>
    {metadata.count>0?<div className="chart-explorer-toolbar" role="toolbar" aria-label="Herramientas para explorar el gráfico">
      <button type="button" onClick={()=>selectIndex((selected?.index??metadata.count)-1)} disabled={!selected||selected.index<=0} title="Dato anterior"><ChevronLeft/><span>Anterior</span></button>
      <button type="button" onClick={()=>selectIndex((selected?.index??-1)+1)} disabled={!selected||selected.index>=metadata.count-1} title="Dato siguiente"><ChevronRight/><span>Siguiente</span></button>
      <button type="button" onClick={()=>selectIndex(metadata.count-1)} title="Ir al último dato"><span>Último dato</span></button>
      <button type="button" onClick={reset} title="Restablecer vista"><RotateCcw/><span>Restablecer</span></button>
      <button type="button" onClick={()=>setExpanded(value=>!value)} title={expanded?'Reducir gráfico':'Explorar en pantalla completa'}>{expanded?<Minimize2/>:<Expand/>}<span>{expanded?'Reducir':'Explorar'}</span></button>
      <button type="button" onClick={download} title="Guardar gráfico como imagen"><Download/><span>Guardar</span></button>
    </div>:null}
    {engaged&&selected&&selected.values.length?<aside className="chart-tooltip-dock" aria-live="polite"><div><small>Dato seleccionado</small><strong>{selected.label}</strong></div><div className="chart-tooltip-values">{selected.values.map((item,index)=><span key={`${item.name}-${index}`}><i style={{background:item.color}}/><small>{item.name}</small><b>{item.value}</b></span>)}</div><button type="button" onClick={()=>setEngaged(false)} aria-label="Cerrar detalle"><X/></button></aside>:null}
    <div ref={canvasRef} className={`${className} chart-explorer-canvas`}/>
  </div>;
}
