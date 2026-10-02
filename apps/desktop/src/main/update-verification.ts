import { verify, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
export const releaseVersion=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-beta\.([1-9]\d{0,5}))?$/;
export function compareVersions(a:string,b:string){
  const left=releaseVersion.exec(a),right=releaseVersion.exec(b);if(!left||!right)throw Error('Invalid version');
  for(let i=1;i<=3;i++){const difference=Number(left[i])-Number(right[i]);if(difference)return Math.sign(difference);}
  if(!left[4]&&!right[4])return 0;if(!left[4])return 1;if(!right[4])return -1;
  return Math.sign(Number(left[4])-Number(right[4]));
}
export interface SignedRelease {version:string;file:string;sha256:string;size:number;signature:string}
export function verifyRelease(value:unknown,key:string,current:string):SignedRelease {
  const m=value as SignedRelease;
  if(!m||!releaseVersion.test(m.version)||m.file!==`Discorda-${m.version}-setup.exe`||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.size)||m.size<=0||m.size>250*1024**2||typeof m.signature!=='string')throw new Error('Invalid release');
  if(compareVersions(m.version,current)<=0)throw new Error('Outdated release');
  if(!verify(null,Buffer.from(JSON.stringify({version:m.version,file:m.file,sha256:m.sha256,size:m.size})),key,Buffer.from(m.signature,'base64')))throw new Error('Invalid update signature');
  return m;
}
export async function verifyInstaller(file:string,release:SignedRelease){
  if((await stat(file)).size!==release.size)throw new Error('Invalid installer size');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  if(hash.digest('hex')!==release.sha256)throw new Error('Invalid installer digest');
}
