import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import model from '../src/model.cjs';
const context=vm.createContext({window:{},Intl,Date});
vm.runInContext(fs.readFileSync(new URL('../src/ui/shared.js',import.meta.url),'utf8'),context);
const {chartData,chartHTML}=context.window.HUD;
const {sampleUsage,sanitizeSettings}=model;
const now=Date.parse('2026-10-14T16:00:00Z'),hour=3600000;
const sample=(at,tokens,interval=60)=>({at,tokens,interval});

test('24-hour option persists; unsupported chart periods keep the default',()=>{
  assert.equal(sanitizeSettings({chartDays:1}).chartDays,1);assert.equal(sanitizeSettings({chartDays:24}).chartDays,7);
});
test('sampling retains only numeric recent readings and resets on account or counter changes',()=>{
  const initial=sampleUsage(null,100,'account-a',60,now-hour);
  const next=sampleUsage(initial,140,'account-a',60,now);
  assert.equal(next.usageSamples.length,2);
  assert.equal(sampleUsage(next,10,'account-b',60,now+60000).usageSamples.length,1);
  assert.equal(sampleUsage(next,90,'account-a',60,now+60000).usageSamples.length,1);
  assert.deepEqual(sampleUsage(next,null,'account-a',60,now).usageSamples,[]);
  assert.deepEqual(sampleUsage(next,140,null,60,now).usageSamples,[]);
  assert.equal(sampleUsage(initial,200,'account-a',60,now+26*hour).usageSamples.length,1);
});
test('24 hours never uses daily totals or fabricates zero before sampling starts',()=>{
  const data=chartData({buckets:[{date:'2026-10-14',tokens:9999}]},1,now);
  assert.equal(data.total,null);assert.equal(data.slots.length,0);assert.equal(data.hourly,true);
  assert.equal(chartData({usageSamples:[sample(now,100)]},1,now).total,null);
});
test('rolling 24-hour chart sums observed deltas and preserves unknown hours',()=>{
  const data=chartData({usageSamples:[sample(now-120000,100),sample(now-60000,140),sample(now,160)]},1,now);
  assert.equal(data.total,60);assert.equal(data.observed,120000);assert.equal(data.slots.length,24);
  assert.equal(data.slots.at(-1).tokens,60);assert.equal(data.slots[0].tokens,null);
  assert.match(chartHTML(data),/最近 24 小时/);assert.match(chartHTML(data),/无数据/);
});
test('offline gaps, cutoff-crossing intervals and counter resets are not counted',()=>{
  const samples=[sample(now-25*hour,0),sample(now-24*hour+1000,1000),sample(now-1000,2000),sample(now,10)];
  const data=chartData({usageSamples:samples},1,now);assert.equal(data.total,null);assert.equal(data.observed,0);
});
test('observed zero usage remains zero; corrupt readings cannot crash the chart',()=>{
  const data=chartData({usageSamples:[null,sample(now-60000,100),sample(now,100),{at:'bad',tokens:200}]},1,now);
  assert.equal(data.total,0);assert.equal(data.slots.at(-1).tokens,0);
  assert.equal(chartData({usageSamples:{}},1,now).total,null);
});
test('restart or connection-break samples never bridge the unobserved interval',()=>{
  const before=sampleUsage(null,100,'account-a',60,now-60000);
  const restarted=sampleUsage(before,500,'account-a',60,now,false);
  assert.equal(chartData(restarted,1,now).total,null);
  const resumed=sampleUsage(restarted,520,'account-a',60,now+60000,true);
  assert.equal(chartData(resumed,1,now+60000).total,20);
});
test('7/30 day charts still use account buckets independently of local sampling',()=>{
  const provider={buckets:[{date:'2026-10-13',tokens:10},{date:'2026-10-14',tokens:20}],usageSamples:[sample(now-60000,100),sample(now,99999)]};
  for(const days of [7,30]){const data=chartData(provider,days,now);assert.equal(data.total,30);assert.equal(data.slots.length,days);assert.equal(data.end,'2026-10-14');}
});
