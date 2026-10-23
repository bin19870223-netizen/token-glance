let current;
const contents=new WeakMap();
let measuredWidth=0,measureFrame;
function measureDock(){
  cancelAnimationFrame(measureFrame);measureFrame=requestAnimationFrame(()=>{
    const horizontal=document.body.classList.contains('horizontal');
    const width=Math.ceil(agents.getBoundingClientRect().width+(horizontal?16:0)+2);
    if(width!==measuredWidth){measuredWidth=width;window.hud.action('dock-width',width);}
  });
}
function render(state){
  current=state;HUD.applyTheme(state);document.body.classList.toggle('horizontal',!['left','right'].includes(state.settings.edge));
  const ids=HUD.providerIds(state.settings),keys=ids.join(',');
  if(agents.dataset.keys!==keys){agents.innerHTML=ids.map(id=>`<button class="agent" data-agent="${id}"></button>`).join('');agents.dataset.keys=keys;}
  for(const id of ids){
    const button=agents.querySelector(`[data-agent="${id}"]`),p=state.providers[id],r=p.primary?.remaining,active=state.pinned&&state.panelAgent===id;
    const balance=p.balance?.balances?.[0],amount=balance?(balance.currency==='CNY'?'¥':'$')+Number(balance.total_balance).toLocaleString('zh-CN',{maximumFractionDigits:2}):null;
    button.classList.toggle('active',active);
    for(const [key,value] of Object.entries({'aria-label':`${p.name}，${amount!=null?'余额 '+amount:r==null?'用量未连接':Math.round(r)+'% 剩余'}`,'aria-expanded':String(active),title:`${p.name} · ${HUD.statusLabel(p)}`}))if(button.getAttribute(key)!==value)button.setAttribute(key,value);
    const content=HUD.ring(p,state.settings)+(state.settings.showNumbers?`<span class="percent mono" style="--ring-color:${HUD.color(r,true)}">${amount??(r==null?'—':Math.round(r)+'%')}</span>`:'');
    if(contents.get(button)!==content){button.innerHTML=content;contents.set(button,content);}
  }
  measureDock();
}
const agents=document.getElementById('agents');
agents.addEventListener('mouseover',e=>{const b=e.target.closest('[data-agent]');if(b&&!b.contains(e.relatedTarget))window.hud.action('hover',b.dataset.agent);});
agents.addEventListener('click',e=>{const b=e.target.closest('[data-agent]');if(b)window.hud.action('open',b.dataset.agent);});
document.body.addEventListener('mouseleave',()=>window.hud.action('leave'));
document.body.addEventListener('contextmenu',e=>{e.preventDefault();window.hud.action('settings');});
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.hud.action('close-panel');if(e.key===',')window.hud.action('settings');});
const grip=document.getElementById('grip');let dragging=false;
grip.addEventListener('pointerdown',e=>{dragging=true;grip.setPointerCapture(e.pointerId);window.hud.action('drag-start');});
grip.addEventListener('pointermove',()=>{if(dragging)window.hud.action('drag-move');});
grip.addEventListener('pointerup',()=>{if(dragging){dragging=false;window.hud.action('drag-end');}});
grip.addEventListener('lostpointercapture',()=>{if(dragging){dragging=false;window.hud.action('drag-end');}});
document.fonts.ready.then(measureDock);
window.hud.state().then(render);window.hud.subscribe(render);
