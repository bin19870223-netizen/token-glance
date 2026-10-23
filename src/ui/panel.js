let current,tab='overview',used=false,trafficHours=24;
const el=id=>document.getElementById(id);
const planNames={prolite:'Pro Lite',pro:'ChatGPT Pro',plus:'ChatGPT Plus',team:'ChatGPT Business',enterprise:'ChatGPT Enterprise',free:'ChatGPT Free'};
el('pin').innerHTML=HUD.icon('pin');el('refresh').innerHTML=HUD.icon('refresh');el('close').innerHTML=HUD.icon('close');el('settings').innerHTML=HUD.icon('settings');el('sessions-shortcut').innerHTML=HUD.icon('activity');
function render(state){
  current=state;HUD.applyTheme(state);const p=state.providers[state.panelAgent];
  el('agent-name').textContent=p.name;el('agent-logo').src=HUD.logo(p.id);el('agent-logo').className='agent-logo '+p.id;
  el('plan').textContent=planNames[p.plan]||p.plan||'用量监视器';el('connection').innerHTML=`<i class="dot ${p.connected&&!p.stale?'':'offline'}"></i>${HUD.statusLabel(p)}`;
  document.querySelector('[data-tab="sessions"]').hidden=['traffic','balance'].includes(p.kind);el('sessions-shortcut').hidden=['traffic','balance'].includes(p.kind);el('mode').hidden=['traffic','balance'].includes(p.kind);
  el('pin').classList.toggle('selected',state.pinned);el('pin').setAttribute('aria-pressed',state.pinned);el('refresh').disabled=state.refreshing;
  el('updated').textContent=p.checkedAt?`${p.stale?'上次记录':'更新于'} ${new Date(p.checkedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`:'等待首次连接';
  if(p.kind==='balance'){tab='overview';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='overview'));el('refresh').disabled=!!state.deepseek?.loading;el('content').innerHTML=balanceHTML(p);return;}
  if(p.kind==='traffic'){tab='overview';el('refresh').disabled=!!state.traffic?.loading;el('content').innerHTML=trafficHTML(p);return;}
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));el('mode').textContent=used?'已用 %':'剩余 %';
  const content=el('content');
  if(tab==='sessions'){
    content.innerHTML=p.sessions?.length?p.sessions.map(s=>`<button class="session" data-thread="${HUD.esc(s.id)}"><div><div class="session-title">${HUD.esc(s.title)}</div><div class="session-date">${new Date(s.updatedAt*1000).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>${HUD.icon('arrow')}</button>`).join('')+'<p class="session-note">点击会话回到 Codex。运行和审批状态尚未接入。</p>':'<div class="empty">'+HUD.icon('activity')+'<p>暂无会话记录</p></div>';
    return;
  }
  if(!p.connected&&!p.primary){content.innerHTML=`<div class="empty">${HUD.icon('agents')}<p>${p.id==='codex'?'等待 Codex 连接':'还没有连接 '+p.name}</p><small>${p.id==='codex'?'使用本机 Codex 的现有登录，无需 API Key。':'在设置 → 数据源中选择用量快照。'}</small></div>`;return;}
  const data=HUD.chartData(p,state.settings.chartDays);
  content.innerHTML=(p.stale?'<div class="offline-note">连接暂不可用，以下是上次记录。</div>':'')+HUD.quotas(p,state.settings,used)+(p.quotas.length?'':'<div class="offline-note">此数据源没有返回额度信息。</div>')+`<div class="between chart-head"><h3>Token 活动</h3><span class="chart-total mono">${HUD.number(data.total)} <small>tokens</small></span></div><div class="between chart-controls"><small>${data.hourly?'本机采样 · 按小时':'账号 · 按日统计'}</small><div class="segmented"><button data-days="1" class="${state.settings.chartDays===1?'active':''}">24 小时</button><button data-days="7" class="${state.settings.chartDays===7?'active':''}">7 天</button><button data-days="30" class="${state.settings.chartDays===30?'active':''}">30 天</button></div></div>`+(data.slots.length?HUD.chartHTML(data):'<div class="empty">'+(data.hourly?(p.id==='codex'?'尚未获得 24 小时采样<br><small>从本次更新起累计，未采集时段无数据。</small>':'此数据源暂无小时明细'):'暂无 Token 活动数据')+'</div>')+`<div class="between lifetime"><span>账号累计</span><strong class="mono">${HUD.number(p.lifetimeTokens)} tokens</strong></div><div class="between lifetime"><span>额度消耗速率</span><strong class="mono">${p.burnRate==null?'采样中':p.burnRate.toFixed(1)+'% / 小时'}</strong></div><p class="chart-note">${data.hourly?'已采样 '+Math.floor(data.observed/3600000)+' 小时 '+Math.floor(data.observed/60000)%60+' 分钟 / 24 小时。仅统计观测到的累计增量，接口延迟更新会集中显示在读到的小时，不能还原实际发生时间；未运行或连接中断时段不补算。':'Token 为账号记录，日数据可能延迟。'} ${p.burnRate==null?'额度消耗速率在至少 5 分钟采样后显示。 ':''}额度与 Token 分别统计。</p>`;
}
function balanceHTML(p){
  if(!p.balance)return '<div class="empty"><p>'+HUD.esc(p.error||'尚未连接 DeepSeek API')+'</p><small>在设置 → 数据源中填写官方 API Key。</small></div>';
  const money=(v,c)=>HUD.esc((c==='CNY'?'¥':'$')+v);
  return (p.error?'<div class="offline-note">'+HUD.esc(p.error)+'。以下为上次记录。</div>':'')+p.balance.balances.map(b=>'<div class="quota-row"><div class="between"><span class="quota-label">可用余额 · '+b.currency+'</span><strong class="quota-value">'+money(b.total_balance,b.currency)+'</strong></div></div>'+[['充值余额',b.topped_up_balance],['赠送余额',b.granted_balance]].map(([label,value])=>'<div class="between lifetime"><span>'+label+'</span><strong>'+money(value,b.currency)+'</strong></div>').join('')).join('')+'<p class="chart-note">'+(p.balance.available?'账户有可用余额。':'账户暂无可用余额。')+'来自 DeepSeek 官方余额接口，每 5 分钟更新。此接口未提供 Token 消耗明细。</p>';
}
function recentTrafficHTML(p){
  const now=p.checkedAt||Date.now(),r=p.recentUsage?.find(r=>r.hours===trafficHours)||{hours:trafficHours,observed:0,start:now-trafficHours*3600000,end:now,slots:[]};
  const data={...r,metric:'bytes',hourly:true,slots:r.slots?.length?r.slots:Array.from({length:trafficHours},(_,i)=>({at:r.start+i*3600000,bytes:null}))};
  return '<div class="between chart-head"><h3>流量活动</h3><span class="chart-total mono">'+(r.observed?HUD.bytes(r.used):'—')+'</span></div><div class="between chart-controls"><small>本机采样 · 按小时</small><div class="segmented" aria-label="流量统计时段">'+[6,12,24].map(h=>'<button data-traffic-hours="'+h+'" class="'+(h===trafficHours?'active':'')+'" aria-pressed="'+(h===trafficHours)+'">'+h+' 小时</button>').join('')+'</div></div>'+HUD.chartHTML(data)+'<p class="chart-note">已采样 '+Math.floor(r.observed/3600000)+' 小时 '+Math.floor(r.observed/60000)%60+' 分钟 / '+trafficHours+' 小时。'+HUD.esc(p.historyError||'每 5 分钟采样；增量计入采样结束所在小时。未采集时段显示为无数据，不补算历史。')+'</p>';
}

