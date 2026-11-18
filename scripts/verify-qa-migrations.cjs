'use strict';
const assert=require('node:assert/strict');
// Lee exclusivamente el JSON generado por Wrangler D1 --json.
// No muestra nombres de clientes, tokens, contenido de tablas o datos privados.
function parse(text){
  const payload=JSON.parse(text);
  const block=Array.isArray(payload)?payload[0]:payload;
  assert(block && Array.isArray(block.results),'Respuesta D1 QA inesperada');
  assert(block.results.length===1,'Consulta no devolvió una sola fila');
  const row=block.results[0];
  const migrations=Number(row.migrations);
  const last=Number(row.last_id);
  const refresh=Number(row.refresh_column);
  assert(Number.isInteger(migrations) && migrations===21,
    'QA exige 21 migraciones; recibió '+migrations);
  assert(Number.isInteger(last) && last===21,
    'QA requiere migración 021 como última registrada');
  assert(refresh===1,'Falta auth_sessions.refresh_hash de migración 021');
  return true;
}
if(require.main===module){
 let data='';process.stdin.setEncoding('utf8');
 process.stdin.on('data',chunk=>{data+=chunk});
 process.stdin.on('end',()=>{try{parse(data);console.log('PASS: D1 QA 21 migraciones y columna refresh_hash verificadas');}
 catch(e){console.error('QA BLOQUEADA: '+e.message);process.exitCode=1}});
}
module.exports={parse};
