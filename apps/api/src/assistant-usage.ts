/** Web assistant usage: no Telegram, message contents, or empty conversations.
 * Counts retained authenticated customer messages; not a permanent analytics ledger.
 */
const grouped = "WITH usage AS ("+
 "SELECT s.customer_id,COUNT(DISTINCT s.id) AS conversations,COUNT(*) AS messages,"+
 "MIN(m.created_at) AS first_activity,MAX(m.created_at) AS last_activity "+
 "FROM assistant_sessions s JOIN assistant_messages m ON m.session_id=s.id "+
 "WHERE s.channel='web' AND s.customer_id IS NOT NULL AND m.role='user' "+
 "AND (?='' OR m.created_at>=?) GROUP BY s.customer_id), "+
 "filtered AS (SELECT u.*,c.name,c.email,c.phone,c.is_active FROM usage u JOIN customers c ON c.id=u.customer_id "+
 "WHERE (?='' OR instr(lower(c.id),?)>0 OR instr(lower(COALESCE(c.name,'')),?)>0 "+
 "OR instr(lower(COALESCE(c.email,'')),?)>0 OR instr(COALESCE(c.phone,''),?)>0)) ";
export const usageSummarySql=grouped+
 "SELECT COUNT(*) AS users,COALESCE(SUM(conversations),0) AS conversations,"+
 "COALESCE(SUM(messages),0) AS messages,COALESCE(SUM(CASE WHEN conversations>1 THEN 1 ELSE 0 END),0) AS returning_users "+
 "FROM filtered";
export const usageRowsSql=grouped+
 "SELECT customer_id,name,email,phone,is_active,conversations,messages,first_activity,last_activity "+
 "FROM filtered ORDER BY last_activity DESC,customer_id ASC LIMIT ? OFFSET ?";
export function assistantUsageFilters(input:{period?:string;q?:string;page?:string},now=new Date()){
 const period=['7','30','90','all'].includes(input.period||'')?input.period!:'all';
 const since=period==='all'?'':new Date(now.getTime()-Number(period)*86400000).toISOString();
 const q=(input.q||'').trim().toLowerCase().slice(0,120);
 const n=Number(input.page||1),page=Number.isSafeInteger(n)&&n>0?Math.min(n,100000):1;
 const pageSize=15;
 return {period,since,page,pageSize,args:[since,since,q,q,q,q,q],offset:(page-1)*pageSize};
}
