#!/usr/bin/env node
'use strict';
// Solo esquema D1, jamás registros de clientes ni secretos.
// Lee un JSON de `wrangler d1 execute --remote --json` por stdin.
const fs=require('node:fs');
const assert=require('node:assert/strict');

const required=['auth_sessions','customers','admin_users','requests','brigades','brigade_members','brigade_work',
  'request_activities','commercial_quote_versions','request_financial_declarations',
  'request_payment_reports','technical_work_reports','service_followup_cases',
  'service_case_notes','brigade_chief_accounts','brigade_chief_sessions',
  'brigade_chief_reports','brigade_evidence_images','chief_completion_reviews'];
function summarize(raw) {
  const entries=Array.isArray(raw)?raw:[raw];
  if(entries.length!==1 || !Array.isArray(entries[0]?.results)) throw Error('Formato D1 no esperado');
  const rows=entries[0].results;
  const names=new Set();
  for(const row of rows) {
    if(typeof row?.name!=='string' || !required.includes(row.name) && row.name!=='refresh_hash')
      throw Error('Metadato no esperado; detener auditoría');
    names.add(row.name);
  }
  const missing=required.filter(name=>!names.has(name));
  return { requiredCount:required.length, presentCount:required.length-missing.length,
    missing, refreshColumnPresent:names.has('refresh_hash'),
    ready:missing.length===0 && names.has('refresh_hash') };
}
if(require.main===module) {
  const input=fs.readFileSync(0,'utf8');
  const report=summarize(JSON.parse(input));
  console.log('Auditoría SOLO ESQUEMA D1 (sin filas personales):');
  console.log(JSON.stringify(report,null,2));
  if(!report.ready) process.exitCode=2;
}
module.exports={summarize,required};
