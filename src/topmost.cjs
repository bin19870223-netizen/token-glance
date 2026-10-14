// Windows keeps multiple topmost windows in a shared z-order. Reasserting the
// flag alone does not recover from another pinned window being brought forward.
function maintainTopmost(getWindows,isEnabled){
  const configured=new WeakSet();
  function refresh(raise=true){
    const enabled=isEnabled();
    for(const window of getWindows()){
      if(!window||window.isDestroyed())continue;
      // Below-taskbar levels can lose WS_EX_TOPMOST with Windows shell/dock
      // replacements. Use the first level above the taskbar for this overlay.
      const changed=!configured.has(window)||window.isAlwaysOnTop()!==enabled;
      if(changed){window.setAlwaysOnTop(enabled,'pop-up-menu');configured.add(window);}
      if(enabled&&(raise||changed)&&window.isVisible()&&!window.isMinimized())window.moveTop();
    }
  }
  const timer=setInterval(()=>refresh(false),1000);
  timer.unref();
  return {refresh,stop:()=>clearInterval(timer)};
}
module.exports={maintainTopmost};
