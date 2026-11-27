#!/usr/bin/env node
'use strict';
// Verificador estricto del informe npm audit --json sobre el lockfile candidato.
// No usa credenciales ni modifica dependencias. Rechaza salida de red incompleta.
const fs = require('node:fs');

function assess(report) {
  if (!report || typeof report !== 'object' || report.error ||
      !report.metadata || !report.metadata.vulnerabilities) {
    throw new Error('npm audit no produjo un informe válido; se bloquea la salida');
  }
  const counts=report.metadata.vulnerabilities;
  for(const severity of ['critical','high','moderate','low']) {
    if(!Number.isSafeInteger(counts[severity]) || counts[severity]<0) {
      throw new Error('Conteo npm audit inválido: '+severity);
    }
  }
  const blocked=counts.critical+counts.high+counts.moderate;
  return {critical:counts.critical,high:counts.high,moderate:counts.moderate,
    low:counts.low,ready:blocked===0};
}

if(require.main===module) {
  try {
    const result=assess(JSON.parse(fs.readFileSync(0,'utf8')));
    console.log('Resumen audit del candidato:', JSON.stringify(result));
    if(!result.ready) process.exitCode=2;
  } catch(error) {
    console.error(error.message);
    process.exitCode=3;
  }
}
module.exports={assess};
