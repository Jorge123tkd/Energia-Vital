const enc=new TextEncoder();
const active=(h,s,d)=>d>=24||((h-s+24)%24)<d;
// Perfil horario inventariado y ampliación de demanda, sin alterar el estudio.
function inventoryDemand(x){
  const profile=Array.from({length:24},(_,h)=>(x.loads||[]).reduce((sum,r)=>sum+(active(h,+r.start||0,+r.hours||0)?Math.max(0,+r.kw||0)*Math.max(0,+r.qty||0)*Math.min(1,Math.max(0,(+r.sim||0)/100)):0),0));
  const isWork=h=>active(h,+x.start||0,+x.hours||0);
  const workPeak=Math.max(0,...profile.filter((_,h)=>isWork(h))),restPeak=Math.max(0,...profile.filter((_,h)=>!isWork(h)));
  const workTarget=Math.max(workPeak,Number(x.inventoryWork)||0),restTarget=Math.max(restPeak,Number(x.inventoryRest)||0);
  const workExtra=workTarget-workPeak,restExtra=restTarget-restPeak;
  // La base ya inventariada conserva sus horarios. Solo el incremento manual
  // fuera de jornada puede sumarse también a todas las horas laborales.
  const restExtraAtWork=x.restMode==='additional'?restExtra:0;
  const adjusted=profile.map((v,h)=>v+(isWork(h)?workExtra+restExtraAtWork:restExtra));
  const workResult=Math.max(0,...adjusted.filter((_,h)=>isWork(h)));
  return {profile,workPeak,restPeak,workTarget,restTarget,workExtra,restExtra,restExtraAtWork,workResult,adjusted};
}
// Calendario por equipo optativo: el descanso es un mínimo, no una suma.
function weekdayEquipment(x,day){const work=Array.isArray(x.workDays)?x.workDays.map(Number):[0,1,2,3,4,5,6];return (x.loads||[]).filter(r=>Array.isArray(r.activeDays)?r.activeDays.map(Number).includes(day):work.includes(day));}
function weekdayInventory(x,day){return inventoryDemand({...x,loads:weekdayEquipment(x,day)});}
// PV: irradiancia media en plano del módulo (POA), no potencia instantánea.
function pvModel(x){
  const n=(v,d=0)=>v==null||v===''||!Number.isFinite(Number(v))?d:Number(v),lim=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mode=['legacy','advanced','hourly'].includes(x.pvMode)?x.pvMode:'legacy';
  const panels=Math.max(0,n(x.panels)),watts=Math.max(0,n(x.watts)),kwp=panels*watts/1000,inv=Math.max(0,n(x.inverter)),hsp=lim(n(x.sun),0,24),pr=lim(n(x.pr,80)/100,0,1);
  const imp=Math.max(0,n(x.pvImp)),vmp=Math.max(0,n(x.pvVmp))||(imp?watts/imp:0),voc=Math.max(0,n(x.pvVoc)),isc=Math.max(0,n(x.pvIsc));
  const ns=Math.trunc(n(x.pvSeries)),np=Math.trunc(n(x.pvParallel)),mppt=Math.trunc(n(x.pvMppt)),imax=Math.max(0,n(x.pvMpptA)),iscmax=Math.max(0,n(x.pvMpptIsc)),vmin=Math.max(0,n(x.pvMpptMin)),vmax=Math.max(0,n(x.pvMpptMax)),vabs=Math.max(0,n(x.pvMaxVoc)),dcmax=Math.max(0,n(x.pvDcMax));
  const gamma=lim(n(x.pvGamma,-0.35),-2,0)/100,vg=lim(n(x.pvVmpCoeff,-0.3),-2,0)/100,vc=lim(n(x.pvVocCoeff,-0.28),-2,0)/100,cold=n(x.pvCold,5),amb=n(x.pvAmbient,30),noct=lim(n(x.pvNoct,45),20,80);
  const shape=lim(n(x.pvShape,3),0.25,12),dawn=lim(n(x.pvDawn,6),0,23),dusk=lim(n(x.pvDusk,18),dawn+1,24),gmax=lim(n(x.pvGmax,1100),100,1400)/1000,eta=lim(n(x.pvConversion,96)/100,0,1),loss=lim(n(x.pvLoss,5)/100,0,1),coupled=mode!=='legacy'&&n(x.pvCoupled)===1;
  const warnings=[],micro=x.optimizerMode==='Microinversores AC',unitCount=Math.trunc(n(x.inverterCount)),unitMPPT=Math.trunc(n(x.mpptPerInverter)),unitDC=Math.max(0,n(x.dcPerInverter)),unitAC=Math.max(0,n(x.unitInverter)),microCount=Math.trunc(n(x.microCount)),microAC=Math.max(0,n(x.microAC)),microInputs=Math.trunc(n(x.microInputs)),microRated=microCount*microAC,microMaxV=Math.max(0,n(x.microMaxV)),microMaxIsc=Math.max(0,n(x.microMaxIsc)),microMinV=Math.max(0,n(x.microMinV)),microMpptMax=Math.max(0,n(x.microMpptMax));
  const custom=Array.isArray(x.pvAssignments)&&x.pvAssignments.length>0,uniform=ns>0&&np>0&&mppt>0&&ns*np===panels&&(np>=mppt||unitCount>0&&unitMPPT>0&&unitCount*unitMPPT===mppt),groups=[];
  let layout=uniform&&!micro;
  if(!micro&&custom){let seen=new Set();layout=unitCount>0&&unitMPPT>0&&unitCount*unitMPPT<=12000&&x.pvAssignments.length<=12000;let total=0;if(layout)for(let a of x.pvAssignments){let i=Number(a.unit),m=Number(a.mppt),series=Number(a.series),strings=Number(a.strings),key=i+':'+m;if(![i,m,series,strings].every(Number.isInteger)||i<1||i>unitCount||m<1||m>unitMPPT||series<1||strings<1||seen.has(key)){layout=false;break}seen.add(key);total+=series*strings;groups.push({unit:i,mppt:m,series,strings,imax:n(a.maxA,imax),vmin:n(a.minV,vmin),vmax:n(a.maxV,vmax),vabs:n(a.maxVoc,vabs),iscmax:n(a.maxIsc,iscmax)});}if(total!==panels)layout=false;if(!layout)warnings.push('Asignación manual FV inválida o incompleta; el número de paneles y las entradas no coinciden.');}
  else if(layout&&unitCount>0&&unitMPPT>0&&unitCount*unitMPPT===mppt&&mppt<=12000){let base=Math.floor(np/unitCount),extra=np%unitCount;for(let i=0;i<unitCount;i++){let st=base+(i<extra?1:0),q=Math.floor(st/unitMPPT),r=st%unitMPPT;for(let j=0;j<unitMPPT;j++){let strings=q+(j<r?1:0);if(strings)groups.push({unit:i+1,mppt:j+1,series:ns,strings,imax,vmin,vmax,vabs,iscmax})}}}
  const explicitGroups=layout&&groups.length>0;
  if(micro){if(!(microCount>0&&microAC>0&&microInputs>0&&microCount*microInputs>=panels))warnings.push('Microinversores: faltan cantidad, potencia AC o entradas suficientes; producción provisional limitada a cero.');if(!microMaxV||!microMaxIsc||!microMinV||!microMpptMax||!voc||!vmp||!isc||!imp)warnings.push('Microinversores: faltan ficha eléctrica o límites por entrada.');if(voc&&microMaxV&&voc*Math.max(0,1+vc*(cold-25))>=microMaxV)warnings.push('PELIGRO: Voc de módulo en frío alcanza el máximo del microinversor. No conectar.');if(isc&&microMaxIsc&&isc>microMaxIsc)warnings.push('Isc del módulo supera el máximo del microinversor.');if(x.microIslandMode!=='Aprobada por fabricante')warnings.push('Microinversores AC no aportan durante apagones sin sistema de isla aprobado.');}

  if(imp&&n(x.pvVmp)>0&&watts&&Math.abs(imp*vmp/watts-1)>.03)warnings.push('Vmp × Imp difiere más del 3 % de Wp; verifica la ficha. Wp sigue siendo la referencia energética.');
  if(voc&&vmp&&voc<=vmp)warnings.push('Voc debe superar Vmp.');if(isc&&imp&&isc<imp)warnings.push('Isc debe ser mayor o igual a Imp.');
  if(!imp||!n(x.pvVmp)||!voc||!isc)warnings.push('Ficha eléctrica incompleta: faltan valores nominales Imp, Vmp, Voc o Isc; una tensión inferida no sustituye la ficha.');
  if(!micro&&!custom&&(ns||np||mppt)&&!layout)warnings.push('Topología no válida: serie × strings debe igualar paneles y debe haber al menos un string por MPPT activo. No se aplican límites por string.');
  if(!micro&&(!layout||!imax||!vmax||!vmin||!vabs||!iscmax||!dcmax))warnings.push('Límites MPPT/DC incompletos; compatibilidad no verificada. 0 = desconocido.');
  const coldVoc=layout&&voc?(explicitGroups?Math.max(...groups.map(a=>a.series)):ns)*voc*Math.max(0,1+vc*(cold-25)):0;
  if(coldVoc&&vabs&&coldVoc>=vabs)warnings.push('PELIGRO: Voc de string en frío alcanza/supera máxima tensión DC. No conectar; rediseñar.');
  if(layout&&!explicitGroups&&isc&&iscmax&&isc*Math.ceil(np/mppt)>iscmax)warnings.push('Isc STC por MPPT supera el límite indicado. Revisar margen normativo y fabricante.');
  if(vmin&&vmax&&vmin>=vmax&&!micro)warnings.push('Ventana MPPT incoherente.');if(explicitGroups){for(let g of groups){let cv=g.series*voc*Math.max(0,1+vc*(cold-25));if(g.vabs&&cv>=g.vabs)warnings.push('Inversor '+g.unit+' MPPT '+g.mppt+': Voc frío supera límite.');if(g.iscmax&&g.strings*isc>g.iscmax)warnings.push('Inversor '+g.unit+' MPPT '+g.mppt+': Isc STC supera límite.');}if(unitDC>0){let totals={};for(let a of groups)totals[a.unit]=(totals[a.unit]||0)+a.series*a.strings*watts/1000;for(let [i,k] of Object.entries(totals))if(k>unitDC+1e-8)warnings.push('Inversor '+i+': kWp supera el límite FV DC declarado.')}}
  const legacy=Array.from({length:24},(_,h)=>Math.max(0,Math.sin((h+.5-6)*Math.PI/12))),sum=legacy.reduce((a,b)=>a+b,0);
  const hourlyRaw=Array.isArray(x.pvHourly)?x.pvHourly:[],valid=hourlyRaw.length===24&&hourlyRaw.every(v=>v!==null&&v!==''&&Number.isFinite(+v)&&+v>=0&&+v<=1600);
  const tempRaw=Array.isArray(x.pvHourlyTemp)?x.pvHourlyTemp:[],validTemp=tempRaw.length===24&&tempRaw.every(v=>v!==null&&v!==''&&Number.isFinite(+v)&&+v>=-40&&+v<=110);
  if(mode==='hourly'&&tempRaw.length&&!validTemp)warnings.push('Temperaturas horarias inválidas; se estima temperatura con NOCT.');
  if(mode==='hourly'&&!valid)warnings.push('Perfil irradiancia incompleto; introduce 24 valores válidos. Se usa perfil sintético provisional.');
  const weights=Array.from({length:24},(_,h)=>h+.5>=dawn&&h+.5<=dusk?Math.pow(Math.max(0,Math.sin(Math.PI*(h+.5-dawn)/(dusk-dawn))),shape):0);
  const maxHsp=weights.filter(v=>v>0).length*gmax;if(mode==='advanced'&&hsp>maxHsp+1e-8)warnings.push('HSP excede lo que admite la ventana solar y el máximo de irradiancia; se limita la energía.');
  let lo=0,hi=1;const total=k=>weights.reduce((a,w)=>a+Math.min(gmax,k*w),0);while(total(hi)<Math.min(hsp,maxHsp)-1e-8&&hi<1e14)hi*=2;
  for(let j=0;j<70;j++){let mid=(lo+hi)/2;if(total(mid)<Math.min(hsp,maxHsp))lo=mid;else hi=mid}
  const scale=Math.max(0,n(x.pvScenarioFactor,1));
  let rows=weights.map((w,h)=>{
    let g=mode==='legacy'?hsp*legacy[h]/sum:mode==='hourly'&&valid?+hourlyRaw[h]/1000*scale:Math.min(gmax,hi*w),tc=mode==='hourly'&&validTemp?+tempRaw[h]:amb+(noct-20)*g/0.8;
    if(mode==='legacy'){let potential=kwp*hsp*pr*legacy[h]/sum,shade=potential*lim(n(x.shadeLoss),0,100)/100,after=potential-shade,limit=micro?(microCount*microInputs>=panels?microRated:0):inv,usable=Math.min(limit,after);return {g:g*1000,tc:null,dc:null,amps:null,vString:null,potential,usable,shade,clip:Math.max(0,after-usable)}}
    let moduleV=vmp?Math.max(vmp*.1,vmp*(1+vg*(tc-25))):0,unshaded=kwp*g*Math.max(0,1+gamma*(tc-25)),raw=unshaded*(1-lim(n(x.shadeLoss),0,100)/100),dc=raw*(1-loss),amps=moduleV&&layout?raw*1000/(panels*moduleV)*(explicitGroups?Math.max(...groups.map(a=>a.strings)):Math.ceil(np/mppt)):null,vString=layout&&moduleV?(explicitGroups?Math.max(...groups.map(a=>a.series)):ns)*moduleV:null;
    if(micro){let potential=unshaded*(1-loss)*eta,shade=(unshaded-raw)*(1-loss)*eta,available=raw*(1-loss)*eta,valid=microCount>0&&microAC>0&&microInputs>0&&microCount*microInputs>=panels;if(moduleV&&g>0&&((microMinV&&moduleV<microMinV)||(microMpptMax&&moduleV>microMpptMax)))available=0;let usable=valid?Math.min(microRated,available):0;return {g:g*1000,tc,dc:raw*(1-loss),amps:moduleV?raw*1000/(Math.max(1,panels)*moduleV):null,vString:moduleV||null,potential,usable,shade,clip:Math.max(0,potential-shade-usable)}}
    if(custom&&!layout){let potential=unshaded*(1-loss)*eta,shade=(unshaded-raw)*(1-loss)*eta;return {g:g*1000,tc,dc:0,amps:null,vString:null,potential,usable:0,shade,clip:Math.max(0,potential-shade)}}
    if(explicitGroups){let unitPower={},current=moduleV&&panels?raw*1000/(panels*moduleV):0;for(let gr of groups){let inDC=raw*(gr.series*gr.strings/Math.max(1,panels))*(1-loss),sv=moduleV*gr.series;if(current>0&&gr.imax>0)inDC*=Math.min(1,gr.imax/(current*gr.strings));if(g>0&&moduleV&&((gr.vmin&&sv<gr.vmin)||(gr.vmax&&sv>gr.vmax)))inDC=0;unitPower[gr.unit]=(unitPower[gr.unit]||0)+inDC}let totalDC=0,usable=0;for(let z of Object.values(unitPower)){if(unitDC>0)z=Math.min(unitDC,z);totalDC+=z;usable+=coupled?z*eta:Math.min(unitAC||inv/Math.max(1,unitCount),z*eta)}if(dcmax>0&&totalDC>dcmax){usable*=dcmax/totalDC;totalDC=dcmax}if(!coupled)usable=Math.min(inv,usable);let potential=unshaded*(1-loss)*eta,shade=(unshaded-raw)*(1-loss)*eta;return {g:g*1000,tc,dc:totalDC,amps,vString,potential,usable,shade,clip:Math.max(0,potential-shade-usable)}}
    if(amps!=null&&imax&&amps>imax){let current=raw*1000/(panels*moduleV),small=Math.floor(np/mppt),large=np%mppt;dc*=((mppt-large)*Math.min(small*current,imax)+large*Math.min((small+1)*current,imax))/(np*current);}
    if(g>0&&vString!=null&&((vmin&&vString<vmin)||(vmax&&vString>vmax)))dc=0;
    if(dcmax)dc=Math.min(dc,dcmax);
    let potential=unshaded*(1-loss)*eta,shade=(unshaded-raw)*(1-loss)*eta,usable=dc*eta;if(!coupled)usable=Math.min(inv,usable);
    return {g:g*1000,tc,dc,amps,vString,potential,usable,shade,clip:Math.max(0,potential-shade-usable)};
  });
  if(mode!=='legacy'&&!micro&&!explicitGroups&&rows.some(a=>a.g>0&&a.vString!=null&&((vmin&&a.vString<vmin)||(vmax&&a.vString>vmax))))warnings.push('Hay horas fuera de la ventana MPPT; aporte FV limitado a cero en ellas.');
  if(mode==='legacy')warnings.push('Método histórico: HSP × PR repartidos por seno; los datos eléctricos son informativos.');
  return {mode,rows,warnings,kwp,imp,vmp,coldVoc,layout,coupled:coupled&&!micro,micro,assignments:explicitGroups?groups:[],hsp:rows.reduce((a,b)=>a+b.g/1000,0),potential:rows.reduce((a,b)=>a+b.potential,0),usable:rows.reduce((a,b)=>a+b.usable,0),peak:Math.max(0,...rows.map(a=>a.usable))};
}
function calculate(x,options={}){
  const num=(v,d=0)=>Number.isFinite(Number(v))&&v!=null?Number(v):d, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const cap=x.modules.includes('Baterías')?Math.max(0,num(x.battery))*clamp(num(x.batterySOH,100),0,100)/100:0, floor=cap*(1-x.dod/100), ce=x.chargeEff/100,de=x.eff/100;
  let soc=clamp(cap*x.soc/100,0,cap),rows=[],pvTotal=0,loadTotal=0,unmet=0,gridTotal=0,genTotal=0,spill=0;
  const solar=x.modules.includes('Fotovoltaica')?pvModel(x):null;
  const startHour=clamp(Math.trunc(num(x.simStart??x.start)),0,23),duration=clamp(Math.trunc(num(x.simHours,24)),1,168);
  const mode=x.genMode||'deficit',target=x.genTarget||'loads', intervals=Array.isArray(x.genIntervals)?x.genIntervals:[],maxHours=clamp(Math.trunc(num(x.genMaxHours,24)),0,24), threshold=clamp(num(x.genSocStart,50),0,99),stop=clamp(num(x.genSocStop,90),threshold+1,100),usesSOC=mode==='soc'||mode==='combined',usesSchedule=mode==='schedule'||mode==='combined';
  const genRated=Math.max(0,num(x.generator)),genChargeLimit=Math.max(0,num(x.genChargeLimit,1500)),enabled=x.genEnabled&&x.modules.includes('Generador');
  // Calendario civil: lunes=0, domingo=6. Los respaldos antiguos trabajan los siete días.
  const startWeekday=clamp(Math.trunc(num(x.startWeekday,0)),0,6), workDays=Array.isArray(x.workDays)?x.workDays.map(Number).filter(i=>Number.isInteger(i)&&i>=0&&i<=6):[0,1,2,3,4,5,6];
  const restDay=Math.max(0,num(x.restDay,num(x.rest))),evOnRest=x.evOnRest===true;
  const inventory=x.useLoads?inventoryDemand(x):null,weeklyInventory=x.useLoads&&x.loadCalendarMode===true?Array.from({length:7},(_,d)=>weekdayInventory(x,d)):null;
  // Modelo de combustible optativo: no altera escenarios de versiones anteriores.
  const fuelModel=x.genFuelMode==='Limitar por combustible',known=v=>v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v));
  const fuelCurve=[x.genFuelIdle,x.genFuel25,x.genFuel50,x.genFuel75,x.genFuel100].map(v=>known(v)?Number(v):null),fuelValid=known(x.genAvailableFuel)&&num(x.genAvailableFuel)>=0&&fuelCurve.every((v,i)=>v!==null&&v>0&&(i===0||v>=fuelCurve[i-1]))&&known(x.genWarmup)&&num(x.genWarmup)>=0&&num(x.genWarmup)<=1440&&known(x.genCooldown)&&num(x.genCooldown)>=0&&num(x.genCooldown)<=1440;
  let fuelLeft=fuelModel&&fuelValid?Math.max(0,num(x.genAvailableFuel)):null,fuelUsed=0,genState='off',warmLeft=0,coolLeft=0;
  const fuelWarnings=[];
  if(fuelModel&&!fuelValid)fuelWarnings.push('Generador limitado por combustible sin datos completos o curva no monótona; aporte bloqueado.');
  const rating=fuelModel&&num(x.genKva)>0&&num(x.genPF)>0&&num(x.genPF)<=1?Math.min(genRated,num(x.genKva)*num(x.genPF)):genRated;
  const fuelRate=kw=>{let z=clamp(kw/Math.max(rating,1e-9)*4,0,4),i=Math.min(3,Math.floor(z));return fuelCurve[i]+(z-i)*(fuelCurve[i+1]-fuelCurve[i])};
  let latch=false,usedToday=0,prevDay=-1;
  for(let i=0;i<duration;i++){
    let h=(startHour+i)%24,day=Math.floor((startHour+i)/24);if(day!==prevDay){usedToday=0;prevDay=day}
    let socStart=soc,gridRecharge=0,pvCharge=0,genRecharge=0,genDirect=0;
    let weekday=(startWeekday+day)%7,workday=workDays.includes(weekday);
    let load=(workday?(x.useLoads?(weeklyInventory?weeklyInventory[weekday].adjusted[h]:inventory.adjusted[h]):(active(h,x.start,x.hours)?Math.max(0,num(x.work))+(x.restMode==='additional'?Math.max(0,num(x.rest)):0):Math.max(0,num(x.rest)))):(weeklyInventory?Math.max(restDay,weeklyInventory[weekday].profile[h]):restDay))+(x.modules.includes('Carga EV')&&(workday||evOnRest)&&active(h,x.evStart,x.evHours)?x.ev:0);
    load+=Math.max(0,num(x.auxKW));load=Array.isArray(options.loadProfile)?options.loadProfile[i]:load*(options.loadScale??1);let solarHour=solar?.rows[h],pv=(solarHour?.usable||0),grid=0,gen=0,dis=0,ch=0;
    let available=!active(h,x.outStart,x.outHours)&&!(x.outages||[]).some(o=>{let st=clamp(num(o.start),0,23),dur=clamp(num(o.hours),0,24),wd=Number(o.weekday??-1);if(wd<0)return active(h,st,dur);return (wd===weekday&&h>=st&&h<st+dur)||(wd===(weekday+6)%7&&h+24>=st&&h+24<st+dur)});let pvUnavailable=0;if(solar?.micro&&!available){let allowed=x.microIslandMode==='Aprobada por fabricante'&&cap>0&&x.inverter>0&&num(x.microIslandKW)>0&&(!x.requireMicroIslandReserve||soc>floor+1e-9)?Math.min(pv,num(x.microIslandKW)):0;pvUnavailable=pv-allowed;pv=allowed;}let direct=Math.min(load,pv,solar?.micro?Infinity:Math.max(0,x.inverter)),need=load-direct,extra=pv-direct;
    let dischargeLimit=Math.min(Math.max(0,num(x.bdischarge??x.bpower)),x.bmsDischargeKW==null||x.bmsDischargeKW===''?Infinity:Math.max(0,num(x.bmsDischargeKW))),chargeLimit=Math.min(Math.max(0,num(x.bcharge??x.bpower)),x.bmsChargeKW==null||x.bmsChargeKW===''?Infinity:Math.max(0,num(x.bmsChargeKW)));let bp=cap>0?Math.min(dischargeLimit,x.inverter):0,cp=cap>0?Math.min(chargeLimit,x.inverter):0;
    if(available){grid=Math.min(need,x.gridLimit);need-=grid}
    if(usesSOC){if(!cap||soc>=cap*stop/100-1e-8)latch=false;else if(soc<=cap*threshold/100+1e-8)latch=true}
    let scheduled=intervals.some(o=>active(h,clamp(Math.trunc(num(o.start)),0,23),clamp(Math.trunc(num(o.hours)),0,24)));
    let allowed=enabled&&rating>0&&usedToday<maxHours&&(!x.genOnlyOutage||!available)&&(!usesSchedule||scheduled)&&(!usesSOC||latch)&&(mode!=='deficit'||need>0);
    let genCap=rating,genRuntime=0,genIdleTime=0,fuelHour=0,fuelStart=fuelLeft;
    if(fuelModel){
      genCap=0;
      if(!fuelValid||!enabled||fuelLeft<=1e-9){allowed=false;genState='off';}
      else {
        let time=1;
        const idle=(duration)=>{let t=Math.max(0,Math.min(time,duration,fuelLeft/fuelCurve[0]));let f=t*fuelCurve[0];fuelLeft=Math.max(0,fuelLeft-f);fuelHour+=f;genIdleTime+=t;time-=t;return t};
        if(!allowed&&(genState==='run'||genState==='warm')){genState='cool';coolLeft=num(x.genCooldown)/60;warmLeft=0;}
        if(genState==='cool'){coolLeft=Math.max(0,coolLeft-idle(coolLeft));if(coolLeft<=1e-9)genState='off';}
        if(allowed&&time>1e-9&&fuelLeft>1e-9){
          if(genState==='off'){genState='warm';warmLeft=num(x.genWarmup)/60;}
          time=Math.min(time,Math.max(0,maxHours-usedToday-genIdleTime));
          if(genState==='warm'){warmLeft=Math.max(0,warmLeft-idle(warmLeft));if(warmLeft<=1e-9)genState='run';}
          if(genState==='run'&&time>1e-9&&fuelLeft>1e-9){
            // Para la fracción terminal, si no alcanza ni para mantener ralentí durante
            // el intervalo, usar tiempo equivalente a plena carga (conservador).
            genRuntime=fuelLeft<fuelCurve[0]*time?Math.min(time,fuelLeft/fuelCurve[4]):time;
            let lo=0,hi=rating;
            if(genRuntime>0){for(let k=0;k<55;k++){let mid=(lo+hi)/2;if(fuelRate(mid)*genRuntime<=fuelLeft+1e-10)lo=mid;else hi=mid}genCap=lo*genRuntime;}
          }
        }
        allowed=allowed&&genCap>1e-9;
      }
    }
    let chargeTarget=usesSOC?cap*stop/100:cap;
    if(allowed&&target!=='charge'){genDirect=Math.min(need,genCap);need-=genDirect;gen+=genDirect}
    // Charge-only: an independent compatible charger feeds the DC bus while the inverter supplies loads.
    // Energy flows are gross; the battery's SOC changes by net DC energy, not by two independent SOC updates.
    if(allowed&&target==='charge'&&need>0&&cp>0&&ce>0&&bp>0&&de>0){
      let possible=Math.min(need,bp,Math.max(0,x.inverter-(solar?.micro?0:direct)));
      genRecharge=Math.min(genCap,genChargeLimit,cp,Math.max(0,(chargeTarget-soc+possible/de)/ce));
      gen+=genRecharge;ch+=genRecharge;soc+=genRecharge*ce;
    }
    if(bp>0&&de>0){dis=Math.min(need,Math.max(0,soc-floor)*de,bp,Math.max(0,x.inverter-(solar?.micro?0:direct)));soc-=dis/de;need-=dis}
    if((cp>0||solar?.coupled)&&cap>0&&ce>0&&dis===0){
      let solar=Math.min(extra,Math.max(0,(solarHour&&x.pvMode!=='legacy'&&Number(x.pvCoupled)===1?chargeLimit:cp)-ch),Math.max(0,cap-soc)/ce);pvCharge=solar;ch+=solar;soc+=solar*ce;extra-=solar;
      if(allowed&&target!=='loads'){
        let g=Math.min(Math.max(0,genCap-gen),Math.max(0,genChargeLimit-genRecharge),Math.max(0,cp-ch),Math.max(0,chargeTarget-soc)/ce);genRecharge+=g;gen+=g;soc+=g*ce;ch+=g;
      }
      if(available&&x.gridCharge>0){let g=Math.min(x.gridCharge,Math.max(0,x.gridLimit-grid),Math.max(0,cp-ch),Math.max(0,cap-soc)/ce);gridRecharge=g;grid+=g;soc+=g*ce;ch+=g}
    }
    if(fuelModel&&fuelValid){if(genRuntime>0){let consumption=Math.min(fuelLeft,genRuntime*fuelRate(gen/genRuntime));fuelLeft=Math.max(0,fuelLeft-consumption);fuelHour+=consumption;}fuelUsed+=fuelHour;usedToday+=genIdleTime+genRuntime;if(fuelLeft<=1e-9)genState='off';}
    else if(gen>1e-8)usedToday++;
    if(usesSOC&&soc>=chargeTarget-1e-8)latch=false;
    rows.push({h,i,day,weekday,workday,load,pv,pvIrradiance:solarHour?.g??0,pvCellTemp:solarHour?.tc??null,pvDC:solarHour?.dc??null,pvCurrent:solarHour?.amps??null,pvStringV:solarHour?.vString??null,pvClipped:(solarHour?.clip??0)+pvUnavailable,pvShadeLoss:solarHour?.shade??0,pvUnavailable,grid,gen,genDirect,genRecharge,genAllowed:allowed,genRunning:gen>1e-8,genRuntime:fuelModel?genRuntime:(gen>1e-8?1:0),genIdleTime,genFuelUsed:fuelModel&&fuelValid?fuelHour:null,genFuelStart:fuelStart,genFuelLeft:fuelLeft,genState,dis,ch,soc,need,socStart,available,gridRecharge,pvCharge,pvDirect:direct,spill:extra,loss:ch*(1-ce)+(de>0?dis*(1/de-1):0)});
    pvTotal+=pv;loadTotal+=load;unmet+=need;gridTotal+=grid;genTotal+=gen;spill+=extra;
  }
  return {solar,fuelModel,fuelValid,fuelUsed:fuelModel&&fuelValid?fuelUsed:null,fuelLeft,fuelWarnings,effectiveBattery:cap,startHour,startWeekday,duration,rows,pvTotal,loadTotal,unmet,gridTotal,genTotal,spill};
}

