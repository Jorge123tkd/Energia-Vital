/** Separate analytics for private Telegram chats without a verified web link.
 * Retained user messages only; do not expose conversation content.
 */
const grouped="WITH usage AS ("+
 "SELECT m.chat_id,COUNT(DISTINCT m.thread_id) AS conversations,COUNT(*) AS messages,"+
 "MIN(m.created_at) AS first_activity,MAX(m.created_at) AS last_activity "+
 "FROM telegram_bot_messages m WHERE m.role='user' AND (?='' OR m.created_at>=?) "+
 "AND NOT EXISTS(SELECT 1 FROM customers c WHERE c.telegram_customer_chat_id=m.chat_id) "+
 "AND NOT EXISTS(SELECT 1 FROM telegram_staff_links l WHERE l.chat_id=m.chat_id) "+
 "GROUP BY m.chat_id), "+
 "filtered AS (SELECT u.*,p.display_name,p.username FROM usage u LEFT JOIN telegram_visitor_profiles p ON p.chat_id=u.chat_id "+
 "WHERE (?='' OR instr(u.chat_id,?)>0 OR instr(lower(COALESCE(p.display_name,'')),?)>0 "+
 "OR instr(lower(COALESCE(p.username,'')),ltrim(?,'@'))>0 OR instr(lower(COALESCE(p.username,'')),?)>0)) ";
export const visitorSummarySql=grouped+
 "SELECT COUNT(*) AS users,COALESCE(SUM(conversations),0) AS conversations,"+
 "COALESCE(SUM(messages),0) AS messages,COALESCE(SUM(CASE WHEN conversations>1 THEN 1 ELSE 0 END),0) AS returning_users FROM filtered";
export const visitorRowsSql=grouped+
 "SELECT chat_id,display_name,username,conversations,messages,first_activity,last_activity FROM filtered "+
 "ORDER BY last_activity DESC,chat_id ASC LIMIT ? OFFSET ?";
