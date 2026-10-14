const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hud',{
  state:()=>ipcRenderer.invoke('state'),
  settings:(patch)=>ipcRenderer.invoke('settings',patch),
  action:(name,payload)=>ipcRenderer.invoke('action',name,payload),
  subscribe:(callback)=>{const listener=(_,state)=>callback(state);ipcRenderer.on('state',listener);return()=>ipcRenderer.removeListener('state',listener);}
});
