/** Only quotes explicitly issued by an admin are visible to the customer. */
import type {Env} from './types';
import {quoteDecisionsAvailable} from './quote-decisions';
import {cubaToday} from './brigade-policy';
export async function issuedCustomerQuotes(env:Env,customerId:string){
 const {results}=await env.DB.prepare(
  "SELECT q.id,q.request_id,q.version_no,q.title,q.currency,q.items_json,q.subtotal_cents,q.taxes_cents,q.freight_cents,q.discount_cents,q.total_cents,q.valid_until,q.delivery_terms,q.warranty_terms,q.payment_terms,q.stock_notes,q.tax_notes,q.freight_notes,n.created_at AS issued_at "+
  "FROM commercial_quote_versions q JOIN requests r ON r.id=q.request_id JOIN customers cu ON cu.id=r.customer_id "+
  "JOIN notifications n ON n.id='quote-issued-'||q.id AND n.user_id=cu.id AND n.user_type='customer' "+
  "WHERE cu.id=? AND cu.is_active=1 AND q.status='approved_internal' ORDER BY n.created_at DESC LIMIT 30"
 ).bind(customerId).all<{id:string;request_id:string;title:string;total_cents:number;valid_until:string;items_json:string;version_no:number;issued_at:string}>();
 const available=await quoteDecisionsAvailable(env);
 const rows=results||[];
 return Promise.all(rows.map(async({items_json,...q})=>{
  const decision=available?await env.DB.prepare('SELECT decision,note,decided_at FROM commercial_quote_decisions WHERE quote_id=?').bind(q.id).first():null;
  const eligible=available&&!decision&&q.valid_until>=cubaToday()&&!!await env.DB.prepare("SELECT 1 FROM requests r WHERE r.id=? AND r.status NOT IN ('cancelled','completed') AND NOT EXISTS(SELECT 1 FROM commercial_quote_versions v JOIN notifications n ON n.id='quote-issued-'||v.id AND n.user_id=? AND n.user_type='customer' WHERE v.request_id=r.id AND v.version_no>?) AND NOT EXISTS(SELECT 1 FROM commercial_quote_decisions d JOIN commercial_quote_versions v ON v.id=d.quote_id WHERE v.request_id=r.id AND d.decision='accept')").bind(q.request_id,customerId,q.version_no).first();
  return {...q,items:JSON.parse(items_json),decision,can_decide:eligible};
 }));
}
