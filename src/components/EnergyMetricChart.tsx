import EChart from './EChart';

type Props={title:string;subtitle:string;labels:string[];values:number[];unit?:string;color?:string;area?:boolean};
export default function EnergyMetricChart({title,subtitle,labels,values,unit='kWh',color='#45c982',area=true}:Props){
  const total=values.length?values[values.length-1]:0;
  return <section className="panel metric-chart-card"><header><div><small>{subtitle}</small><h3>{title}</h3></div><strong className="metric-total">{total.toLocaleString('es-CL',{maximumFractionDigits:2})} <span>{unit}</span></strong></header><EChart className="metric-chart" option={{
    animationDuration:500,
    tooltip:{trigger:'axis',confine:true,backgroundColor:'#07181f',borderColor:'#2a4b57',textStyle:{color:'#e9f2f4'},formatter:(params:any[])=>{const p=params?.[0];return p?`<strong>${p.axisValue}</strong><br/>${title}: <b>${Number(p.value).toLocaleString('es-CL',{maximumFractionDigits:2})} ${unit}</b>`:''}},
    grid:{left:54,right:22,top:24,bottom:42,containLabel:true},
    xAxis:{type:'category',boundaryGap:false,data:labels,axisLabel:{color:'#8ba0a8',fontSize:10,hideOverlap:true,margin:14},axisLine:{lineStyle:{color:'#29444e'}},axisTick:{show:false}},
    yAxis:{type:'value',name:unit,nameTextStyle:{color:'#8ba0a8',padding:[0,0,8,0]},axisLabel:{color:'#8ba0a8',fontSize:10},splitLine:{lineStyle:{color:'rgba(110,150,160,.12)'}}},
    series:[{name:title,type:'line',data:values,smooth:true,showSymbol:false,emphasis:{focus:'series'},lineStyle:{width:3,color},itemStyle:{color},areaStyle:area?{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:`${color}55`},{offset:1,color:`${color}03`}]}}:undefined}]
  }}/></section>;
}
