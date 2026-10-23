const https=require('node:https');
const {TrafficMonitor}=require('./traffic.cjs');
function apiKey(value){
  if(typeof value!=='string'||!/^sk-[A-Za-z0-9_-]{8,250}$/.test(value.trim()))throw Error('请填写有效的 DeepSeek 官方 API Key');
  return value.trim();
}
function emptyBalance(){return {id:'deepseek',name:'DeepSeek',kind:'balance',connected:false,primary:null,quotas:[],sessions:[],balance:null,error:''};}
function parseBalance(raw,now=Date.now()){
  if(typeof raw?.is_available!=='boolean'||!Array.isArray(raw.balance_infos)||!raw.balance_infos.length||raw.balance_infos.length>2)throw Error('DeepSeek 返回的余额信息无效');
  const seen=new Set(),balances=raw.balance_infos.map(row=>{
    if(!['CNY','USD'].includes(row.currency)||seen.has(row.currency))throw Error('DeepSeek 返回的币种无效');seen.add(row.currency);
    const result={currency:row.currency};
    for(const key of ['total_balance','granted_balance','topped_up_balance']){
      if(typeof row[key]!=='string'||! /^-?\d{1,12}(?:\.\d{1,8})?$/.test(row[key]))throw Error('DeepSeek 返回的余额数值无效');
      result[key]=row[key];
    }return result;
  });
  return {...emptyBalance(),connected:true,checkedAt:now,stale:false,plan:'官方 API 余额 · 5 分钟更新',balance:{available:raw.is_available,balances}};
}
function readBalance(value,request=https.request){
  const key=apiKey(value);
  return new Promise((resolve,reject)=>{
    let timer,done=false;
    const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(data);};
    const req=request('https://api.deepseek.com/user/balance',{method:'GET',headers:{Authorization:'Bearer '+key,Accept:'application/json'},timeout:10000},res=>{
      if(res.statusCode!==200){res.destroy();finish(Error(res.statusCode===401||res.statusCode===403?'DeepSeek 密钥无效或没有访问权限':`DeepSeek 余额服务暂不可用（HTTP ${res.statusCode}）`));return;}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>65536){finish(Error('DeepSeek 余额响应过大'));res.destroy();}else chunks.push(Buffer.from(chunk));});
      res.once('error',()=>finish(Error('DeepSeek 余额响应中断')));
      res.once('aborted',()=>finish(Error('DeepSeek 余额响应中断')));
      res.once('end',()=>{try{finish(null,parseBalance(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch{finish(Error('DeepSeek 返回的余额信息无效'));}});
    });
    const timeout=()=>{finish(Error('DeepSeek 余额查询超时，请检查网络'));req.destroy();};
    timer=setTimeout(timeout,10000);req.once('timeout',timeout);req.once('error',()=>finish(Error('DeepSeek 余额连接失败，请检查网络')));req.end();
  });
}
class DeepSeekMonitor extends TrafficMonitor{
  constructor(file,secure,read=readBalance){super(file,secure,read);this.data=emptyBalance();}
  async configure(value){
    const key=apiKey(value);
    if(!this.secure?.isEncryptionAvailable())throw Error('Windows 本机加密暂不可用，无法保存 API Key');
    const generation=++this.generation,data=await this.read(key);
    if(generation!==this.generation)throw Error('连接已取消，请重试');
    const fs=require('node:fs');fs.writeFileSync(this.file+'.tmp',this.secure.encryptString(key));fs.renameSync(this.file+'.tmp',this.file);this.data=data;
  }
  clear(){super.clear();this.data=emptyBalance();}
  async refresh(){await super.refresh();if(!this.data.connected&&this.data.balance)this.data={...this.data,stale:true};}
}
module.exports={apiKey,emptyBalance,parseBalance,readBalance,DeepSeekMonitor};
