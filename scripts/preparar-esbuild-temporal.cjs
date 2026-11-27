'use strict';
// Copy the exact native compiler resolved by Vite, without reinstalling
// packages or changing node_modules. Verify the copy before Vite can use it.
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
function main(){
 if(process.platform!=='win32'||process.argv.length!==3)throw Error('Uso Windows: preparar-esbuild-temporal.cjs RUTA_TEMPORAL');
 const webRequire=createRequire(path.resolve(__dirname,'../apps/web/package.json'));
 const viteRequire=createRequire(webRequire.resolve('vite/package.json'));
 const esbuildRequire=createRequire(viteRequire.resolve('esbuild/package.json'));
 const version=esbuildRequire('./package.json').version;
 const source=esbuildRequire.resolve('@esbuild/win32-'+process.arch+'/esbuild.exe');
 const target=path.resolve(process.argv[2]);
 fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
 const actual=execFileSync(target,['--version'],{encoding:'utf8',timeout:15000,windowsHide:true}).trim();
 if(actual!==version)throw Error('Version de esbuild no coincide: '+actual+' / '+version);
 console.log('[OK] Copia temporal de esbuild '+version+' ejecutada correctamente.');
}
try{main()}catch(e){console.error('[BLOQUEADO] '+e.message);process.exitCode=1}
