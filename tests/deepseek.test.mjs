import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {apiKey,parseBalance,readBalance,DeepSeekMonitor}=createRequire(import.meta.url)('../src/deepseek.cjs');
const key='sk-test-fixture-only',raw={is_available:true,balance_infos:[{currency:'CNY',total_balance:'15.25',granted_balance:'5.00',topped_up_balance:'10.25'}]};
test('DeepSeek validates keys and preserves official balance precision without inventing token quotas',()=>{
  assert.equal(apiKey(' '+key+' '),key);for(const v of ['',null,'Bearer '+key,key+'\r\nx:y'])assert.throws(()=>apiKey(v));
  const p=parseBalance(raw,123);assert.equal(p.balance.balances[0].total_balance,'15.25');assert.equal(p.primary,null);assert.equal(p.checkedAt,123);assert.equal(p.kind,'balance');
  for(const r of [{},{...raw,is_available:'true'},{...raw,balance_infos:[]},{...raw,balance_infos:[{...raw.balance_infos[0],currency:'<script>'}]},{...raw,balance_infos:[{...raw.balance_infos[0],total_balance:'NaN'}]}])assert.throws(()=>parseBalance(r));
});
function transport(status,body,inspect=()=>{}){return (url,options,callback)=>{
  inspect(url,options);const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.destroy=()=>{};callback(res);if(status===200){res.emit('data',Buffer.from(body));res.emit('end');}});return req;
};}
test('DeepSeek requests only the fixed official balance endpoint and never follows redirects',async()=>{
  const p=await readBalance(key,transport(200,JSON.stringify(raw),(url,options)=>{assert.equal(url,'https://api.deepseek.com/user/balance');assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer '+key);}));assert.equal(p.connected,true);
  await assert.rejects(readBalance(key,transport(401,'')),/密钥无效/);await assert.rejects(readBalance(key,transport(302,'')),/HTTP 302/);await assert.rejects(readBalance(key,transport(200,'not json')),/信息无效/);
  await assert.rejects(readBalance(key,transport(200,'x'.repeat(65537))),/响应过大/);
});
test('DeepSeek encryption unavailable refuses storage and remote error text cannot expose keys',async()=>{
  const monitor=new DeepSeekMonitor('unused', {isEncryptionAvailable:()=>false});await assert.rejects(monitor.configure(key),/加密/);
  await assert.rejects(readBalance(key,()=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>req.emit('error',Error(key)));return req;}),e=>!e.message.includes(key));
});
