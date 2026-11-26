// Real Chromium test of the actual engineering renderer, sandbox and message protocol.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=createRequire(join(process.env.EVPRO_BROWSER_DEPS,'package.json'))('playwright');
const root=new URL('../public/studio-engineering/',import.meta.url);
const frameSource=readFileSync(new URL('../src/components/StudioEngineeringFrame.svelte',import.meta.url),'utf8');
const sandbox=frameSource.match(/sandbox="([^"]+)"/)[1];
const parent=`<!doctype html><iframe id="studio" src="/studio-engineering/index.html" sandbox="${sandbox}" style="width:100%;height:95vh"></iframe><script>
window.qa={snapshot:{companies:[{id:'qa-company',name:'Empresa QA'}],projects:[],library:[],templates:[]},rev:'qa-initial',writes:0,reads:0,checks:0};
let connected=false;
addEventListener('message',e=>{
 if(connected||e.source!==document.getElementById('studio').contentWindow||e.origin!=='null'||e.data?.type!=='evpro-engineering-ready-v2')return;
 connected=true;const channel=new MessageChannel();
 channel.port1.onmessage=ev=>{const d=ev.data,q=window.qa;let result;
 if(d.action==='account')result={email:'qa@example.invalid',role:'admin',platform:'web',mode:'online',version:'3.9.0-beta.9'};
 else if(d.action==='read'){q.reads++;result={snapshot:q.snapshot,rev:q.rev}}
 else if(d.action==='revision'){q.checks++;result={rev:q.rev}}
 else if(d.action==='write'){if(d.payload.expected!==q.rev){channel.port1.postMessage({id:d.id,ok:false,status:409,error:'conflict'});return}q.writes++;q.snapshot=d.payload.snapshot;q.rev=d.payload.rev;result={ok:true,rev:q.rev}}
 else return;
 channel.port1.postMessage({id:d.id,ok:true,result});
 };
 channel.port1.start();e.source.postMessage({type:'evpro-engineering-connect-v1',account:{email:'qa@example.invalid',role:'admin'}},'*',[channel.port2]);
});
</script>`;
const server=createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');if(u.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(parent);return}
 const match=u.pathname.match(/^\/studio-engineering\/([a-zA-Z0-9.-]+)$/);
 if(!match){res.writeHead(404).end();return}
 try{const name=match[1];res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(readFileSync(new URL(name,root)))}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const frame=page.frameLocator('#studio');
 await frame.getByText('Panel principal',{exact:true}).waitFor();
 await frame.getByRole('button',{name:'+ Nuevo proyecto'}).click();
 await frame.locator('#pickCompany').evaluate(el=>el.value='qa-company');
 await frame.locator('#modalForm button[type=submit]').click();
 await page.waitForFunction(()=>window.qa.snapshot.projects.length===1&&window.qa.writes>0,{timeout:20000});
 assert.equal(await page.evaluate(()=>window.qa.snapshot.projects.length),1);
 await frame.getByRole('button',{name:'Todos los proyectos',exact:false}).click();
 await page.evaluate(()=>{window.qa.snapshot.projects[0].name='Proyecto recibido desde Windows';window.qa.rev='qa-remote-2'});
 await frame.getByText('Proyecto recibido desde Windows',{exact:false}).first().waitFor({timeout:30000});
 assert.ok(await page.evaluate(()=>window.qa.checks>0&&window.qa.reads>=2));
 assert.equal(errors.length,0,errors.join('; '));
 console.log('PASS real Chromium: project form saves, revision polling updates without reload, isolated iframe');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
