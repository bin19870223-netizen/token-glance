const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');

function monitorFullscreen(executable,onChange,launch=spawn,onCovered=onChange){
  // Wait for the first native reading rather than raising over an existing game.
  let state='unknown',stopped=false;
  const update=next=>{if(!stopped&&state!==next){state=next;onChange();}};
  const child=launch(executable,[],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{if(line==='restore'){if(!stopped&&state==='desktop')onCovered();}else if(['exclusive','desktop','unknown'].includes(line))update(line);});
  child.on('error',()=>update('unknown'));
  child.on('exit',()=>update('unknown'));
  child.stdin.on('error',()=>update('unknown'));
  return {shouldYield:()=>state!=='desktop',setWindows(windows){
    if(stopped||!child.stdin.writable)return;
    const handles=windows.filter(window=>window&&!window.isDestroyed()).map(window=>{const value=window.getNativeWindowHandle();return (value.length===8?value.readBigUInt64LE():BigInt(value.readUInt32LE())).toString();});
    child.stdin.write('windows:'+handles.join(',')+'\n');
  },stop(){if(stopped)return;stopped=true;lines.close();child.stdin.end();child.kill();}};
}
module.exports={monitorFullscreen};
