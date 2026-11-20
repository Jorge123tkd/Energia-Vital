/** Resumen opt-in de la agenda general del equipo a las 07:00 en Cuba.
 * Cloudflare ejecuta cron en UTC; ambos disparos 11 y 12 UTC cubren CST/CDT.
 */
import type {Env} from './types';
import {cubaDate,cubaHour,agendaForTeam} from './telegram-agenda';
import {sendTelegramText} from './routes/telegram';

export async function runTelegramMorningReminders(env:Env,at:Date):Promise<void>{
  // Inactivo hasta configurar oficialmente Telegram y aplicar migración 011.
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET||cubaHour(at)!==7)return;
  const date=cubaDate(at),stamp=new Date().toISOString();
  const staff=await env.DB.prepare(
    "SELECT l.chat_id,l.admin_user_id FROM telegram_staff_links l "+
    "JOIN admin_users a ON a.id=l.admin_user_id "+
    "WHERE l.reminders_enabled=1 AND a.is_active=1 AND a.role IN ('admin','operator') "+
    "ORDER BY l.verified_at ASC LIMIT 500"
  ).all<{chat_id:string;admin_user_id:string}>();
  if(!staff.results?.length)return;
  // Solo el equipo vinculado puede recibir direcciones y teléfonos.
  const agenda=await agendaForTeam(env,'today',at);
  for(const member of staff.results){
    const claim=await env.DB.prepare(
      "INSERT OR IGNORE INTO telegram_staff_digest_log "+
      "(admin_user_id,cuba_date,status,updated_at) VALUES (?,?,'processing',?)"
    ).bind(member.admin_user_id,date,stamp).run();
    if(!claim.meta?.changes)continue;
    try{
      await sendTelegramText(env,member.chat_id,'☀️ Buenos días. Resumen Bonaire de las 7:00 a. m.\n\n'+agenda);
      await env.DB.prepare(
        "UPDATE telegram_staff_digest_log SET status='sent',updated_at=? WHERE admin_user_id=? AND cuba_date=?"
      ).bind(new Date().toISOString(),member.admin_user_id,date).run();
    }catch(err){
      await env.DB.prepare(
        "UPDATE telegram_staff_digest_log SET status='failed',updated_at=? WHERE admin_user_id=? AND cuba_date=?"
      ).bind(new Date().toISOString(),member.admin_user_id,date).run().catch(()=>null);
      console.error('Telegram: no se pudo entregar un resumen del equipo',
        err instanceof Error?err.message:'Error de entrega');
    }
  }
}
