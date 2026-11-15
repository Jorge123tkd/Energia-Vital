/**
 * Bonaire — Auditoría D1 REMOTA de SOLO LECTURA.
 * No recibe SQL del exterior; todos los comandos SQL están prefijados como SELECT.
 * No imprime filas, números de clientes, correos, tokens ni respuesta JSON cruda.
 * Datos recuperados permanecen en la memoria del runner y no se guardan.
 */
const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
const assert=require('node:assert/strict');

const database='energia-vital-db';
const allowlist=[
 'customers','requests','appointments','assistant_sessions','assistant_messages',
 'request_images','request_intake','audit_logs','brigades','brigade_members',
 'brigade_work','request_activities','commercial_quote_versions',
 'request_financial_declarations','request_payment_reports','technical_work_reports',
 'service_followup_cases','service_case_notes','brigade_chief_accounts',
 'brigade_chief_sessions','brigade_chief_reports','brigade_evidence_images','d1_migrations'
];
function wrangler(args){
 try{
  return execFileSync('npx',['wrangler',...args],{
    cwd:join(__dirname,'..'),encoding:'utf8',timeout:90000,maxBuffer:2*1024*1024,
    env:process.env,stdio:['ignore','pipe','pipe']
  });
 }catch(err){
  // Nunca publicar stderr/stdout de solicitudes remotas: podrían incluir metadatos.
  throw Error('Consulta Cloudflare falló ('+args[0]+' '+(args[1]||'')+'). Revisar token, binding y conectividad en Secrets, sin imprimir credenciales.');
 }
}
function select(sql){
 assert.ok(/^SELECT\s/i.test(sql),'Se prohíbe cualquier SQL que no sea SELECT');
 const result=JSON.parse(wrangler(['d1','execute',database,'--remote','--json','--command',sql]));
 const item=Array.isArray(result)?result[0]:result;
 if(!item||item.success===false||!Array.isArray(item.results))
   throw Error('Cloudflare no devolvió resultados SELECT válidos');
 return item.results;
}
async function main(){
 if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID)
   throw Error('Faltan los secretos de GitHub para auditoría de Cloudflare');
 console.log('Auditoría remota de solo lectura: sin datos personales ni artefactos.');
 const sql="SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+
   allowlist.map(name=>"'"+name+"'").join(',')+") ORDER BY name";
 const names=select(sql).map(x=>x.name);
 if(!names.every(name=>allowlist.includes(name)))
   throw Error('El inventario de esquema contiene una tabla inesperada');
 for(const t of allowlist.filter(t=>t!=='d1_migrations'))
   console.log('ESQUEMA '+t+': '+(names.includes(t)?'PRESENTE':'AUN_NO_PRESENTE'));
 if(names.includes('d1_migrations')){
   const applied=select('SELECT name FROM d1_migrations ORDER BY id').map(x=>x.name);
   for(const [num,name] of [
     ['013','013_brigades_foundation.sql'],['014','014_request_activities.sql'],['015','015_commercial_quote_versions.sql'],['016','016_request_financial_tracking.sql'],['017','017_technical_followup.sql'],['018','018_chief_access_evidence.sql']
   ]){
     console.log('MIGRACION '+num+': '+(applied.includes(name)?'APLICADA':'NO_APLICADA'));
   }
 }else console.log('MIGRACIONES: registro d1_migrations no encontrado; revisar antes de desplegar');
 let countChecked=0;
 for(const t of allowlist.filter(t=>t!=='d1_migrations'&&names.includes(t))){
   // Los conteos permanecen EN MEMORIA, nunca en un log público.
   const rows=select('SELECT COUNT(*) AS n FROM "'+t+'"');
   if(rows.length!==1||!Number.isSafeInteger(Number(rows[0].n))||Number(rows[0].n)<0)
     throw Error('Falló validación de conteo de '+t);
   countChecked++;
 }
 console.log('CONTEOS: '+countChecked+' tablas consultadas; cifras deliberadamente ocultas');
 // La migración es lectura de ficheros públicos de la rama, no ejecuta INSERT/ALTER.
 const pending=wrangler(['d1','migrations','list',database,'--remote']);
 const filenames=[...new Set(pending.match(/\b\d{3}_[a-z0-9_-]+\.sql\b/gi)||[])];
 console.log('MIGRACIONES PENDIENTES: '+(filenames.join(', ')||'sin nombres identificados en la salida; verificar el registro'));
 console.log('FINALIZADO: consultas SELECT y migrations list; NO se hizo backup, ALTER, apply ni deploy');
}
main().catch(err=>{console.error('AUDITORIA BLOQUEADA: '+err.message);process.exitCode=1;});
