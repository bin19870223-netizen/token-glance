// Isolated documentation screenshots: synthetic aggregates, no account access.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'work','docs-capture-runtime');
fs.mkdirSync(path.join(runtime,'temp'),{recursive:true});
process.env.TEMP=path.join(runtime,'temp');process.env.TMP=process.env.TEMP;
if(!process.versions.electron){
  const result=require('node:child_process').spawnSync(require('electron'),[__filename],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;process.exit(result.status===null?1:result.status);
}
const {app,BrowserWindow,ipcMain}=require('electron');
const {defaults,snapshot,dockBounds}=require('../src/model.cjs');
app.setPath('userData',runtime);app.setPath('crashDumps',path.join(runtime,'crashes'));
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.on('window-all-closed',()=>{});
const output=path.join(root,'docs','images');fs.mkdirSync(output,{recursive:true});
const now=Date.now(),day=86400000;
const provider=snapshot({limits:{rateLimits:{planType:'pro',primary:{usedPercent:24,windowDurationMins:10080,resetsAt:Math.floor((now+5*day)/1000)},secondary:{usedPercent:12,windowDurationMins:300,resetsAt:Math.floor((now+2*3600000)/1000)}}},usage:{summary:{lifetimeTokens:8400000},dailyUsageBuckets:[420000,810000,540000,1500000,720000,1000000,620000].map((tokens,i)=>({startDate:new Date(now-(6-i)*day).toISOString().slice(0,10),tokens}))}},null,now);
provider.burnRate=1.8;
let tokens=100000;
provider.usageSamples=Array.from({length:145},(_,i)=>{tokens+=(i%11+1)*120;return {at:now-day+i*600000,tokens,interval:600,continuous:true};});
let state;
function demo(dark=false,patch={}){
  return {settings:{...defaults,theme:dark?'dark':'light',palette:'blue',fontScale:110,ringSize:35,opacity:96,edge:'bottom-right',...patch},dark,
    providers:{codex:provider,claude:{id:'claude',name:'Claude',connected:false},deepseek:{id:'deepseek',name:'DeepSeek',connected:false}},
    panelAgent:'codex',pinned:true,refreshing:false,sources:{claude:false,deepseek:false},displays:[{id:1,name:'Demo display',primary:true}]};
}
ipcMain.handle('state',()=>state);
ipcMain.handle('settings',(_,patch)=>{Object.assign(state.settings,patch);return state;});
ipcMain.handle('action',()=>state);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function capture(view,width,height,data,page){
  state=data;
  const win=new BrowserWindow({width,height,show:false,frame:false,transparent:true,backgroundColor:'#00000000',webPreferences:{preload:path.join(root,'src','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});
  try{
    await win.loadFile(path.join(root,'src','ui',view+'.html'));await delay(120);
    if(page){await win.webContents.executeJavaScript(`document.querySelector('[data-page="${page}"]').click()`);await delay(80);}
    await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await delay(250);
    return (await win.webContents.capturePage()).toPNG();
  }finally{win.destroy();}
}
async function overview(light,dark,dock){
  const win=new BrowserWindow({width:980,height:820,show:false,frame:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  try{
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:36px 50px;background:linear-gradient(135deg,#eaf1f8,#f4f5f5);color:#253349;font-family:"Segoe UI",sans-serif}header{display:flex;justify-content:space-between;align-items:center}h1{font-size:29px;letter-spacing:-1px;margin:0}header small{font-size:12px;color:#6d7d91;letter-spacing:1px}.intro{display:flex;align-items:center;gap:18px;height:78px}.intro img{width:${dock.width}px;height:${dock.height}px}.intro p{font-size:14px;color:#5d7089}.views{display:flex;gap:44px;justify-content:center}.view{width:390px}.view>img{width:390px;height:590px;display:block;filter:drop-shadow(0 8px 14px #25334912)}.label{font-size:12px;color:#66788d;margin:10px 2px}</style></head><body><header><h1>Token Glance</h1><small>DEMO DATA · 示例数据</small></header><div class="intro"><img src="data:image/png;base64,${dock.png.toString('base64')}"/><p>Keep usage at the edge. Hover for the details.<br>贴边看额度，悬停看详情。</p></div><div class="views"><div class="view"><img src="data:image/png;base64,${light.toString('base64')}"/><div class="label">LIGHT · 浅色用量概览</div></div><div class="view"><img src="data:image/png;base64,${dark.toString('base64')}"/><div class="label">DARK · 深色用量概览</div></div></div></body></html>`;
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));await delay(100);
    fs.writeFileSync(path.join(output,'overview.png'),(await win.webContents.capturePage()).toPNG());
  }finally{win.destroy();}
}
app.whenReady().then(async()=>{
  try{
    const light=await capture('panel',390,590,demo()),dark=await capture('panel',390,590,demo(true));
    const settings=demo().settings,bounds=dockBounds({x:0,y:0,width:1920,height:1080},settings);
    const dock={...bounds,png:await capture('dock',bounds.width,bounds.height,demo())};
    await overview(light,dark,dock);
    fs.writeFileSync(path.join(output,'activity-24h.png'),await capture('panel',390,660,demo(false,{chartDays:1})));
    for(const [page,patch] of [['appearance',{}],['layout',{}],['startup',{startupMode:'agents',launchAtLogin:true}]]){
      fs.writeFileSync(path.join(output,'settings-'+page+'.png'),await capture('settings',890,820,demo(false,patch),page));
    }
    console.log('Captured 5 documentation images with synthetic data; no live account or runtime accessed.');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
