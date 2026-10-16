import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {sanitizeSettings,settingsPages,resetSettings}=require('../src/model.cjs');
const source=fs.readFileSync(new URL('../src/main.cjs',import.meta.url),'utf8');
const root=path.resolve('src');

function fixture(){
  const handlers={},files=new Map(),login=[],hotkeys=[],messages=[],timers=[],closes=[];
  let cursor={x:10,y:10};
  const settingsFile=path.resolve(root,'../runtime/settings.json');
  files.set(settingsFile,JSON.stringify(sanitizeSettings({theme:'light',edge:'bottom-right',edgeGap:25,ringSize:44,opacity:70,startupMode:'agents',hotkey:'Alt+G',agents:['claude'],alertEnabled:true,watchProcesses:{claude:'custom.exe'}})));
  const usageFile=path.resolve(root,'../runtime/usage.json'),sourcesFile=path.resolve(root,'../runtime/sources.json');
  files.set(usageFile,'{"lifetimeTokens":1234}');files.set(sourcesFile,JSON.stringify({claude:path.join(root,'fixtures','usage.json')}));
  let destroyed=false,response=0,yieldFullscreen=false;
  const window=()=>({webContents:{mainFrame:{},send(){}},isDestroyed:()=>destroyed});
  const preferences=window(),dock=window(),panel=window();Object.assign(dock,{isVisible:()=>true,getBounds:()=>({x:0,y:0,width:60,height:60}),setBounds(){},setAlwaysOnTop(){},moveTop(){}});
  Object.assign(panel,{isVisible:()=>true,getBounds:()=>({x:80,y:0,width:100,height:100}),close:()=>closes.push(true)});
  const fakeApp={setPath(){},setAppLogsPath(){},setName(){},setAppUserModelId(){},commandLine:{appendSwitch(){}},requestSingleInstanceLock:()=>false,quit(){},on(){},setLoginItemSettings:value=>login.push(value)};
  const area={x:0,y:0,width:1920,height:1040},display={id:1,workArea:area};
  const electron={app:fakeApp,ipcMain:{handle:(name,fn)=>handlers[name]=fn},screen:{getAllDisplays:()=>[display],getPrimaryDisplay:()=>display,getCursorScreenPoint:()=>cursor},nativeTheme:{shouldUseDarkColors:false},globalShortcut:{unregisterAll(){},register:key=>{hotkeys.push(key);return true;}},dialog:{showMessageBox:async(owner,options)=>{messages.push({owner,options});return {response};}}};
  const fakeFS={mkdirSync(){},readFileSync:file=>{if(!files.has(file))throw Error('missing');return files.get(file);},writeFileSync:(file,text)=>files.set(file,text),renameSync:(from,to)=>{files.set(to,files.get(from));files.delete(from);}};
  const context=vm.createContext({__dirname:root,process:{argv:[],execPath:'electron.exe',env:{}},fixture:{preferences,dock,panel},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},require:name=>name==='electron'?electron:name==='node:fs'?fakeFS:name==='./codex.cjs'?{CodexClient:class{}}:name==='./fullscreen.cjs'?require('../src/fullscreen.cjs'):name==='./topmost.cjs'?require('../src/topmost.cjs'):name==='./model.cjs'?require('../src/model.cjs'):require(name)});
  context.fixture.monitor={shouldYield:()=>yieldFullscreen};
  vm.runInContext(source+'\npreferences=fixture.preferences;dock=fixture.dock;fullscreenMonitor=fixture.monitor;',context);
  return {handlers,files,settingsFile,usageFile,sourcesFile,messages,login,hotkeys,preferences,dock,timers,closes,run:code=>vm.runInContext(code,context),cursor:point=>cursor=point,event:{sender:preferences.webContents,senderFrame:preferences.webContents.mainFrame},confirm:(choice=2)=>response=choice,close:()=>destroyed=true,yieldFullscreen:()=>yieldFullscreen=true};
}
test('Windows login startup explicitly enables approval and retains background launch arguments',()=>{
  const f=fixture();f.run("settings.startupMode='system';applyStartup();");
  const item=f.login.at(-1);
  assert.equal(item.name,'AgentHUD.Windows');assert.equal(item.openAtLogin,true);assert.equal(item.enabled,true);
  assert.equal(item.path,'electron.exe');assert.deepEqual(Array.from(item.args),[path.resolve(root,'..'),'--background']);
  assert.equal(f.run('process.env.TEMP'),path.resolve(root,'../runtime/temp'));
  assert.equal(f.run('process.env.TMP'),path.resolve(root,'../runtime/temp'));
});
test('manual startup disables both login registration and Windows approval',()=>{
  const f=fixture();f.run("settings.startupMode='manual';applyStartup();");
  assert.equal(f.login.at(-1).openAtLogin,false);assert.equal(f.login.at(-1).enabled,false);
});
test('stationary hover on an already-visible agent never reopens or repositions the panel',async()=>{
  const f=fixture();f.run('panel=fixture.panel;');
  for(let i=0;i<10;i++)await f.handlers.action(f.event,'hover','codex');
  assert.equal(f.timers.length,0);f.run("showPanel('codex',false);");assert.equal(f.closes.length,0);
});
test('delayed leave ignores false mouseleave while pointer remains over either HUD window',()=>{
  const f=fixture();f.run('panel=fixture.panel;scheduleHide();');f.timers.at(-1)();assert.equal(f.closes.length,0);
  f.cursor({x:90,y:10});f.run('scheduleHide();');f.timers.at(-1)();assert.equal(f.closes.length,0);
  f.cursor({x:1000,y:1000});f.run('scheduleHide();');f.timers.at(-1)();assert.equal(f.closes.length,1);
});
test('exclusive fullscreen blocks hover or shortcut panel opening without changing settings',async()=>{
  const f=fixture(),before=f.files.get(f.settingsFile);f.yieldFullscreen();
  const result=await f.handlers.action(f.event,'open','codex');
  assert.equal(result.pinned,false);assert.equal(f.files.get(f.settingsFile),before);
});
test('cancel reset preserves settings and defaults confirmation to Cancel',async()=>{
  const f=fixture(),before=f.files.get(f.settingsFile);
  assert.equal(await f.handlers.action(f.event,'reset-settings','layout'),null);
  assert.equal(f.files.get(f.settingsFile),before);assert.equal(f.login.length,0);
  assert.equal(f.messages[0].options.defaultId,0);assert.equal(f.messages[0].options.cancelId,0);
  assert.match(f.messages[0].options.detail,/仅手动启动/);
  assert.match(f.messages[0].options.buttons[1],/屏幕与布局/);assert.equal(f.messages[0].options.buttons[2],'恢复全部设置');
});
test('confirmed reset persists every default and applies startup and hotkey without clearing data',async()=>{
  const f=fixture(),usage=f.files.get(f.usageFile),sources=f.files.get(f.sourcesFile);f.confirm();
  const result=await f.handlers.action(f.event,'reset-settings','layout');
  assert.deepEqual(JSON.parse(f.files.get(f.settingsFile)),sanitizeSettings());
  assert.deepEqual(result.settings,sanitizeSettings());
  assert.equal(f.login.at(-1).openAtLogin,false);assert.equal(f.hotkeys.at(-1),'Control+Shift+Space');
  assert.equal(f.files.get(f.usageFile),usage);assert.equal(f.files.get(f.sourcesFile),sources);
  assert.equal(result.resetScope,'all');
});
test('only main frame of settings window can request reset',async()=>{
  const f=fixture();f.confirm();
  await assert.rejects(f.handlers.action({sender:f.dock.webContents,senderFrame:f.dock.webContents.mainFrame},'reset-settings'),/Settings window required/);
  await assert.rejects(f.handlers.action({...f.event,senderFrame:{}},'reset-settings'),/Untrusted sender/);
  assert.equal(f.messages.length,0);
});
test('closed settings window cannot finish pending reset',async()=>{
  const f=fixture(),before=f.files.get(f.settingsFile);f.confirm();
  const pending=f.handlers.action(f.event,'reset-settings','layout');f.close();
  assert.equal(await pending,null);assert.equal(f.files.get(f.settingsFile),before);
});
test('each page reset changes only its own settings',()=>{
  const custom=sanitizeSettings({theme:'light',palette:'rose',customColor:'#112233',opacity:70,fontScale:120,glass:false,reducedMotion:true,edge:'bottom-right',position:.7,displayId:4,edgeGap:25,ringSize:44,hoverDelay:800,alwaysOnTop:false,showRing:false,showNumbers:true,showShort:false,chartDays:30,startupMode:'agents',watchProcesses:{claude:'custom.exe'},agents:['claude'],refreshSeconds:300,alertEnabled:true,alertThreshold:40,hotkey:'Alt+G'});
  const initial=sanitizeSettings();
  for(const [page,{keys}] of Object.entries(settingsPages)){
    const result=resetSettings(custom,page);
    for(const key of Object.keys(initial))assert.deepEqual(result[key],keys.includes(key)?initial[key]:custom[key],page+': '+key);
  }
  const grouped=Object.values(settingsPages).flatMap(page=>page.keys);
  assert.deepEqual([...grouped].sort(),Object.keys(initial).sort(),'every setting belongs to exactly one page');
});
test('page reset applies layout while preserving startup and hotkey',async()=>{
  const f=fixture(),before=JSON.parse(f.files.get(f.settingsFile));f.confirm(1);
  const result=await f.handlers.action(f.event,'reset-settings','layout');
  assert.equal(result.settings.edge,'left');assert.equal(result.settings.edgeGap,8);assert.equal(result.resetScope,'layout');
  assert.equal(result.settings.startupMode,before.startupMode);assert.equal(result.settings.hotkey,before.hotkey);
  assert.equal(f.login.length,0);assert.equal(f.hotkeys.length,0);
});
test('about page offers only cancel and full reset; unknown pages are rejected',async()=>{
  const f=fixture();f.confirm(1);
  const result=await f.handlers.action(f.event,'reset-settings','about');
  assert.equal(result.resetScope,'all');assert.deepEqual(Array.from(f.messages[0].options.buttons),['取消','恢复全部设置']);
  await assert.rejects(f.handlers.action(f.event,'reset-settings','__proto__'),/Unknown settings page/);
});
