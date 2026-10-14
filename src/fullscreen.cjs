const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');

function monitorFullscreen(executable,onChange,launch=spawn){
  // Wait for the first native reading rather than raising over an existing game.
  let state='unknown',stopped=false;
  const update=next=>{if(!stopped&&state!==next){state=next;onChange();}};
  const child=launch(executable,[],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{if(['exclusive','desktop','unknown'].includes(line))update(line);});
  child.on('error',()=>update('unknown'));
  child.on('exit',()=>update('unknown'));
  child.stdin.on('error',()=>update('unknown'));
  return {shouldYield:()=>state!=='desktop',stop(){if(stopped)return;stopped=true;lines.close();child.stdin.end();child.kill();}};
}
module.exports={monitorFullscreen};
