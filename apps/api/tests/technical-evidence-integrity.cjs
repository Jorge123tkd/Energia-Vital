/** Pruebas aisladas del auditor de integridad R2/D1: nunca consulta Cloudflare real. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {createHash}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/technical-evidence-integrity.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const mod={exports:{}};
new Function('module','exports',js)(mod,mod.exports);
const verify=mod.exports.verifyTechnicalEvidence;
const bytes=Buffer.from('Una evidencia técnica ficticia, nunca una foto de cliente.');
const hash=createHash('sha256').update(bytes).digest('hex');
const key='technical-evidence/prueba/test.png';
const obj=data=>({size:data.length,arrayBuffer:async()=>data.buffer.slice(
  data.byteOffset,data.byteOffset+data.byteLength
)});
const mock=stored=>({get:async k=>k===key?stored:null});
(async()=>{
  assert.equal(await verify(mock(obj(bytes)),key,bytes.length,hash),'verified');
  assert.equal(await verify(mock(null),key,bytes.length,hash),'missing');
  assert.equal(await verify(mock(obj(Buffer.from('x'.repeat(bytes.length)))),key,bytes.length,hash),'mismatch',
    'Same length but wrong bytes must fail SHA-256');
  assert.equal(await verify(mock(obj(bytes.subarray(0,5))),key,bytes.length,hash),'mismatch',
    'Incorrect R2 size must fail before reading');
  assert.equal(await verify(mock(obj(bytes)),key,bytes.length,'0'.repeat(64)),'mismatch',
    'Wrong D1 hash must be rejected');
  assert.equal(await verify(mock(obj(bytes)),'public-gallery/a.png',bytes.length,hash),'mismatch',
    'Only technical evidence prefix may be verified');
  assert.equal(await verify(mock(obj(bytes)),key,6*1024*1024,hash),'mismatch',
    'Oversized D1 record must be rejected');
  let read=false;
  const tooLarge={size:6*1024*1024,arrayBuffer:async()=>{read=true;return bytes}};
  assert.equal(await verify(mock(tooLarge),key,bytes.length,hash),'mismatch');
  assert.equal(read,false,'Large R2 objects must not be loaded into memory');
  console.log('PASS read-only R2/D1 integrity verifier, mismatch, missing and size guards');
})().catch(e=>{console.error(e);process.exitCode=1});
