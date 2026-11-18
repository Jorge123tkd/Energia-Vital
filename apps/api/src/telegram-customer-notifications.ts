/** Opt-in private inbox alerts. Only generic text leaves the web inbox automatically. */
import type {Env} from './types';
import {sendTelegramText} from './routes/telegram';

export async function setTelegramCustomerNotifications(env:Env,customerId:string,chatId:string,enabled:boolean){
 const result=await env.DB.prepare("UPDATE customers SET telegram_notifications_since="+(enabled?"COALESCE(telegram_notifications_since,?)":"?")+" WHERE id=? AND telegram_customer_chat_id=? AND is_active=1")
   .bind(enabled?new Date().toISOString():null,customerId,chatId).run();
 return !!result.meta?.changes;
}
export async function runTelegramCustomerNotifications(env:Env,at:Date){
 if(env.ENVIRONMENT!=='production'||!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET)return;
 // Bounded worker batch: at most 20 calls per schedule. Never send old inbox history.
 const stamp=at.toISOString();
 const {results}=await env.DB.prepare(
 "SELECT n.id,n.user_id,c.telegram_customer_chat_id AS chat_id FROM notifications n JOIN customers c ON c.id=n.user_id "+
 "LEFT JOIN telegram_customer_notice_deliveries d ON d.notification_id=n.id "+
 "WHERE n.user_type='customer' AND n.is_read=0 AND c.is_active=1 AND c.telegram_customer_chat_id IS NOT NULL "+
 "AND c.telegram_notifications_since IS NOT NULL AND julianday(n.created_at)>=julianday(c.telegram_notifications_since) "+
 "AND julianday(n.created_at)>=julianday(?,'-7 days') AND d.notification_id IS NULL ORDER BY n.created_at,n.id LIMIT 20"
 ).bind(stamp).all<{id:string;user_id:string;chat_id:string}>();
 for(const item of results||[]){
  const claim=await env.DB.prepare(
   "INSERT OR IGNORE INTO telegram_customer_notice_deliveries(notification_id,customer_id,chat_id,status,updated_at) "+
   "SELECT n.id,c.id,c.telegram_customer_chat_id,'processing',? FROM notifications n JOIN customers c ON c.id=n.user_id "+
   "WHERE n.id=? AND n.user_type='customer' AND n.is_read=0 AND c.id=? AND c.is_active=1 AND c.telegram_customer_chat_id=? "+
   "AND c.telegram_notifications_since IS NOT NULL AND julianday(n.created_at)>=julianday(c.telegram_notifications_since)"
  ).bind(stamp,item.id,item.user_id,item.chat_id).run();
  if(!claim.meta?.changes)continue;
  let status='failed';
  try{
   const still=await env.DB.prepare("SELECT id FROM customers WHERE id=? AND telegram_customer_chat_id=? AND is_active=1 AND telegram_notifications_since IS NOT NULL").bind(item.user_id,item.chat_id).first();
   if(!still)status='cancelled';
   else{
    await sendTelegramText(env,item.chat_id,'🔔 Tienes una nueva notificación de Bonaire. Escribe «mis notificaciones» para consultarla de forma privada.');
    status='sent';
   }
  }catch{/* Do not log the Bot API URL or personal data. No auto-retry of ambiguous sends. */}
  await env.DB.prepare("UPDATE telegram_customer_notice_deliveries SET status=?,updated_at=? WHERE notification_id=? AND status='processing'").bind(status,new Date().toISOString(),item.id).run();
 }
}
