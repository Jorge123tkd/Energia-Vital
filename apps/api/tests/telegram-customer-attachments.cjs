const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,fakeRequire){
 const src=fs.readFileSync(path.resolve(__dirname,file),'utf8');
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',js)(fakeRequire,mod,mod.exports);
 return mod.exports;
}
const auth={currentTelegramCustomer:async()=>null};
const docs=load('../src/telegram-customer-documents.ts',name=>{
 if(name==='./telegram-customer-auth')return auth;
 if(name==='./request-documents')return {boundedDocument:()=>null,saveRequestDocument:()=>false,listRequestDocuments:()=>[],ownedDocument:()=>null,maxDocumentBytes:8*1024*1024,documentFormat:()=>null};
 throw Error('Unexpected dependency '+name);
});
const photos=load('../src/telegram-customer-photos.ts',name=>{
 if(name==='./telegram-customer-auth')return auth;
 throw Error('Unexpected dependency '+name);
});
(async()=>{
 const env={};
 const document=await docs.receiveTelegramDocument(env,{updateId:'100',chatId:'555001',fileId:'file',filename:'plano.pdf',size:1024,caption:'solicitud req-1'});
 assert.match(document,/solicitud por teléfono/);
 assert.match(document,/crea o vincula tu cuenta/);
 assert.match(document,/No se ha guardado este archivo/);
 const photo=await photos.receiveTelegramPhoto(env,{updateId:'101',chatId:'555001',fileId:'file',caption:'solicitud req-1',size:1024});
 assert.match(photo,/solicitud por teléfono/);
 assert.match(photo,/crea o vincula tu cuenta/);
 assert.match(photo,/No se ha guardado esta foto/);
 console.log('PASS Telegram guest attachments: explains account requirement without claiming file was saved.');
})().catch(e=>{console.error(e);process.exitCode=1});
