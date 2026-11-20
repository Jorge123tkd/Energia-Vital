const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {createHmac,webcrypto}=require('node:crypto');
const src=fs.readFileSync(path.join(__dirname,'../src/telegram-customer-auth.ts'),'utf8');
const mod={exports:{}};
new Function('module','exports','crypto',ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports,webcrypto);
const {verifiedTelegramUser}=mod.exports;
const now=1800000000,token='synthetic-test-token';
function signed(date=now,user={id:123456,is_bot:false}){
 const data=new URLSearchParams({auth_date:String(date),query_id:'fake-query',user:JSON.stringify(user)});
 const check=[...data.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(token).digest();
 data.set('hash',createHmac('sha256',key).update(check).digest('hex'));
 return data.toString();
}
(async()=>{
 assert.equal(await verifiedTelegramUser(signed(),token,now),'123456');
 assert.equal(await verifiedTelegramUser(signed(),token+'wrong',now),null);
 assert.equal(await verifiedTelegramUser(signed(now-601),token,now),null);
 assert.equal(await verifiedTelegramUser(signed(now+31),token,now),null);
 assert.equal(await verifiedTelegramUser(signed(now,{id:123456,is_bot:true}),token,now),null);
 assert.equal(await verifiedTelegramUser(signed()+'&auth_date='+now,token,now),null);
 const tampered=new URLSearchParams(signed());tampered.set('user',JSON.stringify({id:999}));
 assert.equal(await verifiedTelegramUser(tampered.toString(),token,now),null);
 const onboardingSrc=fs.readFileSync(path.join(__dirname,'../src/telegram-customer-onboarding.ts'),'utf8');
 const onboardingModule={exports:{}};
 new Function('module','exports','crypto',ts.transpileModule(onboardingSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(onboardingModule,onboardingModule.exports,webcrypto);
 const {advanceRegistration,startsRegistration,cancelsRegistration,isCustomerCode,newCustomerCode,codeDigest,registrationPrompt}=onboardingModule.exports;
 assert.ok(startsRegistration('Crear cuenta'));assert.ok(cancelsRegistration('Cancelar registro'));assert.equal(startsRegistration('Vincular cuenta'),false);
 let stage='name';const data={};for(const input of ['Cliente ficticio','+53 55555555','TEST@invalid.example','Calle ficticia 123','Municipio','Provincia']){const step=advanceRegistration(stage,input);assert.ok(step);data[step.field]=step.value;stage=step.next;}
 assert.equal(stage,'password');assert.equal(data.email,'test@invalid.example');assert.equal(advanceRegistration('password','fake-password-123'),null);assert.match(registrationPrompt('password'),/No la escribas en el chat/);
 assert.equal(advanceRegistration('phone','hola'),null);assert.equal(advanceRegistration('email','correo incorrecto'),null);
 const code=newCustomerCode();assert.ok(isCustomerCode(code));assert.equal(isCustomerCode('12345678'),false);assert.equal((await codeDigest(code)).length,64);assert.equal(await codeDigest(code.toLowerCase()),await codeDigest(code));
 assert.notEqual(newCustomerCode(),code);assert.notEqual(await codeDigest(newCustomerCode()),await codeDigest(code));
 console.log('PASS Telegram signed identity, tampering, expiration, duplicate parameters, guided registration and separate customer code format');
})().catch(e=>{console.error(e);process.exitCode=1});
