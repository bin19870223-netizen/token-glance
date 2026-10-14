const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const test=process.argv.includes('--test');
if(process.platform!=='win32')throw new Error('The watcher requires Windows and .NET Framework 4.x.');
const compilers=['Framework64','Framework'].map(folder=>path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET',folder,'v4.0.30319','csc.exe'));
const compiler=compilers.find(fs.existsSync);
if(!compiler)throw new Error('.NET Framework C# compiler was not found.');
const directory=path.join(root,test?'work/watcher-tests':'runtime');
fs.mkdirSync(directory,{recursive:true});
const output=path.join(directory,test?'WatcherSelfTest.exe':'AgentUsageWatcher.exe');
const args=['/nologo',test?'/target:exe':'/target:winexe','/reference:System.Management.dll','/reference:System.Web.Extensions.dll',`/out:${output}`,path.join(root,'src','AgentUsageWatcher.cs')];
if(test)args.push('/main:WatcherSelfTest',path.join(root,'tests','watcher','WatcherSelfTest.cs'));
const result=spawnSync(compiler,args,{cwd:root,stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
if(result.status!==0){console.error('Build failed. Close an existing watcher before rebuilding its executable.');process.exit(result.status||1);}
console.log('Built '+path.relative(root,output));
if(!test){
  const fullscreen=spawnSync(compiler,['/nologo','/target:exe','/out:'+path.join(directory,'FullscreenState.exe'),path.join(root,'src','FullscreenState.cs')],{cwd:root,stdio:'inherit',windowsHide:true});
  if(fullscreen.error)throw fullscreen.error;if(fullscreen.status!==0)process.exit(fullscreen.status||1);
  console.log('Built runtime/FullscreenState.exe');
}
if(test){const checks=spawnSync(output,[],{cwd:root,stdio:'inherit',windowsHide:true});if(checks.error)throw checks.error;process.exitCode=checks.status===null?1:checks.status;}
if(test){
  const output=path.join(directory,'FullscreenSelfTest.exe');
  const build=spawnSync(compiler,['/nologo','/target:exe','/main:FullscreenSelfTest','/out:'+output,path.join(root,'src','FullscreenState.cs'),path.join(root,'tests','windows','FullscreenSelfTest.cs')],{cwd:root,stdio:'inherit',windowsHide:true});
  if(build.error)throw build.error;if(build.status!==0)process.exit(build.status||1);
  const checks=spawnSync(output,[],{cwd:root,stdio:'inherit',windowsHide:true});if(checks.error)throw checks.error;
  if(checks.status!==0)process.exitCode=checks.status||1;
}
