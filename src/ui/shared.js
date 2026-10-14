const icons={
  hud:'<rect x="3" y="5" width="18" height="14" rx="6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
  settings:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3Z"/><circle cx="12" cy="12" r="3"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',minimize:'<path d="M5 12h14"/>',
  pin:'<path d="m8 3 8 0-1 6 3 4H6l3-4-1-6ZM12 13v8"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
  appearance:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>',
  layout:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4v16"/>',
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  agents:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  arrow:'<path d="m9 5 7 7-7 7"/>',external:'<path d="M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  check:'<path d="m5 12 4 4 10-10"/>',grip:'<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  keyboard:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8"/>',
  moon:'<path d="M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11Z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  power:'<path d="M12 2v10M6 5a9 9 0 1 0 12 0"/>'
};
function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.hud}</svg>`;}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function number(value){if(!Number.isFinite(value))return '—';return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value);}
const palettes={mint:'#73d9bd',blue:'#88b7f3',rose:'#e7a0b4',gold:'#dec27a'};
const lightPalettes={mint:'#137c66',blue:'#245c9d',rose:'#a54868',gold:'#876210'};
function applyTheme(state){
  const s=state.settings;document.documentElement.classList.toggle('light',!state.dark);document.documentElement.classList.toggle('reduce-motion',s.reducedMotion);
  const accent=s.palette==='custom'?s.customColor:(state.dark?palettes:lightPalettes)[s.palette];
  const rgb=accent.slice(1).match(/../g).map(x=>parseInt(x,16)).join(',');
  const style=document.documentElement.style;
  style.setProperty('--accent',accent);style.setProperty('--accent-rgb',rgb);style.setProperty('--opacity',s.glass?s.opacity/100:1);style.setProperty('--scale',s.fontScale/100);style.setProperty('--ring-size',s.ringSize+'px');
  style.setProperty('--accent-ink',state.dark?'#0a2920':'#ffffff');
}
function color(remaining){return remaining==null?'var(--subtle)':remaining<=10?'#f28e8e':remaining<=30?'#e8c16c':'var(--accent)';}
function ring(provider,settings){const remaining=provider.primary?.remaining;return `<span class="ring ${remaining==null?'unknown':''} ${settings.showRing?'':'hide-ring'}" style="--ring-offset:${remaining==null?100:100-remaining};--ring-color:${color(remaining)}"><svg viewBox="0 0 40 40"><circle class="track" cx="20" cy="20" r="17" pathLength="100"/><circle class="fill" cx="20" cy="20" r="17" pathLength="100"/></svg><img class="agent-logo ${provider.id}" src="assets/${provider.id==='codex'?'chatgpt':provider.id}.png" alt=""></span>`;}
function countdown(timestamp){if(!Number.isFinite(timestamp))return '重置时间未知';const mins=Math.max(0,Math.ceil((timestamp*1000-Date.now())/60000));if(!mins)return '等待额度更新';if(mins>=1440)return `${Math.floor(mins/1440)} 天 ${Math.floor(mins%1440/60)} 小时后重置`;return `${Math.floor(mins/60)} 小时 ${mins%60} 分后重置`;}
function quotas(provider,settings,used=false){const rows=provider.quotas.filter(q=>settings.showShort||q.minutes>300);return rows.map(q=>`<div class="quota-row"><div class="between"><span class="quota-label">${esc(q.label)}</span><span class="quota-value mono" style="--quota-color:${color(q.remaining)}">${Math.round(used?q.used:q.remaining)}<small>%</small></span></div><div class="quota-track"><div class="quota-fill" style="--fill:${used?q.used:q.remaining}%;--quota-color:${color(q.remaining)}"></div></div><div class="between quota-sub"><span>${used?'已使用':'剩余额度'}</span><span>${countdown(q.resetsAt)}</span></div></div>`).join('');}
function chartData(provider,days,now=Date.now()){
  if(days===1){
    const start=now-24*3600000;
    const slots=Array.from({length:24},(_,i)=>({at:start+i*3600000,tokens:null}));
    const samples=Array.isArray(provider.usageSamples)?provider.usageSamples:[];let observed=0;
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i];
      if(![a,b].every(s=>s&&Number.isFinite(s.at)&&Number.isSafeInteger(s.tokens)&&s.tokens>=0&&Number.isFinite(s.interval)&&s.interval>=30&&s.interval<=600))continue;
      const duration=b.at-a.at,delta=b.tokens-a.tokens;
      if(b.continuous===false||a.at<start||b.at>now||duration<=0||duration>Math.max(a.interval,b.interval)*2000+10000||!Number.isSafeInteger(delta)||delta<0)continue;
      const first=Math.max(0,Math.floor((a.at-start)/3600000)),last=Math.min(23,Math.floor((b.at-start)/3600000));
      for(let j=first;j<=last;j++)slots[j].tokens??=0;
      slots[last].tokens+=delta;observed+=duration;
    }
    return {slots:observed?slots:[],total:observed?slots.reduce((sum,b)=>sum+(b.tokens??0),0):null,start,end:now,hourly:true,observed};
  }
  if(!provider.buckets?.length)return {slots:[],total:null,start:'',end:''};
  const latest=provider.buckets.at(-1).date;const end=new Date(latest+'T12:00:00Z');const slots=[];
  for(let i=days-1;i>=0;i--){const day=new Date(end);day.setUTCDate(end.getUTCDate()-i);const date=day.toISOString().slice(0,10);slots.push({date,tokens:provider.buckets.find(b=>b.date===date)?.tokens??null});}
  return {slots,total:slots.reduce((s,b)=>s+(b.tokens??0),0),start:slots[0].date,end:latest};
}
function chartHTML(data){
  const max=Math.max(1,...data.slots.map(b=>b.tokens||0));
  const time=at=>new Date(at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  return `<div class="chart">${data.slots.map(b=>`<div class="bar ${b.tokens==null?'missing':''}" title="${esc(data.hourly?time(b.at):b.date)} · ${b.tokens==null?'无数据':new Intl.NumberFormat('zh-CN').format(b.tokens)+' tokens'}" style="--height:${b.tokens==null?2:Math.max(2,b.tokens/max*100)}%"></div>`).join('')}</div><div class="between chart-labels"><span>${data.hourly?time(data.start):data.start.slice(5).replace('-',' / ')}</span><span>${data.hourly?'最近 24 小时':`截至 ${data.end.slice(5).replace('-',' / ')} · 按日`}</span></div>`;
}
function statusLabel(p){return p.stale?'上次记录':p.connected?(p.source==='file'?'文件快照':'已连接'):'未连接';}
window.HUD={icon,esc,number,applyTheme,color,ring,countdown,quotas,chartData,chartHTML,statusLabel};
