// Isolated UI + native Windows encryption. Subscription response headers are fixtures.
const {app,BrowserWindow,ipcMain,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {defaults,sanitizeSettings}=require('../src/model.cjs');
const {TrafficMonitor,parseTraffic,emptyTraffic}=require('../src/traffic.cjs');
const directory=path.resolve(__dirname,'../work/traffic-ui-runtime');
fs.mkdirSync(path.join(directory,'temp'),{recursive:true});
process.env.TEMP=process.env.TMP=path.join(directory,'temp');
app.setPath('userData',directory);app.setPath('crashDumps',path.join(directory,'crashes'));
app.on('window-all-closed',()=>{});
const state={settings:{...defaults,theme:'light',palette:'gold'},dark:false,providers:{codex:{id:'codex',name:'Codex',connected:false},claude:{id:'claude',name:'Claude'},deepseek:{id:'deepseek',name:'DeepSeek'},airport:emptyTraffic()},traffic:{configured:false,loading:false},sources:{},displays:[{id:1,name:'演示显示器',primary:true}],panelAgent:'airport',pinned:false};
const monitor=new TrafficMonitor(path.join(directory,'subscription.enc'),safeStorage,async()=>parseTraffic('upload=2147483648;download=73014444032;total=107374182400;expire=1900000000'));
const windows=[],errors=[];
function update(){state.providers.airport=monitor.data;state.traffic.configured=monitor.configured();for(const w of windows)if(!w.isDestroyed())w.webContents.send('state',state);}
ipcMain.handle('state',()=>state);
ipcMain.handle('settings',(_,patch)=>{state.settings=sanitizeSettings({...state.settings,...patch});update();return state;});
ipcMain.handle('action',async(event,name,payload)=>{
  if(name==='test-broadcast'){update();return;}
  if(name==='test-offline'){monitor.data={...monitor.data,stale:true,connected:false,error:'连接失败'};update();return;}
  if(name==='traffic-connect'||name==='traffic-clear'){
    try{if(name==='traffic-clear')monitor.clear();else{await monitor.configure(payload);state.settings.showTraffic=true;}update();return {ok:true};}
    catch(error){return {ok:false,message:error.message};}
  }
});
async function windowFor(view,width,height){
  const win=new BrowserWindow({width,height,show:false,webPreferences:{preload:path.resolve(__dirname,'../src/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
  windows.push(win);win.webContents.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message);});
  await win.loadFile(path.resolve(__dirname,'../src/ui',view+'.html'));return win;
}
app.whenReady().then(async()=>{
  try{
    monitor.clear();const settings=await windowFor('settings',890,820);
    const checks=await settings.webContents.executeJavaScript(`(${async function(){
      const labels=[],tick=()=>new Promise(r=>setTimeout(r,80)),check=(ok,text)=>{if(!ok)throw Error(text);labels.push(text);};
      await tick();document.querySelector('[data-page="sources"]').click();await tick();
      check(document.getElementById('traffic-link').type==='password','subscription field is masked');
      document.getElementById('traffic-link').focus();document.getElementById('traffic-link').value='draft';await window.hud.action('test-broadcast');await tick();
      check(document.getElementById('traffic-link').value==='draft','broadcast preserves focused subscription draft');
      document.getElementById('traffic-link').value='http://invalid.local';document.getElementById('traffic-connect').click();await tick();await tick();
      check(document.getElementById('traffic-message').textContent.includes('HTTPS'),'invalid link shows a useful error');
      check(!(await window.hud.state()).traffic.configured,'invalid link is not saved');
      document.getElementById('traffic-link').value='https://www.asiassn.com/subscription/ui-fixture';document.getElementById('traffic-link').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();await tick();
      const state=await window.hud.state();
      check(state.traffic.configured&&state.settings.showTraffic,'Enter connects and enables the existing dock feature');
      check(document.getElementById('traffic-message').textContent.includes('连接成功'),'successful connection is visible');
      check(document.getElementById('traffic-link').value==='','saved secret is never filled back into the form');
      check(!JSON.stringify(state).includes('ui-fixture'),'IPC state excludes the subscription URL');
      return labels;
    }})()`);
    if(fs.readFileSync(monitor.file,'utf8').includes('ui-fixture'))throw Error('Subscription was stored in plaintext');
    const panel=await windowFor('panel',390,590);await new Promise(r=>setTimeout(r,250));
    const panelChecks=await panel.webContents.executeJavaScript(`(${async function(){
      const check=(ok,text)=>{if(!ok)throw Error(text);return text;},result=[];
      result.push(check(document.body.textContent.includes('30 GiB'),'remaining traffic is shown in binary units'));
      result.push(check(document.body.textContent.includes('70 GiB')&&document.body.textContent.includes('100 GiB'),'used and total match the response headers'));
      result.push(check(!document.body.textContent.includes('Token 活动'),'traffic is not mislabeled as Tokens'));
      result.push(check(document.querySelector('[data-tab="sessions"]').hidden,'irrelevant session controls are hidden'));
      result.push(check(document.getElementById('sessions-shortcut').getBoundingClientRect().width===0,'conversation shortcut is not visually rendered'));
      return result;
    }})()`);
    const output='E:\\Codex\\deliverable\\Token-Glance-traffic-monitor-20261023';fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'traffic-panel-demo.png'),(await panel.webContents.capturePage()).toPNG());
    await settings.webContents.executeJavaScript("document.getElementById('traffic-link').scrollIntoView({block:'center'});");await new Promise(r=>setTimeout(r,150));
    fs.writeFileSync(path.join(output,'traffic-settings-demo.png'),(await settings.webContents.capturePage()).toPNG());
    const dock=await windowFor('dock',220,70);await new Promise(r=>setTimeout(r,150));
    const dockOk=await dock.webContents.executeJavaScript("!!document.querySelector('[data-agent=airport]')&&document.querySelector('[data-agent=airport]').textContent.includes('30%')");
    if(!dockOk)throw Error('Airport quota is missing from the dock');
    await panel.webContents.executeJavaScript("window.hud.action('test-offline')");await new Promise(r=>setTimeout(r,120));
    if(!await panel.webContents.executeJavaScript("document.body.textContent.includes('上次记录')&&document.body.textContent.includes('30 GiB')"))throw Error('Network failure lost last known readings');
    await settings.webContents.executeJavaScript("document.getElementById('traffic-clear').click()");await new Promise(r=>setTimeout(r,150));
    if(monitor.configured())throw Error('Removing connection did not remove encrypted storage');
    if(errors.length)throw Error('UI console errors: '+errors.join('; '));
    console.log('PASS: '+(checks.length+panelChecks.length+4)+' traffic UI/encryption checks; fixture headers, no real account access');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
  finally{monitor.clear();for(const win of windows)if(!win.isDestroyed())win.destroy();}
});
