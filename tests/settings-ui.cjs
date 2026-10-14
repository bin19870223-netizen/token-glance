// Run with: node_modules/electron/dist/electron.exe tests/settings-ui.cjs
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {defaults,resetSettings}=require('../src/model.cjs');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'work','slider-test-runtime'));
app.setPath('crashDumps',path.join(root,'work','slider-test-runtime','crashes'));
const state={settings:{...defaults},dark:false,providers:{codex:{id:'codex',name:'Codex',connected:false},claude:{name:'Claude'},deepseek:{name:'DeepSeek'}},sources:{},displays:[{id:1,name:'测试显示器',primary:true}]};
const writes=[];
let confirmReset=null;
ipcMain.handle('state',()=>state);
ipcMain.handle('settings',(_,patch)=>{writes.push(patch);Object.assign(state.settings,patch);return state;});
ipcMain.handle('action',(event,name,payload)=>{
  if(name==='test-refresh')event.sender.send('state',state);
  if(name==='test-confirm-reset')confirmReset=payload;
  if(name==='reset-settings'){if(!confirmReset)return null;const scope=confirmReset==='page'?payload:'all';state.settings=resetSettings(state.settings,scope);event.sender.send('state',state);return {...state,resetScope:scope};}
});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:890,height:736,show:false,webPreferences:{preload:path.join(root,'src','preload.cjs')}});
  try{
    await win.loadFile(path.join(root,'src','ui','settings.html'));
    const results=await win.webContents.executeJavaScript(`(${async function(){
      const checks=[];
      const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
      const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
      const navigate=async page=>{document.activeElement?.blur();document.querySelector(`[data-page="${page}"]`).click();await tick();};
      const enter=async(key,text)=>{const input=document.getElementById(key+'-number');input.focus();input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();};
      await tick();
      for(const [page,keys] of [['appearance',['opacity','fontScale']],['layout',['position','edgeGap','ringSize','hoverDelay']],['notifications',['alertThreshold']]]){
        await navigate(page);
        for(const key of keys){
          const slider=document.getElementById(key),before=Number(slider.value),step=Number(slider.step);
          check(!!document.getElementById(key+'-number')&&!!document.getElementById(key+'-less')&&!!document.getElementById(key+'-more'),key+' has arrows and number input');
          document.getElementById(key+'-more').click();await tick();
          check(Math.abs(Number(document.getElementById(key).value)-before-step)<1e-6,key+' increases by its step');
          document.getElementById(key+'-less').click();await tick();
          check(Math.abs(Number(document.getElementById(key).value)-before)<1e-6,key+' decreases by its step');
          await enter(key,String(before+step));
          check(Number(document.getElementById(key).value)===Number((before+step).toFixed(2)),key+' commits on Enter');
        }
      }
      await navigate('layout');
      await enter('edgeGap','999');check(document.getElementById('edgeGap').value==='32'&&document.getElementById('edgeGap-more').disabled,'upper bound clamps and disables arrow');
      await enter('edgeGap','-20');check(document.getElementById('edgeGap').value==='0'&&document.getElementById('edgeGap-less').disabled,'lower bound clamps and disables arrow');
      await enter('hoverDelay','235');check(document.getElementById('hoverDelay').value==='240','typed number aligns with slider step');
      await enter('position','0.29');document.getElementById('position-more').click();await tick();check(document.getElementById('position').value==='0.3','decimal stepping has no floating point drift');
      await enter('edgeGap','');check(document.getElementById('edgeGap-number').getAttribute('aria-invalid')==='true'&&!document.getElementById('edgeGap-error').hidden&&document.getElementById('edgeGap').value==='0','empty input shows error and keeps saved setting');
      await enter('edgeGap','7');
      const input=document.getElementById('edgeGap-number');input.value='19';input.dispatchEvent(new Event('input',{bubbles:true}));
      check(document.getElementById('edgeGap').value==='7','typing alone does not commit');
      await window.hud.action('test-refresh');await tick();
      check(document.activeElement===input&&input.value==='19','state broadcast preserves numeric draft and focus');
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check(input.value==='7','Escape cancels numeric draft');
      const unsubmitted=document.getElementById('edgeGap-number');unsubmitted.focus();unsubmitted.value='23';unsubmitted.blur();
      // Hidden BrowserWindows do not emit native focusout when blurred.
      unsubmitted.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));check(unsubmitted.value==='7','leaving without Enter restores saved value');
      const slider=document.getElementById('edgeGap');slider.value='12';slider.dispatchEvent(new Event('input',{bubbles:true}));await tick();check(document.getElementById('edgeGap-number').value==='12','dragging updates numeric display');
      for(const page of ['appearance','layout','display','startup','sources','notifications','about']){await navigate(page);check(!!document.getElementById('reset-settings'),'global reset available on '+page);}
      await navigate('layout');document.getElementById('reset-settings').click();await tick();
      check(document.getElementById('edgeGap-number').value==='12'&&!document.getElementById('reset-settings').disabled,'cancelled reset keeps current settings and enables button');
      await window.hud.settings({opacity:70});
      await window.hud.action('test-confirm-reset','page');document.getElementById('reset-settings').click();await tick();
      check(document.getElementById('edgeGap-number').value==='8'&&document.getElementById('save-state').textContent==='已恢复「屏幕与布局」默认设置','page reset redraws current page and shows its scope');
      check((await window.hud.state()).settings.opacity===70,'page reset preserves other page values');
      await window.hud.action('test-confirm-reset','all');document.getElementById('reset-settings').click();await tick();
      check((await window.hud.state()).settings.opacity===96&&document.getElementById('save-state').textContent==='已恢复全部默认设置','full reset redraws defaults and shows its scope');
      return checks;
    }} )()`);
    for(const width of [800,890]){
      win.setSize(width,736);
      const fits=await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.range-control')).every(el=>{const r=el.getBoundingClientRect(),label=el.closest('.setting').firstElementChild.getBoundingClientRect();return r.right<=innerWidth-15&&label.right<=r.left;})`);
      if(!fits)throw new Error(`Slider controls overlap at ${width}px`);
      results.push(`controls fit ${width}px window`);
    }
    const png=await win.webContents.capturePage();fs.writeFileSync(path.join(root,'work','sliders-preview.png'),png.toPNG());
    fs.writeFileSync(path.join(root,'work','slider-test-result.json'),JSON.stringify({passed:results.length,checks:results,writes:writes.length},null,2));
    console.log(`PASS: ${results.length} UI checks; ${writes.length} isolated setting writes`);app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
});
