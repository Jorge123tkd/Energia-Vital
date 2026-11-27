/** Only quotes explicitly issued by an admin are visible to their current owner. */
import type {Env} from './types';
import {quoteDecisionsAvailable} from './quote-decisions';
import {cubaToday} from './brigade-policy';
export async function issuedCustomerQuotes(env:Env,customerId:string){
 const enabled=await quoteDecisionsAvailable(env);
 const extra=enabled?",d.decision AS response_decision,d.note AS response_note,d.decided_at AS response_at,CASE WHEN d.quote_id IS NULL AND q.valid_until>=? AND r.status NOT IN ('cancelled','completed') AND NOT EXISTS(SELECT 1 FROM commercial_quote_versions v JOIN notifications nn ON nn.id='quote-issued-'||v.id AND nn.user_id=cu.id AND nn.user_type='customer' WHERE v.request_id=r.id AND v.version_no>q.version_no) AND NOT EXISTS(SELECT 1 FROM commercial_quote_decisions dd JOIN commercial_quote_versions v ON v.id=dd.quote_id WHERE v.request_id=r.id AND dd.decision='accept') THEN 1 ELSE 0 END AS eligible":",NULL AS response_decision,NULL AS response_note,NULL AS response_at,0 AS eligible";
 const statement=env.DB.prepare(
  "SELECT q.id,q.request_id,q.version_no,q.title,q.currency,q.items_json,q.subtotal_cents,q.taxes_cents,q.freight_cents,q.discount_cents,q.total_cents,q.valid_until,q.delivery_terms,q.warranty_terms,q.payment_terms,q.stock_notes,q.tax_notes,q.freight_notes,n.created_at AS issued_at"+extra+
  " FROM commercial_quote_versions q JOIN requests r ON r.id=q.request_id JOIN customers cu ON cu.id=r.customer_id "+
  "JOIN notifications n ON n.id='quote-issued-'||q.id AND n.user_id=cu.id AND n.user_type='customer' "+
  (enabled?"LEFT JOIN commercial_quote_decisions d ON d.quote_id=q.id ":"")+
  "WHERE cu.id=? AND cu.is_active=1 AND q.status='approved_internal' ORDER BY n.created_at DESC LIMIT 30"
 );
 const {results}=await statement.bind(...(enabled?[cubaToday(),customerId]:[customerId])).all<{id:string;request_id:string;title:string;total_cents:number;valid_until:string;items_json:string;version_no:number;issued_at:string;response_decision:string|null;response_note:string|null;response_at:string|null;eligible:number}>();
 return (results||[]).map(({items_json,response_decision,response_note,response_at,eligible,...q})=>({...q,items:JSON.parse(items_json),decision:response_decision?{decision:response_decision,note:response_note,decided_at:response_at}:null,can_decide:eligible===1}));
}
