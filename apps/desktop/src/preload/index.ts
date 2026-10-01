import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type DesktopApi } from '../shared/ipc/contracts';

const api: DesktopApi = {
  admin:action=>ipcRenderer.invoke(IPC.admin,action),
  notifyMessage:channelId=>ipcRenderer.invoke(IPC.notifyMessage,channelId),
  reconnectLive:()=>ipcRenderer.invoke(IPC.reconnectLive),
  diagnostics:action=>ipcRenderer.invoke(IPC.diagnostics,action),
  updates:action=>ipcRenderer.invoke(IPC.updates,action),
  importServer:()=>ipcRenderer.invoke(IPC.importServer),
  connectServer:ip=>ipcRenderer.invoke(IPC.connectServer,ip),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  checkServices: () => ipcRenderer.invoke(IPC.services),
  getAuthState: () => ipcRenderer.invoke(IPC.authState),
  signIn: () => ipcRenderer.invoke(IPC.signIn),
  cancelSignIn: () => ipcRenderer.invoke(IPC.cancelSignIn),
  signOut: () => ipcRenderer.invoke(IPC.signOut),
  chat: (action) => ipcRenderer.invoke(IPC.chat, action),
  media: action => ipcRenderer.invoke(IPC.media, action),
  devicePermissions: action => ipcRenderer.invoke(IPC.devicePermissions,action),
  audioStatus:()=>ipcRenderer.invoke(IPC.audioStatus),
  audioApplications: () => ipcRenderer.invoke(IPC.audioApplications),
  applicationAudio: action => ipcRenderer.invoke(IPC.applicationAudio,action),
  onApplicationAudio: listener => {const receive=(_event:Electron.IpcRendererEvent,data:Uint8Array)=>listener(data);ipcRenderer.on(IPC.applicationAudioData,receive);return()=>ipcRenderer.removeListener(IPC.applicationAudioData,receive);},
  onApplicationAudioEnd: listener => {const receive=()=>listener();ipcRenderer.on(IPC.applicationAudioEnd,receive);return()=>ipcRenderer.removeListener(IPC.applicationAudioEnd,receive);},
  microphoneTest: enabled => ipcRenderer.invoke(IPC.microphoneTest, enabled),
  captureSources: () => ipcRenderer.invoke(IPC.captureSources),
  selectCapture: (id, audio) => ipcRenderer.invoke(IPC.selectCapture, id, audio),
  startLive: () => ipcRenderer.invoke(IPC.liveStart),
  stopLive: () => ipcRenderer.invoke(IPC.liveStop),
  voiceActivity:(leaseId,speaking)=>ipcRenderer.invoke(IPC.voiceActivity,leaseId,speaking),
  liveActivity: (channelId, typing) => ipcRenderer.invoke(IPC.liveActivity, channelId, typing),
  onLiveEvent: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => listener(payload);
    ipcRenderer.on(IPC.liveEvent, receive);
    return () => { ipcRenderer.removeListener(IPC.liveEvent, receive); };
  },
};
contextBridge.exposeInMainWorld('discorda', Object.freeze(api));
