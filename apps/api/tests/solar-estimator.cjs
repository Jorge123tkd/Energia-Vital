/** Verificaciones deterministas del estimador usado por el formulario solar de Bonaire. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname,'../../web/src/lib/solar-estimator.ts'),'utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
new Function('require','module','exports',js)(require,mod,mod.exports);
const {estimateSolar,candidatePvStrings,DEFAULT_LOADS} = mod.exports;

const loads=[
  {...DEFAULT_LOADS.find(x=>x.name==='Refrigerador'),id:1},
  {...DEFAULT_LOADS.find(x=>x.name==='Televisor'),id:2},
  {...DEFAULT_LOADS.find(x=>x.name==='Bombillas LED'),id:3},
];
const input={sector:'residencial',level:'basico',origin:'equipos',phase:'monofasica',
  loads,voltage:220,amps:0,powerFactor:0.85,hoursDaily:6,
  autonomyHours:5,peakSunHours:4.5,panelWatts:450,essentialPercent:35,existingBatteryKWh:0};
const home=estimateSolar(input);
assert.equal(home.power,300,'Power is an upper bound with all listed loads simultaneously on');
assert.equal(home.daily,1.95,'Daily energy from individual use durations');
assert.equal(home.backupWatts,120,'Refrigeration duty cycle and lights, excluding TV');
assert.ok(Math.abs(home.battery-0.833333)<0.001,'Usable battery correction for critical loads');
assert.equal(home.panelCount,2,'Preliminary panel quantity is energy sizing, not string wiring');
assert.equal(home.inverter,262.5,'Peak critical loads drive inverter guidance');

const heavy=estimateSolar({...input,loads:[{
  id:4,name:'Carga alta',watts:10000,units:1,hours:8,critical:true,backupDuty:1,estimate:false,
}],autonomyHours:15});
assert.ok(heavy.battery>200);
assert.equal(heavy.guideBattery,15,'Residential capacity reference is not a physics cap');
assert.equal(heavy.guideFits,false,'High demand is not falsely marked covered');
assert.ok(heavy.guideHours<2,'Shows realistic shortfall for a 15 kWh example');

assert.deepEqual(candidatePvStrings(11,450,undefined),[],'No strings without manufacturer specifications');
const specs={maxDcVoltage:500,mpptMin:120,mpptMax:450,mpptCount:2,maxIscPerMppt:20,
  maxPvWatts:6000,voc:50,vmp:41,isc:11,vocCoeffPct:-0.28,vmpCoeffPct:-0.35,minAirC:5,maxCellC:65};
const candidates=candidatePvStrings(11,450,specs);
assert.ok(candidates.some(x=>x.inSeries===6&&x.strings===2&&x.total===12),
  '11 panels may require a compatible 2x6 design with one string per MPPT; not 11 in series');
assert.deepEqual(candidatePvStrings(11,450,{...specs,maxDcVoltage:250}),[],
  'Cold Voc safety rules disallow otherwise incompatible 11-panel array patterns');
console.log('PASS solar estimator: appliances, critical backup, residential storage and strict string limits');
