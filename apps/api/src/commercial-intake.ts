/** Explicit commercial intake. One draft per conversation; no side effects here.
 * The caller persists the draft and performs authenticated registration atomically. */
import {parseRequestIntake} from './request-intake';
export type CommercialDraft = {
 id:string; stage:'kind'|'company'|'need'|'location'|'payment'|'budget'|'review'|'submitted';
 kind?:string; company?:string; need?:string; location?:string; payment?:string; budget?:string; contact?:string; natural?:boolean;
};
export type CommercialStep = {draft:CommercialDraft|null; reply:string; submit?:true};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const kinds:Record<string,string>={'mipyme':'mipyme','empresa estatal':'estatal','estatal':'estatal','negocio privado':'empresa_privada','empresa privada':'empresa_privada','tcp':'tcp','cooperativa':'cooperativa','residencial':'persona','vivienda':'persona','proveedor':'otro','alianza':'otro','otro':'otro'};
const labels:Record<string,string>={mipyme:'Mipyme',estatal:'Empresa estatal',empresa_privada:'Empresa / negocio privado',tcp:'TCP',cooperativa:'Cooperativa',persona:'Residencial',otro:'Proveedor, alianza u otra organización'};
export const startCommercialIntake=(s:string)=>/^(?:registrar (?:una )?solicitud comercial|crear (?:un )?expediente comercial|iniciar solicitud empresarial|registrar proyecto empresarial)[.!]*$/.test(norm(s));
const optional=(s:string)=>/^(?:no se|por definir|pendiente|omitir|no disponible|aun no|todavia no)$/.test(norm(s));
export function commercialSummary(d:CommercialDraft):string{
 return ['Tipo: '+labels[d.kind||'otro'],'Entidad o titular: '+d.company,...(d.contact?['Persona de contacto: '+d.contact]:[]),'Necesidad: '+d.need,'Ubicación: '+d.location,'Forma de pago: '+(d.payment||'Por definir'),'Presupuesto disponible USD: '+(d.budget||'Por definir')].join('\n');
}

