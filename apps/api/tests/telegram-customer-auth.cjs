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
 const routeSrc=fs.readFileSync(path.join(__dirname,'../src/routes/telegram.ts'),'utf8');
 const routeModule={exports:{}};
 const deny=async c=>c.json({error:'not authorized'},401);
 new Function('require','module','exports',ts.transpileModule(routeSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name==='hono'?require('hono'):name==='../middleware'?{requireAdminAuth:deny,requireStaffAuth:deny}:name==='../telegram-customer-onboarding'?onboardingModule.exports:{},routeModule,routeModule.exports);
 const canonical=routeModule.exports.canonicalTelegramLinks;
 assert.equal(canonical('https://energia-vital-web.pages.dev/perfil?x=1'),'https://bnergiv.com/perfil?x=1');
 assert.equal(canonical('http://energiavitalweb.page.net/entrar'),'https://bnergiv.com/entrar');
 assert.equal(canonical('https://wa.me/5355555555 https://eltoque.com https://api.telegram.org'),'https://wa.me/5355555555 https://eltoque.com https://api.telegram.org');
 assert.equal(canonical('https://energia-vital-web.pages.dev.evil.example'),'https://energia-vital-web.pages.dev.evil.example');
 const callback={update_id:999,callback_query:{id:'callback-test',data:'customer:create',from:{id:123456},message:{chat:{id:123456,type:'private'}}}};
 assert.equal(routeModule.exports.extractTelegramAccountCallback(callback).input.text,'crear cuenta');
 assert.equal(routeModule.exports.extractTelegramAccountCallback({...callback,callback_query:{...callback.callback_query,from:{id:654321}}}),null);
 assert.equal(routeModule.exports.extractTelegramAccountCallback({...callback,callback_query:{...callback.callback_query,message:{chat:{id:123456,type:'group'}}}}),null);
 console.log('PASS Telegram signed identity, tampering, expiration, duplicate parameters, guided registration, separate customer code format and private callbacks');
})().catch(e=>{console.error(e);process.exitCode=1});
