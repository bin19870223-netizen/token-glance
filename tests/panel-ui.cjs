const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {defaults,sanitizeSettings}=require('../src/model.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'work','panel-test-runtime');
app.setPath('userData',directory);app.setPath('crashDumps',path.join(directory,'crashes'));
const now=Date.now();
const provider={id:'codex',name:'Codex',connected:true,checkedAt:now,quotas:[],primary:{remaining:80},lifetimeTokens:1000,burnRate:null,
  buckets:[{date:'2026-10-13',tokens:10},{date:'2026-10-14',tokens:20}],
  usageSamples:[{at:now-60000,tokens:100,interval:60},{at:now,tokens:160,interval:60}]};
const state={settings:{...defaults},dark:false,providers:{codex:provider},panelAgent:'codex',pinned:false};
ipcMain.handle('state',()=>state);
ipcMain.handle('settings',(event,patch)=>{state.settings=sanitizeSettings({...state.settings,...patch});event.sender.send('state',state);return state;});
ipcMain.handle('action',(event,name)=>{if(name==='test-empty'){provider.usageSamples=[];event.sender.send('state',state);}});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:390,height:590,show:false,webPreferences:{preload:path.join(root,'src','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  try{
    await win.loadFile(path.join(root,'src/ui/panel.html'));
    const checks=await win.webContents.executeJavaScript(`(${async function(){
      const checks=[],tick=()=>new Promise(resolve=>setTimeout(resolve,50));
      const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
      const select=async days=>{document.querySelector('[data-days="'+days+'"]').click();await tick();};
      await tick();check(document.querySelectorAll('[data-days]').length===3,'three period buttons');
      await select(1);check(document.querySelector('[data-days="1"]').classList.contains('active'),'24-hour button selects');
      check((await window.hud.state()).settings.chartDays===1,'24-hour period persists');
      check(document.querySelector('.chart-controls small').textContent.includes('本机采样'),'sample source is explicit');
      check(document.querySelectorAll('.bar').length===24,'24 hourly bars');
      check(document.querySelectorAll('.bar.missing').length>0,'unobserved hours remain missing');
      check(document.querySelector('.chart-total').textContent.includes('60'),'sampled increment shown');
      check(document.querySelector('.chart-note').textContent.includes('未运行'),'coverage limit explained');
      await window.hud.settings({fontScale:125});await tick();
      const controls=document.querySelector('.chart-controls'),left=controls.firstElementChild.getBoundingClientRect(),right=controls.lastElementChild.getBoundingClientRect();
      check(left.right<=right.left&&right.right<=innerWidth-15,'period buttons fit at largest font');
      await select(7);check(document.querySelectorAll('.bar').length===7&&document.querySelector('.chart-total').textContent.includes('30'),'7-day account totals unchanged');
      await select(30);check(document.querySelectorAll('.bar').length===30,'30-day chart unchanged');
      await select(1);await window.hud.action('test-empty');await tick();
      check(document.querySelector('.chart-total').textContent.includes('—')&&document.querySelector('.empty').textContent.includes('未采集'),'first-use state does not invent zero usage');
      return checks;
    }})()`);
    const picture=await win.webContents.capturePage();fs.writeFileSync(path.join(root,'work','panel-24h-preview.png'),picture.toPNG());
    console.log('PASS: '+checks.length+' isolated panel UI checks');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
