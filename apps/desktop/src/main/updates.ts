import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {app} from 'electron';
import { autoUpdater, NsisUpdater } from 'electron-updater';
import { updatePublicKey } from './update-key';
import { releaseVersion, verifyRelease,verifyInstaller,type SignedRelease } from './update-verification';
import type { UpdateState } from '../shared/ipc/contracts';

export class Updates {
  state:UpdateState={status:'idle'};
  private checking=false;
  private channel:'stable'|'beta'='stable';
  private preferences=path.join(app.getPath('userData'),'update-channel.json');
  setChannel(channel:'stable'|'beta'){if(this.checking||this.state.status==='downloading'||this.state.status==='ready')throw Error('Conclua a atualização ou reinicie o aplicativo antes de trocar de canal.');this.channel=channel;autoUpdater.allowPrerelease=channel==='beta';autoUpdater.channel=channel==='beta'?'beta':'latest';autoUpdater.allowDowngrade=false;writeFileSync(this.preferences,JSON.stringify({channel}),{mode:0o600});this.state={status:'idle'};}
  private startupNotice?:string;
  private marker=path.join(app.getPath('userData'),'update-pending.json');
  confirmStartup(){
    try{const marker=JSON.parse(readFileSync(this.marker,'utf8'));if(typeof marker.target==='string'&&releaseVersion.test(marker.target)){
      this.startupNotice=marker.target===app.getVersion()?'Atualização instalada e abertura confirmada.':'A atualização anterior não foi concluída. Verifique novamente ou reinstale pelo instalador oficial.';
    }unlinkSync(this.marker);}catch{/* No pending update. */}
  }
  snapshot(){return {...this.state,channel:this.channel,startupNotice:this.startupNotice};}
  private release?:SignedRelease;
  private downloaded?:string;
  constructor(private callActive:()=>boolean){
    autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowDowngrade=false;autoUpdater.allowPrerelease=false;autoUpdater.logger=null;
    try{if(JSON.parse(readFileSync(this.preferences,'utf8')).channel==='beta'){this.channel='beta';autoUpdater.allowPrerelease=true;autoUpdater.channel='beta';autoUpdater.allowDowngrade=false;}}catch{}
    if(autoUpdater instanceof NsisUpdater)autoUpdater.verifyUpdateCodeSignature=async(_publishers,file)=>{try{if(!this.release)throw new Error();await verifyInstaller(file,this.release);return null;}catch{return 'A assinatura privada da atualização não confere.';}};
    autoUpdater.on('error',()=>{this.state={status:'error',message:'Atualização indisponível. Tente novamente mais tarde.'};});
    autoUpdater.on('download-progress',p=>{this.state={status:'downloading',progress:Math.round(p.percent)};});
    autoUpdater.on('update-downloaded',event=>{void this.ready(event.downloadedFile);});
  }
  private async ready(file:string){try{if(!this.release)throw new Error();await verifyInstaller(file,this.release);this.downloaded=file;this.state={status:'ready',version:this.release.version};}catch{this.state={status:'error',message:'A verificação de segurança da atualização falhou.'};}}
  async check(){
    if(process.env.DISCORDA_OFFICIAL_RELEASE !== '1'){this.state={status:'idle',message:'Build comunitária: atualize usando os instaladores do seu mantenedor.'};return;}
    if(!app.isPackaged){this.state={status:'idle',message:'Atualizações disponíveis no aplicativo instalado.'};return;}
    if(this.checking||this.state.status==='downloading'||this.state.status==='ready')return;
    this.checking=true;this.state={status:'checking'};
    try{
      const result=await autoUpdater.checkForUpdates();
      if(!result||!result.isUpdateAvailable||result.updateInfo.version===app.getVersion()){this.state={status:'current'};return;}
      const version=result.updateInfo.version;if(!releaseVersion.test(version))throw new Error();
      const response=await fetch(`https://github.com/kljoao/discorda/releases/download/v${version}/discorda-update.json`,{signal:AbortSignal.timeout(15000)});
      if(!response.ok||Number(response.headers.get('content-length'))>8192)throw new Error();
      const text=await response.text();if(text.length>8192)throw new Error();
      this.release=verifyRelease(JSON.parse(text),updatePublicKey,app.getVersion());
      if(this.release.version!==version)throw new Error();
      this.state={status:'downloading',version,progress:0};await autoUpdater.downloadUpdate();
    }catch{this.state={status:'error',message:'Não foi possível verificar uma atualização assinada. Tente novamente mais tarde.'};}
    finally{this.checking=false;}
  }
  async install(){
    if(this.callActive())throw new Error('Saia da chamada antes de atualizar.');
    if(this.state.status!=='ready'||!this.release||!this.downloaded)throw new Error('Nenhuma atualização pronta.');
    await verifyInstaller(this.downloaded,this.release);
    if(this.callActive())throw new Error('Saia da chamada antes de atualizar.');
    writeFileSync(this.marker,JSON.stringify({target:this.release.version}),{mode:0o600});
    autoUpdater.quitAndInstall(false,true);
  }
}
