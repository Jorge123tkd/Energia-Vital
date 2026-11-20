const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
const src=fs.readFileSync(path.join(__dirname,'../src/assistant-usage.ts'),'utf8');
const mod={exports:{}};
new Function('module','exports',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports);
const {assistantUsageFilters,usageSummarySql,usageRowsSql}=mod.exports;
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT,email TEXT,phone TEXT,is_active INTEGER);CREATE TABLE assistant_sessions(id TEXT PRIMARY KEY,customer_id TEXT,channel TEXT);CREATE TABLE assistant_messages(id TEXT PRIMARY KEY,session_id TEXT,role TEXT,created_at TEXT);");
db.exec("INSERT INTO customers VALUES('c1','Ana','ana@invalid.example','111',1),('c2','Luis','luis@invalid.example','222',1),('c3','Eva','eva@invalid.example','333',1),('c4','Empty','empty@invalid.example','444',1); INSERT INTO assistant_sessions VALUES('w1','c1','web'),('w2','c1','web'),('w3','c1','web'),('w4','c2','web'),('t1','c1','telegram'),('t2','c3','telegram'),('e1','c4','web');");
const insert=db.prepare("INSERT INTO assistant_messages VALUES(?,?,?,?)");
for(const [i,session,role,date] of [
 ['1','w1','user','2026-09-01T12:00:00.000Z'],['2','w1','user','2026-11-18T12:00:00.000Z'],
 ['3','w2','user','2026-11-18T13:00:00.000Z'],['4','w3','user','2026-11-18T14:00:00.000Z'],
 ['5','w1','assistant','2026-11-18T12:00:01.000Z'],['6','w4','user','2026-11-18T15:00:00.000Z'],
 ['7','t1','user','2026-11-18T15:00:00.000Z'],['8','t2','user','2026-11-18T16:00:00.000Z'],
 ['9','e1','assistant','2026-11-18T16:00:00.000Z']
])insert.run(i,session,role,date);
const f=assistantUsageFilters({},new Date('2026-11-19T12:00:00.000Z'));
const summary=(filter)=>({...db.prepare(usageSummarySql).get(...filter.args)});
const rows=(filter)=>db.prepare(usageRowsSql).all(...filter.args,filter.pageSize,filter.offset);
assert.deepEqual(summary(f),{users:2,conversations:4,messages:5,returning_users:1});
assert.equal(rows(f).length,2);
const ana=rows(f).find(r=>r.customer_id==='c1');
assert.equal(ana.conversations,3);assert.equal(ana.messages,4);
assert.equal(ana.first_activity,'2026-09-01T12:00:00.000Z');
const recent=assistantUsageFilters({period:'7'},new Date('2026-11-19T12:00:00.000Z'));
assert.deepEqual(summary(recent),{users:2,conversations:4,messages:4,returning_users:1});
assert.deepEqual(summary(assistantUsageFilters({q:'111'})),{users:1,conversations:3,messages:4,returning_users:1});
assert.equal(rows(assistantUsageFilters({q:'Eva'})).length,0);
assert.equal(rows(assistantUsageFilters({page:'2'})).length,0);
assert.equal(assistantUsageFilters({page:'-99'}).page,1);
console.log('PASS assistant usage: distinct customer IDs, repeat conversations, user messages only, Telegram and empty chats excluded, filters/pagination');
// Telegram visitor stats never include verified web links or linked staff.
db.exec("ALTER TABLE customers ADD COLUMN telegram_customer_chat_id TEXT; CREATE TABLE telegram_staff_links(chat_id TEXT PRIMARY KEY); CREATE TABLE telegram_bot_messages(id TEXT PRIMARY KEY,chat_id TEXT,thread_id TEXT,role TEXT,created_at TEXT);");
db.exec(fs.readFileSync(path.join(__dirname,'../migrations/023_telegram_visitor_profiles.sql'),'utf8'));
db.exec("UPDATE customers SET telegram_customer_chat_id='400' WHERE id='c1'; INSERT INTO telegram_staff_links VALUES('500'); INSERT INTO telegram_visitor_profiles VALUES('100','Visitante A','visitor_a','2026-11-18T12:00:00.000Z');");
const visitorMod={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/telegram-visitor-usage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(visitorMod,visitorMod.exports);
const {visitorSummarySql,visitorRowsSql}=visitorMod.exports;
const insertVisitor=db.prepare("INSERT INTO telegram_bot_messages VALUES(?,?,?,?,?)");
for(const [i,chat,thread,role] of [['1','100','t1','user'],['2','100','t1','user'],['3','100','t2','user'],['4','100','t2','assistant'],['5','200','t3','user'],['6','400','t4','user'],['7','500','t5','user']])insertVisitor.run(i,chat,thread,role,'2026-11-18T12:00:00.000Z');
assert.deepEqual({...db.prepare(visitorSummarySql).get(...f.args)},{users:2,conversations:3,messages:4,returning_users:1});
const vrows=db.prepare(visitorRowsSql).all(...f.args,15,0);
assert.equal(vrows.find(r=>r.chat_id==='100').messages,3);
assert.equal(vrows.find(r=>r.chat_id==='200').username,null);
const byUsername=assistantUsageFilters({q:'@visitor_a'});
assert.equal(db.prepare(visitorRowsSql).all(...byUsername.args,15,0).length,1);
db.exec("UPDATE customers SET telegram_customer_chat_id='100' WHERE id='c2';");
assert.equal(db.prepare(visitorRowsSql).all(...f.args,15,0).length,1);
console.log('PASS Telegram visitors: unique IDs, unknown profile, username filter, registered and staff exclusion, link transition');
db.close();
