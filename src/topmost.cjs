// Windows keeps multiple topmost windows in a shared z-order. Reasserting the
// flag alone does not recover from another pinned window being brought forward.
function maintainTopmost(getWindows,isEnabled){
  const configured=new WeakSet();
  function refresh(){
    const enabled=isEnabled();
    for(const window of getWindows()){
      if(!window||window.isDestroyed())continue;
      // Below-taskbar levels can lose WS_EX_TOPMOST with Windows shell/dock
      // replacements. Use the first level above the taskbar for this overlay.
      if(!configured.has(window)||window.isAlwaysOnTop()!==enabled){window.setAlwaysOnTop(enabled,'pop-up-menu');configured.add(window);}
      if(enabled&&window.isVisible()&&!window.isMinimized())window.moveTop();
    }
  }
  const timer=setInterval(refresh,1000);
  timer.unref();
  return {refresh,stop:()=>clearInterval(timer)};
}
module.exports={maintainTopmost};
