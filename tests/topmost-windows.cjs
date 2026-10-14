const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {maintainTopmost}=require('../src/topmost.cjs');
const {monitorFullscreen}=require('../src/fullscreen.cjs');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const directory=path.resolve(__dirname,'../work/topmost-test-runtime');
app.setPath('userData',directory);app.setPath('crashDumps',path.join(directory,'crashes'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const handle=window=>{const buffer=window.getNativeWindowHandle();return (buffer.length===8?buffer.readBigUInt64LE():BigInt(buffer.readUInt32LE())).toString();};
app.whenReady().then(async()=>{
  const windows=[];let guard,fullscreen,nativeMonitor;const checks=[];
  const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
  try{
    nativeMonitor=monitorFullscreen(path.resolve(__dirname,'../runtime/FullscreenState.exe'),()=>{});
    for(let i=0;i<30&&nativeMonitor.shouldYield();i++)await delay(100);
    check(!nativeMonitor.shouldYield(),'native Windows detector reports desktop outside exclusive fullscreen');nativeMonitor.stop();
    async function make(title,topmost,transparent=false){
      const window=new BrowserWindow({title,x:100,y:100,width:260,height:140,show:false,frame:false,transparent,alwaysOnTop:topmost,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
      windows.push(window);await window.loadURL('data:text/html,<body style="background:%23eef2f6">Token Glance window-order test</body>');window.showInactive();window.setAlwaysOnTop(topmost,'pop-up-menu');return window;
    }
    const dock=await make('Test dock',true,true),panel=await make('Test panel',true,true),competitor=await make('Test competing pinned app',true);
    const ids=[dock,panel,competitor].map(handle);
    const inspect=()=>{const r=spawnSync(path.join(directory,'WindowOrder.exe'),ids,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
    const above=(state,a,b)=>state.order.indexOf(ids[a])>=0&&state.order.indexOf(ids[a])<state.order.indexOf(ids[b]);
    dock.setAlwaysOnTop(true,'floating');
    console.log('Original floating level retains Windows topmost flag: '+dock.isAlwaysOnTop());
    dock.setAlwaysOnTop(true,'pop-up-menu');
    competitor.show();competitor.focus();competitor.moveTop();await delay(150);
    const before=inspect();
    check(dock.isAlwaysOnTop()&&above(before,2,0),'reproduces old failure: pinned competitor covers a still-topmost HUD');
    check(before.foreground!=='0','foreground window is available for focus-preservation check');
    const signal=new EventEmitter();signal.stdout=new PassThrough();signal.stdin=new PassThrough();signal.kill=()=>{};
    fullscreen=monitorFullscreen('test-detector.exe',()=>guard?.refresh(),()=>signal);signal.stdout.write('desktop\n');
    let enabled=true;guard=maintainTopmost(()=>[dock,panel],()=>enabled&&!fullscreen.shouldYield());
    await delay(1250);const recovered=inspect();
    check(above(recovered,0,2)&&above(recovered,1,0),'timer recovers dock and panel in correct native z-order');
    check((recovered.styles[ids[0]]&8)!==0&&(recovered.styles[ids[1]]&8)!==0,'native Windows topmost flags are retained');
    check(recovered.foreground===before.foreground,'recovery preserves foreground keyboard focus');
    for(let i=0;i<3;i++){
      competitor.moveTop();const foreground=inspect().foreground;await delay(1200);const state=inspect();
      check(above(state,0,2)&&above(state,1,0)&&state.foreground===foreground,'recovers repeated competitor promotion '+(i+1));
    }
    panel.hide();dock.hide();competitor.moveTop();await delay(1200);
    check(!dock.isVisible()&&!panel.isVisible(),'guard respects tray-hidden windows');
    dock.showInactive();guard.refresh();check(above(inspect(),0,2),'show refresh immediately restores HUD');
    competitor.setAlwaysOnTop(false);competitor.maximize();competitor.show();competitor.focus();await delay(1200);
    check(above(inspect(),0,2),'HUD remains above a maximized normal window');
    signal.stdout.write('exclusive\n');competitor.setAlwaysOnTop(true,'pop-up-menu');competitor.moveTop();const gameFocus=inspect().foreground;await delay(1200);
    const yielded=inspect();
    check(!dock.isAlwaysOnTop()&&!panel.isAlwaysOnTop()&&(yielded.styles[ids[0]]&8)===0&&above(yielded,2,0),'simulated exclusive state demotes native overlays and stops recovery');
    check(yielded.foreground===gameFocus,'exclusive state does not change foreground focus');
    signal.stdout.write('desktop\n');const desktop=inspect();
    check(dock.isAlwaysOnTop()&&above(desktop,0,2),'leaving exclusive state restores desktop topmost immediately');
    enabled=false;guard.refresh();competitor.setAlwaysOnTop(true);competitor.moveTop();await delay(1200);
    check(!dock.isAlwaysOnTop()&&!panel.isAlwaysOnTop()&&above(inspect(),2,0),'disabling always-on-top stops recovery');
    enabled=true;guard.refresh();dock.destroy();panel.destroy();await delay(1200);
    check(windows.slice(0,2).every(window=>window.isDestroyed()),'closed overlays do not crash the guard');
    console.log(JSON.stringify({passed:checks.length,checks},null,2));
  }catch(error){console.error(error);process.exitCode=1;}
  finally{guard?.stop();fullscreen?.stop();nativeMonitor?.stop();for(const window of windows)if(!window.isDestroyed())window.destroy();app.exit(process.exitCode||0);}
});
