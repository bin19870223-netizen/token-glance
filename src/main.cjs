const {app,BrowserWindow,ipcMain,screen,Tray,Menu,nativeImage,nativeTheme,globalShortcut,Notification,shell,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {spawn}=require('node:child_process');
const {CodexClient}=require('./codex.cjs');
const {maintainTopmost}=require('./topmost.cjs');
const {monitorFullscreen}=require('./fullscreen.cjs');
const {defaults,sanitizeSettings,settingsPages,resetSettings,snapshot,sampleUsage,dockBounds,panelBounds}=require('./model.cjs');
const root=path.resolve(__dirname,'..');
const runtime=path.join(root,'runtime');
for(const dir of ['user-data','cache','logs','temp','crash-dumps']) fs.mkdirSync(path.join(runtime,dir),{recursive:true});
process.env.TEMP=process.env.TMP=path.join(runtime,'temp');
app.setPath('userData',path.join(runtime,'user-data'));
app.setPath('sessionData',path.join(runtime,'user-data'));
app.setPath('temp',path.join(runtime,'temp'));
app.setPath('crashDumps',path.join(runtime,'crash-dumps'));
app.setAppLogsPath(path.join(runtime,'logs'));
app.commandLine.appendSwitch('disk-cache-dir',path.join(runtime,'cache'));
app.commandLine.appendSwitch('force-renderer-accessibility');
app.setName('Token Glance');
app.setAppUserModelId('AgentHUD.Windows');
const settingsPath=path.join(runtime,'settings.json');
const usagePath=path.join(runtime,'usage.json');
function readJSON(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
let settings=sanitizeSettings(readJSON(settingsPath,{}));
let codex=readJSON(usagePath,null);
if(codex) codex={...codex,connected:false,stale:true};
let dock,panel,preferences,tray,topmostGuard,fullscreenMonitor,pinned=false,panelAgent='codex',refreshTimer,refreshing=false,hoverTimer,hideTimer,baseline=null,dragState=null;
let sources=readJSON(path.join(runtime,'sources.json'),{});
const client=new CodexClient();
let connectionError='',hotkeyError='',usageSamplingStarted=false,autoStarted=process.argv.includes('--agent-auto');
const names={codex:'Codex',claude:'Claude',deepseek:'DeepSeek'};
const assets={codex:'chatgpt',claude:'claude',deepseek:'deepseek'};
function otherProvider(id){
  const file=sources[id];
  if(!file) return {id,name:names[id],connected:false,stale:false,quotas:[],buckets:[],sessions:[],primary:null,lifetimeTokens:null};
  try{
    const stat=fs.statSync(file);
    if(stat.size>1024*1024) throw new Error('Snapshot too large');
    const data=readJSON(file,{});
    const normalized=snapshot({limits:{rateLimits:{primary:data.primary,secondary:data.secondary}},usage:{summary:{lifetimeTokens:data.lifetimeTokens},dailyUsageBuckets:data.dailyUsageBuckets}},null,stat.mtimeMs);
    if(!normalized.primary&&normalized.lifetimeTokens===null&&!normalized.buckets.length)throw new Error('No usage readings');
    return {...normalized,id,name:names[id],connected:true,stale:Date.now()-stat.mtimeMs>300000,source:'file',plan:'文件快照'};
  }catch{return {id,name:names[id],connected:false,stale:true,quotas:[],buckets:[],sessions:[],primary:null,lifetimeTokens:null};}
}
function allProviders(){return {codex:codex || {id:'codex',name:'Codex',connected:false,quotas:[],buckets:[],sessions:[],primary:null,lifetimeTokens:null},claude:otherProvider('claude'),deepseek:otherProvider('deepseek')};}
function state(){return {settings,providers:allProviders(),pinned,panelAgent,refreshing,connectionError,hotkeyError,dark:settings.theme==='dark'||settings.theme==='system'&&nativeTheme.shouldUseDarkColors,displays:screen.getAllDisplays().map(d=>({id:d.id,name:d.label || `显示器 ${d.id}`,primary:d.id===screen.getPrimaryDisplay().id})),sources:{claude:!!sources.claude,deepseek:!!sources.deepseek}};}
function broadcast(){const value=state();for(const w of [dock,panel,preferences])if(w&&!w.isDestroyed())w.webContents.send('state',value);updateTray();}
function saveSettings(){fs.writeFileSync(settingsPath+'.tmp',JSON.stringify(settings,null,2));fs.renameSync(settingsPath+'.tmp',settingsPath);}
function logStartup(event){
  const file=path.join(runtime,'logs','startup.log');
  try{
    if(fs.existsSync(file)&&fs.statSync(file).size>65536)fs.renameSync(file,file+'.previous');
    fs.appendFileSync(file,`${new Date().toISOString()} ${event}\n`);
  }catch{ /* Diagnostics must not prevent startup. */ }
}
function applyStartup(){
  const follow=settings.startupMode==='agents';
  const watcher=path.join(runtime,'AgentUsageWatcher.exe');
  const enabled=settings.startupMode!=='manual';
  app.setLoginItemSettings({name:'AgentHUD.Windows',openAtLogin:enabled,enabled,path:follow?watcher:process.execPath,args:follow?[]:[root,'--background']});
  if(follow){
    const child=spawn(watcher,[],{cwd:root,windowsHide:true,detached:true,stdio:'ignore'});
    child.on('error',()=>{connectionError='启动监听器未能启动';broadcast();});child.unref();
  }
}
function display(){return screen.getAllDisplays().find(d=>d.id===settings.displayId)||screen.getPrimaryDisplay();}
function placeWindow(window,bounds){const old=window.getBounds();if(Object.keys(bounds).some(key=>old[key]!==bounds[key]))window.setBounds(bounds);}
function setBounds(){
  if(!dock||dock.isDestroyed())return;
  placeWindow(dock,dockBounds(display().workArea,settings,settings.agents.length));
  if(panel&&!panel.isDestroyed()){
    const area=display().workArea;
    placeWindow(panel,panelBounds(dock.getBounds(),area,settings.edge,Math.min(390,area.width),Math.min(Math.ceil(470*settings.fontScale/100),area.height)));
  }
  topmostGuard?.refresh();
  fullscreenMonitor?.setWindows?.(settings.alwaysOnTop?[dock,panel]:[]);
}
function secureWindow(options,view){
  const w=new BrowserWindow({...options,show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  w.webContents.on('will-navigate',event=>event.preventDefault());
  w.webContents.on('render-process-gone',()=>fs.appendFileSync(path.join(runtime,'logs','health.log'),`${new Date().toISOString()} renderer stopped\n`));
  w.loadFile(path.join(__dirname,'ui',view+'.html'));
  return w;
}
function createDock(){
  dock=secureWindow({title:'Token Glance · 贴边用量',...dockBounds(display().workArea,settings,settings.agents.length),frame:false,transparent:true,resizable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:false},'dock');
  dock.once('ready-to-show',()=>{dock.showInactive();logStartup('dock-visible');});
  dock.on('show',()=>topmostGuard?.refresh());
  dock.on('closed',()=>{dock=null;fullscreenMonitor?.setWindows?.(settings.alwaysOnTop?[dock,panel]:[]);});
  setBounds();
}
function ensurePanel(){
  if(panel&&!panel.isDestroyed())return;
  panel=secureWindow({title:'Token Glance · 用量概览',width:390,height:470,frame:false,transparent:true,resizable:false,skipTaskbar:true,hasShadow:false,alwaysOnTop:false},'panel');
  panel.on('show',()=>topmostGuard?.refresh());
  panel.once('ready-to-show',()=>{setBounds();if(fullscreenMonitor?.shouldYield())panel.showInactive();else if(pinned){panel.show();panel.focus();}else{panel.showInactive();panel.moveTop();}broadcast();});
  panel.on('blur',()=>{if(!pinned)scheduleHide();});
  panel.on('closed',()=>{panel=null;fullscreenMonitor?.setWindows?.(settings.alwaysOnTop?[dock,panel]:[]);});
  setBounds();
}
function showPanel(id='codex',pin=false){
  if(fullscreenMonitor?.shouldYield())return;
  clearTimeout(hideTimer);clearTimeout(hoverTimer);
  const nextAgent=Object.hasOwn(names,id)?id:'codex';
  if(!pin&&panel?.isVisible()&&panelAgent===nextAgent)return;
  panelAgent=nextAgent;pinned=pin;
  ensurePanel();setBounds();if(pin){panel.show();panel.focus();}else{panel.showInactive();panel.moveTop();}broadcast();
}
function pointerOverHud(){const point=screen.getCursorScreenPoint();return [dock,panel].some(window=>{if(!window||window.isDestroyed()||!window.isVisible())return false;const bounds=window.getBounds();return point.x>=bounds.x&&point.x<bounds.x+bounds.width&&point.y>=bounds.y&&point.y<bounds.y+bounds.height;});}
function scheduleHide(){clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!pinned&&!pointerOverHud())panel?.close();},350);}
function showSettings(){
  clearTimeout(hideTimer);if(!pinned)panel?.close();
  if(preferences&&!preferences.isDestroyed()){preferences.show();preferences.focus();return;}
  preferences=secureWindow({title:'Token Glance · 设置',width:890,height:736,minWidth:800,minHeight:620,frame:false,transparent:true,hasShadow:true,backgroundColor:'#00000000'},'settings');
  preferences.once('ready-to-show',()=>{preferences.show();broadcast();});
  preferences.on('closed',()=>{preferences=null;});
}
function applyHotkey(){
  globalShortcut.unregisterAll();
  try{hotkeyError=globalShortcut.register(settings.hotkey,()=>panel?.isVisible()?closePanel():showPanel('codex',true))?'':'快捷键已被占用，请换一个组合';}
  catch{hotkeyError='快捷键格式无效，例如 Control+Shift+Space';}
}
function closePanel(){pinned=false;panel?.close();broadcast();}
async function refresh(){
  if(refreshing)return;refreshing=true;broadcast();
  try{
    const raw=await client.read();const next=snapshot(raw,baseline);
    if(!baseline || next.checkedAt-baseline.checkedAt>=300000)baseline=next;
    const old=codex;
    const email=raw.account?.account?.email;
    const account=typeof email==='string'&&email?createHash('sha256').update(email.trim().toLowerCase()).digest('hex'):null;
    Object.assign(next,sampleUsage(old,next.lifetimeTokens,account,settings.refreshSeconds,next.checkedAt,usageSamplingStarted));
    usageSamplingStarted=!!account&&Number.isSafeInteger(next.lifetimeTokens);
    codex=next;connectionError='';
    // Persist only aggregate usage. Session names and IDs remain in memory.
    fs.writeFileSync(usagePath,JSON.stringify({...next,sessions:[]}));
    if(settings.alertEnabled&&next.primary&&next.primary.remaining<=settings.alertThreshold&&(!old?.primary||old.primary.remaining>settings.alertThreshold)&&Notification.isSupported()){
      new Notification({title:'Codex 额度提醒',body:`${next.primary.label}剩余 ${Math.round(next.primary.remaining)}%`,silent:true}).show();
    }
  }catch(e){
    usageSamplingStarted=false;
    connectionError=e.message.startsWith('Codex RPC')?'当前 Codex 接口未返回用量':'正在等待 Codex 连接';
    if(codex)codex={...codex,connected:false,stale:true};
  }finally{refreshing=false;broadcast();scheduleRefresh();}
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,settings.refreshSeconds*1000);}
function updateTray(){
  if(!tray)return;
  const remaining=codex?.primary?.remaining;
  tray.setToolTip(`Token Glance · ${codex?.connected?'Codex '+(remaining==null?'已连接':Math.round(remaining)+'% 剩余'):'等待连接'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'查看用量',click:()=>showPanel('codex',true)},
    {label:'设置',click:showSettings},
    {label:'刷新用量',click:refresh},
    {type:'separator'},
    {label:dock?.isVisible()?'隐藏贴边条':'显示贴边条',click:()=>dock?.isVisible()?dock.hide():dock.showInactive()},
    {label:'退出 Token Glance',click:()=>app.quit()}
  ]));
}
function trusted(event){return [dock,panel,preferences].some(w=>w&&!w.isDestroyed()&&w.webContents===event.sender)&&event.senderFrame===event.sender.mainFrame;}
function requireTrusted(event){if(!trusted(event))throw new Error('Untrusted sender');}
function updateSettings(next){
  const old=settings;settings=next;
  if(old.hotkey!==settings.hotkey)applyHotkey();
  saveSettings();if(old.startupMode!==settings.startupMode)applyStartup();setBounds();scheduleRefresh();broadcast();return state();
}
ipcMain.handle('state',event=>{requireTrusted(event);return state();});
ipcMain.handle('settings',(event,patch)=>{
  requireTrusted(event);if(event.sender!==preferences?.webContents&&Object.keys(patch).some(k=>k!=='chartDays'))throw new Error('Settings window required');
  return updateSettings(sanitizeSettings({...settings,...patch}));
});
ipcMain.handle('action',async(event,name,payload)=>{
  requireTrusted(event);
  if(name==='hover'){clearTimeout(hideTimer);clearTimeout(hoverTimer);if(!pinned&&!(panel?.isVisible()&&panelAgent===payload))hoverTimer=setTimeout(()=>showPanel(payload,false),settings.hoverDelay);}
  else if(name==='leave'){clearTimeout(hoverTimer);scheduleHide();}
  else if(name==='panel-enter'){clearTimeout(hideTimer);}
  else if(name==='open'){if(panel?.isVisible()&&pinned&&panelAgent===payload)closePanel();else showPanel(payload,true);}
  else if(name==='pin'){pinned=!pinned;broadcast();}
  else if(name==='close-panel')closePanel();
  else if(name==='settings')showSettings();
  else if(name==='close-settings')preferences?.close();
  else if(name==='minimize')preferences?.minimize();
  else if(name==='refresh')await refresh();
  else if(name==='reset-settings'){
    if(event.sender!==preferences?.webContents)throw new Error('Settings window required');
    if(!Object.hasOwn(settingsPages,payload))throw new Error('Unknown settings page');
    const owner=preferences;
    const page=settingsPages[payload],hasPageSettings=page.keys.length>0;
    const scopes=hasPageSettings?[null,payload,'all']:[null,'all'];
    const {response}=await dialog.showMessageBox(owner,{type:'question',title:'恢复默认设置',message:'选择要恢复的范围',detail:(hasPageSettings?`仅恢复本页：恢复「${page.label}」里的设置，其他页面保持原样。\n\n`:'「关于」页没有可调整的设置。\n\n')+'恢复全部设置：重置所有页面，启动方式恢复为「仅手动启动」。\n\n保留 Codex 登录状态、用量记录与已选的数据源文件。',buttons:hasPageSettings?['取消',`仅恢复本页（${page.label}）`,'恢复全部设置']:['取消','恢复全部设置'],defaultId:0,cancelId:0,noLink:true});
    const scope=scopes[response];
    if(!scope||owner.isDestroyed())return null;
    return {...updateSettings(resetSettings(settings,scope)),resetScope:scope};
  }
  else if(name==='thread'&&/^[a-zA-Z0-9-]{10,80}$/.test(payload)&&codex?.sessions?.some(s=>s.id===payload))await shell.openExternal('codex://threads/'+payload);
  else if(name==='drag-start'&&event.sender===dock.webContents){dragState={cursor:screen.getCursorScreenPoint(),bounds:dock.getBounds()};clearTimeout(hoverTimer);closePanel();}
  else if(name==='drag-move'&&dragState){const p=screen.getCursorScreenPoint();dock.setPosition(dragState.bounds.x+p.x-dragState.cursor.x,dragState.bounds.y+p.y-dragState.cursor.y);}
  else if(name==='drag-end'&&dragState){
    const p=screen.getCursorScreenPoint(),d=screen.getDisplayNearestPoint(p),a=d.workArea;
    const edges={left:Math.abs(p.x-a.x),right:Math.abs(p.x-a.x-a.width),top:Math.abs(p.y-a.y),bottom:Math.abs(p.y-a.y-a.height)};
    settings.edge=Object.keys(edges).sort((x,y)=>edges[x]-edges[y])[0];settings.displayId=d.id;
    const vertical=['left','right'].includes(settings.edge);const bounds=dockBounds(a,settings,settings.agents.length);
    settings.position=Math.max(0,Math.min(1,vertical?(dock.getBounds().y-a.y)/(a.height-bounds.height):(dock.getBounds().x-a.x)/(a.width-bounds.width)));
    dragState=null;saveSettings();setBounds();broadcast();
  }
  else if(name==='pick-source'&&event.sender===preferences?.webContents&&['claude','deepseek'].includes(payload)){
    const result=await dialog.showOpenDialog(preferences,{title:'选择用量快照 JSON',properties:['openFile'],filters:[{name:'JSON 用量快照',extensions:['json']}]});
    if(!result.canceled){sources[payload]=result.filePaths[0];fs.writeFileSync(path.join(runtime,'sources.json'),JSON.stringify(sources));broadcast();}
  }
  else if(name==='quit')app.quit();
  return state();
});
if(!app.requestSingleInstanceLock())app.quit();
else if(process.argv.includes('--agents-stopped'))app.quit();
else{
  logStartup(`start mode=${settings.startupMode} background=${process.argv.includes('--background')}`);
  process.on('uncaughtExceptionMonitor',error=>logStartup(`uncaught ${error.name}`));
  app.on('second-instance',(_event,args)=>{
    if(args.includes('--agents-stopped')){if(settings.startupMode==='agents'&&autoStarted)app.quit();}
    else if(args.includes('--agent-auto')){if(settings.startupMode==='agents')autoStarted=true;}
    else if(args.includes('--reload-hud')){app.relaunch({args:autoStarted?[root,'--background','--agent-auto']:[root]});app.quit();}
    else showSettings();
  });
  app.whenReady().then(()=>{
    Menu.setApplicationMenu(null);
    const icon=nativeImage.createFromPath(path.join(__dirname,'ui','assets','chatgpt.png')).resize({width:20,height:20});
    tray=new Tray(icon);tray.on('click',()=>panel?.isVisible()?closePanel():showPanel('codex',true));tray.on('double-click',showSettings);
    fullscreenMonitor=monitorFullscreen(path.join(runtime,'FullscreenState.exe'),()=>topmostGuard?.refresh());
    topmostGuard=maintainTopmost(()=>[dock,panel],()=>settings.alwaysOnTop&&!fullscreenMonitor.shouldYield());
    saveSettings();applyStartup();createDock();applyHotkey();updateTray();refresh();
    nativeTheme.on('updated',broadcast);
    screen.on('display-metrics-changed',()=>{setBounds();broadcast();});
    screen.on('display-removed',()=>{setBounds();broadcast();});
    if(!process.argv.includes('--background'))showSettings();
    logStartup('ready');
  }).catch(error=>{logStartup(`failed ${error.name}`);app.exit(1);});
}
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{topmostGuard?.stop();fullscreenMonitor?.stop();clearTimeout(refreshTimer);clearTimeout(hideTimer);clearTimeout(hoverTimer);globalShortcut.unregisterAll();client.stop();tray?.destroy();});
