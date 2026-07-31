export type SiteProfile={
 key:'arrayan'|'puerto-montt';
 label:string;
 shortLabel:string;
 latitude:number;
 longitude:number;
 installedWp:number;
 timezone:string;
 defaultTariff:number;
 defaultFeedInTariff:number;
 gridConnected:boolean;
};

export function siteProfile(name=''):SiteProfile{
 const value=name.toLocaleLowerCase('es-CL');
 if(value.includes('puerto')||value.includes('montt'))return {
  key:'puerto-montt',label:'Casa Puerto Montt',shortLabel:'Puerto Montt',latitude:-41.4693,longitude:-72.9424,
  installedWp:1800,timezone:'America/Santiago',defaultTariff:250,defaultFeedInTariff:0,gridConnected:false
 };
 return {
  key:'arrayan',label:'Casa ECO Arrayán',shortLabel:'El Arrayán',latitude:-33.347,longitude:-70.515,
  installedWp:8680,timezone:'America/Santiago',defaultTariff:250,defaultFeedInTariff:0,gridConnected:true
 };
}

export function siteStorageKey(prefix:string,siteName=''){return `${prefix}:${siteProfile(siteName).key}`}
