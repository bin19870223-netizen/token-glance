const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const directory=path.resolve(__dirname,'../work/external-overlay-runtime');
app.setPath('userData',directory);app.setPath('crashDumps',path.join(directory,'crashes'));
let window;
app.whenReady().then(async()=>{
  window=new BrowserWindow({x:100,y:100,width:260,height:140,show:false,frame:false});
  await window.loadURL('data:text/html,<body style="background:%23eee">Independent overlay test</body>');
  window.showInactive();window.setAlwaysOnTop(true,'pop-up-menu');
  console.log('overlay:'+window.getNativeWindowHandle().readBigUInt64LE().toString());
  process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{if(data.includes('raise'))window.moveTop();});
  // GUI Electron may not expose stdin on Windows. Parent kills this short-lived
  // test process; the timeout also cleans up after an interrupted parent test.
  setTimeout(()=>app.quit(),10000);
});
