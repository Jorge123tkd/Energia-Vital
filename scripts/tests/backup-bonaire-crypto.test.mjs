import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {seal,unseal,checkRestoration} from '../backup-bonaire-crypto.mjs'
const p='una frase de respaldo muy larga y distinta'
const sql=Buffer.from('BEGIN TRANSACTION;\nCREATE TABLE d1_migrations(id INTEGER PRIMARY KEY);\n'+
 Array.from({length:24},(_,i)=>'INSERT INTO d1_migrations(id) VALUES('+(i+1)+');\n').join('')+
 ['admin_users','requests','customers','auth_sessions','products'].map(n=>'CREATE TABLE '+n+'(id TEXT PRIMARY KEY);\n').join('')+
 'COMMIT;\n')
test('AES-256-GCM backup roundtrip authenticates data and metadata',()=>{
 const encrypted=seal(sql,p)
 assert.ok(encrypted.length>sql.length)
 assert.deepEqual(unseal(encrypted,p),sql)
 assert.notDeepEqual(encrypted,seal(sql,p))
 for(const bad of [encrypted.subarray(0,-1),Buffer.concat([encrypted,Buffer.from('x')]),Buffer.from(encrypted)]){
  if(bad.length===encrypted.length)bad[22]^=2
  assert.throws(()=>unseal(bad,p))
 }
 assert.throws(()=>unseal(encrypted,'clave equivocada pero larga'))
})
test('private export restores solely in SQLite memory with 24 migrations',()=>{
 assert.equal(checkRestoration(sql),true)
 assert.throws(()=>checkRestoration(Buffer.from('SELECT 123;\n'.repeat(30))))
})
test('offline plan and no production mutations',()=>{
 const file=fileURLToPath(new URL('../backup-bonaire-crypto.mjs',import.meta.url))
 const r=spawnSync(process.execPath,[file,'--plan'],{encoding:'utf8',timeout:10000})
 assert.equal(r.status,0,r.stderr)
 assert.match(r.stdout,/AES-256-GCM/)
 const src=readFileSync(file,'utf8')
 assert.doesNotMatch(src,/wrangler\s+deploy|migrations apply|d1 execute|pages deploy|r2 object put/)
})
