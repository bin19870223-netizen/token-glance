const fs=require('node:fs');
const day=24*3600000,maxGap=15*60000;
function validSegment(s){return s&&Number.isSafeInteger(s.start)&&s.start>0&&Number.isSafeInteger(s.end)&&s.end>s.start&&s.end-s.start<=maxGap&&['upload','download'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0)&&Number.isSafeInteger(s.upload+s.download);}
function summaries(segments,now){
  return [6,12,24].map(hours=>{
    const rows=segments.filter(s=>validSegment(s)&&s.start>=now-hours*3600000&&s.end<=now);
    const upload=rows.reduce((n,s)=>n+s.upload,0),download=rows.reduce((n,s)=>n+s.download,0);
    const start=now-hours*3600000,slots=Array.from({length:hours},(_,i)=>({at:start+i*3600000,bytes:null}));
    for(const row of rows){
      const first=Math.max(0,Math.floor((row.start-start)/3600000)),last=Math.min(hours-1,Math.floor((row.end-start-1)/3600000));
      for(let i=first;i<=last;i++)slots[i].bytes??=0;
      slots[last].bytes+=row.upload+row.download;
    }
    return {hours,upload,download,used:upload+download,observed:rows.reduce((n,s)=>n+s.end-s.start,0),start,end:now,slots};
  });
}
class TrafficHistory{
  constructor(file){this.file=file;this.baseline=null;this.segments=[];try{if(fs.statSync(file).size<=1024*1024){const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(raw))this.segments=raw.filter(validSegment).slice(-4096);}}catch{}}
  reset(){this.baseline=null;this.segments=[];for(const file of [this.file,this.file+'.tmp'])if(fs.existsSync(file))fs.unlinkSync(file);}
  interrupt(){this.baseline=null;}
  sample(data){
    const now=data.checkedAt,t=data.traffic,old=this.baseline;
    this.segments=this.segments.filter(s=>s.end>now-day&&s.end<=now);
    if(old){
      const elapsed=now-old.at,upload=t.upload-old.upload,download=t.download-old.download;
      if(elapsed>=60000&&elapsed<=maxGap&&upload>=0&&download>=0&&t.total===old.total&&t.expiresAt===old.expiresAt){
        this.segments.push({start:old.at,end:now,upload,download});this.baseline=null;
      }else if(elapsed<0||elapsed>maxGap||upload<0||download<0||t.total!==old.total||t.expiresAt!==old.expiresAt)this.baseline=null;
    }
    if(!this.baseline)this.baseline={at:now,upload:t.upload,download:t.download,total:t.total,expiresAt:t.expiresAt};
    this.segments=this.segments.slice(-4096);
    fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.segments));fs.renameSync(this.file+'.tmp',this.file);
    return summaries(this.segments,now);
  }
}
module.exports={TrafficHistory,summaries};
