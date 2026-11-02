const fs=require('node:fs');
class SettingsStore{
  constructor(file,normalize,io=fs){this.file=file;this.normalize=normalize;this.io=io;this.revision=0;this.keys=new Set(Object.keys(normalize({})));}
  load(){
    const records=[];let existing=false;
    for(const file of [this.file,this.file+'.bak',this.file+'.tmp',this.file+'.bak.tmp']){
      if(!this.io.existsSync(file))continue;existing=true;
      try{
        const text=this.io.readFileSync(file,'utf8');if(text.length>65536)continue;
        const value=JSON.parse(text);
        if(!value||Array.isArray(value)||typeof value!=='object'||!Object.keys(value).some(k=>this.keys.has(k)))continue;
        records.push({value,revision:Number.isSafeInteger(value._savedAt)&&value._savedAt>=0?value._savedAt:0});
      }catch{}
    }
    records.sort((a,b)=>b.revision-a.revision);
    if(!records.length){if(existing)throw Error('无法恢复已保存的设置，原文件已保留');return this.normalize({});}
    this.revision=records[0].revision;return this.normalize(records[0].value);
  }
  save(settings){
    const value=this.normalize(settings);this.revision=Math.max(Date.now(),this.revision+1);
    const text=JSON.stringify({...value,_savedAt:this.revision},null,2);
    // Flush both copies before promoting either. Recovery chooses the newest valid record.
    this.io.writeFileSync(this.file+'.tmp',text,{encoding:'utf8',flush:true});
    this.io.writeFileSync(this.file+'.bak.tmp',text,{encoding:'utf8',flush:true});
    this.io.renameSync(this.file+'.bak.tmp',this.file+'.bak');
    this.io.renameSync(this.file+'.tmp',this.file);
  }
}
module.exports={SettingsStore};
