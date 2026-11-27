export type SurveyLine={name:string;kind:'material'|'labor';unit:string;required_milli:number;client_milli:number;warehouse_milli:number;sale_cents:number|null};
export type Survey={mode:'installation'|'partial'|'turnkey';site:string;notes:string;lines:SurveyLine[]};
const units=['unit','m','m2','kg','set','hour','visit','trip','service'];
const qty=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=100000000;
const cents=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=99999999999;
const isObj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function validateSurvey(input:unknown):Survey|null{
 if(!isObj(input)||Object.keys(input).sort().join(',')!=='lines,mode,notes,site'||!['installation','partial','turnkey'].includes(String(input.mode))||typeof input.site!=='string'||input.site.trim().length<3||input.site.length>240||typeof input.notes!=='string'||input.notes.length>1200||!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>30)return null;
 const lines:SurveyLine[]=[];
 for(const r of input.lines){
  if(!isObj(r)||Object.keys(r).sort().join(',')!=='client_milli,kind,name,required_milli,sale_cents,unit,warehouse_milli'||typeof r.name!=='string'||r.name.trim().length<3||r.name.length>130||!['material','labor'].includes(String(r.kind))||typeof r.unit!=='string'||!units.includes(r.unit)||!qty(r.required_milli)||r.required_milli===0||!qty(r.client_milli)||!qty(r.warehouse_milli)||r.client_milli+r.warehouse_milli>r.required_milli||!(r.sale_cents===null||cents(r.sale_cents)))return null;
  if(r.kind==='labor'&&(r.client_milli!==0||r.warehouse_milli!==0))return null;
  if(r.kind==='material'&&((input.mode==='installation'&&r.client_milli!==r.required_milli)||(input.mode==='turnkey'&&r.client_milli!==0)))return null;
  if(['unit','set','visit','trip','service'].includes(r.unit)&&[r.required_milli,r.client_milli,r.warehouse_milli].some(n=>n%1000!==0))return null;
  lines.push({...r,name:r.name.trim()} as SurveyLine);
 }
 return {mode:input.mode as Survey['mode'],site:input.site.trim(),notes:input.notes.trim(),lines};
}
export function surveyQuote(s:Survey,revision:number){
 const items:{description:string;quantity:number;unit_price_usd_cents:number}[]=[];
 const missing:string[]=[],provided:string[]=[],planning:string[]=[];
 for(const l of s.lines){
  const billed=l.required_milli-l.client_milli;
  if(l.client_milli)provided.push(l.name+': '+l.client_milli/1000+' '+l.unit);
  if(l.kind==='material'&&billed)planning.push(l.name+': almacén previsto '+l.warehouse_milli/1000+'; proveedor '+(billed-l.warehouse_milli)/1000+' '+l.unit);
  if(billed){if(l.sale_cents===null)missing.push(l.name);else items.push({description:(l.name+' ('+l.unit+')').slice(0,180),quantity:billed/1000,unit_price_usd_cents:l.sale_cents});}
 }
 const stockNotes='Aportado por cliente: '+(provided.join('; ')||'Nada registrado')+'. Suministro previsto: '+(planning.join('; ')||'No aplica')+'. Sin reserva de almacén.';
 return {revision,items,missing,stockNotes,canImport:missing.length===0&&items.length>0&&stockNotes.length<=600};
}