function zip(files){let parts=[],central=[],offset=0,crc=a=>{let c=-1;for(let b of a){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^-1)>>>0};for(let [name,data] of Object.entries(files)){let n=enc.encode(name),a=typeof data==='string'?enc.encode(data):data,c=crc(a),l=new Uint8Array(30+n.length),v=new DataView(l.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);v.setUint32(14,c,true);v.setUint32(18,a.length,true);v.setUint32(22,a.length,true);v.setUint16(26,n.length,true);l.set(n,30);let b=new Uint8Array(46+n.length),w=new DataView(b.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,2048,true);w.setUint32(16,c,true);w.setUint32(20,a.length,true);w.setUint32(24,a.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);b.set(n,46);parts.push(l,a);central.push(b);offset+=l.length+a.length}let end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,central.reduce((s,a)=>s+a.length,0),true);v.setUint32(16,offset,true);return new Blob([...parts,...central,end])}


// Comprobación estática de grupos AC sin interconectar salidas. No es despacho horario.
function acGroupCheck(g){
 const issues=[],pending=[],num=k=>g[k]===null||g[k]===undefined||g[k]===''?null:Number(g[k]);
 const types=['Monofásico L–N','Monofásico 110/220 V (fase partida)','Trifásico'];
 const count=num('units'),kw=num('unitKW'),kva=num('unitKVA'),v=num('voltage'),vn=num('voltageLN'),pf=num('pf'),maxA=num('lineLimitA'),top=types.indexOf(g.topology),n=top+1;
 const vals=[num('loadL1'),num('loadL2'),num('loadL3')].slice(0,n),balanced=top>0?num('balancedKW'):0;
 const valid=(x,min=0)=>x!==null&&Number.isFinite(x)&&x>=min;
 if(top<0)pending.push('Topología no definida.');
 if(!valid(count,1)||!Number.isInteger(count)||!valid(kw,.001)||!valid(kva,.001))pending.push('Cantidad, potencia activa y aparente de cada unidad pendientes.');
 if(count>1&&g.parallelApproval!=='Confirmado por fabricante')pending.push('Paralelo de unidades no confirmado; no se permite inferir capacidad conjunta.');
 if(!valid(v,.001)||!valid(vn,.001)||!valid(pf,.001)||pf>1||!valid(maxA,.001))pending.push('Tensiones, factor de potencia o límite de corriente por línea pendientes.');
 if(top>=0&&valid(v,.001)&&valid(vn,.001)){let ideal=vn*(top===2?Math.sqrt(3):top===1?2:1);if(Math.abs(v-ideal)/ideal>.05)issues.push('V L–L y L–N no corresponden a la topología declarada.');}
 if(top<0||!vals.every(x=>valid(x))||!valid(balanced))pending.push('Introduce potencia simultánea de cada rama y carga equilibrada; cero explícito cuando no exista.');
 let demand=null,apparent=null,currents=[],neutral=null,imbalance=null;
 if(top>=0&&vals.every(x=>valid(x))&&valid(balanced)&&valid(vn,.001)&&valid(v,.001)&&valid(pf,.001)&&pf<=1){
  demand=vals.reduce((a,b)=>a+b,0)+balanced;apparent=demand/pf;
  const singles=vals.map(x=>x*1000/(vn*pf)),bl=top===1?balanced*1000/(v*pf):top===2?balanced*1000/(Math.sqrt(3)*v*pf):0;
  currents=singles.map(x=>x+bl);neutral=top===0?singles[0]:top===1?Math.abs(singles[0]-singles[1]):Math.hypot(singles[0]-.5*(singles[1]+singles[2]),Math.sqrt(3)/2*(singles[1]-singles[2]));
  let avg=currents.reduce((a,b)=>a+b,0)/n;imbalance=avg?Math.max(...currents.map(x=>Math.abs(x-avg)))/avg*100:0;
  if(valid(count,1)&&valid(kw,.001)&&demand>count*kw+1e-8)issues.push('La demanda simultánea supera la potencia activa nominal del grupo.');
  if(valid(count,1)&&valid(kva,.001)&&apparent>count*kva+1e-8)issues.push('La demanda aparente supera los kVA nominales del grupo.');
  if(valid(maxA,.001))currents.forEach((a,i)=>{if(a>maxA+1e-8)issues.push('L'+(i+1)+': corriente supera límite declarado del grupo.');});
 }
 if(!String(g.reference||'').trim())pending.push('Identifica la medición o el plano y las condiciones de simultaneidad.');
 return {demand,apparent,currents,neutral,imbalance,issues,pending};
}
function acArchitectureCheck(s){
 const groups=Array.isArray(s.acGroups)?s.acGroups:[],rows=groups.map(g=>({g,...acGroupCheck(g)})),issues=rows.flatMap(r=>r.issues.map(x=>(r.g.name||'Grupo')+': '+x)),pending=rows.flatMap(r=>r.pending.map(x=>(r.g.name||'Grupo')+': '+x));
 const capacity=groups.reduce((a,g)=>a+(Number(g.units)||0)*(Number(g.unitKW)||0),0),units=groups.reduce((a,g)=>a+(Number(g.units)||0),0);
 if(groups.length){if(Math.abs(capacity-(Number(s.inverter)||0))>1e-6)issues.push('La potencia nominal de los grupos no coincide con la conversión total del simulador.');if(Number(s.inverterCount)>0&&units!==Number(s.inverterCount))issues.push('La cantidad de unidades de los grupos no coincide con ingeniería.');}
 else pending.push('No hay un reparto de cargas por grupos AC declarado.');
 return {rows,capacity,units,issues,pending};
}

