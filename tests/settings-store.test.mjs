import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{SettingsStore}=require('../src/settings-store.cjs'),{sanitizeSettings}=require('../src/model.cjs');
const base=path.resolve('work/settings-store-tests');fs.mkdirSync(base,{recursive:true});
function fixture(){const file=path.join(fs.mkdtempSync(path.join(base,'case-')),'settings.json');return {file,open:()=>new SettingsStore(file,sanitizeSettings)};}
test('all saved preferences survive repeated independent startup reads without changing values',()=>{
 const f=fixture(),settings=sanitizeSettings({theme:'light',palette:'rose',edge:'top-right',position:.87,displayId:2736041158,displayTarget:{label:'LG HDR 4K',x:2560,y:-898,width:1441,height:2560,internal:false},fontScale:120,opacity:80,agents:['codex','deepseek'],startupMode:'agents',showTraffic:true,trafficAlertsEnabled:true,autoUpdate:false,hotkey:'Alt+G'});
 f.open().save(settings);for(let i=0;i<5;i++){const store=f.open(),restored=store.load();assert.deepEqual(restored,settings);store.save(restored);}
 assert.deepEqual(f.open().load(),settings);assert.equal(fs.readFileSync(f.file,'utf8'),fs.readFileSync(f.file+'.bak','utf8'));
});
test('a corrupt or missing primary recovers the latest backup instead of defaults',()=>{
 const f=fixture(),settings=sanitizeSettings({edge:'bottom-left',fontScale:125,startupMode:'agents'});f.open().save(settings);
 fs.writeFileSync(f.file,'{"edge":');assert.deepEqual(f.open().load(),settings);f.open().save(f.open().load());fs.unlinkSync(f.file);assert.deepEqual(f.open().load(),settings);
});
test('an interrupted save recovers the newer flushed record even when the primary still contains older settings',()=>{
 const f=fixture(),store=f.open();store.save(sanitizeSettings({fontScale:100}));const newer={...sanitizeSettings({fontScale:125}),_savedAt:store.revision+1};
 fs.writeFileSync(f.file+'.tmp',JSON.stringify(newer));assert.equal(f.open().load().fontScale,125);
 fs.writeFileSync(f.file+'.bak.tmp',JSON.stringify({...newer,fontScale:115,_savedAt:newer._savedAt+1}));assert.equal(f.open().load().fontScale,115);
});
test('unrecoverable existing settings are kept intact and never silently overwritten by defaults',()=>{
 const f=fixture();assert.equal(f.open().load().edge,'left');fs.writeFileSync(f.file,'broken settings');assert.throws(()=>f.open().load(),/原文件已保留/);assert.equal(fs.readFileSync(f.file,'utf8'),'broken settings');
});
