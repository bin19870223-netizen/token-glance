import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const {TrafficHistory,summaries}=createRequire(import.meta.url)('../src/traffic-history.cjs');
const at=1900000000000,minute=60000;
const data=(time,upload,download,total=100000)=>({checkedAt:time,traffic:{upload,download,total,expiresAt:null}});
function fixture(name){const base=path.resolve('work/traffic-history-tests');fs.mkdirSync(base,{recursive:true});const file=path.join(base,name+'.json');if(fs.existsSync(file))fs.unlinkSync(file);return new TrafficHistory(file);}
test('traffic windows distinguish 6, 12 and 24 hours and exclude partial boundary intervals',()=>{
 const segments=[1,7,13,25].map(h=>({start:at-h*3600000,end:at-h*3600000+5*minute,upload:10,download:20}));
 assert.deepEqual(summaries(segments,at).map(s=>s.used),[30,60,90]);
 for(const row of summaries(segments,at)){assert.equal(row.slots.length,row.hours);assert.equal(row.slots.reduce((n,b)=>n+(b.bytes||0),0),row.used);assert.ok(row.slots.some(b=>b.bytes===null));}
 assert.deepEqual(summaries(segments,at).map(s=>s.observed),[5*minute,10*minute,15*minute]);
 assert.equal(summaries([{start:at-6*3600000-minute,end:at-6*3600000+minute,upload:10,download:0}],at)[0].observed,0);
});
test('traffic sampling persists readings but never bridges a restart, outage or counter reset',()=>{
 const history=fixture('continuity');assert.equal(history.sample(data(at,10,20))[0].observed,0);
 let rows=history.sample(data(at+5*minute,20,50));assert.equal(rows[0].used,40);assert.equal(rows[0].observed,5*minute);
 const restarted=new TrafficHistory(history.file);rows=restarted.sample(data(at+10*minute,30,90));assert.equal(rows[0].used,40);
 rows=restarted.sample(data(at+15*minute,40,100));assert.equal(rows[0].used,60);
 restarted.interrupt();restarted.sample(data(at+20*minute,100,200));assert.equal(restarted.segments.length,2);
 restarted.sample(data(at+25*minute,0,0));assert.equal(restarted.segments.length,2);
 restarted.sample(data(at+30*minute,5,10));assert.equal(restarted.segments.length,3);
 restarted.sample(data(at+60*minute,100,200));assert.equal(restarted.segments.length,3);
 restarted.sample(data(at+65*minute,110,210,200000));assert.equal(restarted.segments.length,3);
 restarted.reset();assert.equal(fs.existsSync(restarted.file),false);assert.equal(restarted.segments.length,0);
});
test('repeated manual refreshes, zero usage and corrupt cache do not fabricate traffic',()=>{
 const history=fixture('validation');history.sample(data(at,0,0));history.sample(data(at+1000,1,1));assert.equal(history.segments.length,0);
 const rows=history.sample(data(at+5*minute,0,0));assert.equal(rows[0].used,0);assert.equal(rows[0].observed,5*minute);
 fs.writeFileSync(history.file,'{"secret":"not a history array"}');assert.equal(new TrafficHistory(history.file).segments.length,0);
 assert.equal(summaries([{start:at,end:at+minute,upload:-1,download:5}],at+minute)[0].observed,0);history.reset();
});