// Despacho horario de bancos y tableros independientes. Compartir fuentes sin
// topología/limitación confirmada requiere otro modelo; no se infiere aquí.
function independentGroupDispatch(s){
 const gs=Array.isArray(s.acGroups)?s.acGroups:[],errors=[],notes=[],active=s.acGroupDispatch===true;
 const out={active,errors,notes,groups:[],summary:null};if(!active)return out;
 const n=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v),num=v=>n(v)??0;
 const eq=(a,b)=>Math.abs(a-b)<1e-6,has=m=>(s.modules||[]).includes(m),pv=has('Fotovoltaica'),bat=has('Baterías')&&num(s.battery)>0,grid=num(s.gridLimit)>0;
 if(!gs.length||gs.length>120)errors.push('Define entre 1 y 120 grupos AC para este cálculo.');
 if(s.acConnection!=='Tableros independientes')errors.push('Selecciona la arquitectura AC de tableros independientes.');
 const common=bat&&s.batteryConnection==='Banco común autorizado';out.common=common;
 if(bat&&!common&&s.batteryConnection!=='Bancos independientes')errors.push('Declara bancos independientes o banco común autorizado.');
 if(common){
   if(!String(s.factoryConfirmation||'').trim()||!String(s.bmsProtocol||'').trim())errors.push('Banco común: requiere referencia de autorización OEM y protocolo BMS maestro.');
   for(const k of ['bmsChargeKW','bmsDischargeKW','batteryMinV','batteryMaxV'])if(n(s[k])===null||num(s[k])<=0)errors.push('Banco común: falta límite confirmado '+k+'.');
   if(num(s.batteryMinV)>=num(s.batteryMaxV))errors.push('Banco común: rango de tensión BESS incoherente.');
   for(const k of ['chargeEff','eff','dod','soc'])if(n(s[k])===null||num(s[k])<0||num(s[k])>100||(['chargeEff','eff'].includes(k)&&num(s[k])===0))errors.push('Banco común: porcentaje inválido '+k+'.');
   for(const k of ['bcharge','bdischarge'])if(n(s[k]??s.bpower)===null||num(s[k]??s.bpower)<0)errors.push('Banco común: límite operativo inválido '+k+'.');
 }
 const gen=has('Generador')&&s.genEnabled&&num(s.generator)>0,micro=pv&&s.optimizerMode==='Microinversores AC';
 const sharedGen=gen&&common&&(!['deficit','schedule'].includes(s.genMode||'deficit')||(s.genTarget||'loads')!=='loads');
 if(sharedGen&&(!['deficit','schedule','soc','combined'].includes(s.genMode||'deficit')||!['loads','charge','both'].includes(s.genTarget||'loads')))errors.push('Modo de generación no reconocido.');
 if(sharedGen&&(s.genTarget||'loads')!=='loads'&&!(num(s.genChargeLimit)>0))errors.push('Banco común: declara límite total de recarga por generadores.');
 if(sharedGen&&['soc','combined'].includes(s.genMode)&&(!(num(s.genSocStart)>=0)||num(s.genSocStart)>=num(s.genSocStop)||num(s.genSocStop)>100||n(s.genSocStart)===null||n(s.genSocStop)===null))errors.push('Banco común: umbrales SOC de generación inválidos.');
 if(gen&&!eq(gs.reduce((t,g)=>t+num(g.genKW),0),num(s.generator)))errors.push('La suma de potencias nominales de generadores por grupo debe igualar la potencia global.');
 if(micro&&(!Number.isInteger(num(s.panels))||!Number.isInteger(num(s.microCount))||gs.reduce((t,g)=>t+num(g.microPanels),0)!==num(s.panels)||gs.reduce((t,g)=>t+num(g.microUnits),0)!==num(s.microCount)))errors.push('La asignación de módulos y microinversores por grupo debe coincidir con los totales.');
 const a=acArchitectureCheck(s);for(const msg of a.issues)if(msg.includes('no coincide'))errors.push(msg);
 const ids=new Set();for(const g of gs){const name=g.name||'Grupo';if(!g.id||ids.has(g.id))errors.push('Identificadores de grupos ausentes o duplicados.');ids.add(g.id);const r=acGroupCheck(g);
  for(const k of ['loadShare',...(bat&&!common?['batteryShare']:[]),...(grid?['gridShare']:[])])if(n(g[k])===null||num(g[k])<0||num(g[k])>100)errors.push(name+': '+k+' requiere porcentaje explícito entre 0 y 100.');
  if(!Number.isInteger(num(g.units))||num(g.units)<1||num(g.unitKW)<=0||num(g.unitKVA)<=0||num(g.pf)<=0||num(g.pf)>1||num(g.lineLimitA)<=0||r.demand===null||r.demand<=0&&num(g.loadShare)>0)errors.push(name+': faltan capacidades, tensiones, límite por línea o proporciones de carga por fase.');
  if(gen){
   if(n(g.genKW)===null||num(g.genKW)<0)errors.push(name+': declara potencia de generador propia (0 si no tiene).');
   if(num(g.genKW)>0){
    if(!String(g.genReference||'').trim())errors.push(name+': falta referencia de generador y transferencia eléctrica dedicada.');
    if(n(g.genKVA)===null||num(g.genKVA)<=0||num(g.genPF)<=0||num(g.genPF)>1||num(g.genKW)>num(g.genKVA)*num(g.genPF)+1e-6)errors.push(name+': potencia kW/kVA/FP de generador incoherente.');
    if(sharedGen&&(s.genTarget||'loads')!=='loads'&&(g.genChargeApproval!=='Confirmado por fabricante'||n(g.genChargeKW)===null||num(g.genChargeKW)<0||num(g.genChargeKW)>num(g.genKW)||!String(g.genChargeReference||'').trim()))errors.push(name+': recarga del banco común requiere autorización OEM, referencia del cargador/transferencia y límite de recarga individual.');
    if(sharedGen&&num(g.genChargeKW)>0&&num(g.bessChargeKW)<=0)errors.push(name+': la rama DC no admite la recarga de generador declarada.');
    if(s.genFuelMode==='Limitar por combustible'){
     const curve=['genFuelIdle','genFuel25','genFuel50','genFuel75','genFuel100'].map(k=>n(g[k]));
     if(n(g.genAvailableFuel)===null||num(g.genAvailableFuel)<0||curve.some((v,i)=>v===null||v<=0||i>0&&v<curve[i-1])||['genWarmup','genCooldown'].some(k=>n(g[k])===null||num(g[k])<0||num(g[k])>1440))errors.push(name+': combustible y curva de consumo independientes incompletos.');
    }
   }
  }
  if(micro){
   if(['microPanels','microUnits'].some(k=>n(g[k])===null||!Number.isInteger(num(g[k]))||num(g[k])<0)||num(g.microPanels)>num(g.microUnits)*num(s.microInputs))errors.push(name+': módulos/entradas de microinversor no coinciden.');
   if(num(g.microPanels)>0&&(!String(g.microReference||'').trim()||num(s.microAC)<=0||num(s.microInputs)<=0))errors.push(name+': falta ficha y referencia de acoplamiento AC.');
   if(num(g.microPanels)>0&&bat&&(common?num(g.bessChargeKW)>0||num(g.bessDischargeKW)>0:num(g.batteryShare)>0)&&g.microCoupleApproval!=='Confirmado por fabricante')errors.push(name+': requiere confirmar acoplamiento AC con inversor de batería.');
   if(g.microIslandApproval==='Confirmado por fabricante'&&gen&&num(g.genKW)>0)errors.push(name+': operación simultánea de generador e isla de microinversores no modelada.');
   if(g.microIslandApproval==='Confirmado por fabricante'&&(!(num(g.microIslandKW)>0)||!String(g.microReference||'').trim()||!bat||(common?num(g.bessDischargeKW)<=0:num(g.batteryShare)<=0)||g.microCoupleApproval!=='Confirmado por fabricante'))errors.push(name+': isla AC requiere BESS local, límite y referencia OEM.');
  }
  if(common){for(const k of ['bessChargeKW','bessDischargeKW'])if(n(g[k])===null||num(g[k])<0)errors.push(name+': declara límite DC por rama '+k+' (0 si no conectado).');if(!String(g.bessReference||'').trim())errors.push(name+': falta referencia de compatibilidad/protección de la rama DC.');}
  if(num(g.units)>1&&g.parallelApproval!=='Confirmado por fabricante')errors.push(name+': paralelo interno sin confirmación.');
  for(const msg of r.issues)if(msg.includes('topología'))errors.push(name+': '+msg);
 }
 for(const [key,label,required] of [['loadShare','demanda',true],['batteryShare','batería',bat&&!common],['gridShare','red',grid]])if(required&&!eq(gs.reduce((t,g)=>t+num(g[key]),0),100))errors.push('La asignación total de '+label+' debe sumar 100 %.');
 const model=pv?pvModel(s):null;
 if(pv&&!micro&&num(s.panels)>0&&(!model.layout||!model.assignments.length||a.units!==num(s.inverterCount)||num(s.mpptPerInverter)<1))errors.push('El reparto FV necesita strings asignados por inversor y MPPT y cantidades coherentes.');
 if(pv&&!micro&&num(s.panels)>0&&num(s.pvDcMax)>0){if(gs.some(g=>n(g.dcLimitKW)===null||num(g.dcLimitKW)<0)||gs.reduce((t,g)=>t+num(g.dcLimitKW),0)>num(s.pvDcMax)+1e-6)errors.push('Declara límites FV DC por grupo sin superar el límite total.');}
 if(errors.length)return out;
 const base=calculate(s);let offset=0;
 const equipmentMode=s.acDemandMode==='Equipos por tablero';
 if(equipmentMode){
  if(!s.useLoads)errors.push('Activa el inventario detallado para repartir equipos por tablero.');
  for(const r of s.loads||[])if(!ids.has(r.acGroupId))errors.push('Equipo sin tablero válido: '+(r.name||'Sin nombre'));
 }
 if(errors.length)return out;
 const inventory=equipmentMode?inventoryDemand(s):null;
 const localProfiles=new Map(equipmentMode?gs.map(g=>{const l={...s,loads:(s.loads||[]).filter(r=>r.acGroupId===g.id)};return [g.id,s.loadCalendarMode===true?Array.from({length:7},(_,d)=>weekdayInventory(l,d).profile):inventoryDemand(l).profile]}):[]);
 const weeklyInventory=equipmentMode&&s.loadCalendarMode===true?Array.from({length:7},(_,d)=>weekdayInventory(s,d).profile):null;
 for(const g of gs){const check=acGroupCheck(g),units=num(g.units),limit=Math.min(units*num(g.unitKW),units*num(g.unitKVA)*num(g.pf),check.demand>0&&Math.max(0,...check.currents)>0?check.demand*num(g.lineLimitA)/Math.max(...check.currents):Infinity);
  const l=num(g.loadShare)/100,b=bat&&!common?num(g.batteryShare)/100:0,q=grid?num(g.gridShare)/100:0;
  const assignments=(model?.assignments||[]).filter(z=>z.unit>offset&&z.unit<=offset+units).map(z=>({unit:z.unit-offset,mppt:z.mppt,series:z.series,strings:z.strings,maxA:z.imax,minV:z.vmin,maxV:z.vmax,maxVoc:z.vabs,maxIsc:z.iscmax}));
  const panels=micro?num(g.microPanels):assignments.reduce((t,z)=>t+z.series*z.strings,0),first=offset+1;offset+=units;
  if(pv&&!micro&&panels>0&&num(s.pvDcMax)>0&&num(g.dcLimitKW)<=0){errors.push((g.name||'Grupo')+': límite FV DC positivo requerido para módulos asignados.');continue;}
  const x={...s,panels,inverter:limit,inverterCount:units,unitInverter:num(g.unitKW),pvAssignments:assignments,pvSeries:assignments[0]?.series||0,pvParallel:assignments.reduce((t,z)=>t+z.strings,0),pvMppt:units*num(s.mpptPerInverter),pvDcMax:num(g.dcLimitKW),battery:num(s.battery)*b,bcharge:num(s.bcharge??s.bpower)*b,bdischarge:num(s.bdischarge??s.bpower)*b,bpower:num(s.bpower)*b,bmsChargeKW:n(s.bmsChargeKW)===null?null:num(s.bmsChargeKW)*b,bmsDischargeKW:n(s.bmsDischargeKW)===null?null:num(s.bmsDischargeKW)*b,gridLimit:num(s.gridLimit)*q,gridCharge:num(s.gridCharge)*q,genEnabled:false};
  if(gen&&num(g.genKW)>0&&!sharedGen)Object.assign(x,{genEnabled:true,generator:num(g.genKW),genKva:num(g.genKVA),genPF:num(g.genPF),genOnlyOutage:true,genChargeLimit:Math.min(num(s.genChargeLimit)*num(g.genKW)/num(s.generator),num(g.genKW)),...Object.fromEntries(['genAvailableFuel','genFuelIdle','genFuel25','genFuel50','genFuel75','genFuel100','genWarmup','genCooldown'].map(k=>[k,n(g[k])]))});
  else Object.assign(x,{genEnabled:false,generator:0,genFuelMode:null});
  if(micro)Object.assign(x,{microCount:num(g.microUnits),microIslandMode:g.microIslandApproval==='Confirmado por fabricante'?'Aprobada por fabricante':'No aprobada',microIslandKW:num(g.microIslandKW),pvCoupled:0,requireMicroIslandReserve:true});
  if(!panels)x.modules=x.modules.filter(m=>m!=='Fotovoltaica');
  const loadProfile=equipmentMode?base.rows.map(r=>weeklyInventory?localProfiles.get(g.id)[r.weekday][r.h]+Math.max(0,r.load-weeklyInventory[r.weekday][r.h])*l:r.workday?localProfiles.get(g.id)[r.h]+Math.max(0,r.load-inventory.profile[r.h])*l:r.load*l):null;
  const r=calculate(x,{loadScale:l,loadProfile});
  for(const warning of new Set(r.solar?.warnings||[]))notes.push((g.name||'Grupo')+': '+warning);
  const peak=Math.max(0,...r.rows.map(z=>z.load));if(peak>check.demand+1e-6)notes.push((g.name||'Grupo')+': pico simulado superior a la demanda simultánea declarada; revisar el perfil y corrientes.');
  out.groups.push({id:g.id,name:g.name,firstUnit:first,lastUnit:offset,panels,limit,peak,nominalBattery:x.battery,...r});
 }
 if(errors.length){out.groups=[];return out;}
 if(common)dispatchCommonBank(s,out,gs,sharedGen);
 const total=k=>out.groups.reduce((t,g)=>t+g[k],0);out.summary={loadTotal:total('loadTotal'),pvTotal:total('pvTotal'),unmet:total('unmet'),gridTotal:total('gridTotal'),genTotal:total('genTotal'),spill:total('spill'),effectiveBattery:common?out.bank.capacity:total('effectiveBattery'),end:common?out.bank.end:out.groups.reduce((t,g)=>t+g.rows.at(-1).soc,0),aggregateUnmet:base.unmet};
 if(!eq(out.summary.loadTotal,base.loadTotal))errors.push('Error de reconciliación de demanda.');
 if(pv&&out.groups.reduce((t,g)=>t+g.panels,0)!==num(s.panels))errors.push('Error de reconciliación de paneles.');
 if(errors.length){out.groups=[];out.summary=null;return out;}
 notes.push(common?'Banco común: un único SOC y límites DC del BMS maestro y por rama; asignación proporcional a la solicitud de cada grupo. Prioridad a descarga; no se admite carga y descarga simultáneas. No hay intercambio AC directo entre tableros.':'Cada grupo usa un porcentaje fijo del perfil horario de la instalación, la misma curva solar y parámetros de batería; potencia BMS y recarga se reparten proporcionalmente.');notes.push(equipmentMode?'Cada equipo usa su tablero asignado y su horario. Las ampliaciones, EV, consumos auxiliares y el mínimo residual de descanso se distribuyen por porcentaje declarado. Si se activa el calendario por equipo, se respetan también sus días de actividad.':'Los perfiles de demanda son proporcionales y usan la misma curva solar.');notes.push('No representa transitorios ni un control OEM certificado.');
 if(gen)notes.push('Generadores dedicados: curva y combustible por grupo; transferencia solo durante apagones, sin fuente común ni paralelo con red. Horarios y modos siguen la configuración general.'+(sharedGen?' Recarga del banco común limitada por fuente, rama, conversión, BMS y SOC; prioridad a descarga, sin recarga concurrente.':' '));
 if(micro)notes.push('Microinversores por grupo: entradas, potencia e isla declaradas localmente; sin referencia de isla se desconectan durante apagones. Acoplamiento AC y límites de transferencia requieren validación OEM.');
 notes.push('El límite de conversión considera kW, kVA y el patrón de corrientes declarado; no simula corrientes armónicas, protecciones, límites de paso de red ni transitorios.');
 return out;
}

