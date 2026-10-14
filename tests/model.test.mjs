import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../src/model.cjs';
const {sanitizeSettings,snapshot,dockBounds,panelBounds}=model;

test('weekly primary is never mislabeled as a five-hour window',()=>{
  const s=snapshot({limits:{rateLimits:{primary:{usedPercent:19,windowDurationMins:10080,resetsAt:2000000}}},usage:{summary:{}}},null,1000);
  assert.equal(s.quotas.length,1);assert.equal(s.primary.label,'每周额度');assert.equal(s.primary.remaining,81);assert.equal(s.lifetimeTokens,null);
});
test('missing quotas and token usage stay unknown, with no synthetic activity',()=>{
  const s=snapshot({limits:{rateLimits:{primary:null}},usage:{summary:{lifetimeTokens:null},dailyUsageBuckets:null}},null);
  assert.equal(s.primary,null);assert.equal(s.lifetimeTokens,null);assert.deepEqual(s.buckets,[]);
});
test('valid zero token readings survive normalization',()=>{
  const s=snapshot({usage:{summary:{lifetimeTokens:0},dailyUsageBuckets:[{startDate:'2026-10-13',tokens:0},{startDate:'bad',tokens:99},{startDate:'2026-10-12',tokens:-5}]}},null);
  assert.equal(s.lifetimeTokens,0);assert.deepEqual(s.buckets,[{date:'2026-10-13',tokens:0}]);
});
test('burn rate requires five minutes in the same quota period and resets on rollover',()=>{
  const raw=used=>({limits:{rateLimits:{primary:{usedPercent:used,windowDurationMins:10080,resetsAt:2000000}}}});
  const first=snapshot(raw(10),null,1000);
  assert.equal(snapshot(raw(11),first,61000).burnRate,null);
  assert.equal(snapshot(raw(11),first,301000).burnRate,12);
  const rollover=raw(2);rollover.limits.rateLimits.primary.resetsAt=3000000;
  assert.equal(snapshot(rollover,first,601000).burnRate,null);
});
test('settings reject arbitrary keys, clamp geometry and never hide every indicator',()=>{
  const s=sanitizeSettings({edge:'north',opacity:0,position:99,agents:[],showNumbers:false,showRing:false,customColor:'url(x)',secret:'not-persisted'});
  assert.equal(s.edge,'left');assert.equal(s.opacity,65);assert.equal(s.position,1);assert.equal(s.showRing,true);assert.deepEqual(s.agents,['codex']);assert.equal(s.secret,undefined);assert.equal(s.customColor,'#73d9bd');
});
test('all four edges and panels stay inside a negative-origin second monitor',()=>{
  const area={x:-1920,y:-1080,width:1920,height:1040};
  for(const edge of ['left','right','top','bottom'])for(const position of [0,.5,1]){
    const s=sanitizeSettings({edge,position,ringSize:44,agents:['codex','claude','deepseek']});
    const d=dockBounds(area,s,3),p=panelBounds(d,area,edge,390,470);
    for(const b of [d,p]){assert.ok(b.x>=area.x);assert.ok(b.y>=area.y);assert.ok(b.x+b.width<=area.x+area.width);assert.ok(b.y+b.height<=area.y+area.height);}
  }
});
test('window durations and corrupt usage percentages are bounded correctly',()=>{
  const s=snapshot({limits:{rateLimits:{primary:{usedPercent:105,windowDurationMins:300},secondary:{usedPercent:-10,windowDurationMins:10080}}}},null);
  assert.equal(s.quotas[0].remaining,0);assert.equal(s.quotas[1].remaining,100);assert.equal(s.quotas[0].label,'5 小时额度');
});

test('all four corner choices persist and anchor exactly inside the work area',()=>{
  const area={x:-1920,y:120,width:1920,height:1040};
  for(const edge of ['top-left','top-right','bottom-left','bottom-right'])for(const gap of [0,8,32]){
    const s=sanitizeSettings({edge,edgeGap:gap,position:.37,agents:['codex','claude','deepseek']});
    assert.equal(s.edge,edge);
    const d=dockBounds(area,s,3);
    assert.equal(d.x,edge.endsWith('right')?area.x+area.width-d.width-gap:area.x+gap);
    assert.equal(d.y,edge.startsWith('bottom')?area.y+area.height-d.height-gap:area.y+gap);
    assert.deepEqual(d,dockBounds(area,{...s,position:.91},3));
    const p=panelBounds(d,area,edge,390,470);
    assert.ok(p.x>=area.x&&p.x+p.width<=area.x+area.width);
    assert.ok(p.y>=area.y&&p.y+p.height<=area.y+area.height);
    if(edge.startsWith('top'))assert.equal(p.y,d.y+d.height+8);
    else assert.equal(p.y+p.height,d.y-8);
    assert.equal(edge.endsWith('right')?p.x+p.width:p.x,edge.endsWith('right')?d.x+d.width:d.x);
  }
});

test('legacy Windows startup selection migrates without enabling agent following',()=>{
  assert.equal(sanitizeSettings({launchAtLogin:true}).startupMode,'system');
  assert.equal(sanitizeSettings({launchAtLogin:false}).startupMode,'manual');
  const s=sanitizeSettings({startupMode:'agents',agents:['claude'],watchProcesses:{claude:'claude.exe, bad command, custom.EXE'}});
  assert.equal(s.startupMode,'agents');assert.equal(s.launchAtLogin,true);
  assert.deepEqual(s.agents,['claude']);assert.equal(s.watchProcesses.claude,'claude.exe, custom.EXE');
  assert.equal(sanitizeSettings({startupMode:'manual',launchAtLogin:true}).launchAtLogin,false);
});