// Natural enterprise intake: explicit menu or a clear commercial intention,
// never a generic question. Use existing DB categories for compatibility.
const naturalMenu=/^(?:empresas? y negocios|empresas?|negocios?|atencion a empresas|proyecto empresarial|servicios para empresas|proveedores y alianzas|proveedores?|alianzas|solicitar servicio|registrar solicitud)$/;
export function naturalCommercialStart(text:string):boolean{
 const m=norm(text).replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
 if(naturalMenu.test(m)||/^(?:somos|soy) (?:una? )?(?:empresa(?: estatal| privada)?|mipyme|negocio privado|cooperativa)$/.test(m))return true;
 if(/[¿?]/.test(text)||/\b(?:saber|informacion|conocer|que venden|que ofrecen)\b/.test(m))return false;
 return /\b(?:empresa|mipyme|negocio|tcp|cooperativa|entidad|fabricante|proveedor)\b/.test(m)&&/\b(?:necesit\w*|queremos|solicitar|cotiz\w*|respaldo|proyecto|mantenimiento|reparacion|suministro|alianza)\b/.test(m);
}
const prompt:Record<string,string>={
 kind:'¿La entidad es estatal o privada? (Privada incluye mipymes, TCP, cooperativas y viviendas.)',
 company:'¿Cómo se llama la entidad o titular? Puedes indicar también la persona de contacto.',
 need:'¿Qué necesitan resolver? Cuéntame el servicio, suministro o proyecto que desean.',
 location:'¿En qué municipio, provincia o país sería el trabajo?',
 payment:'¿Cómo prevén pagar? Transferencia, efectivo u otra forma. Si aún no lo saben, escribe «por definir».',
 budget:'¿Qué presupuesto aproximado tienen disponible en USD? Puedes escribir «por definir». No pedimos anticipo.'
};
function naturalNext(d:CommercialDraft):CommercialStep{
 for(const k of ['need','location','kind','company','payment','budget'] as const){
  if(d[k]===undefined){d.stage=k;return {draft:d,reply:prompt[k]};}
 }
 d.stage='review';return {draft:d,reply:'Estos son los datos que recogí:\n\n'+commercialSummary(d)+'\n\nEscribe «confirmar solicitud comercial» para enviarla al equipo o «corregir nombre: ...», «corregir ubicación: ...» o «cancelar borrador». No implica una cita ni un compromiso de pago.'};
}
function naturalKind(text:string):string|undefined{
 const m=norm(text);
 if(/\b(?:estatal|organismo estatal|institucion publica)\b/.test(m))return 'estatal';
 if(/\b(?:privad[ao]|mipyme|mi pyme|tcp|cooperativa|residencial|vivienda)\b/.test(m))return 'empresa_privada';
 if(/\b(?:proveedor|fabricante|alianza)\b/.test(m))return 'otro';
 return undefined;
}
function labelled(text:string,key:string):string|undefined{
 const re=new RegExp('(?:^|[;,\\n]|\\b(?:y|la|el)\\s+)\\s*(?:'+key+')\\s*(?:es\\s+|:|=)\\s*([^;\\n]+)','i');
 const m=re.exec(text);
 return m?.[1].split(/,\s*(?:(?:la |el )?(?:persona|contacto|ubicaci[oó]n|municipio|necesidad|presupuesto|forma de pago|entidad|empresa)\b)/i)[0].trim();
}
export function resumeCommercialIntake(d:CommercialDraft):string{
 if(d.stage==='submitted')return 'Solicitud registrada. Referencia: '+d.id+'. Consulta «mis solicitudes».';
 if(d.natural)return naturalNext({...d}).reply;
 return d.stage==='review'?'Tu borrador sigue guardado:\n\n'+commercialSummary(d)+'\n\nEscribe «confirmar solicitud comercial» para enviarlo.':prompt[d.stage]||'Continúa con tu solicitud comercial.';
}
function advanceNatural(text:string,prior:CommercialDraft|null,id:string):CommercialStep{
 const m=norm(text),d:CommercialDraft=prior?{...prior}:{id,stage:'need',natural:true};
 if(/^(?:cancelar|cancelar borrador|cancelar solicitud comercial|no gracias)$/.test(m))return {draft:null,reply:'Borrador cancelado. No se registró ninguna solicitud.'};
 if(/[¿?]/.test(text))return {draft:d,reply:'Tu solicitud sigue guardada. '+resumeCommercialIntake(d)};
 if(d.stage==='review'&&m==='confirmar solicitud comercial')return {draft:d,reply:'',submit:true};
 const menu=naturalMenu.test(m.replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim());
 if(menu){if(/proveedor|alianza/.test(m)&&!d.kind)d.kind='otro';return naturalNext(d);}
 let value:string|undefined,matched=false;
 const assign=(k:'company'|'contact'|'need'|'location'|'payment',v:string|undefined,max:number,min=2)=>{
  if(v&&v.length>=min&&v.length<=max){d[k]=v;matched=true;}
 };
 const explicitKind=naturalKind(text);
 if(explicitKind&&(d.kind===undefined||d.stage==='kind')){d.kind=explicitKind;matched=true;}
 assign('company',labelled(text,'(?:corregir\\s+)?(?:nombre(?: de la entidad)?|entidad|empresa)'),120,3);
 assign('contact',labelled(text,'(?:persona de contacto|contacto|representante)'),120);
 assign('location',labelled(text,'(?:corregir\\s+)?(?:ubicaci[oó]n|municipio|provincia|direcci[oó]n)'),250);
 assign('need',labelled(text,'(?:corregir\\s+)?(?:necesidad|servicio|proyecto)'),1800,3);
 assign('payment',labelled(text,'(?:forma de pago|pago)'),160);
 const place=/(?:somos|estamos|trabajamos|radicamos)\s+(?:de|en)\s+([^,;\n]+?)(?=\s+y\s+(?:necesit|querem|pag)|[,;\n]|$)/i.exec(text);
 if(place&&!d.location)assign('location',place[1].trim(),250);
 const need=/(?:necesitamos|necesito|queremos|requerimos)\s+(.+?)(?=\s+y\s+(?:somos|estamos|trabajamos)|[;\n]|$)/i.exec(text);
 if(need&&!d.need)assign('need',need[1].trim(),1800,3);
 if(!d.need&&place){const prefix=text.slice(0,place.index).replace(/\s+y\s*$/i,'').trim();assign('need',prefix,1800,3);}
 if(d.payment===undefined&&/\b(?:transferencia|efectivo|cheque)\b/.test(m)){
  const pay=m.match(/\b(?:transferencia|efectivo|cheque)\b/);if(pay)assign('payment',pay[0],160);
 }
 value=labelled(text,'(?:corregir\\s+)?presupuesto(?: disponible)?');
 if(value){const amount=value.replace(/\s*USD$/i,'').trim(),parsed=parseRequestIntake({available_budget_usd:optional(amount)?'':amount,customer_type:d.kind});if(!parsed.error){d.budget=optional(amount)?'':amount;matched=true;}}
 if(!matched&&d.stage!=='review'){
  switch(d.stage){
   case 'need':if(text.length>=3&&text.length<=1800)d.need=text;break;
   case 'location':if(text.length>=2&&text.length<=250)d.location=text;break;
   case 'kind':if(explicitKind)d.kind=explicitKind;break;
   case 'company':if(text.length>=3&&text.length<=120)d.company=text;break;
   case 'payment':if(optional(text)||text.length<=160)d.payment=optional(text)?'':text;break;
   case 'budget':{
    const amount=optional(text)?'':text.replace(/\s*USD$/i,'').trim(),parsed=parseRequestIntake({available_budget_usd:amount,customer_type:d.kind,payment_method:d.payment});
    if(parsed.error)return {draft:d,reply:parsed.error+' Puedes indicar «por definir».'};d.budget=amount;break;
   }
  }
 }
 if(d.stage==='review'&&!matched)return {draft:d,reply:resumeCommercialIntake(d)};
 return naturalNext(d);
}

