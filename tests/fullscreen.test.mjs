import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {monitorFullscreen}=require('../src/fullscreen.cjs');
const {maintainTopmost}=require('../src/topmost.cjs');

function fixture(t,onChange=()=>{}){
  const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();let killed=false;
  child.kill=()=>{killed=true;};
  const monitor=monitorFullscreen('native-probe.exe',onChange,(file,args,options)=>{
    assert.equal(file,'native-probe.exe');assert.deepEqual(args,[]);assert.equal(options.windowsHide,true);return child;
  });
  t.after(monitor.stop);
  return {child,monitor,killed:()=>killed,send:line=>child.stdout.write(line+'\n')};
}
test('waits for native state and yields only for exclusive or unknown readings',t=>{
  let changed=0;const f=fixture(t,()=>changed++);
  assert.equal(f.monitor.shouldYield(),true);f.send('desktop');assert.equal(f.monitor.shouldYield(),false);
  f.send('exclusive');assert.equal(f.monitor.shouldYield(),true);f.send('exclusive');assert.equal(changed,2);
  f.send('desktop');assert.equal(f.monitor.shouldYield(),false);assert.equal(changed,3);
});
test('handles fragmented output and ignores invalid protocol lines',t=>{
  const f=fixture(t);f.child.stdout.write('desk');assert.equal(f.monitor.shouldYield(),true);
  f.child.stdout.write('top\r\n');assert.equal(f.monitor.shouldYield(),false);
  f.send('arbitrary data');assert.equal(f.monitor.shouldYield(),false);
});
test('coverage requests restore desktop overlays but never interrupt exclusive fullscreen',t=>{
  let restored=0;const f=fixture(t,()=>restored++);
  f.send('restore');assert.equal(restored,0);
  f.send('desktop');f.send('restore');assert.equal(restored,2);
  f.send('exclusive');f.send('restore');assert.equal(restored,3);
});
test('only owned overlay handles are sent to the native coverage detector',t=>{
  const f=fixture(t);let input='';f.child.stdin.on('data',data=>input+=data);
  const handle=Buffer.alloc(8);handle.writeBigUInt64LE(123n);
  f.monitor.setWindows([{isDestroyed:()=>false,getNativeWindowHandle:()=>handle},null,{isDestroyed:()=>true}]);
  assert.equal(input,'windows:123\n');
});
test('detector failure yields safely and stop closes its input and process',t=>{
  const f=fixture(t);f.send('desktop');f.child.emit('error',Error('unavailable'));assert.equal(f.monitor.shouldYield(),true);
  f.send('desktop');f.child.emit('exit',1);assert.equal(f.monitor.shouldYield(),true);
  f.monitor.stop();assert.equal(f.child.stdin.writableEnded,true);assert.equal(f.killed(),true);
  f.send('desktop');assert.equal(f.monitor.shouldYield(),true);
});
test('game transitions demote overlays, stop periodic raising and restore desktop policy without changing user setting',t=>{
  t.mock.timers.enable({apis:['setInterval']});let topmost=false,raised=0,guard;let setting=true;
  const window={isDestroyed:()=>false,isAlwaysOnTop:()=>topmost,setAlwaysOnTop:value=>topmost=value,isVisible:()=>true,isMinimized:()=>false,moveTop:()=>raised++};
  const f=fixture(t,()=>guard?.refresh());
  guard=maintainTopmost(()=>[window],()=>setting&&!f.monitor.shouldYield());t.after(guard.stop);
  f.send('desktop');assert.equal(topmost,true);const before=raised;
  f.send('exclusive');assert.equal(topmost,false);t.mock.timers.tick(5000);assert.equal(raised,before);assert.equal(setting,true);
  f.send('desktop');assert.equal(topmost,true);assert.ok(raised>before);
  setting=false;guard.refresh();f.send('exclusive');f.send('desktop');assert.equal(topmost,false);
});
