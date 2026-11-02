const $=id=>document.getElementById(id);
let current,page='appearance',dragging=false,saveTimer,trafficBusy=false,trafficMessage='',deepseekBusy=false,deepseekMessage='';
const pages={appearance:['外观','安静一点，也可以很漂亮。','appearance'],layout:['屏幕与布局','贴着屏幕边缘，留出你的工作空间。','layout'],display:['显示内容','只留下你想一眼看到的信息。','activity'],startup:['启动与运行','和你的 Agent 一起出现，用完就轻轻退场。','power'],sources:['数据源','真实用量，清楚知道它从哪里来。','agents'],notifications:['提醒与快捷键','需要的时候出现，其余时间保持安静。','bell'],about:['关于','Your agents, at a glance.','info']};
$('brand').innerHTML=HUD.icon('hud');$('minimize').innerHTML=HUD.icon('minimize');$('close').innerHTML=HUD.icon('close');
$('navigation').innerHTML=Object.entries(pages).map(([id,[label,,ico]])=>`<button data-page="${id}" class="${id===page?'active':''}">${HUD.icon(ico)}<span>${label}</span></button>`).join('');
function row(label,description,control){return `<div class="setting"><div><div class="setting-label">${label}</div>${description?`<div class="setting-description">${description}</div>`:''}</div><div class="control">${control}</div></div>`;}
function toggle(key,label,description){return row(label,description,`<button class="switch ${current.settings[key]?'on':''}" role="switch" aria-checked="${current.settings[key]}" aria-label="${label}" data-toggle="${key}"></button>`);}
function range(key,label,description,min,max,unit,step=1){
  const value=current.settings[key],shown=Number(value.toFixed(2));
  return row(label,description,`<div class="range-control"><div class="range-fields"><button id="${key}-less" class="range-arrow less" data-step="${key}" data-direction="-1" aria-label="减小${label}" title="减少 ${step}${unit}" ${value<=min?'disabled':''}>${HUD.icon('arrow')}</button><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-range="${key}" aria-label="${label}"><button id="${key}-more" class="range-arrow" data-step="${key}" data-direction="1" aria-label="增大${label}" title="增加 ${step}${unit}" ${value>=max?'disabled':''}>${HUD.icon('arrow')}</button><label class="range-number"><input id="${key}-number" type="number" min="${min}" max="${max}" step="${step}" value="${shown}" data-number="${key}" aria-label="${label}数值" aria-describedby="${key}-error" title="输入数字后按 Enter 确定（${min}–${max}，步长 ${step}）"><span>${unit.trim()}</span></label></div><span id="${key}-error" class="range-error" role="alert" hidden>请输入有效数字</span></div>`);
}
function rangeValue(input,raw){
  if(String(raw).trim()===''||!Number.isFinite(Number(raw)))return null;
  const min=Number(input.min),max=Number(input.max),step=Number(input.step);
  const value=Math.min(max,Math.max(min,Number(raw)));
  return Number(Math.min(max,Math.max(min,min+Math.round((value-min)/step)*step)).toFixed(2));
}
function syncRange(key,value){
  $(key).value=value;$(`${key}-number`).value=Number(value.toFixed(2));
  $(`${key}-less`).disabled=value<=Number($(key).min);
  $(`${key}-more`).disabled=value>=Number($(key).max);
  $(`${key}-number`).removeAttribute('aria-invalid');$(`${key}-error`).hidden=true;
}
function saveRange(key,value){syncRange(key,value);current.settings[key]=value;return patch({[key]:value});}
function select(key,label,description,options){return row(label,description,`<select id="${key}" data-setting="${key}" aria-label="${label}">${options.map(([v,l])=>`<option value="${HUD.esc(v)}" ${String(current.settings[key])===String(v)?'selected':''}>${HUD.esc(l)}</option>`).join('')}</select>`);}
function heading(text){return `<h3 class="group-heading">${text}</h3>`;}
function card(html){return `<div class="card">${html}</div>`;}
function preview(){const p=current.providers.codex,s=current.settings;return `<div class="preview"><div class="preview-dock">${HUD.ring(p,s)}${s.showNumbers?`<strong class="mono">${p.primary?Math.round(p.primary.remaining)+'%':'—'}</strong>`:''}<span class="preview-divider"></span><img src="assets/claude.png" class="agent-logo" alt="Claude" style="opacity:.45"><img src="assets/deepseek.png" class="agent-logo" alt="DeepSeek" style="opacity:.45"></div><div class="preview-label"><h3>低调地，待在一旁。</h3><p>预览使用当前 Codex 用量。<br>未连接的 Agent 显示为灰色。</p></div></div>`;}
function appearance(){
  const s=current.settings;
  return preview()+heading('主题')+`<div class="theme-grid">${[['light','浅色','sun'],['dark','深色','moon'],['system','跟随系统','monitor']].map(([id,label])=>`<button class="theme-choice ${s.theme===id?'active':''}" data-value="${id}" data-key="theme"><div class="theme-scene ${id}-scene"><div class="mini-window"></div></div><div class="between"><span>${label}</span><span class="check">${HUD.icon('check')}</span></div></button>`).join('')}</div>`+
  heading('界面配色')+card(row('一点颜色，刚刚好','用于额度圆环、图表与选中状态。','')+`<div class="palette-grid">${[['mint','薄荷绿'],['blue','冰川蓝'],['rose','玫瑰粉'],['gold','香槟金']].map(([id,label])=>`<button class="palette-choice ${s.palette===id?'active':''}" data-key="palette" data-value="${id}"><span class="row"><span class="swatch" style="--swatch:${palettes[id]}"><i></i><i></i></span>${label}</span>${HUD.icon('check')}</button>`).join('')}</div>`+row('自定义颜色','选择自己的强调色。',`<button class="button" data-key="palette" data-value="custom">${s.palette==='custom'?'使用中':'使用自定义'}</button><input type="color" id="customColor" data-setting="customColor" aria-label="自定义强调色" value="${s.customColor}">`))+
  heading('材质与文字')+card(toggle('glass','半透明材质','让贴边条和面板轻轻融入桌面。')+range('opacity','面板不透明度','较高的不透明度让文字更清楚。',65,100,'%')+range('fontScale','字号缩放','调整 HUD 面板的文字大小。',85,125,'% ',5)+toggle('reducedMotion','减少动态效果','关闭圆环与界面的过渡动画。'));
}
function layout(){const s=current.settings;const corner=s.edge.includes('-');return heading('屏幕位置')+card(select('displayId','所在显示器',current.displayMissing?'选定屏幕暂未就绪，临时显示在主屏；连接后自动恢复。':'重启后记住屏幕，副屏稍后连接时自动恢复。',[...(current.displayMissing?[[s.displayId,'上次选定屏幕 · 暂未连接']]:[]),...current.displays.map(d=>[d.id,d.name+(d.primary?' · 主屏幕':'')])])+row('停靠位置','选择屏幕四边或四角。',`<div class="choice-row position-choices">${[['left','左','左侧'],['top','上','上侧'],['right','右','右侧'],['bottom','下','下侧'],['top-left','左上','左上角'],['top-right','右上','右上角'],['bottom-left','左下','左下角'],['bottom-right','右下','右下角']].map(([id,label,name])=>`<button data-key="edge" data-value="${id}" class="${s.edge===id?'active':''}" aria-label="停靠${name}" aria-pressed="${s.edge===id}">${label}</button>`).join('')}</div>`)+(corner?row('四角定位','圆环条横向排列，展开面板朝屏幕内侧打开。',''):range('position','沿边缘的位置','从边缘起点到终点。',0,1,'',.01))+range('edgeGap','边缘留白','让 HUD 与屏幕边缘保留一点呼吸感。',0,32,'px'))+heading('大小与交互')+card(range('ringSize','圆环大小','同时调整贴边条的尺寸。',24,44,'px')+range('hoverDelay','悬停展开延迟','减少路过 HUD 时的误触。',100,1000,'ms',20)+toggle('alwaysOnTop','始终置顶','普通应用上方显示，独占全屏游戏时暂停置顶。'))+`<p class="section-note">四角位置会避开任务栏，距离可用「边缘留白」调整。拖住贴边条的短线可重新停靠到四边。点击圆环固定面板；Esc 收起。</p>`;}
function display(){return heading('贴边条')+card(toggle('showRing','显示额度圆环','圆环越满，剩余额度越多。')+toggle('showNumbers','显示剩余百分比','圆环旁直接显示数值。'))+heading('展开面板')+card(toggle('showShort','显示短周期额度','仅在数据源返回对应额度时显示。')+select('chartDays','默认图表周期','24 小时为本机采样，7 / 30 天为账号按日汇总。',[[1,'最近 24 小时（本机采样）'],[7,'最近 7 天'],[30,'最近 30 天']]))+`<p class="section-note">没有返回的额度或 Token 显示为「—」。账号额度与 Token 消耗分别统计，不互相换算。开机与跟随设置在「启动与运行」。</p>`;}
function startup(){
  const mode=current.settings.startupMode;
  const enabled=current.settings.agents.map(id=>current.providers[id].name).join('、');
  return heading('启动方式')+card(select('startupMode','何时启动','按你的工作习惯选择。',[['manual','仅手动启动'],['system','随 Windows 启动'],['agents','随监控的 Agent 启动']]))+
    `<p class="section-note">${mode==='agents'?`当前跟随：${HUD.esc(enabled)}。登录 Windows 后仅启动小型监听器，每 5 秒检测一次。Agent 启动后显示用量伴侣；所有监控对象退出后，界面和用量连接自动退出。` : mode==='system'?'登录 Windows 后直接显示贴边条。你之前的开机启动选择已保留。':'需要时通过启动快捷方式手动打开。'}</p>`+
    heading('识别监控对象')+card(['codex','claude','deepseek'].map(id=>row(current.providers[id].name+' 进程',current.settings.agents.includes(id)?'已在「数据源」中启用监控。':'未启用监控，不会触发启动。',`<input type="text" id="watch-${id}" data-watch-process="${id}" value="${HUD.esc(current.settings.watchProcesses[id])}" aria-label="${current.providers[id].name} 进程名称">`)).join(''))+
    `<p class="section-note">填写 exe 文件名，多个名称用逗号分隔；不要填写路径或命令。Codex 会区分官方桌面应用与本工具自己的只读连接。Claude Code 的 Node 版按专用命令路径识别。这里的进程识别只控制启动，不会改变数据源的连接能力。</p>`;
}
function sources(){
  const providerRows=Object.entries(current.providers).filter(([id])=>id!=='airport').map(([id,p])=>`<div class="setting source-row"><div class="source-text"><img src="${HUD.logo(id)}" class="agent-logo ${id}" alt=""><div><div class="setting-label">${p.name} <span class="badge">${HUD.statusLabel(p)}</span></div><div class="setting-description">${id==='deepseek'&&current.deepseek?.configured?'官方 API 余额 · 5 分钟更新':id==='codex'?'本机 Codex 只读接口 · 额度、Token、会话':current.sources[id]?'本地 JSON 快照 · 5 分钟后标为旧数据':'本地 JSON 快照 · 尚未配置'}</div></div></div><div class="control">${id!=='codex'?`<button class="button" data-source="${id}">选择文件</button>`:''}<button role="switch" class="switch ${current.settings.agents.includes(id)?'on':''}" aria-checked="${current.settings.agents.includes(id)}" aria-label="显示 ${p.name}" data-agent="${id}"></button></div></div>`).join('');
  return heading('监视的 Agent')+card(providerRows)+deepseekSettings()+trafficSettings()+heading('同步')+card(select('refreshSeconds','自动刷新','只读取用量，不触发模型请求。',[[30,'每 30 秒'],[60,'每分钟'],[120,'每 2 分钟'],[300,'每 5 分钟'],[600,'每 10 分钟']])+row('立即同步',current.connectionError||'使用 Codex 当前登录的账号。',`<button class="button" id="refresh-data" ${current.refreshing?'disabled':''}>${current.refreshing?'同步中…':'刷新用量'}</button>`))+
  `<p class="section-note">Claude 使用文件适配器；DeepSeek 可连接官方 API 余额或选择本地快照。JSON 可提供 primary / secondary（usedPercent、windowDurationMins、resetsAt）、lifetimeTokens 和 dailyUsageBuckets。不会读取浏览器 Cookie、密码或其他软件保存的 API Key。</p>`;
}
function deepseekSettings(){
  const configured=!!current.deepseek?.configured;
  return heading('DeepSeek · 官方 API 余额')+card('<div class="traffic-connection"><label for="deepseek-key" class="setting-label">DeepSeek API Key</label><input id="deepseek-key" type="password" autocomplete="off" spellcheck="false" aria-label="DeepSeek API Key" placeholder="'+(configured?'已加密保存；填写新密钥可替换':'在本机粘贴 sk- 开头的官方 API Key')+'"><div class="row gap8"><button class="button" id="deepseek-connect" '+(deepseekBusy?'disabled':'')+'>'+(deepseekBusy?'正在验证…':'保存并连接')+'</button>'+(configured?'<button class="button" id="deepseek-clear" '+(deepseekBusy?'disabled':'')+'>移除 API 连接</button>':'')+'</div><p class="setting-description" role="status">'+HUD.esc(deepseekMessage||current.providers.deepseek?.error||(configured?'已加密保存，每 5 分钟查询官方余额。':'仅查询 api.deepseek.com 的余额；密钥在本机 Windows 加密保存。'))+'</p><p class="setting-description">显示充值余额与赠送余额。官方余额接口不提供 Token 消耗明细。</p></div>');
}
async function connectDeepSeek(clear=false){
  if(deepseekBusy)return;
  const input=$('deepseek-key'),value=clear?'':input.value;
  if(!clear&&!value.trim()){deepseekMessage='请先填写 DeepSeek API Key';render(current);return;}
  deepseekBusy=true;deepseekMessage='';input.value='';input.blur();render(current);
  try{const result=await window.hud.action(clear?'deepseek-clear':'deepseek-connect',value);deepseekMessage=result.ok?(clear?'已移除本机 API Key':'连接成功，已显示 DeepSeek 余额'):result.message;current=await window.hud.state();}
  catch{deepseekMessage='DeepSeek 连接失败，请稍后重试';}
  finally{deepseekBusy=false;render(current);}
}
function trafficSettings(){
  const configured=!!current.traffic?.configured;
  return heading('机场流量 · 白月光')+card(toggle('showTraffic','在贴边条显示流量','独立于 Agent 监控列表，悬停查看流量明细。')+'<div class="traffic-connection"><label for="traffic-link" class="setting-label">原始订阅链接</label><input id="traffic-link" type="password" autocomplete="off" spellcheck="false" aria-label="白月光订阅链接" placeholder="'+(configured?'已加密保存；填写新链接可替换':'粘贴白月光后台的 HTTPS 原始订阅链接')+'"><div class="row gap8"><button class="button" id="traffic-connect" '+(trafficBusy?'disabled':'')+'>'+(trafficBusy?'正在验证…':'保存并连接')+'</button>'+(configured?'<button class="button" id="traffic-clear" '+(trafficBusy?'disabled':'')+'>移除连接</button>':'')+'</div><p id="traffic-message" class="setting-description" role="status">'+HUD.esc(trafficMessage||current.providers.airport?.error||(configured?'已保存订阅，流量每 5 分钟更新。':'链接仅在本机 Windows 加密保存，不会显示或写入日志。'))+'</p></div>');
}
async function connectTraffic(clear=false){
  if(trafficBusy)return;
  const input=$('traffic-link'),value=clear?'':input.value;
  if(!clear&&!value.trim()){trafficMessage='请先填写原始订阅链接';render(current);return;}
  trafficBusy=true;trafficMessage='';input.value='';input.blur();render(current);
  try{const result=await window.hud.action(clear?'traffic-clear':'traffic-connect',value);trafficMessage=result.ok?(clear?'已移除本机订阅链接':'连接成功，已在贴边条显示流量'):result.message;current=await window.hud.state();}
  catch{trafficMessage='连接失败，请检查链接或网络后重试';}
  finally{trafficBusy=false;render(current);}
}
function notifications(){return heading('低额度提醒')+card(toggle('alertEnabled','额度不足时提醒','达到阈值时发送一次安静的系统通知。')+range('alertThreshold','剩余额度阈值','仅在跨过阈值时提醒。',1,50,'%'))+heading('机场流量告警')+card(toggle('trafficAlertsEnabled','启用机场流量告警','30 分钟新增 ≥20 GiB，或套餐已用达到 80% / 95%。同周期不重复提醒。')+row('游戏与全屏时静默',current.trafficAlerts?.error||(current.trafficAlerts?.quiet?'当前静默：告警先记录，返回桌面后再合并提醒。':'仅发送无声系统通知，不打开窗口、不切换焦点。'),'<span class="badge">始终启用</span>')+row('待提醒',(current.trafficAlerts?.pending||0)+' 条 · 最近告警保存在本机', ''))+(current.trafficAlerts?.recent?.length?card(current.trafficAlerts.recent.slice().reverse().map(e=>row(new Date(e.at).toLocaleString('zh-CN'),HUD.esc(e.body),HUD.esc(e.status))).join('')):'')+heading('快捷键')+card(row('展开 / 收起 HUD','支持 Control、Shift、Alt 与按键组合。',`<input id="hotkey" type="text" data-setting="hotkey" value="${HUD.esc(current.settings.hotkey)}" aria-label="HUD 快捷键">`))+(current.hotkeyError?`<p class="error">${HUD.esc(current.hotkeyError)}</p>`:'')+heading('随手操作')+card(row('悬停圆环','临时展开用量面板。',HUD.icon('info'))+row('点击圆环','固定面板，再点一次收起。',HUD.icon('pin'))+row('右键贴边条','直接打开偏好设置。',HUD.icon('settings')))+`<p class="section-note">审批卡片与任务完成提醒尚未接入。本版本不会替你批准操作。</p>`;}
function updatesSettings(){
  const u=current.updates||{status:'idle',message:'尚未检查更新'},busy=['checking','downloading','installed'].includes(u.status);
  return heading('软件更新')+card(toggle('autoUpdate','自动检查并下载更新','启动后与运行期间定期检查；重启安装由你决定。')+row('当前版本','v'+(current.appVersion||'0.1.3')+(u.latest?' · 可用版本 v'+u.latest:''),'<button class="button" id="update-check" '+(busy?'disabled':'')+'>检查更新</button>')+row('更新状态',u.message,'<div class="row gap8">'+(u.status==='available'?'<button class="button" id="update-download">下载更新</button>':'')+(u.status==='ready'?'<button class="button" id="update-install">重启并更新</button>':'')+(u.url?'<button class="button" id="update-release">查看发布页</button>':'')+'</div>'))+'<p class="section-note">从本项目 GitHub Releases 下载兼容更新包，校验后保留旧程序备份。设置、用量记录及本机加密的密钥不会被替换。运行环境发生变化时需手动安装。</p>';
}
function about(){return `<div class="about-logo"><div class="brand-mark">${HUD.icon('hud')}</div><div><h2>Token Glance</h2><p>Windows · v${HUD.esc(current.appVersion||'0.1.3')}</p></div></div>`+card(`<div class="about-text"><strong>让用量待在视线边缘。</strong><br>一个安静的 Windows 桌面用量助手。悬停查看，点击固定，拖动停靠。<br><br>交互参考 jazzenchen / agent-hud-open；设置布局参考 CyclicRedundancyCHK / session-model-usage。独立实现，非 OpenAI 官方产品。</div>`)+updatesSettings()+heading('数据与边界')+card(row('本地保存','设置、缓存和运行数据保存在应用目录下的 runtime 文件夹。','')+row('只读连接','调用 Codex 官方 app-server 的用量与会话列表接口。不会发起模型任务或消耗重置券。','')+row('当前支持','Codex 账号额度、按日 Token 活动、最近会话跳转。其他 Agent 支持本地快照。','')+row('尚未支持','实时审批、任务运行状态、逐会话 Token 分项。',''))+heading('运行')+card(row('结束运行','退出后会关闭贴边条、面板及其只读连接。',`<button class="button" id="quit-app">退出 Token Glance</button>`));}
const renderers={appearance,layout,display,startup,sources,notifications,about};
function render(state){
  current=state;HUD.applyTheme(state);
  const updateReady=current.updates?.status==='ready',updateAvailable=['available','manual'].includes(current.updates?.status);
  document.querySelector('.version').textContent='v'+(current.appVersion||'0.1.3')+' · '+(updateReady?'更新已就绪':updateAvailable?'有新版本':'社区版本');
  $('sidebar-status').textContent=state.providers.codex.connected?'Codex 已连接':'Codex 等待连接';$('sidebar-dot').classList.toggle('offline',!state.providers.codex.connected);
  if(dragging||document.activeElement?.dataset.number||['traffic-link','deepseek-key'].includes(document.activeElement?.id))return;
  const focus=document.activeElement?.id;
  $('page-title').textContent=pages[page][0];$('page-subtitle').textContent=pages[page][1];
  $('page').innerHTML=renderers[page]();
  if(focus&&$(focus))$(focus).focus();
}
async function patch(value){
  $('save-state').textContent='保存中…';
  try{const result=await window.hud.settings(value);current=result;$('save-state').textContent='已保存';$('save-state').classList.add('saved');clearTimeout(saveTimer);saveTimer=setTimeout(()=>{$('save-state').textContent='自动保存';$('save-state').classList.remove('saved');},1800);return result;}
  catch{$('save-state').textContent='保存失败，请重试';}
}
document.addEventListener('click',e=>{
  const arrow=e.target.closest('[data-step]');
  if(arrow){const key=arrow.dataset.step,input=$(key);saveRange(key,rangeValue(input,Number(input.value)+Number(arrow.dataset.direction)*Number(input.step)));}
  const nav=e.target.closest('[data-page]');if(nav){page=nav.dataset.page;document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b===nav);b.setAttribute('aria-current',b===nav?'page':'false');});$('page').parentElement.scrollTop=0;render(current);}
  const t=e.target.closest('[data-toggle]');if(t)patch({[t.dataset.toggle]:!current.settings[t.dataset.toggle]});
  const c=e.target.closest('[data-key]');if(c)patch({[c.dataset.key]:c.dataset.value});
  const a=e.target.closest('[data-agent]');if(a){let agents=current.settings.agents.filter(id=>id!==a.dataset.agent);if(!current.settings.agents.includes(a.dataset.agent))agents.push(a.dataset.agent);patch({agents});}
  const f=e.target.closest('[data-source]');if(f)window.hud.action('pick-source',f.dataset.source);
  if(e.target.closest('#deepseek-connect'))connectDeepSeek();
  if(e.target.closest('#deepseek-clear'))connectDeepSeek(true);
  if(e.target.closest('#traffic-connect'))connectTraffic();
  if(e.target.closest('#traffic-clear'))connectTraffic(true);
  if(e.target.closest('#refresh-data'))window.hud.action('refresh');
  const update=e.target.closest('[id^="update-"]');if(update&&['update-check','update-download','update-install','update-release'].includes(update.id))window.hud.action(update.id).catch(()=>{});
  if(e.target.closest('#quit-app'))window.hud.action('quit');
});
document.addEventListener('pointerdown',e=>{if(e.target.matches('input[type=range]'))dragging=true;});
document.addEventListener('input',e=>{
  if(e.target.dataset.range)saveRange(e.target.dataset.range,Number(e.target.value));
  if(e.target.dataset.number){e.target.removeAttribute('aria-invalid');$(`${e.target.dataset.number}-error`).hidden=true;}
});
document.addEventListener('focusout',e=>{if(e.target.dataset.number)syncRange(e.target.dataset.number,current.settings[e.target.dataset.number]);});
document.addEventListener('change',e=>{
  const agent=e.target.dataset.watchProcess;
  if(agent)patch({watchProcesses:{...current.settings.watchProcesses,[agent]:e.target.value}});
  const key=e.target.dataset.setting;
  if(key)patch({[key]:['displayId','chartDays','refreshSeconds'].includes(key)?Number(e.target.value):e.target.value});
  if(e.target.dataset.range){dragging=false;saveRange(e.target.dataset.range,Number(e.target.value)).then(()=>render(current));}
});
document.addEventListener('pointerup',()=>{if(dragging){dragging=false;setTimeout(()=>render(current),50);}});
$('close').onclick=()=>window.hud.action('close-settings');$('minimize').onclick=()=>window.hud.action('minimize');$('show-hud').onclick=()=>window.hud.action('open','codex');
$('reset-settings').onclick=async()=>{
  const button=$('reset-settings');button.disabled=true;
  try{
    const result=await window.hud.action('reset-settings',page);
    if(result){document.activeElement?.blur();dragging=false;render(result);$('save-state').textContent=result.resetScope==='all'?'已恢复全部默认设置':`已恢复「${pages[result.resetScope][0]}」默认设置`;$('save-state').classList.add('saved');clearTimeout(saveTimer);}
  }catch{$('save-state').textContent='重置失败，请重试';}
  finally{button.disabled=false;}
};
document.addEventListener('keydown',e=>{
  if(e.target.id==='deepseek-key'&&e.key==='Enter'){e.preventDefault();connectDeepSeek();return;}
  if(e.target.id==='traffic-link'&&e.key==='Enter'){e.preventDefault();connectTraffic();return;}
  const key=e.target.dataset.number;
  if(key&&e.key==='Enter'){
    e.preventDefault();const value=rangeValue($(key),e.target.value);
    if(value===null){e.target.setAttribute('aria-invalid','true');$(`${key}-error`).hidden=false;return;}
    saveRange(key,value);e.target.select();
  }
  if(e.key==='Escape'){if(key){syncRange(key,current.settings[key]);e.target.blur();}else window.hud.action('close-settings');}
});
window.hud.state().then(render);window.hud.subscribe(render);