export function advanceCommercialIntake(message:string, prior:CommercialDraft|null, id:string):CommercialStep|null{
 const text=message.trim(),m=norm(text);
 if(prior?.natural&&prior.stage!=='submitted')return startCommercialIntake(text)?{draft:prior,reply:resumeCommercialIntake(prior)}:advanceNatural(text,prior,id);
 if((!prior||prior.stage==='submitted')&&naturalCommercialStart(text)&&!startCommercialIntake(text))return advanceNatural(text,null,id);
 if(startCommercialIntake(text)){
   if(prior&&prior.stage!=='submitted')return {draft:prior,reply:'Ya tienes un borrador en esta conversación. Continúa respondiendo la última pregunta o escribe «cancelar borrador» para comenzar nuevamente.'};
   return {draft:{id,stage:'kind'},reply:'Vamos a preparar una solicitud comercial. ¿Qué tipo de cliente eres: mipyme, empresa estatal, negocio privado, TCP, cooperativa, residencial, proveedor o alianza? Todavía no se enviará nada.'};
 }
 if(!prior)return null;
 if(/^(?:cancelar borrador|cancelar solicitud comercial)$/.test(m)&&prior.stage!=='submitted')
   return {draft:null,reply:'Borrador cancelado. No se ha registrado ninguna solicitud.'};
 if(prior.stage==='submitted'){
   if(m==='confirmar solicitud comercial')return {draft:prior,reply:'Esta solicitud ya está registrada. Referencia: '+prior.id};
   return null;
 }
 // A question is not consent or a field value.
 if(/[¿?]/.test(text))return {draft:prior,reply:'Tu borrador sigue pendiente. Responde el dato solicitado o escribe «cancelar borrador». Puedes iniciar otro chat para una consulta diferente.'};
 const d={...prior};
 const invalid=(reply:string):CommercialStep=>({draft:prior,reply});
 switch(d.stage){
 case 'kind':{
  const kind=Object.prototype.hasOwnProperty.call(kinds,m)?kinds[m]:undefined;if(!kind)return invalid('Selecciona mipyme, empresa estatal, negocio privado, TCP, cooperativa, residencial, proveedor o alianza.');
  d.kind=kind;d.stage='company';return {draft:d,reply:'¿Cuál es el nombre de la entidad o titular? Usaremos el contacto de tu cuenta registrada.'};
 }
 case 'company':
  if(text.length<3||text.length>120)return invalid('Escribe el nombre de la entidad o titular (3 a 120 caracteres).');
  d.company=text;d.stage='need';return {draft:d,reply:'Cuéntame qué necesitas: servicio, proyecto, suministro, distribución o asociación. Describe el alcance que conoces.'};
 case 'need':
  if(text.length<6||text.length>1800)return invalid('Describe la necesidad en 6 a 1800 caracteres.');
  d.need=text;d.stage='location';return {draft:d,reply:'¿En qué municipio, provincia o país se realizará el proyecto o colaboración?'};
 case 'location':
  if(text.length<2||text.length>250)return invalid('Indica la ubicación (máximo 250 caracteres).');
  d.location=text;d.stage='payment';return {draft:d,reply:'¿Cómo prevén pagar: transferencia, efectivo u otra modalidad? Si aún no lo saben, escribe «por definir».'};
 case 'payment':
  if(!optional(text)&&(!text||text.length>160))return invalid('Indica la forma de pago en un máximo de 160 caracteres, o «por definir».');
  d.payment=optional(text)?'':text;d.stage='budget';return {draft:d,reply:'¿Qué presupuesto tienen disponible aproximadamente en USD? Indica solo el importe (ej. 2500.50) o «por definir». No se necesita anticipo.'};
 case 'budget':{
  const amount=optional(text)?'':text;
  const parsed=parseRequestIntake({available_budget_usd:amount,customer_type:d.kind,payment_method:d.payment});
  if(parsed.error)return invalid(parsed.error+' Escribe un importe en USD o «por definir».');
  d.budget=amount;d.stage='review';return {draft:d,reply:'Revisa tu solicitud:\n\n'+commercialSummary(d)+'\n\nPara enviarla al equipo escribe exactamente «confirmar solicitud comercial». Para descartarla escribe «cancelar borrador». No implica aprobación, contrato, cita ni compromiso de pago.'};
 }
 case 'review':
  if(m!=='confirmar solicitud comercial')return invalid('Para enviar el resumen escribe «confirmar solicitud comercial». Para modificar los datos, cancela el borrador y vuelve a iniciarlo.');
  return {draft:d,reply:'',submit:true};
 }
 return null;
}
