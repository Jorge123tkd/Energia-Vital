/** Estimador preliminar Bonaire. No sustituye un dimensionamiento ni validación de instalación.
 * Referencias: https://samrepo.nlr.gov/help/pv_system_design.html
 * https://www.pvsyst.com/help/project-design/grid-connected-system-definition/array-voltage-sizing-according-to-inverter.html
 */
export type Sector = 'residencial' | 'privado' | 'estatal';
export type Level = 'basico' | 'tecnico';
export type Phase = 'monofasica' | 'bifasica' | 'trifasica';
export type Origin = 'equipos' | 'medicion' | 'acometida';
export type Load = {
  id: number; name: string; watts: number; units: number; hours: number;
  critical: boolean; backupDuty: number; estimate: boolean;
};
export const DEFAULT_LOADS: Omit<Load, 'id'>[] = [
  {name:'Refrigerador',watts:150,units:1,hours:8,critical:true,backupDuty:0.40,estimate:true},
  {name:'Televisor',watts:90,units:1,hours:5,critical:false,backupDuty:1,estimate:true},
  {name:'Ventilador',watts:65,units:1,hours:8,critical:true,backupDuty:1,estimate:true},
  {name:'Bombillas LED',watts:10,units:6,hours:5,critical:true,backupDuty:1,estimate:true},
  {name:'Router de internet',watts:15,units:1,hours:10,critical:true,backupDuty:1,estimate:true},
  {name:'Aire acondicionado',watts:1200,units:1,hours:5,critical:false,backupDuty:1,estimate:true},
  {name:'Bomba de agua',watts:750,units:1,hours:1,critical:false,backupDuty:1,estimate:true},
  {name:'Lavadora',watts:600,units:1,hours:1,critical:false,backupDuty:1,estimate:true},
  {name:'Computadora',watts:150,units:1,hours:6,critical:false,backupDuty:1,estimate:true},
  {name:'Microondas',watts:1200,units:1,hours:0.4,critical:false,backupDuty:1,estimate:true},
];
export const SECTOR_CAPACITY_GUIDE: Record<Sector, number[]> = {
  residencial: [5,10,12,15],
  privado: [10,15,20,30],
  estatal: [15,30,50],
};
// Las capacidades son ejemplos prácticos de baterías nominales comerciales, no topes normativos.
export type PvDetails = {
  maxDcVoltage: number; mpptMin: number; mpptMax: number; mpptCount: number;
  maxIscPerMppt: number; maxPvWatts: number;
  voc: number; vmp: number; isc: number;
  vocCoeffPct: number; vmpCoeffPct: number; minAirC: number; maxCellC: number;
};
export type StringCandidate = {
  inSeries:number; strings:number; total:number; coldVoc:number; hotVmp:number; coldVmp:number;
  iscPerTracker:number; pvW:number;
};
export type SolarInput = {
  sector:Sector; level:Level; origin:Origin; phase:Phase;
  loads:Load[]; voltage:number; amps:number; powerFactor:number; hoursDaily:number;
  autonomyHours:number; peakSunHours:number; panelWatts:number; essentialPercent:number;
  existingBatteryKWh:number; panelDetails?:PvDetails;
};
export type SolarOutput = {
  power:number; daily:number; backupWatts:number; backupEnergy:number; battery:number;
  inverter:number; pv:number; panelCount:number; panelWatts:number;
  guideBattery:number; guideFits:boolean; guideHours:number; maxCriticalWatts:number;
  existingHours:number|null; candidateStrings:StringCandidate[];
  requiresElectricalReview:boolean;
};
function rounded(num:number,digits=2){return Number(num.toFixed(digits));}
function safe(v:number){return Number.isFinite(v)?Math.max(0,v):0;}
export function candidatePvStrings(requiredPanels:number,panelWatts:number,d?:PvDetails):StringCandidate[]{
  if(!d || !Number.isFinite(requiredPanels) || requiredPanels<1 || !Number.isFinite(panelWatts)||panelWatts<=0)return [];
  const all=[d.maxDcVoltage,d.mpptMin,d.mpptMax,d.mpptCount,d.maxIscPerMppt,d.maxPvWatts,
    d.voc,d.vmp,d.isc,d.minAirC,d.maxCellC,d.vocCoeffPct,d.vmpCoeffPct];
  if(all.some(x=>!Number.isFinite(x))||d.maxDcVoltage<=0||d.mpptMin<=0||d.mpptMax<=d.mpptMin||
    d.mpptCount<1||!Number.isInteger(d.mpptCount)||d.maxIscPerMppt<=0||d.maxPvWatts<=0||
    d.voc<=d.vmp||d.vmp<=0||d.isc<=0||d.vocCoeffPct>=0||d.vmpCoeffPct>=0||
    d.vocCoeffPct< -2 || d.vmpCoeffPct< -2 || d.minAirC< -40||d.minAirC>25||
    d.maxCellC<25||d.maxCellC>95) return [];
  const maxInputs=Math.min(8,d.mpptCount);
  const proposals:StringCandidate[]=[];
  for(let series=2;series<=Math.min(requiredPanels+8,30);series++){
    const strings=Math.ceil(requiredPanels/series);
    const total=series*strings;
    const coldVoc=series*d.voc*(1+d.vocCoeffPct/100*(d.minAirC-25));
    const hotVmp=series*d.vmp*(1+d.vmpCoeffPct/100*(d.maxCellC-25));
    const coldVmp=series*d.vmp*(1+d.vmpCoeffPct/100*(d.minAirC-25));
    // Conservador: una cadena por MPPT independiente; no presupone conectores en paralelo.
    const current=d.isc*1.25;
    if(strings>maxInputs||coldVoc>=d.maxDcVoltage||hotVmp<d.mpptMin||
      coldVmp>d.mpptMax||current>d.maxIscPerMppt||total*panelWatts>d.maxPvWatts)continue;
    proposals.push({inSeries:series,strings,total,coldVoc:rounded(coldVoc,1),
      hotVmp:rounded(hotVmp,1),coldVmp:rounded(coldVmp,1),
      iscPerTracker:rounded(current,1),pvW:total*panelWatts});
  }
  return proposals.sort((a,b)=>a.total-b.total||a.strings-b.strings).slice(0,3);
}
export function estimateSolar(input:SolarInput):SolarOutput {
  const isLoads=input.origin==='equipos';
  const loads=input.loads.filter(l=>l.watts>0&&l.units>0&&l.hours>0);
  const power=isLoads
    ?loads.reduce((sum,l)=>sum+l.watts*l.units,0)
    :input.voltage*input.amps*input.powerFactor*(input.phase==='trifasica'?Math.sqrt(3):1);
  const daily=isLoads
    ?loads.reduce((sum,l)=>sum+l.watts*l.units*l.hours,0)/1000
    :power*input.hoursDaily/1000;
  const backupWatts=isLoads
    ?loads.filter(l=>l.critical).reduce((sum,l)=>sum+l.watts*l.units*l.backupDuty,0)
    :power*input.essentialPercent/100;
  const backupEnergy=backupWatts*input.autonomyHours/1000;
  // Ejemplo de litio: 80% DoD y 90% eficiencia; los datos reales dependen de la batería.
  const battery=backupEnergy/(0.8*0.9);
  const inverter=power*1.25; // No contempla corrientes de arranque ni requisitos de conmutación.
  const pv=daily/(input.peakSunHours*0.75);
  const panelCount=Math.ceil(pv*1000/input.panelWatts);
  const tiers=SECTOR_CAPACITY_GUIDE[input.sector];
  const guideBattery=tiers.find(v=>v>=battery)||tiers[tiers.length-1];
  const guideFits=battery<=guideBattery;
  const guideHours=backupWatts>0?guideBattery*1000*.8*.9/backupWatts:0;
  const maxCriticalWatts=guideBattery*1000*.8*.9/input.autonomyHours;
  const existingHours=input.existingBatteryKWh>0&&backupWatts>0?
    input.existingBatteryKWh*1000*.8*.9/backupWatts:null;
  const candidateStrings=candidatePvStrings(panelCount,input.panelWatts,input.panelDetails);
  return {
    power:safe(power),daily:safe(daily),backupWatts:safe(backupWatts),backupEnergy:safe(backupEnergy),
    battery:safe(battery),inverter:safe(inverter),pv:safe(pv),panelCount,panelWatts:input.panelWatts,
    guideBattery,guideFits,guideHours, maxCriticalWatts,
    existingHours,candidateStrings,requiresElectricalReview:true,
  };
}
