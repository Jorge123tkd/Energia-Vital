/** Explicit commercial intake. One draft per conversation; no side effects here.
 * The caller persists the draft and performs authenticated registration atomically. */
import {parseRequestIntake} from './request-intake';
export type CommercialDraft = {
 id:string; stage:'kind'|'company'|'need'|'location'|'payment'|'budget'|'review'|'submitted';
 kind?:string; company?:string; need?:string; location?:string; payment?:string; budget?:string;
};
export type CommercialStep = {draft:CommercialDraft|null; reply:string; submit?:true};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const kinds:Record<string,string>={'mipyme':'mipyme','empresa estatal':'estatal','estatal':'estatal','negocio privado':'empresa_privada','empresa privada':'empresa_privada','tcp':'tcp','cooperativa':'cooperativa','residencial':'persona','vivienda':'persona','proveedor':'otro','alianza':'otro','otro':'otro'};
const labels:Record<string,string>={mipyme:'Mipyme',estatal:'Empresa estatal',empresa_privada:'Empresa / negocio privado',tcp:'TCP',cooperativa:'Cooperativa',persona:'Residencial',otro:'Proveedor, alianza u otra organización'};
export const startCommercialIntake=(s:string)=>/^(?:registrar (?:una )?solicitud comercial|crear (?:un )?expediente comercial|iniciar solicitud empresarial|registrar proyecto empresarial)[.!]*$/.test(norm(s));
const optional=(s:string)=>/^(?:no se|por definir|pendiente|omitir|no disponible|aun no|todavia no)$/.test(norm(s));
export function commercialSummary(d:CommercialDraft):string{
 return ['Tipo: '+labels[d.kind||'otro'],'Entidad o titular: '+d.company,'Necesidad: '+d.need,'Ubicación: '+d.location,'Forma de pago: '+(d.payment||'Por definir'),'Presupuesto disponible USD: '+(d.budget||'Por definir')].join('\n');
}
export function advanceCommercialIntake(message:string, prior:CommercialDraft|null, id:string):CommercialStep|null{
 const text=message.trim(),m=norm(text);
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
