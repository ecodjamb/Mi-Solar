import EChart from './EChart';

export default function PowerGauge({value,max=10000,label='Consumo instantáneo',color='#5aa8ff'}:{value:number;max?:number;label?:string;color?:string}){
  const safe=Math.max(0,Math.min(max,value));
  return <EChart className="gauge-chart" option={{
    animation:false,
    animationDuration:0,
    animationDurationUpdate:0,
    toolbox:{show:false},
    series:[{
      type:'gauge',
      min:0,max,
      startAngle:210,endAngle:-30,
      splitNumber:10,
      radius:'92%',
      center:['50%','54%'],
      axisLine:{lineStyle:{width:20,color:[[0.5,'#27c981'],[0.8,'#efb637'],[1,'#ef5b63']]}},
      progress:{show:true,width:20,roundCap:true,itemStyle:{color:safe>max*.8?'#ef5b63':color}},
      pointer:{show:true,length:'66%',width:7,itemStyle:{color:'#f4f8fa'}},
      anchor:{show:true,size:15,itemStyle:{color:'#f4f8fa',borderColor:'#091a21',borderWidth:4}},
      axisTick:{distance:-27,length:6,lineStyle:{color:'#91a8b2',width:1}},
      splitLine:{distance:-30,length:13,lineStyle:{color:'#c4d0d5',width:2}},
      axisLabel:{distance:-48,color:'#8ea5ae',fontSize:10,formatter:(v:number)=>`${Math.round(v/1000)}k`},
      title:{offsetCenter:[0,'55%'],color:'#93a9b2',fontSize:13},
      detail:{offsetCenter:[0,'34%'],valueAnimation:false,color:'#f4f8fa',fontSize:30,fontWeight:700,formatter:(v:number)=>`${Math.round(v).toLocaleString('es-CL')} W`},
      data:[{value:safe,name:label}]
    }]
  }}/>;
}
