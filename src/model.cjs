const defaults = Object.freeze({
  theme:'dark', palette:'mint', customColor:'#73d9bd', edge:'left', position:0.48,
  displayId:null, edgeGap:8, showNumbers:true, showRing:true, showShort:true,
  ringSize:32, fontScale:100, opacity:96, glass:true, hoverDelay:220,
  alwaysOnTop:true, reducedMotion:false, refreshSeconds:60, alertEnabled:false,
  alertThreshold:15, startupMode:'manual', launchAtLogin:false, hotkey:'Control+Shift+Space',
  watchProcesses:{codex:'ChatGPT.exe, codex.exe',claude:'claude.exe',deepseek:'DeepSeek.exe'},
  agents:['codex'], chartDays:7
});
const settingsPages={
  appearance:{label:'外观',keys:['theme','palette','customColor','opacity','fontScale','glass','reducedMotion']},
  layout:{label:'屏幕与布局',keys:['edge','position','displayId','edgeGap','ringSize','hoverDelay','alwaysOnTop']},
  display:{label:'显示内容',keys:['showRing','showNumbers','showShort','chartDays']},
  startup:{label:'启动与运行',keys:['startupMode','launchAtLogin','watchProcesses']},
  sources:{label:'数据源',keys:['agents','refreshSeconds']},
  notifications:{label:'提醒与快捷键',keys:['alertEnabled','alertThreshold','hotkey']},
  about:{label:'关于',keys:[]}
};
function resetSettings(current,page){
  if(page==='all')return sanitizeSettings();
  if(!Object.hasOwn(settingsPages,page))throw new Error('Unknown settings page');
  const initial=sanitizeSettings();
  return sanitizeSettings({...current,...Object.fromEntries(settingsPages[page].keys.map(key=>[key,initial[key]]))});
}
function sanitizeSettings(input = {}) {
  const s={...defaults};
  for(const key of ['theme','palette','edge']) {
    const options={theme:['dark','light','system'],palette:['mint','blue','rose','gold','custom'],edge:['left','right','top','bottom','top-left','top-right','bottom-left','bottom-right']};
    if(options[key].includes(input[key])) s[key]=input[key];
  }
  for(const [key,min,max] of [['position',0,1],['edgeGap',0,32],['ringSize',24,44],['fontScale',85,125],['opacity',65,100],['hoverDelay',100,1000],['refreshSeconds',30,600],['alertThreshold',1,50]]) {
    if(Number.isFinite(input[key])) s[key]=Math.max(min,Math.min(max,input[key]));
  }
  for(const key of ['showNumbers','showRing','showShort','glass','alwaysOnTop','reducedMotion','alertEnabled','launchAtLogin']) if(typeof input[key]==='boolean') s[key]=input[key];
  s.startupMode=['manual','system','agents'].includes(input.startupMode)?input.startupMode:input.launchAtLogin?'system':'manual';
  s.launchAtLogin=s.startupMode!=='manual';
  s.watchProcesses={...defaults.watchProcesses};
  for(const id of ['codex','claude','deepseek']){
    const text=input.watchProcesses?.[id];
    if(typeof text==='string'&&text.length<=240){
      const names=text.split(/[,，;；]/).map(x=>x.trim()).filter(x=>/^[a-zA-Z0-9_.-]+\.exe$/i.test(x));
      if(names.length)s.watchProcesses[id]=[...new Set(names)].slice(0,8).join(', ');
    }
  }
  if(!s.showNumbers && !s.showRing) s.showRing=true;
  if(/^#[0-9a-f]{6}$/i.test(input.customColor || '')) s.customColor=input.customColor;
  if(typeof input.hotkey==='string' && input.hotkey.length<70 && /^(Control|Alt|Shift|Super|CommandOrControl|[A-Za-z0-9+ ])+$/.test(input.hotkey)) s.hotkey=input.hotkey;
  if(Number.isInteger(input.displayId)) s.displayId=input.displayId;
  if([1,7,30].includes(input.chartDays)) s.chartDays=input.chartDays;
  if(Array.isArray(input.agents)) s.agents=['codex', 'claude', 'deepseek'].filter(id=>input.agents.includes(id));
  if(!s.agents.length) s.agents=['codex'];
  return s;
}
function quota(window, index) {
  if(!window || !Number.isFinite(window.usedPercent)) return null;
  const mins=window.windowDurationMins;
  const label=mins===10080?'每周额度':mins===300?'5 小时额度':mins>=1440?`${mins/1440} 天额度`:mins>=60?`${mins/60} 小时额度`:'可用额度';
  return { id:String(index), label, minutes:mins || null, used:Math.max(0,Math.min(100,window.usedPercent)),
    remaining:Math.max(0,Math.min(100,100-window.usedPercent)), resetsAt:Number.isFinite(window.resetsAt)?window.resetsAt:null };
}
function snapshot(raw, previous, now=Date.now()) {
  const limits=raw.limits?.rateLimitsByLimitId?.codex ?? raw.limits?.rateLimits;
  const quotas=[quota(limits?.primary,0),quota(limits?.secondary,1)].filter(Boolean);
  const buckets=Array.isArray(raw.usage?.dailyUsageBuckets)?raw.usage.dailyUsageBuckets.filter(b=>/^\d{4}-\d{2}-\d{2}$/.test(b.startDate) && Number.isSafeInteger(b.tokens) && b.tokens>=0).map(b=>({date:b.startDate,tokens:b.tokens})):[];
  buckets.sort((a,b)=>a.date.localeCompare(b.date));
  const lifetime=raw.usage?.summary?.lifetimeTokens;
  const primary=quotas.length?[...quotas].sort((a,b)=>b.used-a.used)[0]:null;
  let burnRate=null;
  if(previous?.primary && primary && previous.primary.resetsAt===primary.resetsAt && previous.primary.minutes===primary.minutes) {
    burnRate=previous.burnRate??null;
    const hours=(now-previous.checkedAt)/3600000;
    if(hours>=1/12 && primary.used>=previous.primary.used) burnRate=(primary.used-previous.primary.used)/hours;
  }
  return { id:'codex', name:'Codex', connected:true, stale:false, checkedAt:now,
    quotas, primary, burnRate, plan:limits?.planType ?? raw.account?.account?.planType ?? '',
    resetCredits:raw.limits?.rateLimitResetCredits?.availableCount ?? null,
    lifetimeTokens:Number.isSafeInteger(lifetime)&&lifetime>=0?lifetime:null, buckets,
    sessions:(raw.threads?.data || []).filter(t=>/^[a-zA-Z0-9-]+$/.test(t.id)).slice(0,6)
      .map(t=>({id:t.id,title:t.name || '未命名会话',updatedAt:t.updatedAt,status:'unknown'}))
  };
}
function sampleUsage(previous,tokens,account,interval,now=Date.now(),continuous=true){
  if(!Number.isSafeInteger(tokens)||tokens<0||!account)return {usageSamples:[],sampledAccount:null};
  let samples=previous?.sampledAccount===account&&Array.isArray(previous.usageSamples)?previous.usageSamples.slice(-3000).filter(s=>Number.isFinite(s.at)&&s.at>now-25*3600000&&s.at<now&&Number.isSafeInteger(s.tokens)&&s.tokens>=0&&Number.isFinite(s.interval)&&s.interval>=30&&s.interval<=600):[];
  if(samples.length&&tokens<samples.at(-1).tokens)samples=[];
  samples.push({at:now,tokens,interval,continuous});
  return {usageSamples:samples,sampledAccount:account};
}
function dockBounds(area,s,count=1) {
  const vertical=s.edge==='left'||s.edge==='right';
  const itemLength=s.ringSize+(s.showNumbers?43:8);
  const width=vertical?Math.ceil(itemLength+16):Math.ceil(22+count*itemLength);
  const height=vertical?Math.ceil(22+count*(s.ringSize+12)):s.ringSize+24;
  const gap=s.edgeGap;
  if(s.edge.includes('-'))return {width,height,
    x:Math.round(s.edge.endsWith('right')?area.x+area.width-width-gap:area.x+gap),
    y:Math.round(s.edge.startsWith('bottom')?area.y+area.height-height-gap:area.y+gap)};
  return { width,height,
    x:Math.round(vertical?(s.edge==='left'?area.x+gap:area.x+area.width-width-gap):area.x+(area.width-width)*s.position),
    y:Math.round(vertical?area.y+(area.height-height)*s.position:(s.edge==='top'?area.y+gap:area.y+area.height-height-gap)) };
}
function panelBounds(dock,area,edge,width,height) {
  let x=dock.x+dock.width+8,y=dock.y;
  if(edge==='right') x=dock.x-width-8;
  if(edge==='top') {x=dock.x; y=dock.y+dock.height+8;}
  if(edge==='bottom') {x=dock.x; y=dock.y-height-8;}
  if(edge.includes('-')){
    x=edge.endsWith('right')?dock.x+dock.width-width:dock.x;
    y=edge.startsWith('bottom')?dock.y-height-8:dock.y+dock.height+8;
  }
  return {width,height,x:Math.round(Math.max(area.x,Math.min(area.x+area.width-width,x))),y:Math.round(Math.max(area.y,Math.min(area.y+area.height-height,y)))};
}
module.exports={defaults,sanitizeSettings,settingsPages,resetSettings,snapshot,sampleUsage,dockBounds,panelBounds};
