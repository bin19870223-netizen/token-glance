const fs=require('node:fs');
const minute=60000,GiB=1024**3;
class TrafficAlerts{
  constructor(file){
    this.file=file;this.sending=false;this.state={samples:[],warned80:false,warned95:false,lastSpikeAt:0,pending:[],recent:[]};
    try{if(fs.statSync(file).size<131072){const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(raw?.format===1){
      this.state.warned80=raw.warned80===true;this.state.warned95=raw.warned95===true;
      this.state.lastSpikeAt=Number.isFinite(raw.lastSpikeAt)?raw.lastSpikeAt:0;
      const last=raw.lastReading;if(last&&['at','used','upload','download'].every(k=>Number.isSafeInteger(last[k])&&last[k]>=0))this.state.lastReading={at:last.at,used:last.used,upload:last.upload,download:last.download,total:last.total,expiresAt:last.expiresAt};
      this.state.pending=Array.isArray(raw.pending)?raw.pending.filter(e=>e&&['80','95','spike'].includes(e.key)&&Number.isFinite(e.at)&&typeof e.body==='string'&&e.body.length<500).slice(-3):[];
      this.state.recent=Array.isArray(raw.recent)?raw.recent.filter(e=>e&&Number.isFinite(e.at)&&typeof e.body==='string'&&e.body.length<500).slice(-20):[];
    }}}catch{}
    // Never infer a 30-minute spike across a restart or disconnected interval.
    this.state.samples=[];
  }
  save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify({format:1,...this.state}));fs.renameSync(this.file+'.tmp',this.file);}
  reset(){this.state={samples:[],warned80:false,warned95:false,lastSpikeAt:0,pending:[],recent:[]};this.save();}
  enqueue(key,body,at){
    const event={key,body,at,deferred:false};this.state.pending=this.state.pending.filter(e=>e.key!==key);this.state.pending.push(event);
    this.state.recent.push({...event,status:'待提醒'});this.state.recent=this.state.recent.slice(-20);
  }
  observe(provider,enabled,now=Date.now()){
    const s=this.state,t=provider?.traffic;
    if(!enabled){s.samples=[];s.pending=[];this.save();return;}
    if(!provider?.connected||provider.stale||!t){s.samples=[];return;}
    const last=s.samples.at(-1)||s.lastReading,point={at:now,used:t.used,upload:t.upload,download:t.download,total:t.total,expiresAt:t.expiresAt};
    if(![point.used,point.upload,point.download].every(n=>Number.isSafeInteger(n)&&n>=0))return;
    if(last&&(point.upload<last.upload||point.download<last.download||point.total!==last.total||point.expiresAt!==last.expiresAt))this.reset();
    const previous=this.state.samples.at(-1);
    if(previous&&(now<=previous.at||now-previous.at>15*minute))this.state.samples=[];
    this.state.samples=this.state.samples.filter(p=>p.at>=now-30*minute);
    this.state.samples.push(point);this.state.samples=this.state.samples.slice(-62);
    this.state.lastReading=point;
    const current=this.state,pct=t.total>0?t.used/t.total*100:null,first=current.samples[0];
    if(pct!==null&&pct>=95&&!current.warned95){this.enqueue('95',`套餐已用 ${pct.toFixed(1)}%，已达到 95% 告警线。`,now);current.warned95=current.warned80=true;current.pending=current.pending.filter(e=>e.key!=='80');for(const event of current.recent)if(event.key==='80'&&event.status==='待提醒')event.status='已合并至 95% 告警';}
    else if(pct!==null&&pct>=80&&!current.warned80){this.enqueue('80',`套餐已用 ${pct.toFixed(1)}%，已达到 80% 告警线。`,now);current.warned80=true;}
    const delta=point.used-first.used;
    if(now>first.at&&delta>=20*GiB&&(!current.lastSpikeAt||now-current.lastSpikeAt>=30*minute)){
      this.enqueue('spike',`最近 ${(now-first.at)/minute|0} 分钟观测到新增 ${(delta/GiB).toFixed(2)} GiB（30 分钟告警窗口，阈值 20 GiB）。`,now);current.lastSpikeAt=now;
    }
    this.save();
  }
  async flush(quiet,send,enabled,now=Date.now()){
    if(this.sending)return;
    const current=this.state;current.pending=current.pending.filter(e=>now-e.at<24*60*minute&&e.at<=now);
    if(!enabled){if(current.pending.length){current.pending=[];this.save();}return;}
    if(!current.pending.length)return;
    if(quiet){if(current.pending.some(e=>!e.deferred)){for(const e of current.pending)e.deferred=true;this.save();}return;}
    const pending=current.pending.map(e=>({...e}));this.sending=true;
    try{
      const shown=await send({title:pending.some(e=>e.deferred)?'机场流量告警 · 静默期间记录':'机场流量告警',body:pending.map(e=>e.body).join('\n'),silent:true});
      if(shown&&this.state===current){current.pending=current.pending.filter(e=>!pending.some(p=>p.key===e.key&&p.at===e.at));for(const e of current.recent)if(pending.some(p=>p.key===e.key&&p.at===e.at))e.status='已通知';this.save();}
    }finally{this.sending=false;}
  }
  view(){return {pending:this.state.pending.length,recent:this.state.recent.slice(-5)};}
}
module.exports={TrafficAlerts};