function trafficHTML(p){
  const t=p.traffic;
  if(!t)return '<div class="empty">'+HUD.icon('agents')+'<p>'+HUD.esc(p.error||'尚未连接白月光流量')+'</p><small>在设置 → 数据源中填写本站原始订阅链接。</small></div>';
  const remaining=p.primary?.remaining;
  return (p.error?'<div class="offline-note">'+HUD.esc(p.error)+'。以下为上次记录。</div>':'')+'<div class="quota-row"><div class="between"><span class="quota-label">剩余流量</span><strong class="quota-value" style="--quota-color:'+HUD.color(remaining,true)+'">'+HUD.bytes(t.remaining)+'</strong></div><div class="quota-track"><div class="quota-fill" style="--fill:'+(remaining??0)+'%;--quota-color:'+HUD.color(remaining)+'"></div></div><div class="between quota-sub"><span>已用 '+HUD.bytes(t.used)+'</span><span>总量 '+HUD.bytes(t.total)+'</span></div></div>'+[['上传',HUD.bytes(t.upload)],['下载',HUD.bytes(t.download)],['到期时间',t.expiresAt?new Date(t.expiresAt*1000).toLocaleString('zh-CN'):'订阅未提供到期时间']].map(([label,value])=>'<div class="between lifetime"><span>'+label+'</span><strong>'+value+'</strong></div>').join('')+recentTrafficHTML(p)+'<p class="chart-note">来自订阅服务的流量统计，每 5 分钟更新。流量单位为二进制；套餐重置规则以白月光后台为准。</p>';
}
document.addEventListener('click',e=>{
  const hours=e.target.closest('[data-traffic-hours]');if(hours){const value=Number(hours.dataset.trafficHours);if([6,12,24].includes(value)){trafficHours=value;render(current);}}
  const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render(current);}
  const d=e.target.closest('[data-days]');if(d)window.hud.settings({chartDays:Number(d.dataset.days)});
  const s=e.target.closest('[data-thread]');if(s)window.hud.action('thread',s.dataset.thread);
});
el('pin').onclick=()=>window.hud.action('pin');el('refresh').onclick=()=>window.hud.action('refresh');el('close').onclick=()=>window.hud.action('close-panel');el('settings').onclick=()=>window.hud.action('settings');
el('sessions-shortcut').onclick=()=>{tab=tab==='sessions'?'overview':'sessions';render(current);};el('mode').onclick=()=>{used=!used;render(current);};
document.body.onmouseenter=()=>window.hud.action('panel-enter');document.body.onmouseleave=()=>window.hud.action('leave');
document.onkeydown=e=>{if(e.key==='Escape')window.hud.action('close-panel');};
window.hud.state().then(render);window.hud.subscribe(render);
