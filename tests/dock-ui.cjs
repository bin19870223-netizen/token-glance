const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const {defaults}=require('../src/model.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'work','dock-test-runtime');
app.setPath('userData',directory);app.setPath('crashDumps',path.join(directory,'crashes'));
const state={settings:{...defaults},dark:false,providers:{codex:{id:'codex',name:'Codex',connected:true,primary:{remaining:76}}},pinned:false,panelAgent:'codex'};
const actions=[];
ipcMain.handle('state',()=>state);
ipcMain.handle('action',(event,name)=>{
  actions.push(name);
  if(name==='test-broadcast')event.sender.send('state',state);
  if(name==='test-update'){state.providers.codex.primary.remaining=75;event.sender.send('state',state);}
  if(name==='test-pin'){state.pinned=true;event.sender.send('state',state);}
});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:100,height:90,show:false,webPreferences:{preload:path.join(root,'src/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  try{
    await win.loadFile(path.join(root,'src/ui/dock.html'));
    const checks=await win.webContents.executeJavaScript(`(${async function(){
      const checks=[],tick=()=>new Promise(resolve=>setTimeout(resolve,20));
      const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
      await tick();const button=document.querySelector('[data-agent]'),ring=button.querySelector('.ring');
      for(let i=0;i<20;i++){await window.hud.action('test-broadcast');await tick();}
      check(button===document.querySelector('[data-agent]'),'broadcasts preserve hovered button identity');
      check(ring===button.querySelector('.ring'),'unchanged broadcasts preserve icon and native tooltip target');
      check(button.title==='Codex · 已连接','native tooltip text is stable');
      ring.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:null}));await tick();
      await window.hud.action('test-update');await tick();
      check(button===document.querySelector('[data-agent]'),'quota update preserves button identity');
      check(button.textContent.includes('75%'),'quota text still updates');
      const updated=button.querySelector('.ring');await window.hud.action('test-pin');await tick();
      check(button.classList.contains('active')&&button.getAttribute('aria-expanded')==='true','pinned state still updates');
      check(updated===button.querySelector('.ring'),'pinning does not rebuild icon');
      return checks;
    }})()`);
    if(actions.filter(name=>name==='hover').length!==1)throw Error('unexpected hover action count');
    console.log('PASS: '+(checks.length+1)+' isolated dock hover checks');app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
