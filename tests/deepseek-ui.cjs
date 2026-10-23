const {app,BrowserWindow,ipcMain,safeStorage}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {defaults}=require('../src/model.cjs');
const {DeepSeekMonitor,parseBalance}=require('../src/deepseek.cjs');
const directory=path.resolve(__dirname,'../work/deepseek-ui-runtime');fs.mkdirSync(directory,{recursive:true});
app.setPath('userData',directory);app.setPath('temp',directory);app.setPath('crashDumps',path.join(directory,'crashes'));app.on('window-all-closed',()=>{});
const raw={is_available:true,balance_infos:[{currency:'CNY',total_balance:'15.25',granted_balance:'5.00',topped_up_balance:'10.25'}]};
const monitor=new DeepSeekMonitor(path.join(directory,'key.enc'),safeStorage,async()=>parseBalance(raw));
const windows=[],errors=[];
const state={settings:{...defaults,theme:'light'},dark:false,providers:{codex:{id:'codex',name:'Codex'},claude:{id:'claude',name:'Claude'},deepseek:monitor.data,airport:{id:'airport',name:'流量'}},sources:{},displays:[],deepseek:{configured:false},panelAgent:'deepseek'};
function update(){state.providers.deepseek=monitor.data;state.deepseek.configured=monitor.configured();for(const w of windows)w.webContents.send('state',state);}
ipcMain.handle('state',()=>state);ipcMain.handle('settings',(_,patch)=>{Object.assign(state.settings,patch);update();return state;});
ipcMain.handle('action',async(_,name,value)=>{try{if(name==='deepseek-connect'){await monitor.configure(value);state.settings.agents=['codex','deepseek'];}if(name==='deepseek-clear')monitor.clear();update();return {ok:true};}catch(e){return {ok:false,message:e.message};}});
async function view(name,w,h){const win=new BrowserWindow({width:w,height:h,show:false,webPreferences:{preload:path.resolve(__dirname,'../src/preload.cjs'),sandbox:true,contextIsolation:true,offscreen:true,backgroundThrottling:false}});windows.push(win);win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message);});await win.loadFile(path.resolve(__dirname,'../src/ui',name+'.html'));return win;}
app.whenReady().then(async()=>{try{
 monitor.clear();const settings=await view('settings',890,900);
 await settings.webContents.executeJavaScript(`(async()=>{const tick=()=>new Promise(r=>setTimeout(r,120));await tick();document.querySelector('[data-page="sources"]').click();if(document.getElementById('deepseek-key').type!=='password')throw Error('unmasked input');document.getElementById('deepseek-key').value='invalid';document.getElementById('deepseek-connect').click();await tick();if(!document.body.innerText.includes('有效的 DeepSeek'))throw Error('missing validation');document.getElementById('deepseek-key').value='sk-test-fixture-only';document.getElementById('deepseek-key').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();if(!document.body.innerText.includes('连接成功'))throw Error('missing success');if(document.getElementById('deepseek-key').value)throw Error('key refilled');})()`);
 if(JSON.stringify(state).includes('sk-test-fixture-only')||fs.readFileSync(monitor.file).includes(Buffer.from('sk-test-fixture-only')))throw Error('key leaked');
 const panel=await view('panel',390,540);await new Promise(r=>setTimeout(r,200));
 await panel.webContents.executeJavaScript(`(()=>{const text=document.getElementById('content').innerText;if(!text.includes('¥15.25')||!text.includes('¥10.25')||!text.includes('¥5.00'))throw Error('missing balances');if(text.includes('Token 活动'))throw Error('invented token chart');if(document.getElementById('mode').getBoundingClientRect().width)throw Error('percent toggle visible');})()`);
 const dock=await view('dock',400,90);await new Promise(r=>setTimeout(r,200));await dock.webContents.executeJavaScript(`(()=>{if(!document.querySelector('[data-agent="deepseek"]').innerText.includes('¥15.25'))throw Error('missing dock amount');})()`);
 await settings.webContents.executeJavaScript(`document.getElementById('deepseek-clear').click()`);await new Promise(r=>setTimeout(r,200));if(monitor.configured())throw Error('key not removed');if(errors.length)throw Error(errors.join(';'));console.log('PASS: DeepSeek masked entry, invalid key, Enter-connect, native encryption, secret-free state, balance panel, dock amount and remove flow (fixture API)');app.exit(0);
}catch(e){console.error(e);app.exit(1);}});
