import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {subscriptionURL,parseTraffic,readTraffic,TrafficMonitor}=createRequire(import.meta.url)('../src/traffic.cjs');
const url='https://www.asiassn.com/subscription/test-fixture';
const header='upload=1073741824; download=2147483648; total=10737418240; expire=1900000000';

test('traffic link accepts only provider HTTPS URLs without embedded credentials',()=>{
  assert.equal(subscriptionURL(url).origin,'https://www.asiassn.com');
  for(const bad of ['http://www.asiassn.com/x','https://asiassn.com.evil.invalid/x','https://127.0.0.1/x','https://user:pass@asiassn.com/x','https://www.asiassn.com:444/x','file:///x','https://www.asiassn.com/x#secret'])assert.throws(()=>subscriptionURL(bad));
});
test('traffic totals are in bytes and remaining percentage is separate from Tokens',()=>{
  const p=parseTraffic(header,1234);
  assert.equal(p.traffic.used,3*1024**3);assert.equal(p.traffic.remaining,7*1024**3);assert.equal(p.primary.remaining,70);assert.equal(p.checkedAt,1234);assert.equal(p.kind,'traffic');assert.equal(p.lifetimeTokens,undefined);
});
test('missing, malformed, duplicate, overflow and negative readings cannot invent data',()=>{
  for(const bad of [undefined,'','upload=-1; download=0; total=10','upload=0; download=0','upload=1; upload=2; download=0; total=10','upload=9007199254740991; download=1; total=10','upload=0; download=0; total=10; expire=9999999999999'])assert.throws(()=>parseTraffic(bad));
  assert.equal(parseTraffic('upload=0;download=0;total=10').primary.remaining,100);
  assert.equal(parseTraffic('upload=20;download=0;total=10').primary.remaining,0);
  assert.equal(parseTraffic('upload=20;download=0;total=0;expire=0').primary,null);
});
function transport(response,inspect=()=>{}){
  return (link,options,callback)=>{
    inspect(link,options);const request=new EventEmitter();request.destroy=()=>request.emit('error',Error('internal private URL must not escape'));
    request.end=()=>queueMicrotask(()=>callback({...response,destroy(){inspect('body-destroyed');}}));return request;
  };
}
test('subscription fetch reads headers and discards the body, without cookies or auth headers',async()=>{
  let discarded=false;
  const p=await readTraffic(url,transport({statusCode:200,headers:{'subscription-userinfo':header}},(value,options)=>{
    if(value==='body-destroyed'){discarded=true;return;}assert.deepEqual(options.headers,{'User-Agent':'clash.meta','Accept':'*/*'});
  }));assert.equal(p.primary.remaining,70);assert.equal(discarded,true);
});
test('cross-origin redirects and unauthorized subscriptions report safe errors',async()=>{
  await assert.rejects(readTraffic(url,transport({statusCode:302,headers:{location:'https://other.invalid/private'}})),/跨站跳转/);
  await assert.rejects(readTraffic(url,transport({statusCode:403,headers:{}})),/失效/);
  await assert.rejects(readTraffic(url,(link,options,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>req.emit('error',Error(url)));return req;}),error=>!error.message.includes(url)&&error.message.includes('连接失败'));
});
test('saved links are encrypted; a failed replacement preserves the old working connection',async()=>{
  const base=path.resolve('work/traffic-unit-tests');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'store-')),file=path.join(dir,'subscription.enc');
  const secure={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from('encrypted:'+Buffer.from(value).toString('base64')),decryptString:value=>Buffer.from(value.toString().slice(10),'base64').toString()};
  const monitor=new TrafficMonitor(file,secure,async()=>parseTraffic(header));
  try{
    await monitor.configure(url);assert.equal(monitor.configured(),true);assert.equal(fs.readFileSync(file,'utf8').includes(url),false);
    const saved=fs.readFileSync(file);monitor.read=async()=>{throw Error('服务暂不可用');};
    await assert.rejects(monitor.configure(url+'-new'));assert.deepEqual(fs.readFileSync(file),saved);
    await monitor.refresh();assert.equal(monitor.data.stale,true);assert.equal(monitor.data.traffic.remaining,7*1024**3);
    monitor.clear();assert.equal(monitor.configured(),false);assert.equal(monitor.data.traffic,null);
  }finally{assert.ok(fs.realpathSync(dir).startsWith(fs.realpathSync(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
test('clearing a subscription while a refresh is pending cannot restore old usage',async()=>{
  const base=path.resolve('work/traffic-unit-tests');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'race-')),file=path.join(dir,'subscription.enc');
  const secure={isEncryptionAvailable:()=>true,encryptString:()=>Buffer.from('ciphertext'),decryptString:()=>url};let finish;
  const monitor=new TrafficMonitor(file,secure,async()=>parseTraffic(header));
  try{await monitor.configure(url);monitor.read=()=>new Promise(resolve=>finish=resolve);const pending=monitor.refresh();monitor.clear();finish(parseTraffic(header));await pending;assert.equal(monitor.data.traffic,null);assert.equal(monitor.configured(),false);}
  finally{assert.ok(fs.realpathSync(dir).startsWith(fs.realpathSync(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
test('without Windows encryption no subscription is written',async()=>{
  const monitor=new TrafficMonitor(path.resolve('work/no-plaintext-subscription.enc'),{isEncryptionAvailable:()=>false});
  await assert.rejects(monitor.configure(url),/加密/);assert.equal(monitor.configured(),false);
});