// Banco DC único: solicitudes AC-equivalentes, restricciones BMS en el lado DC.
// Se asigna cada recurso una sola vez; no se autoriza un paralelo AC.
function dispatchCommonBank(s,out,defs,sharedGen=false){
 const num=(v,d=0)=>v==null||v===''||!Number.isFinite(+v)?d:+v;
 const cap=Math.max(0,num(s.battery))*Math.max(0,Math.min(100,num(s.batterySOH,100)))/100;
 const floor=cap*(1-num(s.dod)/100),ce=num(s.chargeEff)/100,de=num(s.eff)/100;
 let soc=cap*num(s.soc)/100;const start=soc,history=[];
 const micro=s.optimizerMode==='Microinversores AC'&&(s.modules||[]).includes('Fotovoltaica');
 const genGiven=sharedGen?defs.map(g=>sharedGenController(s,g)):[],target=s.genTarget||'loads',usesSOC=['soc','combined'].includes(s.genMode);
 let latch=false;
 const pc=Math.min(num(s.bcharge??s.bpower),num(s.bmsChargeKW)/ce),pd=Math.min(num(s.bdischarge??s.bpower),num(s.bmsDischargeKW)*de);
 const allocate=(req,budget)=>{let sum=req.reduce((a,b)=>a+b,0),ratio=sum>0?Math.max(0,Math.min(1,budget/sum)):0;return req.map(v=>v*ratio)};
 for(let i=0;i<out.groups[0].rows.length;i++){
  const rr=out.groups.map(g=>g.rows[i]),initial=soc;
  // La producción AC en isla se recalcula con el SOC único al comienzo de cada hora.
  if(micro)for(let j=0;j<rr.length;j++){let r=rr[j],g=defs[j],solar=out.groups[j].solar?.rows[r.h];if(!solar||r.available)continue;let p=g.microIslandApproval==='Confirmado por fabricante'&&soc>floor+1e-9?Math.min(solar.usable,num(g.microIslandKW)):0;r.pv=p;r.pvDirect=Math.min(r.load,p);r.need=r.load-r.pvDirect;r.spill=p-r.pvDirect;r.pvUnavailable=solar.usable-p;r.pvClipped=solar.clip+r.pvUnavailable;}
  if(usesSOC){if(soc>=cap*num(s.genSocStop)/100-1e-8)latch=false;else if(soc<=cap*num(s.genSocStart)/100+1e-8)latch=true;}
  const gc=sharedGen?rr.map((r,j)=>sharedGenHour(genGiven[j],r,latch)):rr.map(()=>null);
  if(sharedGen)for(let j=0;j<rr.length;j++){let r=rr[j],v=gc[j];r.genDirect=target==='charge'?0:Math.min(r.need,v.cap);r.gen=r.genDirect;r.need-=r.genDirect;}
  // Las filas se calcularon sin batería; PV directo y red no se duplican.
  let request=rr.map((r,j)=>Math.min(r.need,Math.max(0,out.groups[j].limit-(micro?0:r.pvDirect)),num(defs[j].bessDischargeKW)*de));
  let dis=allocate(request,Math.min(pd,Math.max(0,soc-floor)*de));
  const d=dis.reduce((a,b)=>a+b,0);soc-=d/de;
  let pvCharge=rr.map(()=>0),gridCharge=rr.map(()=>0),genCharge=rr.map(()=>0);
  if(d<=1e-12){
   const branch=rr.map((r,j)=>Math.min(num(defs[j].bessChargeKW)/ce,Number(s.pvCoupled)===1&&s.pvMode!=='legacy'?Infinity:Math.max(0,out.groups[j].limit-(micro?0:r.pvDirect))));
   const budget=()=>Math.min(pc,Math.max(0,cap-soc)/ce);
   pvCharge=allocate(rr.map((r,j)=>Math.min(r.spill,branch[j])),budget());
   const pv=pvCharge.reduce((a,b)=>a+b,0);soc+=pv*ce;
   if(sharedGen&&target!=='loads'){
    const limit=usesSOC?Math.max(0,cap*num(s.genSocStop)/100-soc)/ce:Math.max(0,cap-soc)/ce;
    genCharge=allocate(rr.map((r,j)=>Math.max(0,Math.min(gc[j].cap-r.gen,num(defs[j].genChargeKW),branch[j]-pvCharge[j],out.groups[j].limit-(micro?0:r.pvDirect)-pvCharge[j]))),Math.min(num(s.genChargeLimit),Math.max(0,pc-pv),limit));
    soc+=genCharge.reduce((a,b)=>a+b,0)*ce;
   }
   gridCharge=allocate(rr.map((r,j)=>r.available?Math.max(0,Math.min(num(s.gridCharge)*num(defs[j].gridShare)/100,num(s.gridLimit)*num(defs[j].gridShare)/100-r.grid,branch[j]-pvCharge[j]-genCharge[j],out.groups[j].limit-(micro?0:r.pvDirect)-pvCharge[j]-genCharge[j])):0),Math.min(Math.max(0,pc-pv-genCharge.reduce((a,b)=>a+b,0)),Math.max(0,cap-soc)/ce));
   soc+=gridCharge.reduce((a,b)=>a+b,0)*ce;
  }
  for(let j=0;j<rr.length;j++){const r=rr[j];r.dis=dis[j];r.need=Math.max(0,r.need-r.dis);r.pvCharge=pvCharge[j];r.gridRecharge=gridCharge[j];if(sharedGen){r.genRecharge=genCharge[j];r.gen+=r.genRecharge;sharedGenSettle(genGiven[j],gc[j],r);}r.ch=r.pvCharge+r.gridRecharge+(sharedGen?r.genRecharge:0);r.grid+=r.gridRecharge;r.spill=Math.max(0,r.spill-r.pvCharge);r.loss=r.ch*(1-ce)+r.dis*(1/de-1);r.soc=null;r.socStart=null;}
  history.push({i,h:rr[0].h,day:rr[0].day,socStart:initial,soc,dis:d,ch:pvCharge.reduce((a,b)=>a+b,0)+gridCharge.reduce((a,b)=>a+b,0)+genCharge.reduce((a,b)=>a+b,0)});
 }
 for(const [j,g] of out.groups.entries()){g.unmet=g.rows.reduce((a,r)=>a+r.need,0);g.gridTotal=g.rows.reduce((a,r)=>a+r.grid,0);g.genTotal=g.rows.reduce((a,r)=>a+r.gen,0);g.pvTotal=g.rows.reduce((a,r)=>a+r.pv,0);g.spill=g.rows.reduce((a,r)=>a+r.spill,0);if(sharedGen){g.fuelModel=genGiven[j].limited;g.fuelValid=genGiven[j].limited;g.fuelLeft=genGiven[j].fuel;g.fuelUsed=genGiven[j].limited?genGiven[j].initial-genGiven[j].fuel:null;}}
 out.bank={capacity:cap,start,end:soc,floor,history,chargeLimitDC:num(s.bmsChargeKW),dischargeLimitDC:num(s.bmsDischargeKW)};
}

