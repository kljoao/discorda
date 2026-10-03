import {createHash} from 'node:crypto';
import {open,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {parseServerConfig,type ServerConfig} from './server-config';
import {normalizeServerAddress} from './server-discovery';

export const serverId=(origin:string)=>createHash('sha256').update(origin).digest('hex');
export function inviteAddress(value:unknown):string {
  if(typeof value!=='string'||value.length>1024)throw Error('Convite inválido.');
  const url=new URL(value);
  if(url.protocol!=='discorda:'||url.hostname!=='join'||url.pathname&&url.pathname!=='/'||url.username||url.password||url.port||url.hash||[...url.searchParams.keys()].join(',')!=='server')throw Error('Convite inválido.');
  return normalizeServerAddress(url.searchParams.get('server'));
}
export function inviteLink(origin:string):string {
  const url=new URL(origin);const address=url.hostname.startsWith('26.')?url.hostname:origin;
  return 'discorda://join?'+new URLSearchParams({server:normalizeServerAddress(address)});
}
type Entry={id:string;name:string;config:ServerConfig};
export class ServerLibrary {
  private queue:Promise<unknown>=Promise.resolve();
  constructor(private directory:string){}
  async entries():Promise<Entry[]>{
    try{const file=await open(path.join(this.directory,'servers.json'),'r');let text:string;
      try{const bytes=Buffer.alloc(700001);const {bytesRead}=await file.read(bytes,0,bytes.length,0);if(bytesRead>700000)throw Error();text=bytes.subarray(0,bytesRead).toString('utf8');}finally{await file.close();}
      const items=JSON.parse(text);if(!Array.isArray(items)||items.length>20)throw Error();
      return items.flatMap(item=>{try{const config=parseServerConfig(JSON.stringify(item.config),true);return [{id:serverId(config.apiUrl),name:typeof item.name==='string'?item.name.slice(0,60):new URL(config.apiUrl).hostname,config}];}catch{throw Error('Registro de servidor inválido.');}});
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw Error('Não foi possível ler os servidores salvos.');}
  }
  change(update:(entries:Entry[])=>Entry[]):Promise<void>{
    const operation=this.queue.then(async()=>{const entries=update(await this.entries());if(entries.length>20)throw Error('Limite de 20 servidores. Remova um antes de adicionar.');await mkdir(this.directory,{recursive:true});const file=path.join(this.directory,'servers.json');await writeFile(file+'.tmp',JSON.stringify(entries),{mode:0o600});await rename(file+'.tmp',file);});
    this.queue=operation.catch(()=>{});return operation;
  }
  remember(config:ServerConfig){return this.change(entries=>{const id=serverId(config.apiUrl),old=entries.find(e=>e.id===id);return [...entries.filter(e=>e.id!==id),{id,name:old?.name??new URL(config.apiUrl).hostname,config}];});}
}
