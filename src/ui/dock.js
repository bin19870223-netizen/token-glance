let current;
function render(state){
  current=state;HUD.applyTheme(state);document.body.classList.toggle('horizontal',!['left','right'].includes(state.settings.edge));
  document.getElementById('agents').innerHTML=state.settings.agents.map(id=>{const p=state.providers[id];const r=p.primary?.remaining;return `<button class="agent ${state.pinned&&state.panelAgent===id?'active':''}" data-agent="${id}" aria-label="${p.name}，${r==null?'用量未连接':Math.round(r)+'% 剩余'}" aria-expanded="${state.pinned&&state.panelAgent===id}" title="${p.name} · ${HUD.statusLabel(p)}">${HUD.ring(p,state.settings)}${state.settings.showNumbers?`<span class="percent mono" style="--ring-color:${HUD.color(r)}">${r==null?'—':Math.round(r)+'%'}</span>`:''}</button>`;}).join('');
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
window.hud.state().then(render);window.hud.subscribe(render);
