<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import PageHero from './components/PageHero.svelte';
  import CardImage from './components/CardImage.svelte';
  import { DEFAULT_LOADS, estimateSolar, type Load, type SolarOutput, type Sector,
    type Level, type Phase, type Origin, type PvDetails } from './lib/solar-estimator';

  const labels = ['Tu situación', 'Cómo calcular', 'Tus equipos', 'Baterías y paneles', 'Revisar'];
  const sectorOptions: {id:Sector;label:string;info:string}[]=[
    {id:'residencial',label:'Vivienda',info:'Prioridad a refrigeración, luces y servicios esenciales.'},
    {id:'privado',label:'Negocio privado',info:'Diferenciamos servicios esenciales y consumos productivos.'},
    {id:'estatal',label:'Centro estatal',info:'Revisamos la continuidad de operación y cargas críticas.'},
  ];
  let step=$state(0);
  let level=$state<Level>('basico'),sector=$state<Sector>('residencial');
  let phase=$state<Phase>('monofasica'),origin=$state<Origin>('equipos');
  let voltage=$state(220),amps=$state(0),powerFactor=$state(0.85),hoursDaily=$state(6);
  let devices:Load[]=$state([]);
  let nextId=1;
  let autonomyHours=$state(15),peakSunHours=$state(4.5),panelWatts=$state(450);
  // Modo sencillo: se calculan horas solicitadas sin exigir al cliente conocer el horario del apagón.
  // El escenario diurno se muestra por separado como un ejemplo, nunca como pronóstico.
  let outageStartHour=$state(17),hasPanels=$state(false),maxPanels=$state(10);
  let solarWeather=$state<'soleado'|'variable'|'nublado'>('variable');
  let cloudFactor=$derived(solarWeather==='soleado'?1:solarWeather==='variable'?0.7:0.35);
  let essentialPercent=$state(35);
  let existingInverter=$state(false),existingModel=$state(''),existingInverterKw=$state(0);
  let existingPanelCount=$state(0);
  let existingBatteryKWh=$state(0);
  let showSpecs=$state(false);
  let pv: PvDetails=$state({
    maxDcVoltage:0,mpptMin:0,mpptMax:0,mpptCount:0,maxIscPerMppt:0,maxPvWatts:0,
    voc:0,vmp:0,isc:0,vocCoeffPct:0,vmpCoeffPct:0,minAirC:10,maxCellC:65,
  });
  let result:SolarOutput|null=$state(null),error=$state(''),copied=$state(false);
  let solarInputs=$derived({
    sector,level,origin:level==='basico'?'equipos' as Origin:origin,phase,
    loads:devices,voltage,amps,powerFactor,hoursDaily,
    autonomyHours,peakSunHours,panelWatts,essentialPercent,
    existingBatteryKWh,maxPanels,cloudFactor,
    panelDetails:existingInverter&&showSpecs?pv:undefined,
  });
  let estimated=$derived(estimateSolar({
    ...solarInputs,hasPanels:level==='tecnico'&&hasPanels,
    outageStartHour:level==='tecnico'?outageStartHour:17,
  }));
  // Ejemplo diurno independiente: no presupone que el usuario sabe a qué hora cortarán la red.
  let daylightExample=$derived(estimateSolar({
    ...solarInputs,hasPanels:true,outageStartHour:9,
  }));
  type StockItem = {id:string;name:string;category_name?:string;stock_status?:string;
    stock_quantity?:number|null;price?:number|null;currency?:string;
    primary_image_url?:string|null;short_description?:string|null;description?:string|null;
    brand?:string|null;model?:string|null};
  let inventory:StockItem[]=$state([]);
  let inventoryLoading=$state(true),inventoryError=$state('');
  onMount(() => {
    void api.getProducts().then((data: any) => { inventory=data.products ?? []; })
      .catch(() => {inventoryError='No se pudo consultar el catálogo.';})
      .finally(() => {inventoryLoading=false;});
  });
  function normalized(value:string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function nominal(item:StockItem,kind:'bateria'|'panel'|'inversor'):number|null {
    const name=normalized(item.name).replace(',','.');
    const unit=kind==='bateria'?'kwh':kind==='panel'?'w':'kw';
    const found=name.match(new RegExp('([0-9]+(?:\\.[0-9]+)?)\\s*'+unit+'\\b'));
    return found?Number(found[1])*(kind==='inversor'?1000:1):null;
  }
  let recommendations=$derived.by(() => {
    const available=inventory.filter(p => p.stock_status==='in_stock' &&
      (p.stock_quantity===null || p.stock_quantity===undefined || Number(p.stock_quantity)>0));
    const choose=(kind:'bateria'|'panel'|'inversor',target:number) => available.filter(p => {
      const key=normalized((p.category_name||'')+' '+p.name);
      return kind==='bateria'?/bateria|litio|lifepo4|almacenamiento/.test(key)
        :kind==='panel'?/panel|fotovoltaic|modulo solar/.test(key)
        :/inversor|hibrido|convertidor solar/.test(key);
    }).sort((a,b)=>{
      const score=(n:number|null)=>n===null?1e6:n>=target?n-target:1e5+target-n;
      return score(nominal(a,kind))-score(nominal(b,kind));
    }).slice(0,2);
    return {
      baterias:choose('bateria',result?.guideBattery ?? 10),
      inversores:choose('inversor',result?.inverter ?? 5000),
      paneles:choose('panel',panelWatts)
    };
  });
  let recommendedProducts=$derived([
    ...recommendations.baterias.map(item=>({item,family:'Batería',reason:'Alternativa de almacenamiento; revisa capacidad y compatibilidad.'})),
    ...recommendations.paneles.map(item=>({item,family:'Panel solar',reason:'Opción para producir energía durante las horas de sol.'})),
    ...recommendations.inversores.map(item=>({item,family:'Inversor',reason:existingInverter?'Opción de ampliación; comprueba primero si el tuyo sirve.':'Alternativa para las cargas esenciales estimadas.'})),
  ].slice(0,6));
  function addLoad(item?:Omit<Load,'id'>){
    devices=[...devices,item?{...item,id:nextId++}:{
      id:nextId++,name:'',watts:100,units:1,hours:4,critical:false,backupDuty:1,estimate:true,
    }];
  }
  function togglePreset(preset:Omit<Load,'id'>){
    const found=devices.find(l=>l.name===preset.name);
    if(found)devices=devices.filter(l=>l.id!==found.id);
    else addLoad(preset);
  }
  function removeLoad(id:number){devices=devices.filter(l=>l.id!==id);}
  function valid(n:number,lo:number,hi:number){return Number.isFinite(n)&&n>=lo&&n<=hi;}
  function validate(next:number){
    error='';
    if(next===2 && level==='tecnico' && origin==='acometida'){
      error='El interruptor general indica un límite eléctrico, no el consumo. Usa equipos o una medición de cargas reales.';
      return false;
    }
    if(next===3){
      if(level==='basico'||origin==='equipos'){
        if(!devices.length){error='Selecciona al menos un electrodoméstico o añade un equipo.';return false;}
        if(devices.some(d=>!d.name.trim()||!valid(d.watts,1,50000)||!valid(d.units,1,100)||
          !Number.isInteger(d.units)||!valid(d.hours,0.1,24)||!valid(d.backupDuty,0.05,1)||
          (d.critical && d.backupHours!==undefined && !valid(d.backupHours,0.5,autonomyHours)))){
          error='Revisa nombre, potencia, cantidad y horas de cada equipo.';return false;
        }
        if(!devices.some(d=>d.critical)){
          error='Marca al menos un equipo como esencial para calcular la energía de respaldo.';return false;
        }
      }else if(!valid(voltage,50,600)||!valid(amps,0.1,1000)||!valid(powerFactor,0.1,1)||
        !valid(hoursDaily,0.1,24)||!valid(essentialPercent,5,100)){
        error='Comprueba voltaje, amperios medidos, factor de potencia, horas y porcentaje de cargas esenciales.';
        return false;
      }
      if(!valid(estimated.power,1,250000)||!valid(estimated.daily,0.01,1000)){
        error='Los consumos no parecen válidos. Revisa unidades y cantidades.';return false;
      }
    }
    if(next===4 && (!valid(autonomyHours,.5,72)||!valid(peakSunHours,1,8)||
      !valid(panelWatts,100,900)||!valid(existingBatteryKWh,0,5000)||
      !valid(outageStartHour,0,23)||!valid(maxPanels,1,200)||
      !valid(existingInverterKw,0,250)||!valid(existingPanelCount,0,200))){
      error='Comprueba horas de respaldo, horas solares, potencia de panel y batería existente.';return false;
    }
    return true;
  }
  function next(){
    if(step>=4||!validate(step+1))return;
    if(level==='basico')origin='equipos';
    step+=1;window.scrollTo({top:0,behavior:'smooth'});
  }
  function back(){if(step>0)step--;result=null;error='';}
  function calculate(){
    if(!validate(3)||!validate(4))return;
    if(![estimated.daily,estimated.battery,estimated.pv,estimated.inverter].every(Number.isFinite)){
      error='Los datos no permiten un cálculo coherente.';return;
    }
    result=estimated;step=5;error='';window.scrollTo({top:0,behavior:'smooth'});
  }
  function reset(){step=0;devices=[];result=null;error='';copied=false;
    existingInverter=false;existingModel='';existingInverterKw=0;
    existingBatteryKWh=0;existingPanelCount=0;hasPanels=false;outageStartHour=17;}
  function assessment(){
    if(!result)return;
    const query=new URLSearchParams({
      power:result.power.toFixed(0),dailyEnergy:result.daily.toFixed(2),
      batteryCapacity:result.batteryWithSolar.toFixed(2),inverterMin:result.inverter.toFixed(0),
      pvPower:result.plannedPvKW.toFixed(2),panelCount:String(result.plannedPanels),
      sector,experience:level,criticalWatts:result.backupWatts.toFixed(0),
      existingEquipment:existingInverter
        ?('Inversor existente '+(existingModel||'sin modelo')+' · '+(existingInverterKw||'potencia sin confirmar')+' kW · batería '+existingBatteryKWh+' kWh').slice(0,160)
        :devices.map(d=>d.name).join(', ').slice(0,160),
    });
    window.location.href='/contacto?'+query;
  }
  async function copy(){
    if(!result)return;
    const summary=[
      'Bonaire · Estimación solar preliminar',
      'Sector: '+sector+' · Nivel: '+level,
      'Sistema previo: '+(existingInverter?'Sí, '+(existingModel||'modelo desconocido')+
        ' · inversor '+(existingInverterKw||'potencia no indicada')+' kW · batería existente '+existingBatteryKWh+' kWh':'No dispone de inversor'),
      'Cargas estimadas simultáneas: '+result.power.toFixed(0)+' W',
      'Consumo diario total: '+result.daily.toFixed(2)+' kWh',
      'Potencia media de respaldo (cargas esenciales): '+result.backupWatts.toFixed(0)+' W',
      'Autonomía solicitada: '+autonomyHours+' horas',
      'Batería nominal sin aporte solar: '+result.battery.toFixed(2)+' kWh',
      'Batería nominal con aporte solar en el corte: '+result.batteryWithSolar.toFixed(2)+' kWh',
      'Banco de referencia: '+result.guideBattery+' kWh ('+(result.guideFits?'cubre escenario estimado':'no cubre todas las cargas')+')',
      level==='basico'
        ?'Sin hora declarada de apagón: comparación de batería sin aporte FV; ejemplo con sol separado.'
        :'Escenario técnico desde las '+outageStartHour+':00 · Sol dentro del corte '+result.outageSunHours.toFixed(1)+' h',
      'Paneles sugeridos orientativamente: '+daylightExample.plannedPanels+' paneles; '+daylightExample.pvDailyKWh.toFixed(1)+' kWh/día de ejemplo',
      'Ejemplo diurno: '+daylightExample.batteryWithSolar.toFixed(2)+' kWh de batería, no sustituye el escenario nocturno.',
      'Inversor preliminar para cargas esenciales: '+result.inverter.toFixed(0)+' W (revisar picos de arranque)',
      'Paneles calculados para energía diaria en condiciones base: '+result.panelCount+' de '+result.panelWatts+' W',
      'Conexión serie/paralelo: requiere ficha técnica y validación profesional.',
    ].join('\n');
    try{await navigator.clipboard.writeText(summary);copied=true;}
    catch{error='No se pudo copiar. Selecciona los resultados manualmente.';}
  }
</script>

<div class="w-full max-w-5xl mx-auto px-1 sm:px-4 py-5 sm:py-9">
  <div class="mb-6">
    <PageHero eyebrow="Bonaire · Asesor solar" title="Planifica tu energía con confianza"
      description="Compara consumos, horas sin red, paneles y baterías. Puedes empezar sin experiencia o introducir tus mediciones técnicas." />
  </div>
  <section class="bg-white border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
    <div class="px-4 sm:px-8 py-5 bg-slate-50 border-b border-slate-200">
      <div class="flex flex-wrap justify-between gap-3 text-sm font-bold">
        <span class="text-slate-800">{step===5?'Estudio preliminar':labels[step]}</span>
        <span class="text-teal-700">{step===5?'Resultado':'Paso '+(step+1)+' de 5'}</span>
      </div>
      <div class="h-2 rounded-full bg-slate-200 mt-3 overflow-hidden">
        <div class="h-full bg-teal-700 rounded-full transition-all" style:width={(step===5?100:(step+1)*20)+'%'}></div>
      </div>
      <p class="text-xs text-slate-500 mt-2">{sectorOptions.find(x=>x.id===sector)?.label} · {level==='basico'?'Guía sencilla':'Modo técnico'}</p>
    </div>
    <div class="p-4 sm:p-8">
      {#if step===0}
        <div class="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 sm:p-5 space-y-4">
          <div>
            <p class="text-xs font-extrabold uppercase tracking-wide text-teal-800">Antes de comenzar</p>
            <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">¿Ya tienes un inversor?</h2>
            <p class="text-sm text-slate-600 mt-1">Así sabremos si quieres empezar desde cero o mejorar un sistema que ya utilizas.</p>
          </div>
          <div class="grid sm:grid-cols-2 gap-3">
            <button type="button" aria-pressed={!existingInverter}
              onclick={()=>existingInverter=false}
              class="text-left rounded-xl border-2 p-4 {existingInverter?'border-slate-200 bg-white':'border-teal-700 bg-white'}">
              <strong class="block text-slate-900">No, necesito un sistema nuevo</strong>
              <span class="block text-xs text-slate-600 mt-1">Ayúdame a elegir batería, inversor y paneles.</span>
            </button>
            <button type="button" aria-pressed={existingInverter}
              onclick={()=>existingInverter=true}
              class="text-left rounded-xl border-2 p-4 {existingInverter?'border-teal-700 bg-white':'border-slate-200 bg-white'}">
              <strong class="block text-slate-900">Sí, ya tengo un inversor</strong>
              <span class="block text-xs text-slate-600 mt-1">Quiero más autonomía, agregar paneles o revisar mi sistema.</span>
            </button>
          </div>
          {#if existingInverter}
            <div class="rounded-xl border border-teal-100 bg-white p-4">
              <p class="font-bold text-slate-900">Cuéntanos lo que ya tienes</p>
              <p class="text-xs text-slate-600 mt-1">Puedes dejar en cero las capacidades que no conozcas. Un inversor de 5 kW no es una batería de 5 kWh.</p>
              <div class="grid sm:grid-cols-2 gap-3 mt-3">
                <label class="solar-label">Marca o modelo (si lo sabes)
                  <input class="solar-input" maxlength="200" bind:value={existingModel} placeholder="Ej. marca y modelo"/>
                </label>
                <label class="solar-label">Potencia del inversor (kW, opcional)
                  <input type="number" min="0" max="250" step="0.5" bind:value={existingInverterKw} class="solar-input"/>
                </label>
                <label class="solar-label">Baterías que ya tienes en total (kWh, opcional)
                  <input type="number" min="0" max="5000" step="0.5" bind:value={existingBatteryKWh} class="solar-input"/>
                </label>
                <label class="solar-label">Paneles que ya tienes instalados (opcional)
                  <input type="number" min="0" max="200" step="1" bind:value={existingPanelCount} class="solar-input"/>
                </label>
              </div>
              <p class="text-xs text-slate-500 mt-3">Con estos datos podremos comparar cuánto cubre tu sistema actual y qué ampliación sería orientativa, sin asegurar compatibilidad sin ficha técnica.</p>
            </div>
          {/if}
        </div>
        <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900 mt-8">¿Para quién es el sistema?</h2>
        <p class="text-sm text-slate-600 mt-2">El sector nos ayuda a priorizar las cargas esenciales; no cambia las leyes físicas ni establece límites obligatorios de batería.</p>
        <div class="grid sm:grid-cols-3 gap-3 mt-5">
          {#each sectorOptions as option (option.id)}
            <button type="button" aria-pressed={sector===option.id} onclick={()=>{sector=option.id;maxPanels=option.id==='residencial'?10:option.id==='privado'?24:40;}}
              class="text-left p-4 border-2 rounded-2xl {sector===option.id?'bg-teal-50 border-teal-700':'border-slate-200 hover:border-teal-300'}">
              <strong class="block text-slate-900">{option.label}</strong><span class="block text-xs text-slate-500 mt-2">{option.info}</span>
            </button>
          {/each}
        </div>
        <h3 class="mt-7 font-extrabold text-slate-900 text-lg">¿Cuánto sabes de tus equipos?</h3>
        <div class="grid sm:grid-cols-2 gap-3 mt-3">
          <button type="button" aria-pressed={level==='basico'} onclick={()=>{level='basico';origin='equipos';}}
            class="rounded-2xl border-2 p-5 text-left {level==='basico'?'border-teal-700 bg-teal-50':'border-slate-200'}">
            <span class="block text-xl font-extrabold text-slate-900">☀ No tengo experiencia</span>
            <span class="block text-sm mt-2 text-slate-600">Elijo nevera, televisor, luces y otros aparatos. Bonaire propone potencias orientativas que puedo corregir.</span>
          </button>
          <button type="button" aria-pressed={level==='tecnico'} onclick={()=>level='tecnico'}
            class="rounded-2xl border-2 p-5 text-left {level==='tecnico'?'border-teal-700 bg-teal-50':'border-slate-200'}">
            <span class="block text-xl font-extrabold text-slate-900">⚡ Sí tengo experiencia</span>
            <span class="block text-sm mt-2 text-slate-600">Introduzco vatios, cantidades, lecturas de corriente y, si los tengo, datos del MPPT del inversor.</span>
          </button>
        </div>
        {#if level==='tecnico'}
          <h3 class="mt-6 font-bold text-slate-900">Tipo de acometida o cargas</h3>
          <div class="flex flex-wrap gap-2 mt-3">
            {#each [{id:'monofasica',label:'Monofásica'},{id:'bifasica',label:'Entre dos líneas'},{id:'trifasica',label:'Trifásica'}] as option}
              <button type="button" aria-pressed={phase===option.id} onclick={()=>phase=option.id as Phase}
                class="px-4 py-2.5 rounded-xl text-sm border {phase===option.id?'bg-teal-700 text-white':'border-slate-300 text-slate-700'}">{option.label}</button>
            {/each}
          </div>
        {/if}
      {:else if step===1}
        {#if level==='basico'}
          <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">No necesitas medir amperios</h2>
          <p class="text-slate-600 text-sm mt-3">En el siguiente paso verás equipos comunes. Marca los que tienes, cuántos son y cuántas horas suelen funcionar. Los vatios serán un <strong>supuesto editable</strong>, no una medición del equipo real.</p>
          <div class="grid sm:grid-cols-3 gap-3 mt-5">
            {#each [{number:'1',title:'Enumera tus aparatos',text:'Refrigerador, televisor, ventiladores, luces…'},
              {number:'2',title:'Elige lo imprescindible',text:'Qué debe seguir funcionando durante un apagón.'},
              {number:'3',title:'Compara escenarios',text:'Batería estimada con paneles y sin paneles, y opciones comunes de 5 a 15 kWh.'}] as item}
              <div class="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
                <span class="text-teal-700 font-extrabold">{item.number}</span>
                <h3 class="font-bold text-slate-900 mt-2">{item.title}</h3>
                <p class="text-xs text-slate-600 mt-1">{item.text}</p>
              </div>
            {/each}
          </div>
        {:else}
          <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">¿De dónde vienen tus datos de consumo?</h2>
          <p class="text-sm text-slate-600 mt-2">El amperaje del interruptor principal no representa el consumo real.</p>
          <div class="space-y-3 mt-5">
            {#each [
              {id:'equipos',label:'Potencias de los equipos',info:'Conozco los vatios (W) de cada carga y sus horas de uso.'},
              {id:'medicion',label:'Medición real',info:'Tengo voltaje y corriente medidos con los aparatos en funcionamiento.'},
              {id:'acometida',label:'Solo conozco el breaker',info:'No es suficiente para calcular energía consumida.'}] as option}
              <button type="button" aria-pressed={origin===option.id} onclick={()=>origin=option.id as Origin}
                class="w-full text-left p-4 border-2 rounded-2xl {origin===option.id?'border-teal-700 bg-teal-50':'border-slate-200 hover:border-teal-300'}">
                <strong class="block text-slate-900">{option.label}</strong>
                <span class="block text-sm text-slate-600 mt-1">{option.info}</span>
              </button>
            {/each}
          </div>
          {#if origin==='acometida'}<p class="text-sm bg-amber-50 text-amber-900 rounded-xl p-3 mt-4">Escoge otro origen: el breaker es una protección, no una medida de energía diaria.</p>{/if}
        {/if}
      {:else if step===2}
        <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">¿Qué necesitas alimentar?</h2>
        {#if level==='basico'}
          <p class="text-sm text-slate-600 mt-2">Selecciona los equipos que tienes. Los consumos son ejemplos aproximados: un refrigerador puede variar mucho según su tamaño, edad y ciclo de compresor.</p>
          <div class="rounded-xl bg-teal-50 border border-teal-100 p-3 mt-3 text-xs sm:text-sm text-slate-700 space-y-1">
            <p><strong>W (vatios):</strong> cuánta potencia usa un aparato mientras trabaja.</p>
            <p><strong>Horas al día:</strong> cuánto tiempo funciona, o las horas equivalentes si enciende y apaga solo.</p>
            <p><strong>Esencial:</strong> marca los que deben mantenerse encendidos durante un apagón.</p>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 mt-5">
            {#each DEFAULT_LOADS as preset (preset.name)}
              <button type="button" aria-pressed={devices.some(d=>d.name===preset.name)}
                onclick={()=>togglePreset(preset)} class="p-3 rounded-xl border-2 text-left text-sm
                {devices.some(d=>d.name===preset.name)?'border-teal-700 bg-teal-50':'border-slate-200 hover:border-teal-300'}">
                <span class="block text-base font-extrabold text-slate-900">{devices.some(d=>d.name===preset.name)?'✓ ':'+ '}{preset.name}</span>
                <span class="block text-xs text-slate-500 mt-1">{preset.watts} W estimados · {preset.hours} h/día equivalentes</span>
              </button>
            {/each}
          </div>
          <button type="button" onclick={()=>addLoad()} class="text-sm font-bold text-teal-800 border border-teal-300 rounded-xl px-4 py-3 mt-4">+ Otro equipo</button>
        {:else if origin==='medicion'}
          <p class="text-sm text-slate-600 mt-2">Registra la corriente real de las cargas encendidas. No uses la capacidad nominal del breaker.</p>
          <div class="grid sm:grid-cols-2 gap-4 mt-5">
            <label class="solar-label">Voltaje medido (V)<input type="number" min="50" max="600" bind:value={voltage} class="solar-input"/></label>
            <label class="solar-label">Corriente medida (A)<input type="number" min="0.1" max="1000" step="0.1" bind:value={amps} class="solar-input"/></label>
            <label class="solar-label">Factor de potencia<input type="number" min="0.1" max="1" step="0.01" bind:value={powerFactor} class="solar-input"/></label>
            <label class="solar-label">Horas de uso al día<input type="number" min="0.1" max="24" step="0.5" bind:value={hoursDaily} class="solar-input"/></label>
            <label class="solar-label sm:col-span-2">% de potencia para cargas imprescindibles durante el corte
              <input type="number" min="5" max="100" step="5" bind:value={essentialPercent} class="solar-input"/>
              <span class="block mt-1 text-xs text-slate-500 font-normal">Ejemplo inicial: 35%; ajusta con mediciones separadas de esas cargas.</span>
            </label>
          </div>
        {:else}
          <p class="text-sm text-slate-600 mt-2">Añade tus equipos y sus datos de placa o mediciones.</p>
          <button type="button" onclick={()=>addLoad()} class="text-sm font-bold text-teal-800 border border-teal-300 rounded-xl px-4 py-3 mt-4">+ Añadir equipo</button>
        {/if}
        {#if level==='basico'||origin==='equipos'}
          <div class="space-y-3 mt-5">
            {#each devices as d (d.id)}
              <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div class="flex justify-between gap-2 items-center">
                  <strong class="text-sm text-teal-800">Equipo {devices.indexOf(d)+1}</strong>
                  <button type="button" class="text-red-700 font-semibold text-xs" onclick={()=>removeLoad(d.id)}>Quitar</button>
                </div>
                <label class="solar-label">Nombre
                  <input class="solar-input" maxlength="100" bind:value={d.name} placeholder="Ej. Refrigerador"/>
                </label>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {#if level==='tecnico'}
                    <label class="solar-label">Potencia (W)
                      <input type="number" min="1" max="50000" bind:value={d.watts} class="solar-input"/>
                    </label>
                  {/if}
                  <label class="solar-label">¿Cuántos tienes?
                    <input type="number" min="1" max="100" step="1" bind:value={d.units} class="solar-input"/>
                  </label>
                  <label class="solar-label">Horas al día
                    <input type="number" min="0.1" max="24" step="0.5" bind:value={d.hours} class="solar-input"/>
                  </label>
                </div>
                {#if level==='basico'}
                  <details class="rounded-xl border border-slate-200 bg-white p-3">
                    <summary class="cursor-pointer text-xs font-bold text-teal-800">Opcional: modificar la potencia estimada ({d.watts} W)</summary>
                    <label class="solar-label mt-3">Potencia real del equipo (W), si la sabes
                      <input type="number" min="1" max="50000" bind:value={d.watts} class="solar-input"/>
                    </label>
                  </details>
                {/if}
                <label class="flex gap-3 items-center text-sm text-slate-700">
                  <input type="checkbox" bind:checked={d.critical}/>
                  Debe funcionar durante los apagones
                </label>
                {#if d.critical}
                  {#if level==='basico'}
                    <details class="rounded-xl border border-slate-200 bg-white p-3">
                      <summary class="cursor-pointer text-xs font-bold text-teal-800">Opcional: menos horas de uso durante el corte</summary>
                      <label class="solar-label mt-3">Horas de uso de este equipo en el apagón
                        <input type="number" min="0.5" max={autonomyHours} step="0.5"
                          value={d.backupHours ?? autonomyHours}
                          onchange={e => d.backupHours=Number(e.currentTarget.value)} class="solar-input"/>
                      </label>
                    </details>
                  {:else}
                    <label class="solar-label">Horas de uso durante el apagón
                      <input type="number" min="0.5" max={autonomyHours} step="0.5"
                        value={d.backupHours ?? autonomyHours}
                        onchange={e => d.backupHours=Number(e.currentTarget.value)} class="solar-input"/>
                    </label>
                  {/if}
                {/if}
                {#if d.name==='Refrigerador'}
                  <p class="text-xs text-slate-500">Para el respaldo suponemos que el compresor funciona aproximadamente el 40% del tiempo. Compruébalo con tus mediciones reales.</p>
                {/if}
              </div>
            {/each}
          </div>
          {#if !devices.length}<p class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 mt-4">Selecciona al menos un equipo para continuar.</p>{/if}
        {/if}
      {:else if step===3}
        <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">{level==='basico'?'¿Cuántas horas necesitas energía?':'Autonomía y generación solar'}</h2>
        <p class="text-sm text-slate-600 mt-2">Calcularemos el respaldo para las cargas imprescindibles, no necesariamente para toda la vivienda o negocio.</p>
        {#if level==='basico'}
          <div class="rounded-xl border border-teal-100 bg-teal-50 p-4 mt-4 text-sm text-slate-700 space-y-2">
            <p><strong>¿Qué significa autonomía?</strong> Es el tiempo que quieres que funcionen tus aparatos esenciales cuando se va la corriente.</p>
            <p><strong>¿Qué es kWh?</strong> Es la energía que puede almacenar una batería, distinta de la potencia (kW) que puede suministrar un inversor.</p>
            <p>Solo indica las horas que deseas tener energía. Explorar una opción con paneles es voluntario; no necesitas saber cuántos comprar.</p>
          </div>
        {/if}
        <div class="grid sm:grid-cols-2 gap-4 mt-5">
          <label class="solar-label">Horas que deseas funcionar sin red
            <input type="number" min="0.5" max="72" step="0.5" bind:value={autonomyHours} class="solar-input"/>
          </label>
          {#if level==='tecnico'}
            <label class="solar-label">Horas solares pico/día
              <input type="number" min="1" max="8" step="0.5" bind:value={peakSunHours} class="solar-input"/>
              <span class="block text-xs font-normal text-slate-500 mt-1">4,5 es solo un ejemplo; verifica ubicación, sombras y época del año.</span>
            </label>
            <label class="solar-label">Potencia del panel que consideras (W)
              <input type="number" min="100" max="900" step="10" bind:value={panelWatts} class="solar-input"/>
            </label>
          {:else}
            <div class="sm:col-span-2">
              <details class="border border-slate-200 rounded-xl p-3 bg-slate-50">
                <summary class="cursor-pointer text-sm font-bold text-teal-800">Opcional: ajustar supuestos técnicos de paneles</summary>
                <p class="text-xs text-slate-600 mt-2">Por defecto: 4,5 horas solares pico y paneles de 450 W, orientativos, no datos de tu equipo.</p>
                <div class="grid sm:grid-cols-2 gap-3 mt-3">
                  <label class="solar-label">Horas solares pico/día
                    <input type="number" min="1" max="8" step="0.5" bind:value={peakSunHours} class="solar-input"/>
                  </label>
                  <label class="solar-label">Potencia del panel (W)
                    <input type="number" min="100" max="900" step="10" bind:value={panelWatts} class="solar-input"/>
                  </label>
                </div>
              </details>
            </div>
          {/if}


        </div>
        <div class="rounded-2xl border border-teal-100 bg-teal-50/40 p-4 mt-5 space-y-3">
          <label class="flex gap-3 items-center text-sm font-bold text-slate-800">
            <input type="checkbox" bind:checked={hasPanels}/> También quiero explorar una solución con paneles solares (opcional)
          </label>
          {#if hasPanels}
            <p class="text-xs text-slate-700">No tienes que saber cuántos paneles comprar. Bonaire calculará una cantidad orientativa según tus aparatos y podrá mostrarte una comparación durante un corte diurno hipotético.</p>
            {#if level==='tecnico'}
              <div class="grid sm:grid-cols-2 gap-3">
                <label class="solar-label">Máximo de paneles que puedes instalar
                  <input type="number" min="1" max="200" step="1" bind:value={maxPanels} class="solar-input"/>
                </label>
                <label class="solar-label">Escenario de cielo
                  <select bind:value={solarWeather} class="solar-input">
                    <option value="soleado">Soleado · 100 %</option>
                    <option value="variable">Nubes variables · 70 %</option>
                    <option value="nublado">Muy nublado · 35 %</option>
                  </select>
                </label>
              </div>
            {:else}
              <p class="text-xs text-teal-900">Ejemplo inicial de vivienda: espacio para hasta diez paneles y cielo variable; el cálculo muestra si esa cantidad no alcanzaría. Un técnico verificará espacio, clima y capacidad del inversor.</p>
            {/if}
          {:else}
            <p class="text-xs text-slate-700">Perfecto: primero calcularemos el respaldo con batería. Al final podrás revisar cuántos paneles serían orientativos si decides añadirlos.</p>
          {/if}
        </div>
        {#if existingInverter && level==='tecnico'}
        <details class="rounded-2xl border border-slate-200 p-4 mt-5 space-y-3">
          <summary class="cursor-pointer text-sm font-bold text-teal-800">Opcional: datos técnicos de mi inversor y horario conocido de corte</summary>
          <p class="text-xs text-slate-600 mt-3">Solo para técnicos que conocen las especificaciones. Si no sabes la hora del apagón, no hace falta indicarla.</p>
          <label class="solar-label mt-3">Hora de inicio del escenario de corte (0–23, solo ejemplo)
            <input type="number" min="0" max="23" step="1" bind:value={outageStartHour} class="solar-input"/>
          </label>
          <label class="flex gap-2 items-center text-sm text-teal-800 font-bold mt-3">
            <input type="checkbox" bind:checked={showSpecs}/> Tengo límites MPPT y la ficha de mis paneles
          </label>
          {#if showSpecs}
              <p class="text-xs text-amber-800 bg-amber-50 rounded-xl p-3">Introduce solo valores reales de las fichas técnicas. Sin todos ellos no se propondrán cadenas de paneles. Los resultados siguen sujetos a revisión por un instalador.</p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label class="solar-label">Máximo voltaje DC inversor (V)<input type="number" min="1" bind:value={pv.maxDcVoltage} class="solar-input"/></label>
                <label class="solar-label">MPPT mínimo (V)<input type="number" min="1" bind:value={pv.mpptMin} class="solar-input"/></label>
                <label class="solar-label">MPPT máximo (V)<input type="number" min="1" bind:value={pv.mpptMax} class="solar-input"/></label>
                <label class="solar-label">MPPT independientes<input type="number" min="1" max="8" step="1" bind:value={pv.mpptCount} class="solar-input"/></label>
                <label class="solar-label">Isc máximo por MPPT (A)<input type="number" min="0.1" step="0.1" bind:value={pv.maxIscPerMppt} class="solar-input"/></label>
                <label class="solar-label">Potencia PV máx. inversor (W)<input type="number" min="1" bind:value={pv.maxPvWatts} class="solar-input"/></label>
                <label class="solar-label">Voc panel (V)<input type="number" min="1" step=".1" bind:value={pv.voc} class="solar-input"/></label>
                <label class="solar-label">Vmp panel (V)<input type="number" min="1" step=".1" bind:value={pv.vmp} class="solar-input"/></label>
                <label class="solar-label">Isc panel (A)<input type="number" min=".1" step=".1" bind:value={pv.isc} class="solar-input"/></label>
                <label class="solar-label">Coeficiente Voc (%/°C negativo)<input type="number" max="-.01" step=".01" bind:value={pv.vocCoeffPct} class="solar-input"/></label>
                <label class="solar-label">Coeficiente Vmp (%/°C negativo)<input type="number" max="-.01" step=".01" bind:value={pv.vmpCoeffPct} class="solar-input"/></label>
                <label class="solar-label">Temperatura mínima ambiente (°C)<input type="number" step="1" bind:value={pv.minAirC} class="solar-input"/></label>
                <label class="solar-label">Temperatura máxima de célula (°C)<input type="number" step="1" bind:value={pv.maxCellC} class="solar-input"/></label>
              </div>
            {/if}
        </details>
        {/if}
      {:else if step===4}
        <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900">Resumen antes de calcular</h2>
        <p class="text-sm text-slate-600 mt-2">Estos valores son preliminares. La potencia simultánea supone que todas las cargas indicadas podrían estar encendidas a la vez.</p>
        <dl class="grid sm:grid-cols-2 gap-3 mt-5">
          {#each [
            {label:'Sector',value:sectorOptions.find(x=>x.id===sector)?.label||sector},
            {label:'Modalidad',value:level==='basico'?'Estimaciones de electrodomésticos':'Datos técnicos'},
            {label:'Potencia total de cargas',value:estimated.power.toFixed(0)+' W'},
            {label:'Consumo diario',value:estimated.daily.toFixed(2)+' kWh'},
            {label:'Potencia media esencial en apagón',value:estimated.backupWatts.toFixed(0)+' W'},
            {label:'Respaldo solicitado',value:autonomyHours+' horas'},
            {label:'Situación inicial',value:existingInverter?'Ya tengo inversor':'Voy a empezar desde cero'},
            {label:'Banco de batería actual',value:existingInverter && existingBatteryKWh>0?existingBatteryKWh+' kWh declarados':'No especificado'},
            {label:'Opciones solares',value:hasPanels?'Deseo ver una alternativa con paneles':'Por ahora, batería y respaldo'},
          ] as info}
            <div class="rounded-xl bg-slate-50 p-4"><dt class="text-xs text-slate-500">{info.label}</dt><dd class="font-extrabold text-slate-900 mt-1">{info.value}</dd></div>
          {/each}
        </dl>
        {#if level==='basico'}<p class="mt-4 text-xs bg-amber-50 text-amber-900 p-3 rounded-xl">Los consumos de neveras, ventiladores y demás equipos son aproximaciones. Antes de comprar, confirma sus potencias y picos de arranque.</p>{/if}
      {:else if step===5 && result}
        <h2 class="text-2xl font-extrabold text-slate-900">Tu estudio solar preliminar</h2>
        <p class="text-sm text-slate-600 mt-2">Calculamos las horas de respaldo solicitadas con los equipos que elegiste. No necesitas saber a qué hora ocurrirá un apagón. La generación solar se analiza aparte como un escenario posible, nunca garantizado.</p>
        {#if level==='basico'}
          <p class="mt-3 rounded-xl bg-teal-50 p-4 text-sm text-slate-700"><strong>Lectura sencilla:</strong> los vatios (W) indican cuánto consume un aparato mientras funciona; los kilovatios-hora (kWh) indican cuánto gasta o puede almacenar una batería con el paso del tiempo. Estos resultados son aproximaciones, no una lista de compras obligatoria.</p>
        {/if}
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {#each [
            {label:'Potencia simultánea total',value:result.power.toFixed(0)+' W'},
            {label:'Energía diaria',value:result.daily.toFixed(2)+' kWh/día'},
            {label:'Potencia media esencial',value:result.backupWatts.toFixed(0)+' W'},
            {label:sector==='residencial'?'Banco doméstico de referencia':'Banco comercial de referencia',value:result.guideBattery.toFixed(2)+' kWh'},
            {label:'Inversor para cargas esenciales',value:result.inverter.toFixed(0)+' W'},
            {label:'Paneles orientativos',value:daylightExample.panelCount+' de '+result.panelWatts+' W'},
          ] as box}
            <div class="rounded-2xl border border-teal-100 bg-teal-50 p-3 sm:p-4">
              <dt class="text-xs text-teal-800 font-semibold">{box.label}</dt>
              <dd class="text-lg sm:text-2xl font-extrabold text-slate-950 mt-2 break-words">{box.value}</dd>
            </div>
          {/each}
        </div>
        <section class="rounded-2xl p-4 sm:p-5 border border-slate-200 bg-white mt-5 space-y-3">
          <h3 class="text-lg font-extrabold text-slate-900">Cuánta batería necesitarías</h3>
          <div class="grid {hasPanels?'sm:grid-cols-2':''} gap-3">
            <div class="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <p class="text-xs font-semibold text-slate-600">Respaldo sin contar con el sol</p>
              <p class="text-2xl font-extrabold text-slate-900 mt-1">{result.battery.toFixed(2)} kWh</p>
              <p class="text-xs text-slate-600 mt-2">Estimación nominal para las cargas que marcaste como esenciales durante {autonomyHours} horas. No significa que debas comprar automáticamente este tamaño de batería.</p>
            </div>
            {#if hasPanels}
              <div class="rounded-xl bg-teal-50 border border-teal-100 p-4">
                <p class="text-xs font-semibold text-teal-800">{level==='basico'?'Ejemplo de corte diurno con paneles':'Escenario técnico con paneles'}</p>
                <p class="text-2xl font-extrabold text-teal-950 mt-1">{(level==='basico'?daylightExample.batteryWithSolar:result.batteryWithSolar).toFixed(2)} kWh</p>
                <p class="text-xs text-slate-600 mt-2">{level==='basico'?'Solo ilustra un corte que empieza con sol a las 9:00 a. m.; no conocemos el horario real de los apagones.':'Calculado con el horario de ejemplo que indicaste; no equivale a una garantía de producción solar.'}</p>
              </div>
            {/if}
          </div>
          {#if hasPanels}
            <p class="text-sm text-slate-700">En el escenario comparativo los paneles podrían suministrar alrededor de {(level==='basico'?daylightExample.pvDirectKWh:result.pvDirectKWh).toFixed(1)} kWh directamente a los equipos y generar hasta {(level==='basico'?daylightExample.pvSurplusKWh:result.pvSurplusKWh).toFixed(1)} kWh de excedente potencial de recarga, antes de pérdidas. Eso solo ocurre durante horas con producción y depende de la instalación.</p>
          {/if}
          <p class="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">Para prepararte ante un apagón que puede ocurrir de noche, toma como referencia conservadora la batería <strong>sin aporte solar</strong>. Los paneles ayudan a consumir y recargar de día, pero no sustituyen el almacenamiento nocturno.</p>
          <p class="text-sm text-slate-600">Para {sectorOptions.find(x=>x.id===sector)?.label.toLowerCase()}, usamos {sector==='residencial'?'5, 10, 12 y 15 kWh':'varias capacidades comerciales'} como referencias, <strong>no como límites técnicos ni legales</strong>.</p>
          <div class="rounded-xl p-4 {result.guideFits?'bg-emerald-50 border border-emerald-100':'bg-amber-50 border border-amber-200'}">
            <p class="font-bold text-slate-900">Referencia: {result.guideBattery} kWh nominales</p>
            {#if result.guideFits}
              <p class="text-sm text-slate-700 mt-2">Podría cubrir la energía estimada del respaldo, sujeto al modelo real, potencia, BMS y pérdidas.</p>
            {:else}
              <p class="text-sm text-slate-800 mt-2">No alcanza las {autonomyHours} horas para todas las cargas esenciales indicadas: sin apoyo solar, ese banco duraría aproximadamente <strong>{result.guideHours.toFixed(1)} horas</strong>.</p>
              <p class="text-sm text-slate-800 mt-2">Para aspirar a {autonomyHours} horas con {result.guideBattery} kWh, el consumo medio durante el corte tendría que bajar a aproximadamente <strong>{result.maxCriticalWatts.toFixed(0)} W</strong>. Prioriza nevera, pocas luces y comunicaciones; apaga aire acondicionado, bombas y otras cargas prescindibles si están incluidas.</p>
              <p class="text-xs text-slate-700 mt-2">Otra opción es estudiar un banco mayor o un sistema por etapas. No recomendamos automáticamente comprar {result.battery.toFixed(1)} kWh solo por el número calculado.</p>
            {/if}
          </div>
          {#if existingInverter}
            <div class="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-2">
              <h4 class="font-extrabold text-teal-950">Tu sistema actual y posibles ampliaciones</h4>
              {#if existingBatteryKWh>0 && result.existingHours!==null}
                <p class="text-sm text-slate-700">Con los <strong>{existingBatteryKWh} kWh</strong> nominales de batería que declaraste, la autonomía ilustrativa sería de <strong>{result.existingHours.toFixed(1)} horas</strong> para las cargas esenciales estimadas, sin aporte solar.</p>
                {#if result.battery>existingBatteryKWh}
                  <p class="text-sm text-slate-800">Para las {autonomyHours} horas que deseas, la diferencia teórica respecto al banco actual sería de <strong>{Math.max(0,result.battery-existingBatteryKWh).toFixed(2)} kWh nominales</strong>. No significa que sea seguro conectar otra batería directamente: primero hay que verificar química, voltaje, BMS y condiciones del banco existente.</p>
                {:else}
                  <p class="text-sm text-teal-900">La energía nominal declarada parece suficiente para este escenario de consumo; hay que verificar las condiciones reales de la batería.</p>
                {/if}
              {:else}
                <p class="text-sm text-slate-700">No indicaste la capacidad de tu batería. Puedes volver al primer paso para añadirla y ver una comparación de ampliación.</p>
              {/if}
              {#if existingInverterKw>0}
                <p class="text-sm text-slate-700">Tu inversor declarado: <strong>{existingInverterKw} kW</strong>. Potencia orientativa para cargas esenciales: <strong>{(result.inverter/1000).toFixed(2)} kW</strong>. {existingInverterKw*1000>=result.inverter?'La potencia nominal parece alcanzar esta referencia, sin verificar picos de arranque ni batería.':'La potencia declarada podría resultar insuficiente con esas cargas; se requiere revisar el inversor o reducir simultaneidad.'}</p>
              {:else}
                <p class="text-sm text-slate-700">Sin potencia nominal del inversor no podemos decidir todavía si soporta todos los equipos o una ampliación.</p>
              {/if}
              {#if existingPanelCount>0}
                <p class="text-xs text-slate-600">Paneles existentes declarados: {existingPanelCount}. Para saber si puedes aprovecharlos o ampliarlos hacen falta datos de los módulos y del MPPT; no se presupone compatibilidad con paneles adicionales.</p>
              {/if}
            </div>
          {/if}
          <p class="text-xs text-slate-500">Supuestos ilustrativos: batería inicialmente cargada, 80 % de descarga utilizable, 90 % de eficiencia y paneles al 75 % de rendimiento global. Producción promediada en intervalos de 15 minutos dentro de 9:00–16:00; no sustituye irradiancia horaria, curva de carga, límites BMS ni estudios por ubicación. Ninguna cifra garantiza autonomía real.</p>
        </section>
        <section class="rounded-2xl p-4 sm:p-5 bg-slate-950 text-white mt-5 space-y-3">
          <h3 class="text-lg font-extrabold">Paneles y compatibilidad con el inversor</h3>
          <p class="text-sm text-slate-200">Escenario propuesto: <strong>{result.plannedPanels} paneles de {result.panelWatts} W</strong> ({result.plannedPvKW.toFixed(2)} kWp), con unos {result.pvDailyKWh.toFixed(1)} kWh/día bajo el clima indicado. La necesidad orientativa sin reducción por nubes sería {result.panelCount} paneles. El cálculo no determina conexiones seguras en serie o paralelo.</p>
          {#if hasPanels && result.pvCoveragePercent<100}
            <p class="rounded-xl bg-slate-800 border border-slate-600 p-3 text-sm text-slate-100">La producción estimada en estas condiciones cubriría aproximadamente {result.pvCoveragePercent.toFixed(0)} % de tu consumo diario. La diferencia dependería de energía almacenada, red u otras fuentes y del patrón real de uso.</p>
          {/if}
          {#if hasPanels && result.panelCount>result.plannedPanels}
            <p class="rounded-xl bg-amber-900/50 border border-amber-300/40 text-amber-100 p-3 text-sm">La cantidad de paneles prevista no cubre toda la demanda diaria calculada en el caso base. Hay que revisar el consumo, espacio, módulos disponibles, apoyo de la red o un diseño distinto: no se debe ocultar este déficit.</p>
          {/if}
          {#if !hasPanels}
            <p class="text-sm text-amber-100">No se han previsto paneles: la autonomía depende de la batería cargada previamente y de la disponibilidad de la red para recargarla.</p>
          {/if}
          {#if result.candidateStrings.length}
            <p class="text-xs font-bold text-teal-200">Ejemplos preliminares con los límites que introdujiste (una cadena por MPPT independiente):</p>
            <div class="grid sm:grid-cols-2 gap-2">
              {#each result.candidateStrings as string}
                <div class="rounded-xl border border-teal-500/40 bg-teal-950 p-3 text-sm">
                  <strong class="text-teal-100">{string.strings} cadena(s) de {string.inSeries} paneles</strong>
                  <p class="mt-1 text-xs text-teal-100">{string.total} paneles · {string.pvW} W</p>
                  <p class="mt-1 text-xs text-slate-300">Voc frío: {string.coldVoc} V · Vmp caliente: {string.hotVmp} V</p>
                </div>
              {/each}
            </div>
            <p class="text-xs text-amber-200">No son esquemas de cableado aprobados. Verificar límites por entrada, orientación, sombreado, cableado, protecciones, temperatura y fichas reales con un profesional.</p>
          {:else}
            <p class="text-xs text-amber-200">No se puede decidir el número de paneles en serie/paralelo sin conocer la ficha del inversor (rango MPPT, tensión máxima, Isc por MPPT, potencia admisible) y del panel (Voc, Vmp, Isc y coeficientes de temperatura). Requiere verificación técnica.</p>
          {/if}
        </section>
        <section class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3">
          <div class="flex flex-wrap justify-between items-end gap-3">
            <div>
              <h3 class="font-extrabold text-xl text-slate-900">Productos recomendados para tu estudio</h3>
              <p class="text-sm text-slate-600 mt-1">Hasta seis alternativas reales del catálogo de Bonaire para comparar. Tú eliges cuáles te interesan.</p>
            </div>
            <a href="/catalogo" class="rounded-xl border border-teal-200 bg-teal-50 text-teal-800 px-4 py-2.5 font-bold text-sm hover:bg-teal-100">Ver más productos →</a>
          </div>
          {#if inventoryLoading}<p class="text-sm text-slate-500">Buscando equipos disponibles…</p>{/if}
          {#if inventoryError}<p class="text-sm text-amber-800">{inventoryError}</p>{/if}
          {#if !inventoryLoading && recommendedProducts.length}
            <p class="text-xs text-slate-500 sm:hidden">Desliza hacia los lados para explorar →</p>
            <div aria-label="Productos recomendados; desplaza horizontalmente"
              class="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth overscroll-x-contain pb-4 [scrollbar-width:thin]">
              {#each recommendedProducts as recommendation (recommendation.item.id)}
                <article class="min-w-0 shrink-0 flex flex-col w-[78vw] sm:w-[44vw] md:w-[30vw] lg:w-[calc(20%_-_0.6rem)] snap-start rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition">
                  <a href={'/catalogo?product='+encodeURIComponent(recommendation.item.id)}
                    class="block bg-gradient-to-br from-teal-50 to-slate-100"
                    aria-label={'Ver detalles de '+recommendation.item.name}>
                    <CardImage src={recommendation.item.primary_image_url} alt={recommendation.item.name}/>
                  </a>
                  <div class="p-3.5 flex flex-col flex-1 gap-2">
                    <p class="text-[11px] uppercase tracking-wide font-extrabold text-teal-700">{recommendation.family}</p>
                    <h4 class="font-extrabold text-slate-900 text-sm line-clamp-2">{recommendation.item.name}</h4>
                    <p class="text-xs text-slate-600 line-clamp-2 flex-1">{recommendation.reason}</p>
                    <p class="text-sm font-extrabold text-teal-800">{recommendation.item.price == null ? 'Consultar precio' : Number(recommendation.item.price).toLocaleString('es-CU')+' '+(recommendation.item.currency||'USD')}</p>
                    <p class="text-[11px] font-medium text-emerald-700">Marcado como disponible en catálogo</p>
                    <a href={'/catalogo?product='+encodeURIComponent(recommendation.item.id)}
                      class="rounded-xl bg-teal-700 px-3 py-2.5 text-center text-xs font-bold text-white hover:bg-teal-800">Ver ficha y consultar →</a>
                  </div>
                </article>
              {/each}
            </div>
          {:else if !inventoryLoading}
            <p class="rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 p-4">No encontramos modelos de estas familias marcados como disponibles. Consulta el catálogo completo o solicita orientación.</p>
          {/if}
          <p class="text-xs text-slate-500">Son sugerencias comerciales preliminares por familia y potencia identificable, no compatibilidad garantizada. Confirma tensión y química de batería, BMS, corrientes y MPPT, picos del inversor, protecciones y existencias actuales antes de comprar.</p>
        </section>
        <p class="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
          <strong>Importante:</strong> Orientación comercial preliminar, no diseño eléctrico ni presupuesto final. Los motores pueden tener picos de arranque, y la temperatura y las sombras alteran la producción. Un especialista debe revisar tensión, corriente, protecciones, baterías y condiciones locales antes de comprar o instalar.
        </p>
        <div class="flex flex-wrap gap-3 mt-5">
          <button type="button" onclick={assessment} class="rounded-xl bg-teal-700 text-white font-bold px-5 py-3 hover:bg-teal-800">Solicitar estudio técnico</button>
          <button type="button" onclick={copy} class="rounded-xl border border-teal-200 text-teal-800 font-semibold px-5 py-3">{copied?'Resumen copiado ✓':'Copiar resumen'}</button>
          <button type="button" onclick={reset} class="rounded-xl bg-slate-100 text-slate-800 font-semibold px-5 py-3">Nuevo estudio</button>
        </div>
      {/if}
      {#if error}<p role="alert" class="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-800 p-4 text-sm font-semibold">{error}</p>{/if}
      {#if step<5}
        <div class="border-t border-slate-100 flex flex-wrap justify-between gap-3 pt-6 mt-7">
          <button type="button" disabled={step===0} onclick={back} class="rounded-xl border border-slate-300 text-slate-700 font-semibold px-5 py-3 disabled:opacity-40">← Volver</button>
          {#if step<4}
            <button type="button" onclick={next} class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold px-6 py-3">Continuar →</button>
          {:else}
            <button type="button" onclick={calculate} class="rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold px-6 py-3">Calcular mi sistema →</button>
          {/if}
        </div>
      {/if}
    </div>
  </section>
</div>
<style>
  .solar-label { display:block; font-size:.875rem; font-weight:650; color:#334155; }
  .solar-input { display:block; width:100%; min-width:0; margin-top:.45rem; padding:.8rem .9rem;
    background:#fff; color:#0f172a; border:1px solid #cbd5e1; border-radius:.85rem; outline:0; }
  .solar-input:focus-visible { box-shadow:0 0 0 3px #ccfbf1; border-color:#0f766e; }
</style>
