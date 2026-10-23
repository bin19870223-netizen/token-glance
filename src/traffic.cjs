const fs=require('node:fs');
const https=require('node:https');

function subscriptionURL(value){
  if(typeof value!=='string'||value.length>4096)throw Error('请填写白月光的 HTTPS 订阅链接');
  let url;try{url=new URL(value.trim());}catch{throw Error('订阅链接格式不正确');}
  const supportedHost=['asiassn.com','qinyues4.cc'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
  if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||!supportedHost)throw Error('请使用白月光的 HTTPS 原始订阅链接（asiassn.com 或 qinyues4.cc 及其子域名）');
  return url;
}
function parseTraffic(header,now=Date.now()){
  if(typeof header!=='string'||header.length>2048)throw Error('订阅未返回流量信息，请使用原始 Clash / Mihomo 订阅链接');
  const values={};
  for(const part of header.split(';')){
    const match=part.trim().match(/^(upload|download|total|expire)\s*=\s*(\d+)$/i);
    if(match){const key=match[1].toLowerCase(),value=Number(match[2]);if(key in values||!Number.isSafeInteger(value))throw Error('订阅返回的流量数据无效');values[key]=value;}
  }
  if(!['upload','download','total'].every(key=>Number.isSafeInteger(values[key])))throw Error('订阅流量信息不完整');
  const used=values.upload+values.download,total=values.total||null;
  if(!Number.isSafeInteger(used)||values.expire>253402300799)throw Error('订阅返回的流量数据无效');
  const remaining=total===null?null:Math.max(0,total-used);
  return {id:'airport',name:'白月光流量',kind:'traffic',connected:true,stale:false,checkedAt:now,error:'',plan:'订阅流量 · 5 分钟更新',
    primary:total===null?null:{remaining:remaining/total*100},quotas:[],sessions:[],
    traffic:{upload:values.upload,download:values.download,used,total,remaining,expiresAt:values.expire>0?values.expire:null}};
}
function readTraffic(value,request=https.request,redirects=0){
  const url=subscriptionURL(value);
  return new Promise((resolve,reject)=>{
    let timer;
    const req=request(url,{method:'GET',headers:{'User-Agent':'clash.meta','Accept':'*/*'},timeout:10000},res=>{
      clearTimeout(timer);
      const status=res.statusCode,location=res.headers.location,header=res.headers['subscription-userinfo'];
      // Only headers are used. Never read or save proxy nodes from the response body.
      res.destroy();
      if(status>=300&&status<400&&location){
        try{const next=new URL(location,url);if(redirects>=2||next.origin!==url.origin)throw Error('订阅发生跨站跳转，请使用本站原始订阅链接');resolve(readTraffic(subscriptionURL(next.href).href,request,redirects+1));}catch(error){reject(error);}return;
      }
      if(status!==200){reject(Error(status===401||status===403?'订阅链接已失效或没有访问权限':`订阅服务暂不可用（HTTP ${status}）`));return;}
      try{resolve(parseTraffic(header));}catch(error){reject(error);}
    });
    const timeout=()=>{reject(Error('流量查询超时，请稍后重试'));req.destroy();};
    timer=setTimeout(timeout,10000);
    req.once('timeout',timeout);
    req.once('error',()=>{clearTimeout(timer);reject(Error('流量查询连接失败，请检查网络或稍后重试'));});
    req.end();
  });
}
function emptyTraffic(){return {id:'airport',name:'白月光流量',kind:'traffic',connected:false,stale:false,primary:null,quotas:[],sessions:[],error:'',traffic:null};}
class TrafficMonitor{
  constructor(file,secure,read=readTraffic){this.file=file;this.secure=secure;this.read=read;this.data=emptyTraffic();this.loading=false;this.generation=0;}
  configured(){return fs.existsSync(this.file);}
  async configure(value){
    const url=subscriptionURL(value).href;
    if(!this.secure?.isEncryptionAvailable())throw Error('Windows 本机加密暂不可用，无法保存订阅链接');
    // Validate against the service before replacing an existing working connection.
    const generation=++this.generation,data=await this.read(url),encrypted=this.secure.encryptString(url);
    if(generation!==this.generation)throw Error('连接已取消，请重试');
    fs.writeFileSync(this.file+'.tmp',encrypted);fs.renameSync(this.file+'.tmp',this.file);this.data=data;
  }
  clear(){this.generation++;for(const file of [this.file,this.file+'.tmp'])if(fs.existsSync(file))fs.unlinkSync(file);this.data=emptyTraffic();}
  async refresh(){
    if(!this.configured()||this.loading)return;
    this.loading=true;const generation=this.generation;
    try{
      if(!this.secure?.isEncryptionAvailable())throw Error('Windows 本机加密暂不可用，请重新连接');
      let url;try{url=this.secure.decryptString(fs.readFileSync(this.file));}catch{throw Error('本机订阅无法解密，请重新连接');}
      const data=await this.read(url);if(generation===this.generation)this.data=data;
    }catch(error){if(generation===this.generation)this.data={...this.data,connected:false,stale:!!this.data.traffic,error:error.message};}
    finally{this.loading=false;}
  }
}
module.exports={subscriptionURL,parseTraffic,readTraffic,emptyTraffic,TrafficMonitor};
