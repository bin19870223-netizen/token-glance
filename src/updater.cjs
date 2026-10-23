const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {createHash,randomUUID}=require('node:crypto');
const repo='bin19870223-netizen/token-glance',releaseBase='https://github.com/'+repo+'/releases/';
const assetName='token-glance-update.json',limit=16*1024*1024;
const hash=data=>createHash('sha256').update(data).digest('hex');
function version(value){if(typeof value!=='string'||!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value))throw Error('更新版本格式无效');return value.split('.').map(Number);}
function newer(a,b){const x=version(a),y=version(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
function updatePath(value){return typeof value==='string'&&(value==='package.json'||/^src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:cjs|js|css|html|png|svg|txt|cs)$/.test(value))&&!value.split('/').some(p=>p==='.'||p==='..');}
function get(url,max=limit,redirects=0){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw Error('更新下载地址不受信任');
  return new Promise((resolve,reject)=>{
    let done=false,timer;
    const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(data);};
    const req=https.get(u,{headers:{'User-Agent':'Token-Glance-Updater','Accept':'application/vnd.github+json'},timeout:30000},res=>{
      if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.destroy();if(redirects>=4){finish(Error('更新下载跳转过多'));return;}try{get(new URL(res.headers.location,u).href,max,redirects+1).then(b=>finish(null,b),finish);}catch(e){finish(e);}return;}
      if(res.statusCode!==200){res.destroy();finish(Error(res.statusCode===403||res.statusCode===429?'GitHub 查询频率受限，请稍后重试':`更新服务暂不可用（HTTP ${res.statusCode}）`));return;}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>max){finish(Error('更新数据超过大小限制'));res.destroy();}else chunks.push(Buffer.from(chunk));});
      res.once('error',()=>finish(Error('更新下载中断')));res.once('aborted',()=>finish(Error('更新下载中断')));res.once('end',()=>finish(null,Buffer.concat(chunks)));
    });
    const timeout=()=>{finish(Error('检查或下载更新超时'));req.destroy();};timer=setTimeout(timeout,60000);req.once('timeout',timeout);req.once('error',()=>finish(Error('无法连接 GitHub，请检查网络')));
  });
}
function compatibility(root){
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const textHash=file=>hash(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
  return {electron:pkg.devDependencies.electron,lock:textHash(path.join(root,'package-lock.json')),native:Object.fromEntries(['AgentUsageWatcher.cs','FullscreenState.cs'].map(f=>[f,textHash(path.join(root,'src',f))]))};
}
function validateBundle(raw,expected,root){
  if(raw?.format!==1||raw.version!==expected||!Array.isArray(raw.files)||raw.files.length<2||raw.files.length>500)throw Error('更新包格式无效');version(raw.version);
  const local=compatibility(root);
  if(JSON.stringify(raw.compatibility)!==JSON.stringify(local))throw Error('新版需要升级运行环境，请从发布页手动安装');
  const files=new Map();let total=0;
  for(const entry of raw.files){
    if(!updatePath(entry.path)||files.has(entry.path.toLowerCase())||typeof entry.content!=='string'||entry.content.length>limit*2||! /^[A-Za-z0-9+/]*={0,2}$/.test(entry.content)||! /^[a-f0-9]{64}$/.test(entry.sha256))throw Error('更新文件列表无效');
    const data=Buffer.from(entry.content,'base64');total+=data.length;
    if(data.toString('base64')!==entry.content||entry.size!==data.length||total>limit||hash(data)!==entry.sha256)throw Error('更新文件校验失败');
    files.set(entry.path.toLowerCase(),{path:entry.path,data});
  }
  for(const file of ['package.json','src/main.cjs','src/updater.cjs','src/model.cjs','src/preload.cjs','src/ui/settings.html','src/ui/dock.html','src/ui/panel.html'])if(!files.has(file))throw Error('更新包缺少必要文件');
  const pkg=JSON.parse(files.get('package.json').data.toString('utf8'));
  if(pkg.name!=='token-glance'||pkg.main!=='src/main.cjs'||pkg.version!==expected||pkg.devDependencies?.electron!==local.electron)throw Error('更新包程序信息不匹配');
  for(const [name,digest] of Object.entries(local.native))if(hash((files.get('src/'+name.toLowerCase())?.data||Buffer.alloc(0)).toString('utf8').replace(/\r\n/g,'\n'))!==digest)throw Error('新版需要升级本机辅助程序，请手动安装');
  return [...files.values()];
}
function plainDirectory(directory){if(fs.lstatSync(directory).isSymbolicLink()||!fs.statSync(directory).isDirectory())throw Error('更新目录不能是链接');}
class AppUpdater{
  constructor(root,notify=()=>{},fetch=get){this.root=root;this.notify=notify;this.fetch=fetch;this.current=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;this.state={current:this.current,status:'idle',message:'尚未检查更新'};this.busy=false;this.candidate=null;this.staged=null;}
  set(status,message,extra={}){this.state={...this.state,status,message,...extra};this.notify();}
  async check(autoDownload=false){
    if(this.busy||this.state.status==='ready')return;this.busy=true;this.set('checking','正在检查 GitHub 更新…');
    try{
      const releases=JSON.parse((await this.fetch('https://api.github.com/repos/'+repo+'/releases?per_page=20',2*1024*1024)).toString('utf8'));
      if(!Array.isArray(releases))throw Error('更新服务返回格式无效');
      const list=releases.filter(r=>!r.draft&&/^v\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(r.tag_name||'')).sort((a,b)=>newer(a.tag_name.slice(1),b.tag_name.slice(1))?-1:1);
      const release=list[0];
      if(!release||!newer(release.tag_name.slice(1),this.current)){this.set('current','当前已是最新发布版本');return;}
      const latest=release.tag_name.slice(1),url=releaseBase+'tag/'+release.tag_name;
      const asset=release.assets?.find(a=>a.name===assetName&&a.state==='uploaded');
      if(!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||'')||!Number.isSafeInteger(asset.size)||asset.size<1||asset.size>limit||asset.browser_download_url!==releaseBase+'download/'+release.tag_name+'/'+assetName){this.set('manual','发现新版，但尚未提供兼容的自动更新包',{latest,url});return;}
      this.candidate={version:latest,asset};this.set('available','发现新版本 '+latest,{latest,url});
    }catch(e){this.set('error',e.message.startsWith('更新')||e.message.includes('GitHub')||e.message.includes('超时')?e.message:'检查更新失败，请稍后重试');}
    finally{this.busy=false;}
    if(autoDownload&&this.state.status==='available')await this.download();
  }
  async download(){
    if(this.busy||!this.candidate||this.state.status!=='available')return;this.busy=true;this.set('downloading','正在下载并校验更新…');
    try{
      const {asset,version:latest}=this.candidate,bytes=await this.fetch(asset.browser_download_url);
      if(bytes.length!==asset.size||'sha256:'+hash(bytes)!==asset.digest)throw Error('更新包校验失败，请重新下载');
      const files=validateBundle(JSON.parse(bytes.toString('utf8')),latest,this.root);
      const runtime=path.join(this.root,'runtime');plainDirectory(this.root);plainDirectory(runtime);
      const updates=path.join(runtime,'updates');fs.mkdirSync(updates,{recursive:true});plainDirectory(updates);
      const stage=path.join(updates,latest+'-'+randomUUID());fs.mkdirSync(stage);
      for(const file of files){const target=path.join(stage,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,file.data,{flag:'wx'});}
      this.staged=stage;this.manifest=JSON.parse(bytes.toString('utf8'));this.set('ready','更新已就绪，重启后应用');
    }catch(e){this.set(e.message.includes('手动安装')?'manual':'error',e.message.startsWith('更新')||e.message.includes('手动安装')||e.message.includes('GitHub')||e.message.includes('超时')?e.message:'下载更新失败，请重试');}
    finally{this.busy=false;}
  }
  apply(){
    if(this.busy||this.state.status!=='ready'||!this.staged)throw Error('尚无可安装的更新');
    const stage=this.staged;plainDirectory(this.root);plainDirectory(path.join(this.root,'runtime'));plainDirectory(path.join(this.root,'runtime','updates'));plainDirectory(stage);plainDirectory(path.join(this.root,'src'));plainDirectory(path.join(stage,'src'));
    for(const file of validateBundle(this.manifest,this.candidate.version,this.root)){
      let directory=path.dirname(path.join(stage,file.path));while(directory!==stage){plainDirectory(directory);directory=path.dirname(directory);}
      const target=path.join(stage,file.path);if(fs.lstatSync(target).isSymbolicLink()||hash(fs.readFileSync(target))!==hash(file.data))throw Error('待安装文件校验失败，请重新下载');
    }
    const backup=stage+'-backup';fs.mkdirSync(backup);const moved=[];
    try{
      for(const name of ['src','package.json']){
        const target=path.join(this.root,name),saved=path.join(backup,name);if(fs.lstatSync(target).isSymbolicLink())throw Error('更新目标不能是链接');
        fs.renameSync(target,saved);moved.push({name,installed:false});fs.renameSync(path.join(stage,name),target);moved.at(-1).installed=true;
      }
      this.set('installed','更新已应用，正在重启…');return backup;
    }catch(error){
      for(const move of moved.reverse()){if(move.installed)fs.renameSync(path.join(this.root,move.name),path.join(stage,move.name));fs.renameSync(path.join(backup,move.name),path.join(this.root,move.name));}
      this.set('error','更新未完成，已恢复原版本');throw Error('更新未完成，已恢复原版本');
    }
  }
}
module.exports={AppUpdater,get,hash,newer,updatePath,compatibility,validateBundle,assetName};
