/**
 * Datos opcionales del PRIMER CONTACTO. Solo representan lo declarado por el cliente.
 * Anticipos, saldos, contratos y autorizaciones no forman parte de este formulario.
 */
export type RequestIntake = {
  available_budget_usd_cents: number | null;
  payment_method: string | null;
  payment_currency: string | null;
  customer_type: string | null;
};

const customerKinds = new Set(['persona','mipyme','estatal','tcp','cooperativa','empresa_privada','otro']);

export function parseRequestIntake(body: Record<string, unknown>): { value: RequestIntake | null; error?: string } {
  const rawAmount = body.available_budget_usd;
  let available_budget_usd_cents: number | null = null;
  if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
    if (typeof rawAmount !== 'string' && typeof rawAmount !== 'number')
      return {value:null,error:'Indica el importe disponible en USD como número o déjalo en blanco.'};
    const amount = String(rawAmount).trim().replace(',', '.');
    const valid = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(amount);
    if (!valid) return {value:null,error:'Importe USD inválido (máximo 2 decimales). También puedes dejarlo vacío.'};
    available_budget_usd_cents = Number(valid[1]) * 100 + Number((valid[2] || '').padEnd(2,'0'));
    if (!Number.isSafeInteger(available_budget_usd_cents) || available_budget_usd_cents > 99999999999)
      return {value:null,error:'Importe USD fuera del rango permitido.'};
  }
  function optional(field:string,max:number):string|null|undefined {
    const v=body[field];
    if(v===null||v===undefined||v==='')return null;
    if(typeof v!=='string'||v.length>max+32)return undefined;
    const cleaned=v.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
    return cleaned.length<=max?cleaned||null:undefined;
  }
  const payment_method=optional('payment_method',160);
  const payment_currency=optional('payment_currency',30);
  const customer_type=optional('customer_type',30);
  if(payment_method===undefined||payment_currency===undefined||customer_type===undefined)
    return {value:null,error:'Revisa la longitud de la forma de pago, moneda o tipo de cliente.'};
  if(customer_type && !customerKinds.has(customer_type))
    return {value:null,error:'El tipo de cliente indicado no es válido.'};
  if(![available_budget_usd_cents,payment_method,payment_currency,customer_type].some(x=>x!==null))
    return {value:null};
  return {value:{available_budget_usd_cents,payment_method,payment_currency,customer_type}};
}
