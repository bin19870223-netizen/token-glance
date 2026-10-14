import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {maintainTopmost}=createRequire(import.meta.url)('../src/topmost.cjs');

function fixture(t){
  t.mock.timers.enable({apis:['setInterval']});
  const order=[],changes=[];
  const window=name=>({topmost:true,visible:true,minimized:false,destroyed:false,
    isDestroyed(){return this.destroyed;},isVisible(){return this.visible;},isMinimized(){return this.minimized;},
    isAlwaysOnTop(){return this.topmost;},setAlwaysOnTop(value,level){assert.equal(level,'pop-up-menu');this.topmost=value;changes.push([name,value]);},
    moveTop(){order.push(name);},focus(){assert.fail('topmost recovery must not steal focus');},show(){assert.fail('must not show hidden windows');}});
  const dock=window('dock'),panel=window('panel');let enabled=true;
  const guard=maintainTopmost(()=>[dock,panel],()=>enabled);
  t.after(guard.stop);
  return {dock,panel,guard,order,changes,disable:()=>enabled=false};
}
test('idle checks do not continually promote windows or reset native hover tooltips',t=>{
  const f=fixture(t);t.mock.timers.tick(2000);
  assert.deepEqual(f.order,['dock','panel']);assert.deepEqual(f.changes,[['dock',true],['panel',true]]);
});
test('restores a lost flag and applies disabled setting without raising windows',t=>{
  const f=fixture(t);f.dock.topmost=false;f.guard.refresh();
  assert.deepEqual(f.changes,[['dock',true],['panel',true]]);
  f.dock.topmost=false;t.mock.timers.tick(1000);assert.equal(f.dock.topmost,true);assert.deepEqual(f.changes.at(-1),['dock',true]);
  f.order.length=0;f.disable();f.guard.refresh();t.mock.timers.tick(2000);
  assert.deepEqual(f.order,[]);assert.equal(f.dock.topmost,false);assert.equal(f.panel.topmost,false);
});
test('hidden, minimized, destroyed and missing windows are not raised',t=>{
  const f=fixture(t);f.dock.visible=false;f.panel.minimized=true;f.guard.refresh();
  f.dock.destroyed=true;f.panel.destroyed=true;t.mock.timers.tick(1000);assert.deepEqual(f.order,[]);
  const guard=maintainTopmost(()=>[null,undefined],()=>true);guard.refresh();guard.stop();
});
test('show refresh is immediate and stopping cancels recovery',t=>{
  const f=fixture(t);f.guard.refresh();assert.deepEqual(f.order,['dock','panel']);
  f.order.length=0;f.guard.stop();t.mock.timers.tick(3000);assert.deepEqual(f.order,[]);
});
