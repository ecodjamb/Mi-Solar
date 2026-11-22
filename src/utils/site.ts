export type SiteProfile={
 key:'arrayan'|'puerto-montt';
 label:string;
 shortLabel:string;
 weatherLocationLabel:string;
 latitude:number;
 longitude:number;
 installedWp:number;
 timezone:string;
 defaultTariff:number;
 defaultFeedInTariff:number;
 gridConnected:boolean;
 configurationKey:string;
 configurationEffectiveFrom?:string;
 strings:Array<{key:'pv1'|'pv2';label:string;installedKwp:number}>;
};

export function siteProfile(name=''):SiteProfile{
 const value=name.toLocaleLowerCase('es-CL');
 if(value.includes('puerto')||value.includes('montt'))return {
 key:'puerto-montt',label:'Casa ECO Quillaipe',shortLabel:'Puerto Montt',weatherLocationLabel:'Quillaipe · Casa ECO Quillaipe',latitude:-41.573491,longitude:-72.716358,
  installedWp:3690,timezone:'America/Santiago',defaultTariff:250,defaultFeedInTariff:0,gridConnected:false,configurationKey:'puerto-montt-v2-3690',configurationEffectiveFrom:'2026-09-18',
  strings:[{key:'pv1',label:'String único · 6 × 615 W',installedKwp:3.69}]
 };
 return {
  key:'arrayan',label:'Casa ECO Arrayán',shortLabel:'El Arrayán',weatherLocationLabel:'Lo Barnechea · sector Plaza San Enrique',latitude:-33.3633868,longitude:-70.4935291,
  installedWp:10540,timezone:'America/Santiago',defaultTariff:250,defaultFeedInTariff:0,gridConnected:true,configurationKey:'arrayan-v2-10540',configurationEffectiveFrom:'2026-10-01',
  strings:[{key:'pv1',label:'String 1 · 9 × 620 W',installedKwp:5.58},{key:'pv2',label:'String 2 · 8 × 620 W',installedKwp:4.96}]
 };
}

export function siteStorageKey(prefix:string,siteName=''){return `${prefix}:${siteProfile(siteName).key}`}