// Fuente dedicada en banco común. Potencias medias horarias, sin paralelo AC.
function sharedGenController(s,g){const n=(v,d=0)=>v==null||v===''||!Number.isFinite(+v)?d:+v;let rated=Math.max(0,Math.min(n(g.genKW),n(g.genKVA)*n(g.genPF))),limited=rated>0&&s.genFuelMode==='Limitar por combustible',fuel=limited?n(g.genAvailableFuel):null;return {rated,limited,fuel,initial:fuel,curve:['genFuelIdle','genFuel25','genFuel50','genFuel75','genFuel100'].map(k=>n(g[k])),warm:n(g.genWarmup)/60,cool:n(g.genCooldown)/60,mode:s.genMode||'deficit',intervals:s.genIntervals||[],maxHours:Math.max(0,Math.min(24,Math.trunc(n(s.genMaxHours,24)))),day:-1,used:0,state:'off',remaining:0};}
function sharedGenHour(c,r,latch){let v={cap:0,runtime:0,idle:0,start:c.fuel,allowed:false};if(!c.rated)return v;if(c.day!==r.day){c.day=r.day;c.used=0;}let scheduled=c.intervals.some(o=>active(r.h,+o.start||0,+o.hours||0));let allowed=!r.available&&c.used<c.maxHours&&(!['schedule','combined'].includes(c.mode)||scheduled)&&(!['soc','combined'].includes(c.mode)||latch)&&(c.mode!=='deficit'||r.need>0);
 if(!c.limited){v.allowed=allowed;v.cap=allowed?c.rated:0;return v;}
 if(c.fuel<=1e-9){c.state='off';return v;}
 let time=1;const idle=t=>{let z=Math.max(0,Math.min(time,t,c.fuel/c.curve[0]));c.fuel-=z*c.curve[0];v.idle+=z;time-=z;return z;};
 if(!allowed&&['run','warm'].includes(c.state)){c.state='cool';c.remaining=c.cool;}
 if(c.state==='cool'){c.remaining=Math.max(0,c.remaining-idle(c.remaining));if(c.remaining<=1e-9)c.state='off';}
 if(allowed&&time>1e-9&&c.fuel>1e-9){if(c.state==='off'){c.state='warm';c.remaining=c.warm;}time=Math.min(time,Math.max(0,c.maxHours-c.used-v.idle));if(c.state==='warm'){c.remaining=Math.max(0,c.remaining-idle(c.remaining));if(c.remaining<=1e-9)c.state='run';}if(c.state==='run'&&time>1e-9&&c.fuel>1e-9){v.runtime=c.fuel<c.curve[0]*time?Math.min(time,c.fuel/c.curve[4]):time;let lo=0,hi=c.rated;for(let i=0;i<55;i++){let m=(lo+hi)/2;if(sharedGenRate(c,m)*v.runtime<=c.fuel+1e-10)lo=m;else hi=m;}v.cap=lo*v.runtime;}}
 v.allowed=allowed&&v.cap>1e-9;return v;}
