import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const {TrafficAlerts}=createRequire(import.meta.url)('../src/traffic-alerts.cjs');
const base=path.resolve('work/traffic-alert-tests');fs.mkdirSync(base,{recursive:true});
const now=1900000000000,minute=60000,GiB=1024**3;
const provider=(used,total=100,extra={})=>({connected:true,stale:false,traffic:{used:used*GiB,upload:0,download:used*GiB,total:total*GiB,expiresAt:null,...extra}});
function fixture(){return new TrafficAlerts(path.join(fs.mkdtempSync(path.join(base,'alerts-')),'state.json'));}
test('80 and 95 percent thresholds persist, coalesce and never repeat each refresh',async()=>{
 const a=fixture();a.observe(provider(80),true,now);assert.equal(a.view().pending,1);
 a.observe(provider(81),true,now+5*minute);assert.equal(a.view().pending,1);
 a.observe(provider(95),true,now+10*minute);assert.equal(a.view().pending,1);assert.equal(a.state.pending[0].key,'95');
 const reloaded=new TrafficAlerts(a.file);reloaded.observe(provider(96),true,now+15*minute);assert.equal(reloaded.view().pending,1);
 let sent;await reloaded.flush(false,async n=>{sent=n;return true;},true,now+15*minute);assert.match(sent.body,/95/);assert.equal(sent.silent,true);assert.equal(reloaded.view().pending,0);
 reloaded.observe(provider(97),true,now+20*minute);assert.equal(reloaded.view().pending,0);
 reloaded.observe(provider(1),true,now+25*minute);reloaded.observe(provider(81),true,now+30*minute);assert.ok(reloaded.state.pending.some(e=>e.key==='80'));
});
test('rolling 30-minute spikes aggregate five-minute readings and have a cooldown',()=>{
 const a=fixture();for(let i=0;i<=6;i++)a.observe(provider(10+i*4,900),true,now+i*5*minute);
 assert.equal(a.state.pending.filter(e=>e.key==='spike').length,1);assert.equal(a.state.recent.filter(e=>e.key==='spike').length,1);
 assert.match(a.state.pending[0].body,/20\.00 GiB/);
 a.observe(provider(38,900),true,now+35*minute);assert.equal(a.state.recent.filter(e=>e.key==='spike').length,1);
});
test('unknown/fullscreen quiet periods never send a notification and merge after returning to desktop',async()=>{
 const a=fixture();a.observe(provider(80),true,now);let calls=0;
 for(let i=0;i<10;i++)await a.flush(true,async()=>{calls++;return true;},true,now+i*1000);
 assert.equal(calls,0);assert.equal(a.view().pending,1);
 const reloaded=new TrafficAlerts(a.file);let notice;await reloaded.flush(false,async n=>{calls++;notice=n;return true;},true,now+minute);
 assert.equal(calls,1);assert.match(notice.title,/静默期间记录/);assert.equal(reloaded.view().pending,0);
 await reloaded.flush(false,async()=>{calls++;return true;},true,now+2*minute);assert.equal(calls,1);
});
test('failed notification delivery keeps the alert pending and disabling drops pending notices',async()=>{
 const a=fixture();a.observe(provider(95),true,now);await a.flush(false,async()=>false,true,now);assert.equal(a.view().pending,1);
 await a.flush(false,async()=>{throw Error('must not send');},false,now);assert.equal(a.view().pending,0);
});
test('outages and restarts cannot invent a 30-minute spike, while cycle resets re-arm thresholds',()=>{
 const a=fixture();a.observe(provider(10,900),true,now);a.observe({connected:false},true,now+5*minute);a.observe(provider(50,900),true,now+10*minute);assert.equal(a.view().pending,0);
 const b=new TrafficAlerts(a.file);b.observe(provider(100,900),true,now+15*minute);assert.equal(b.view().pending,0);
 b.observe(provider(200,900),true,now+40*minute);assert.equal(b.view().pending,0);
 b.observe(provider(96,100),true,now+45*minute);assert.ok(b.state.warned95);
 const c=new TrafficAlerts(b.file);c.observe(provider(1,100),true,now+50*minute);assert.equal(c.state.warned95,false);
 c.observe(provider(96,100),true,now+55*minute);assert.ok(c.state.pending.some(e=>e.key==='95'));
});
