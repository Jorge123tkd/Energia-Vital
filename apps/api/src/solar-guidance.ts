/** Asesoramiento solar por chat: estimación comercial, NO diseño eléctrico. */
export type SolarStage =
  | 'ownership' | 'sector' | 'level' | 'simple-loads' | 'phase' | 'origin'
  | 'power' | 'measurement' | 'hours' | 'essential' | 'inverter' | 'backup' | 'sun';
export type SimpleLoad = { name:string; watts:number; hours:number; units:number; critical:boolean; duty:number };
export type SolarState = {
  stage:SolarStage;
  sector?: 'residencial'|'privado'|'estatal';
  level?: 'basico'|'tecnico';
  phase?: 'monofasica'|'bifasica'|'trifasica';
  origin?: 'equipos'|'medicion';
  watts?:number;hours?:number; backup?:number;
  essentialPercent?:number; simpleLoads?:SimpleLoad[]; onlyCritical?:boolean;
  existingInverter?:string;
};
type StepResult={handled:boolean;state:SolarState|null;reply:string};
const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const numbers=(s:string)=>(s.match(/\d+(?:[.,]\d+)?/g)||[]).map(x=>Number(x.replace(',','.')));
const valid=(x:number,min:number,max:number)=>Number.isFinite(x)&&x>=min&&x<=max;
const ownershipQuestion='¡Empecemos tu estudio solar Bonaire! Antes de calcular: ¿ya tienes un inversor?\n\n1. No, necesito un sistema nuevo.\n2. Sí, tengo un inversor y quiero aprovecharlo o ampliarlo.\n\nResponde 1 o 2. Si lo tienes y sabes la marca, puedes escribir «sí, marca y modelo».';
const sectorQuestion='¿Para qué necesitas energía?\n\n1. Vivienda o residencial\n2. Negocio privado\n3. Centro estatal\n\nResponde 1, 2 o 3.';
const levelQuestion='¿Cuánta experiencia tienes con los datos eléctricos?\n\n1. Guía sencilla: dime tus electrodomésticos y estimaremos valores habituales.\n2. Modo técnico: conozco potencias, lecturas o datos del equipo.\n\nResponde 1 o 2.';
const loadsQuestion='Escribe los equipos que tienes y la cantidad, separados por comas. Por ejemplo: «1 refrigerador, 1 televisor, 2 ventiladores, 6 luces LED, 1 router».\n\nUsaremos potencias y horas orientativas que podrás ajustar después desde «Asesor solar» en Bonaire.';
const phaseQuestion='Para el cálculo técnico, ¿qué tipo de instalación tienes?\n\n1. Monofásica\n2. Dos líneas / 220 V\n3. Trifásica\n\nResponde 1, 2 o 3.';
const originQuestion='¿De dónde vienen tus datos de consumo?\n\n1. Ya sumé las potencias de los equipos en vatios (W).\n2. Medí voltaje y amperios de las cargas encendidas.\n\nEl amperaje del breaker NO es el consumo. Responde 1 o 2.';
const inverterQuestion='¿Ya tienes inversor solar? Responde «no» o «sí, marca y modelo». Si no sabes su modelo, escribe «sí». No te recomendaré conexiones serie/paralelo sin su ficha técnica y la de los paneles.';
const catalogue=[
  {name:'Refrigerador',words:/nevera|frio|refrigerador|refri|congelador/,watts:150,hours:8,duty:0.40,critical:true},
  {name:'Televisor',words:/televisor|television|tv\b/,watts:90,hours:5,duty:1,critical:false},
  {name:'Ventilador',words:/ventilador|abanico/,watts:65,hours:8,duty:1,critical:true},
  {name:'Bombilla LED',words:/bombilla|bombillo|luces|foco|lampara|led/,watts:10,hours:5,duty:1,critical:true},
  {name:'Router',words:/router|modem|internet|wifi/,watts:15,hours:10,duty:1,critical:true},
  {name:'Aire acondicionado',words:/\b(?:aires?|airas?)\s+acondicionad[oa]s?\b|\b(?:mini\s*)?splits?\b/,watts:1200,hours:5,duty:1,critical:false},
  {name:'Bomba de agua',words:/bomba/,watts:750,hours:1,duty:1,critical:false},
  {name:'Computadora',words:/computadora|ordenador|pc\b|laptop/,watts:150,hours:6,duty:1,critical:false},
  {name:'Lavadora',words:/lavadora/,watts:600,hours:1,duty:1,critical:false},
  {name:'Microondas',words:/microondas/,watts:1200,hours:0.4,duty:1,critical:false},
];
export function parseLoads(input:string):SimpleLoad[]{
  const items:SimpleLoad[]=[];
  for(const chunk of input.split(/[,;\n]+/).slice(0,30)){
    const part=normalize(chunk);
    const known=catalogue.find(x=>x.words.test(part));
    if(!known)continue;
    const matches=part.match(/\d{1,3}/g);
    const qty=matches?Number(matches[0]):1;
    if(!Number.isInteger(qty)||qty<1||qty>100)continue;
    const existing=items.find(x=>x.name===known.name);
    if(existing)existing.units+=qty;
    else items.push({name:known.name,watts:known.watts,hours:known.hours,units:qty,
      critical:known.critical,duty:known.duty});
  }
  return items;
}
const flowStart=/asesoramiento solar|asesoria solar|asesor solar|dimensionar (?:mi|un|el) sistema|calcular (?:mi|un|el) sistema solar|empezar (?:el|un) calculo solar|estudio solar paso a paso/;
function finalEstimate(s:SolarState,hsp:number):string{
  const isBasic=s.level==='basico';
  const loads=s.simpleLoads||[];
  const power=isBasic?loads.reduce((sum,x)=>sum+x.watts*x.units,0):(s.watts||0);
  const daily=isBasic?loads.reduce((sum,x)=>sum+x.watts*x.units*x.hours/1000,0):power*(s.hours||0)/1000;
  const critical=isBasic?loads.filter(x=>!s.onlyCritical||x.critical):[];
  const avgBackup=isBasic?critical.reduce((sum,x)=>sum+x.watts*x.units*x.duty,0):
    power*(s.essentialPercent??35)/100;
  const criticalPeak=isBasic?critical.reduce((sum,x)=>sum+x.watts*x.units,0):
    power*(s.essentialPercent??35)/100;
  const backup=s.backup||0;
  const battery=avgBackup*backup/1000/(.8*.9);
  const pv=daily/(hsp*.75);
  const panels=Math.ceil(pv*1000/450);
  const inverter=criticalPeak*1.25;
  const tiers=s.sector==='residencial'?[5,10,12,15]:s.sector==='privado'?[10,15,20,30]:[15,30,50];
  const sample=tiers.find(x=>x>=battery)||tiers[tiers.length-1];
  const fits=battery<=sample;
  const sampleHours=avgBackup>0?sample*1000*.72/avgBackup:0;
  const maxWatts=sample*1000*.72/backup;
  const loadLines=isBasic?'\n\nSupuestos por equipo (orientativos, no medidos):\n'+loads.map(x=>
    '• '+x.units+' × '+x.name+' · '+x.watts+' W · '+x.hours+' h/día'+
    (x.critical?' · esencial':'')).join('\n'):'';
  return 'Estimación inicial de Bonaire ('+(s.sector||'residencial')+', '+(isBasic?'guía sencilla':'datos técnicos')+'):\n\n'+
    '• Potencia simultánea total: '+power.toFixed(0)+' W\n'+
    '• Consumo diario total: '+daily.toFixed(2)+' kWh\n'+
    '• Potencia media de cargas a respaldar: '+avgBackup.toFixed(0)+' W\n'+
    '• Batería nominal TEÓRICA para '+backup+' h: '+battery.toFixed(2)+' kWh\n'+
    '• Inversor orientativo para cargas esenciales: '+inverter.toFixed(0)+' W (sin picos de arranque)\n'+
    '• Paneles aproximados por energía diaria: '+panels+' de 450 W ('+pv.toFixed(2)+' kWp).'+
    loadLines+'\n\n'+
    (fits?'Referencia de banco nominal: '+sample+' kWh podría cubrir la energía calculada con los supuestos usados.':
      'Para este sector, '+sample+' kWh es una referencia comercial, NO cubriría las '+backup+
      ' h: daría unas '+sampleHours.toFixed(1)+' h. Para alcanzar '+backup+
      ' h con esa capacidad habría que reducir la carga media a unos '+maxWatts.toFixed(0)+
      ' W o estudiar más almacenamiento. Prioriza cargas esenciales; evita mantener aire acondicionado y bombas innecesarias.')+
    '\n\n'+(s.existingInverter&&s.existingInverter!=='no'?
      'Inversor existente: '+s.existingInverter+'. Verificar ficha del fabricante antes de comprar paneles.':
      'Si ya tienes un inversor, será necesario conocer su ficha técnica.')+
    '\nNunca conectes '+panels+' paneles en serie o paralelo basándote solo en el conteo: hacen falta Voc, Vmp, Isc, coeficientes de temperatura y límites de cada MPPT.'+
    (loads.some(x=>x.name==='Aire acondicionado')
      ?'\nATENCIÓN: cada aire acondicionado se estimó provisionalmente en 1.200 W. Confirma los datos de placa, el tipo inverter, horas reales y arranque; con dos aires la batería y el inversor pueden necesitar capacidades considerablemente mayores.':'')+
    '\n\nSupuestos: 80% de descarga, 90% de eficiencia de batería y 75% de rendimiento fotovoltaico. Los paneles son una opción para generación diurna, no se presupone que ya existan. El diseño final requiere revisar sombras, temperaturas, arranques, protecciones y equipo real.'+
    '\n\nPuedes detallar cada aparato en la página «Asesor solar» o solicitar una evaluación técnica.';
}
export function advanceSolarGuidance(input:string,previous?:SolarState|null):StepResult{
  const message=normalize(input);
  const reset=/^(reiniciar|empezar de nuevo|nuevo calculo)$/.test(message);
  const cancel=/^(cancelar|salir de asesoria|terminar asesoria|detener calculo)$/.test(message);
  if(cancel&&previous)return {handled:true,state:null,reply:'Asesoramiento cancelado. Escribe «asesoramiento solar» cuando quieras retomarlo.'};
  if((reset&&previous)||flowStart.test(message))
    return {handled:true,state:{stage:'ownership'},reply:ownershipQuestion};
  if(!previous)return {handled:false,state:null,reply:''};
  const invalid=(help:string):StepResult=>({handled:true,state:previous,
    reply:help+'\n\nPuedes escribir «cancelar» o «reiniciar» cuando quieras.'});
  switch(previous.stage){
    case 'ownership':{
      const owns = message==='2'||/^(si|tengo|ya tengo|poseo)\b/.test(message);
      const none = message==='1'||/^(no|ninguno|sin inversor)\b/.test(message);
      if (!owns && !none) return invalid(ownershipQuestion);
      return {handled:true,state:{...previous,existingInverter:owns?(message==='2'?'sí':message):'no',stage:'sector'},
        reply:sectorQuestion};
    }
    case 'sector':{
      const sector=message==='1'||message.includes('residen')||message.includes('vivienda')?'residencial':
        message==='2'||message.includes('privad')||message.includes('negocio')?'privado':
        message==='3'||message.includes('estatal')?'estatal':null;
      if(!sector)return invalid(sectorQuestion);
      return {handled:true,state:{...previous,sector,stage:'level'},reply:levelQuestion};
    }
    case 'level':{
      const level=message==='1'||message.includes('sencill')||message.includes('basico')?'basico':
        message==='2'||message.includes('tecnico')||message.includes('experien')?'tecnico':null;
      if(!level)return invalid(levelQuestion);
      return {handled:true,state:{...previous,level,stage:level==='basico'?'simple-loads':'phase'},
        reply:level==='basico'?loadsQuestion:phaseQuestion};
    }
    case 'simple-loads':{
      const chunks=message.split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).slice(0,30);
      // Si hay varios nombres sin coma, o una cantidad inválida, preguntar
      // antes de calcular y evitar omisiones silenciosas.
      const unknown=chunks.filter(chunk=>{
        const matches=catalogue.filter(item=>item.words.test(chunk));
        const qty=chunk.match(/\d{1,3}/);
        return matches.length!==1 || (qty!==null && (!Number.isInteger(Number(qty[0])) ||
          Number(qty[0])<1 || Number(qty[0])>100));
      });
      const loads=parseLoads(message);
      if(unknown.length){
        const recognized=loads.length ? '\nSí reconocí: '+loads.map(x=>x.units+' × '+x.name).join(', ')+'.' : '';
        return invalid('No reconocí estos equipos: '+unknown.join(', ')+'.'+recognized+
          '\nPrefiero preguntarte antes que omitirlos y calcular una batería insuficiente. Prueba «2 aires acondicionados» o descríbelos en la página Asesor solar.');
      }
      if(!loads.length)return invalid(loadsQuestion+'\nNo reconocí equipos. Usa nombres como nevera, TV, ventiladores, luces LED o aires acondicionados.');
      const summary=loads.map(x=>x.units+' × '+x.name+' ('+x.watts+' W aprox.)').join(', ');
      return {handled:true,state:{...previous,simpleLoads:loads,stage:'essential'},
        reply:'Anoté: '+summary+'.\n\nPara las baterías, ¿qué quieres mantener durante un apagón?\n\n1. Solo esenciales (nevera, luces, ventiladores y router).\n2. Todos los equipos listados.\n\nSi tienes aparatos especiales, el formulario «Asesor solar» te permite detallarlos.'};
    }
    case 'phase':{
      const phase=message==='1'||message.includes('monofas')?'monofasica':
        message==='2'||message.includes('bifas')||message.includes('dos linea')?'bifasica':
        message==='3'||message.includes('trifas')?'trifasica':null;
      if(!phase)return invalid(phaseQuestion);
      return {handled:true,state:{...previous,phase,stage:'origin'},reply:originQuestion};
    }
    case 'origin':{
      const origin=message==='1'||message.includes('equipo')||message.includes('vatios')?'equipos':
        message==='2'||message.includes('medic')||message.includes('amper')?'medicion':null;
      if(!origin)return invalid(originQuestion);
      return origin==='equipos'
        ?{handled:true,state:{...previous,origin,stage:'power'},reply:'¿Cuántos vatios (W) consumen TODOS los equipos encendidos al mismo tiempo? Ejemplo: «850 W». Para sumar cada aparato usa también el formulario «Asesor solar».'}
        :{handled:true,state:{...previous,origin,stage:'measurement'},reply:'Indica voltaje real, amperios medidos bajo carga y factor de potencia, separados por comas. Ejemplo: «220, 8, 0.85». Si no conoces FP, bastan V y A y usaremos 0.85 como supuesto.'};
    }
    case 'power':{
      const values=numbers(message);
      if(values.length!==1||!valid(values[0],1,250000))return invalid('Dime el total aproximado de vatios, por ejemplo «850 W».');
      return {handled:true,state:{...previous,watts:values[0],stage:'hours'},
        reply:'¿Cuántas horas al día funcionan estas cargas? Responde solo un número, por ejemplo «6». Para diferentes horarios por aparato, usa el formulario.'};
    }
    case 'measurement':{
      const vals=numbers(message);
      if((vals.length!==2&&vals.length!==3)||!valid(vals[0],50,600)||!valid(vals[1],.1,1000)||
        (vals.length===3&&!valid(vals[2],.1,1)))
        return invalid('Indica voltaje, amperios medidos y FP opcional. Ejemplo: «220, 8, 0.85».');
      const power=vals[0]*vals[1]*(vals[2]??.85)*(previous.phase==='trifasica'?Math.sqrt(3):1);
      if(!valid(power,1,250000))return invalid('La potencia calculada es demasiado alta. Revisa los datos.');
      return {handled:true,state:{...previous,watts:power,stage:'hours'},
        reply:'Potencia preliminar '+power.toFixed(0)+' W. ¿Cuántas horas al día funcionan estas cargas? Ejemplo: «6».'};
    }
    case 'hours':{
      const vals=numbers(message);
      if(vals.length!==1||!valid(vals[0],.1,24))return invalid('Indica entre 0,1 y 24 horas de uso al día.');
      return {handled:true,state:{...previous,hours:vals[0],stage:'essential'},
        reply:'Durante el apagón, ¿qué parte de esa potencia necesitas mantener?\n\nResponde un porcentaje del 5 al 100, por ejemplo «35» para las cargas esenciales o «100» para todas.'};
    }
    case 'essential':{
      if(previous.level==='basico'){
        // Aceptar opciones conversacionales de Telegram sin romper 1/2 en la web.
        const essentials=message==='1'||/^(solo|solamente|los esenciales|cargas esenciales)/.test(message);
        const all=message==='2'||/^(todos|todo|todos los equipos|todos los aparatos)/.test(message);
        if(!essentials&&!all)return invalid('¿Quieres respaldar solo las cargas esenciales o todos los equipos? Puedes responder con palabras o con 1 / 2.');
        if(essentials && !(previous.simpleLoads||[]).some(x=>x.critical))
          return invalid('De los aparatos que nombraste, ninguno está clasificado como esencial en esta guía. Elige todos los equipos o usa el formulario para indicar cuáles son indispensables.');
        return {handled:true,state:{...previous,onlyCritical:essentials,stage:'backup'},
          reply:'¿Cuántas horas de energía necesitas durante un apagón? Por ejemplo, «10». Si no conoces los vatios de cada aparato usaremos referencias y te diremos cuáles debes confirmar.'};
      }
      const v=numbers(message);
      if(v.length!==1||!valid(v[0],5,100))return invalid('Indica un porcentaje de potencia crítica entre 5 y 100, por ejemplo «35».');
      return {handled:true,state:{...previous,essentialPercent:v[0],stage:'backup'},
        reply:'¿Cuántas horas necesitas que funcione tu sistema durante un apagón? Por ejemplo, «10».'};
    }
    case 'inverter':{
      if(!message||message.length>200)return invalid(inverterQuestion);
      if(!/(^no$|^si\b|^no tengo|^tengo|^inversor)/.test(message))
        return invalid('Responde «no» o «sí, marca y modelo» para el inversor que ya tengas.');
      return {handled:true,state:{...previous,existingInverter:message,stage:'backup'},
        reply:'¿Cuántas horas de autonomía necesitas en un apagón? Ejemplo: «5». Las baterías se calcularán según las cargas que elegiste para respaldo.'};
    }
    case 'backup':{
      const vals=numbers(message);
      if(vals.length!==1||!valid(vals[0],.5,72))return invalid('Responde entre 0,5 y 72 horas, por ejemplo «5».');
      if(previous.level==='basico')return {handled:true,state:null,reply:finalEstimate({...previous,backup:vals[0]},4.5)};
      return {handled:true,state:{...previous,backup:vals[0],stage:'sun'},
        reply:'En modo técnico, ¿qué horas solares pico deseas usar como hipótesis? Por ejemplo, «4,5». Si no las conoces, usa ese valor provisional.'};
    }
    case 'sun':{
      const vals=numbers(message);
      if(vals.length!==1||!valid(vals[0],1,8))return invalid('Introduce entre 1 y 8 horas solares pico; ejemplo: «4,5».');
      return {handled:true,state:null,reply:finalEstimate(previous,vals[0])};
    }
  }
}
