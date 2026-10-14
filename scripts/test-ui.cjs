const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const temp=path.join(root,'work','slider-test-runtime','temp');
fs.mkdirSync(temp,{recursive:true});
process.env.electron_config_cache=process.env.electron_config_cache||path.join(root,'work','electron-download-cache');
process.env.TEMP=temp;process.env.TMP=temp;
// Electron GUI executables need an explicit wait to propagate test failures on Windows.
for(const file of ['settings-ui.cjs','panel-ui.cjs','dock-ui.cjs']){
  const result=spawnSync(require('electron'),[path.join(root,'tests',file)],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,TEMP:temp,TMP:temp}});
  if(result.error)throw result.error;
  if(result.status!==0){process.exitCode=result.status===null?1:result.status;break;}
}
