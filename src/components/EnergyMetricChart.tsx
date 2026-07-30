import EChart from './EChart';

type Props={title:string;subtitle:string;labels:string[];values:number[];unit?:string;color?:string;area?:boolean};
export default function EnergyMetricChart({title,subtitle,labels,values,unit='kWh',color='#45c982',area=true}:Props){
  const total=values.length?values[values.length-1]:0;
  return <section className="panel metric-chart-card"><header><div><small>{subtitle}</small><h3>{title}</h3></div><strong>{total.toLocaleString('es-CL',{maximumFractionDigits:2})} {unit}</strong></header><EChart className="metric-chart" option={{
    animationDuration:500,
    tooltip:{trigger:'axis',valueFormatter:(value)=>`${Number(value).toLocaleString('es-CL',{maximumFractionDigits:2})} ${unit}`},
    grid:{left:42,right:14,top:18,bottom:34},
    xAxis:{type:'category',boundaryGap:false,data:labels,axisLabel:{color:'#718891',fontSize:10,hideOverlap:true},axisLine:{lineStyle:{color:'#213b45'}},axisTick:{show:false}},
    yAxis:{type:'value',axisLabel:{color:'#718891',fontSize:10},splitLine:{lineStyle:{color:'rgba(110,150,160,.1)'}}},
    series:[{type:'line',data:values,smooth:true,showSymbol:false,lineStyle:{width:3,color},itemStyle:{color},areaStyle:area?{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:`${color}55`},{offset:1,color:`${color}03`}]}}:undefined}]
  }}/></section>;
}