function sharedGenRate(c,kw){let z=Math.min(4,Math.max(0,kw/Math.max(c.rated,1e-9)*4)),i=Math.min(3,Math.floor(z));return c.curve[i]+(z-i)*(c.curve[i+1]-c.curve[i]);}
function sharedGenSettle(c,v,r){if(c.limited){if(v.runtime>0)c.fuel=Math.max(0,c.fuel-Math.min(c.fuel,sharedGenRate(c,r.gen/v.runtime)*v.runtime));c.used+=v.runtime+v.idle;if(c.fuel<=1e-9)c.state='off';}else if(r.gen>1e-8)c.used++;Object.assign(r,{genAllowed:v.allowed,genRunning:r.gen>1e-8,genRuntime:c.limited?v.runtime:r.gen>1e-8?1:0,genIdleTime:v.idle,genFuelStart:v.start,genFuelLeft:c.fuel,genFuelUsed:c.limited?v.start-c.fuel:null,genState:c.limited?c.state:r.gen>1e-8?'run':'off'});}

// Un solo resultado de presentación: suma flujos por grupo sin sumar dos veces
// el banco común. El balance agregado queda como referencia explícita.
function mergeGroupBalance(base,d){
 if(!d?.active)return {...base,groupStatus:'aggregate'};
 if(!d.summary)return {...base,groupStatus:'invalid',groupErrors:d.errors};
 const sum=(a,k)=>a.reduce((t,z)=>t+(Number.isFinite(z[k])?z[k]:0),0),optional=(a,k)=>a.some(z=>Number.isFinite(z[k]))?sum(a,k):null;
 const rows=base.rows.map((r,i)=>{let a=d.groups.map(g=>g.rows[i]),o={...r};for(let k of ['load','pv','grid','gen','genDirect','genRecharge','dis','ch','need','pvDC','pvClipped','pvShadeLoss','pvUnavailable','gridRecharge','pvCharge','pvDirect','spill','loss','genIdleTime'])o[k]=sum(a,k);for(let k of ['genFuelUsed','genFuelStart','genFuelLeft'])o[k]=optional(a,k);o.genRunning=a.some(z=>z.genRunning);o.genAllowed=a.some(z=>z.genAllowed);o.genRuntime=Math.max(0,...a.map(z=>z.genRuntime||0));o.genState=o.genRunning?'run':'off';o.socStart=d.common?d.bank.history[i].socStart:sum(a,'socStart');o.soc=d.common?d.bank.history[i].soc:sum(a,'soc');return o;});
 return {...base,rows,loadTotal:d.summary.loadTotal,pvTotal:d.summary.pvTotal,unmet:d.summary.unmet,gridTotal:d.summary.gridTotal,genTotal:d.summary.genTotal,spill:d.summary.spill,effectiveBattery:d.summary.effectiveBattery,fuelUsed:optional(d.groups,'fuelUsed'),fuelLeft:optional(d.groups,'fuelLeft'),fuelWarnings:d.groups.flatMap(g=>(g.fuelWarnings||[]).map(w=>g.name+': '+w)),groupStatus:'groups',aggregateUnmet:d.summary.aggregateUnmet};
}
