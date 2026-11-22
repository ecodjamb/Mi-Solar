export type SpecificYieldSite='arrayan'|'puerto-montt';

export type SpecificYieldReference={
  dailyKwhPerKwp:number;
  annualKwhPerKwp:number;
  source:string;
  sourceDetail:string;
  sourceUrl:string;
  periodLabel?:string;
};

export const SPECIFIC_YIELD_REFERENCES:Record<SpecificYieldSite,SpecificYieldReference>={
  'puerto-montt':{
    dailyKwhPerKwp:3.58,
    annualKwhPerKwp:1305,
    source:'Heliplast · febrero de 2025',
    sourceDetail:'Sistemas ON-GRID en 220/380 V, referencia para Puerto Montt',
    sourceUrl:'https://www.heliplast.cl/wp-content/uploads/2025/02/Sistemas-ON-GRID-en-220-380-Volt-50Hz-Heliplast-Febrero-2025-Publico-1.pdf'
  },
  arrayan:{
    dailyKwhPerKwp:4.21,
    annualKwhPerKwp:1535,
    source:'Guía de Sistemas Fotovoltaicos 2020 · Explorador Solar',
    sourceDetail:'Estimación anual para Santiago del Ministerio de Energía y GIZ',
    sourceUrl:'https://4echile.cl/wp-content/uploads/2020/08/Gu%C3%ADa-de-Sistemas-Fotovoltaicos_web_2020.pdf'
  }
};

export function specificYieldReference(site:SpecificYieldSite){
  return SPECIFIC_YIELD_REFERENCES[site];
}

// Referencia teórica mensual acordada para comparar la producción real sin
// calibrarla contra el propio inversor. El resto de los gráficos conserva la
// referencia anual histórica; esta tabla se usa únicamente en la tarjeta de
// "Producción específica hoy".
export const MONTHLY_SPECIFIC_YIELD_KWH_PER_KWP:Record<SpecificYieldSite,readonly number[]>={
  arrayan:[5.98,5.84,5.42,4.54,3.47,2.99,3.30,3.89,4.69,5.25,5.69,6.01],
  'puerto-montt':[5.38,5.02,4.19,3.07,2.17,1.77,2.01,2.57,3.70,4.30,4.70,5.07]
};

const MONTH_NAMES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'] as const;

export function specificYieldReferenceForDate(site:SpecificYieldSite,date:string):SpecificYieldReference{
  const parsed=new Date(`${date}T12:00:00`);
  const month=Number.isNaN(parsed.getTime())?new Date().getMonth():parsed.getMonth();
  const base=SPECIFIC_YIELD_REFERENCES[site];
  return{
    ...base,
    dailyKwhPerKwp:MONTHLY_SPECIFIC_YIELD_KWH_PER_KWP[site][month],
    source:'Tabla mensual teórica · Explorador Solar / PVGIS',
    sourceDetail:`Referencia independiente para ${MONTH_NAMES[month]}; no se calibra con la producción histórica del inversor.`,
    periodLabel:MONTH_NAMES[month]
  };
}

export type SpecificYieldAssessment={note:-3|-2|-1|0|1|2|3;emoji:'😭'|'😢'|'🙁'|'😐'|'🙂'|'😄'|'🤩';deviationPercent:number;line:string};

export function assessSpecificYield(actualKwh:number,expectedKwh:number):SpecificYieldAssessment|null{
  if(!(expectedKwh>0))return null;
  const deviationPercent=(actualKwh/expectedKwh-1)*100;
  const note:SpecificYieldAssessment['note']=deviationPercent<-30?-3:deviationPercent<-20?-2:deviationPercent<-10?-1:deviationPercent<=10?0:deviationPercent<=20?1:deviationPercent<=30?2:3;
  const emoji:SpecificYieldAssessment['emoji']=note===-3?'😭':note===-2?'😢':note===-1?'🙁':note===0?'😐':note===1?'🙂':note===2?'😄':'🤩';
  const rounded=Math.round(deviationPercent);
  const magnitude=Math.abs(rounded).toLocaleString('es-CL');
  const line=rounded>0?`${emoji} +${magnitude} % sobre la referencia.`:rounded<0?`${emoji} −${magnitude} % bajo la referencia.`:`${emoji} 0 % respecto de la referencia.`;
  return{note,emoji,deviationPercent,line};
}
