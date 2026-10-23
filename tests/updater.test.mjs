import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {AppUpdater,hash,newer,updatePath,validateBundle}=require('../src/updater.cjs');
const {build}=require('../scripts/build-update.cjs');
const base=path.resolve('work/update-tests');fs.mkdirSync(base,{recursive:true});
const repo='https://github.com/bin19870223-netizen/token-glance/releases/';
function fixture(){
 const root=fs.mkdtempSync(path.join(base,'app-'));fs.mkdirSync(path.join(root,'runtime'));fs.mkdirSync(path.join(root,'src/ui'),{recursive:true});
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'token-glance',version:'0.1.2',main:'src/main.cjs',devDependencies:{electron:'44.7.1'}}));fs.writeFileSync(path.join(root,'package-lock.json'),'{}');
 for(const name of ['main.cjs','updater.cjs','model.cjs','preload.cjs','AgentUsageWatcher.cs','FullscreenState.cs','ui/settings.html','ui/dock.html','ui/panel.html'])fs.writeFileSync(path.join(root,'src',name),'original');
 fs.writeFileSync(path.join(root,'runtime/settings.json'),'private settings');fs.writeFileSync(path.join(root,'runtime/deepseek-key.enc'),'encrypted fixture');
 const bundle=build(root);bundle.version='0.1.3';const pkg=bundle.files.find(f=>f.path==='package.json'),data=Buffer.from(JSON.stringify({name:'token-glance',version:'0.1.3',main:'src/main.cjs',devDependencies:{electron:'44.7.1'}}));Object.assign(pkg,{content:data.toString('base64'),size:data.length,sha256:hash(data)});
 const bytes=Buffer.from(JSON.stringify(bundle)),asset={name:'token-glance-update.json',state:'uploaded',size:bytes.length,digest:'sha256:'+hash(bytes),browser_download_url:repo+'download/v0.1.3/token-glance-update.json'};
 const releases=[{tag_name:'v0.1.3',prerelease:true,draft:false,assets:[asset]}];return {root,bundle,bytes,releases,fetch:async url=>url.startsWith('https://api.github.com/')?Buffer.from(JSON.stringify(releases)):bytes};
}
test('update versions compare numerically and protected paths are never allowed',()=>{
 assert.equal(newer('0.1.10','0.1.9'),true);assert.equal(newer('0.1.2','0.1.2'),false);assert.throws(()=>newer('v1.0.0','0.1.2'));
 for(const p of ['runtime/settings.json','src/../runtime/key.enc','src/ui/../../main.cjs','src\\main.cjs','C:/evil.js','.git/config','node_modules/electron/a.js'])assert.equal(updatePath(p),false);
});
test('published preview check, digest verification, stage and apply preserve runtime and backup the old app',async()=>{
 const f=fixture(),u=new AppUpdater(f.root,()=>{},f.fetch);await u.check(true);assert.equal(u.state.status,'ready');
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'package.json'))).version,'0.1.2');
 const backup=u.apply();assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'package.json'))).version,'0.1.3');
 assert.equal(JSON.parse(fs.readFileSync(path.join(backup,'package.json'))).version,'0.1.2');assert.equal(fs.readFileSync(path.join(f.root,'runtime/settings.json'),'utf8'),'private settings');assert.equal(fs.readFileSync(path.join(f.root,'runtime/deepseek-key.enc'),'utf8'),'encrypted fixture');
 assert.equal(new AppUpdater(f.root).current,'0.1.3');
});
test('source-only releases and incompatible runtimes explain manual installation',async()=>{
 const f=fixture();f.releases[0].assets=[];const u=new AppUpdater(f.root,()=>{},f.fetch);await u.check(true);assert.equal(u.state.status,'manual');assert.equal(u.state.url,repo+'tag/v0.1.3');
 f.bundle.compatibility.electron='different';assert.throws(()=>validateBundle(f.bundle,'0.1.3',f.root),/手动安装/);
});
test('malicious manifests, missing files, hash mismatches and native changes are rejected',()=>{
 const f=fixture();
 for(const mutate of [b=>b.files[0].path='runtime/deepseek-key.enc',b=>b.files.push(b.files[0]),b=>b.files[0].sha256='0'.repeat(64),b=>b.files=b.files.filter(x=>x.path!=='src/main.cjs'),b=>b.version='0.1.9']){
  const b=structuredClone(f.bundle);mutate(b);assert.throws(()=>validateBundle(b,'0.1.3',f.root));
 }
 const b=structuredClone(f.bundle),native=b.files.find(f=>f.path==='src/AgentUsageWatcher.cs'),data=Buffer.from('changed native');Object.assign(native,{content:data.toString('base64'),size:data.length,sha256:hash(data)});assert.throws(()=>validateBundle(b,'0.1.3',f.root),/辅助程序/);
});
test('tampered downloads and staged files cannot replace the application',async()=>{
 const f=fixture(),u=new AppUpdater(f.root,()=>{},async url=>url.startsWith('https://api.github.com/')?Buffer.from(JSON.stringify(f.releases)):Buffer.from('tampered'));
 await u.check(true);assert.equal(u.state.status,'error');assert.equal(u.staged,null);
 const valid=new AppUpdater(f.root,()=>{},f.fetch);await valid.check(true);fs.writeFileSync(path.join(valid.staged,'src/main.cjs'),'tampered');assert.throws(()=>valid.apply(),/校验失败/);assert.equal(fs.readFileSync(path.join(f.root,'src/main.cjs'),'utf8'),'original');
});
test('a failed source swap rolls back before the user data directory is touched',async()=>{
 const f=fixture(),u=new AppUpdater(f.root,()=>{},f.fetch);await u.check(true);const rename=fs.renameSync;
 fs.renameSync=(from,to)=>{if(from===path.join(u.staged,'src'))throw Error('fixture disk error');return rename(from,to);};
 try{assert.throws(()=>u.apply(),/已恢复原版本/);}finally{fs.renameSync=rename;}
 assert.equal(fs.readFileSync(path.join(f.root,'src/main.cjs'),'utf8'),'original');assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'package.json'))).version,'0.1.2');
});
test('current, unavailable network and draft-only states are visible and retryable',async()=>{
 const f=fixture();f.releases[0].draft=true;const u=new AppUpdater(f.root,()=>{},f.fetch);await u.check();assert.equal(u.state.status,'current');
 u.fetch=async()=>{throw Error('fixture private network data');};await u.check();assert.equal(u.state.status,'error');assert.ok(!u.state.message.includes('private'));u.fetch=f.fetch;await u.check();assert.equal(u.state.status,'current');
});
