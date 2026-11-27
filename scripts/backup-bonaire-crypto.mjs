// Bonaire D1: encrypt and test only the private export, offline (Node 22+).
import {createCipheriv,createDecipheriv,createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {readFileSync,statSync,openSync,writeSync,fsyncSync,closeSync,unlinkSync,existsSync} from 'node:fs'
import {resolve,dirname,extname,sep} from 'node:path'
import {pathToFileURL,fileURLToPath} from 'node:url'
const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)))
const MAGIC=Buffer.from('BONAIRE-D1-ENC1','ascii'),SALT=16,IV=12,TAG=16,MAX=256*1024*1024,HEADER=MAGIC.length+SALT+IV
const check=(v,m)=>{if(!v)throw Error(m)}
const derived=(p,s)=>scryptSync(p,s,32,{N:32768,r:8,p:1,maxmem:128*1024*1024})
function validPass(p){check(typeof p==='string'&&p.length>=16&&Buffer.byteLength(p,'utf8')<=1024,'Frase demasiado corta o larga')}
export function seal(sql,p,{salt=randomBytes(SALT),iv=randomBytes(IV)}={}){
 validPass(p);check(Buffer.isBuffer(sql)&&sql.length>100&&sql.length<=MAX,'SQL no valido')
 const head=Buffer.concat([MAGIC,salt,iv]),key=derived(p,salt)
 try{const c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(head);return Buffer.concat([head,c.update(sql),c.final(),c.getAuthTag()])}finally{key.fill(0)}
}
export function unseal(blob,p){
 validPass(p);check(Buffer.isBuffer(blob)&&blob.length>HEADER+TAG+100&&blob.length<=MAX+HEADER+TAG,'Copia no valida')
 check(blob.subarray(0,MAGIC.length).equals(MAGIC),'Formato no valido')
 const head=blob.subarray(0,HEADER),salt=head.subarray(MAGIC.length,MAGIC.length+SALT),iv=head.subarray(MAGIC.length+SALT),key=derived(p,salt)
 try{const c=createDecipheriv('aes-256-gcm',key,iv);c.setAAD(head);c.setAuthTag(blob.subarray(blob.length-TAG))
 return Buffer.concat([c.update(blob.subarray(HEADER,blob.length-TAG)),c.final()])}finally{key.fill(0)}
}
export function checkRestoration(sql,expected=24){
 check([24,28,34].includes(expected),'Historial esperado no autorizado')
 check(Buffer.isBuffer(sql)&&sql.length>100&&sql.length<=MAX,'SQL no valido')
 const script=resolve(ROOT,'scripts/verificar-exportacion-d1.py')
 const tools=process.platform==='win32'?[['py',['-3',script]],['python',[script]]]:[['python3',[script]],['python',[script]]]
 for(const [command,args] of tools){
  const r=spawnSync(command,[...args,'--expected',String(expected)],{input:sql,encoding:'utf8',timeout:45000,maxBuffer:4096,windowsHide:true})
  if(r.error?.code==='ENOENT')continue
  check(r.status===0&&r.stdout?.includes(expected+'/'+expected),'No se pudo restaurar D1 en memoria; no continuar')
  return true
 }
 throw Error('Python 3 no disponible')
}
function target(path,extension){
 const p=resolve(path)
 check(p!==ROOT&&!p.startsWith(ROOT+sep),'No usar carpeta del repositorio')
 check(extname(p).toLowerCase()===extension,'Extension incorrecta')
 return p
}
async function prompt(hidden){
 check(process.stdin.isTTY&&typeof process.stdin.setRawMode==='function','Se requiere CMD interactivo')
 process.stdout.write(hidden)
 return new Promise((done,fail)=>{
  let pass='',finished=false
  const clean=()=>{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData)}
  function onData(data){for(const ch of data.toString('utf8')){
   if(ch==='\r'||ch==='\n'){if(finished)return;finished=true;clean();process.stdout.write('\n');done(pass);return}
   if(ch==='\u0003'){finished=true;clean();fail(Error('Cancelado'));return}
   if(ch==='\b'||ch==='\u007f'){pass=pass.slice(0,-1);continue}
   if(pass.length<1024&&ch>=' ')pass+=ch
  }}
  process.stdin.setRawMode(true);process.stdin.resume();process.stdin.on('data',onData)
 })
}
async function main(){
 const [op,arg1,arg2]=process.argv.slice(2)
 if(op==='--plan'&&process.argv.length===3){
  console.log('PLAN: D1 SQL privado -> restauracion en memoria -> AES-256-GCM scrypt -> verificacion cifrada.')
  console.log('La copia externa real debe estar fuera de Cloudflare y del SSD. No se suben archivos automaticamente.')
  return
 }
 if((op==='--crear'||op==='--crear-28')&&process.argv.length===5){
  const expected=op==='--crear-28'?28:24
  const source=target(arg1,'.sql'),dest=target(arg2,'.evbackup')
  check(!existsSync(dest),'No sobrescribir la copia cifrada')
  check(statSync(dirname(dest)).isDirectory(),'Directorio inexistente')
  const sql=readFileSync(source)
  checkRestoration(sql,expected)
  const p=await prompt('Frase de respaldo (16+ caracteres, oculta): ')
  validPass(p);check(p===await prompt('Repita la frase (oculta): '),'Frases distintas')
  const expected=createHash('sha256').update(sql).digest(),encrypted=seal(sql,p)
  let fd,created=false
  try{
   fd=openSync(dest,'wx',0o600);created=true
   let offset=0;while(offset<encrypted.length)offset+=writeSync(fd,encrypted,offset,encrypted.length-offset)
   fsyncSync(fd);closeSync(fd);fd=undefined
   const restored=unseal(readFileSync(dest),p)
   check(timingSafeEqual(expected,createHash('sha256').update(restored).digest()),'Verificacion hash fallida')
   checkRestoration(restored,expected)
  }catch(e){if(fd!==undefined)closeSync(fd);if(created)unlinkSync(dest);throw e}
  console.log('[OK] D1 '+expected+'/'+expected+' restaurable en memoria, cifrado AES-256-GCM autenticado.')
  console.log('[OK] SHA256 copia cifrada: '+createHash('sha256').update(readFileSync(dest)).digest('hex'))
  console.log('[PENDIENTE] Copiar fuera de Cloudflare y SSD y verificar archivo recuperado antes de migrar.')
  return
 }
 if((op==='--verificar'||op==='--verificar-28')&&process.argv.length===4){
  const expected=op==='--verificar-28'?28:24
  const blob=readFileSync(target(arg1,'.evbackup'))
  const p=await prompt('Frase de respaldo (oculta): ')
  checkRestoration(unseal(blob,p),expected)
  console.log('[OK] Copia restaurada en memoria; '+expected+'/'+expected+' y hash del archivo cifrado:')
  console.log(createHash('sha256').update(blob).digest('hex'))
  return
 }
 throw Error('Uso: --plan | --crear EXPORTACION.sql CIFRADO.evbackup | --verificar CIFRADO.evbackup | --crear-28 EXPORTACION.sql CIFRADO.evbackup | --verificar-28 CIFRADO.evbackup')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().catch(()=>{console.error('[BLOQUEADO] Respaldo no validado, datos privados omitidos.');process.exitCode=1})
}
