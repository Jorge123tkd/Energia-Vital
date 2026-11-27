/**
 * Pruebas puras del protocolo Meta; NO envía WhatsApp ni toca D1, Cloudflare o secretos reales.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {Hono}=require('hono');
const source=fs.readFileSync(path.resolve(__dirname,'../src/routes/whatsapp.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const transpiledModule={exports:{}};
const fakeRequire=(name)=>{
 if(name==='hono')return {Hono};
 if(name==='../middleware')return {requireStaffAuth:async(c,next)=>c.json({error:'unverified'},401),getUser:()=>null};
 if(name==='../assistant-engine')return {isOutOfScopeMessage:()=>false,generateResponse:()=>({text:'OK'}),loadAssistantContext:()=>({})};
 if(name==='../solar-guidance')return {advanceSolarGuidance:()=>({handled:false})};
 if(name==='../exchange-rates')return {getElToqueRates:()=>null,formatExchangeReply:()=>''};
 return {};
};
new Function('require','module','exports',js)(fakeRequire,transpiledModule,transpiledModule.exports);
const {whatsappRoutes,extractIncoming,maskWhatsAppId,verifyMetaSignature}=transpiledModule.exports;
const key='local-test-meta-app-secret';
const body=new TextEncoder().encode('{"object":"whatsapp_business_account"}');
async function run(){
 const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signed=await crypto.subtle.sign('HMAC',cryptoKey,body);
 const hex=Buffer.from(new Uint8Array(signed)).toString('hex');
 assert.equal(await verifyMetaSignature(key,body,'sha256='+hex),true);
 assert.equal(await verifyMetaSignature(key,body,'sha256='+hex.slice(0,62)+(hex.slice(-2)==='ff'?'00':'ff')),false);
 assert.equal(await verifyMetaSignature(key,body,'sha1='+hex),false);
 assert.equal(await verifyMetaSignature(key,new TextEncoder().encode('not the same body'),'sha256='+hex),false);
 const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
   metadata:{phone_number_id:'1234'},messages:[{id:'wamid.test',from:'5355550101',type:'text',text:{body:'asesoramiento solar'}}]
 }}]}]};
 assert.deepEqual(extractIncoming(payload,'1234'),[{id:'wamid.test',from:'5355550101',text:'asesoramiento solar'}]);
 assert.equal(extractIncoming(payload,'otro').length,0);
 assert.equal(extractIncoming({object:'not_whatsapp_business_account',entry:payload.entry},'1234').length,0);
 assert.equal(maskWhatsAppId('5355550101'),'•••0101');
 let response=await whatsappRoutes.request('http://local/webhook?hub.mode=subscribe&hub.verify_token=verify-local&hub.challenge=123456',{},{
   WA_VERIFY_TOKEN:'verify-local'
 });
 assert.equal(response.status,200);
 assert.equal(await response.text(),'123456');
 response=await whatsappRoutes.request('http://local/webhook?hub.mode=subscribe&hub.verify_token=incorrect&hub.challenge=123456',{},{
   WA_VERIFY_TOKEN:'verify-local'
 });
 assert.equal(response.status,403);
 response=await whatsappRoutes.request('http://local/webhook',{method:'POST',body:'{}'},{
   WA_VERIFY_TOKEN:'verify-local'
 });
 assert.equal(response.status,503,'Sin credenciales completas no acepta mensajes');
 console.log('PASS whatsapp bot smoke: HMAC, spoofing, number filter, GET verification, disabled-by-default');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
