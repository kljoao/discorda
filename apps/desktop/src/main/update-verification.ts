import { verify, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
export interface SignedRelease {version:string;file:string;sha256:string;size:number;signature:string}
export function verifyRelease(value:unknown,key:string,current:string):SignedRelease {
  const m=value as SignedRelease;
  if(!m||!/^\d+\.\d+\.\d+$/.test(m.version)||m.file!==`Discorda-${m.version}-setup.exe`||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.size)||m.size<=0||m.size>250*1024**2||typeof m.signature!=='string')throw new Error('Invalid release');
  const next=m.version.split('.').map(Number),old=current.split('.').map(Number);
  const first=next.findIndex((v,i)=>v!==old[i]);if(first<0||next[first]<=old[first])throw new Error('Outdated release');
  if(!verify(null,Buffer.from(JSON.stringify({version:m.version,file:m.file,sha256:m.sha256,size:m.size})),key,Buffer.from(m.signature,'base64')))throw new Error('Invalid update signature');
  return m;
}
export async function verifyInstaller(file:string,release:SignedRelease){
  if((await stat(file)).size!==release.size)throw new Error('Invalid installer size');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  if(hash.digest('hex')!==release.sha256)throw new Error('Invalid installer digest');
}
