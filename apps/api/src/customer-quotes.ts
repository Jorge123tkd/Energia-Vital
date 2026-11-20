/** Only quotes explicitly issued by an admin are visible to the customer. */
import type {Env} from './types';
export async function issuedCustomerQuotes(env:Env,customerId:string){
 const {results}=await env.DB.prepare(
  "SELECT q.id,q.request_id,q.version_no,q.title,q.currency,q.items_json,q.subtotal_cents,q.taxes_cents,q.freight_cents,q.discount_cents,q.total_cents,q.valid_until,q.delivery_terms,q.warranty_terms,q.payment_terms,q.stock_notes,q.tax_notes,q.freight_notes,n.created_at AS issued_at "+
  "FROM commercial_quote_versions q JOIN requests r ON r.id=q.request_id JOIN customers cu ON cu.id=r.customer_id "+
  "JOIN notifications n ON n.id='quote-issued-'||q.id AND n.user_id=cu.id AND n.user_type='customer' "+
  "WHERE cu.id=? AND cu.is_active=1 AND q.status='approved_internal' ORDER BY n.created_at DESC LIMIT 30"
 ).bind(customerId).all<{id:string;request_id:string;title:string;total_cents:number;valid_until:string;items_json:string;version_no:number;issued_at:string}>();
 return (results||[]).map(({items_json,...q})=>({...q,items:JSON.parse(items_json)}));
}
