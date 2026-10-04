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
export interface SignedRelease {version:string;file:string;sha256:string;size:number;signature:string;compatibility?:{protocolMin:number;protocolMax:number;signature:string}}
export function verifyRelease(value:unknown,key:string,current:string):SignedRelease {
  const m=value as SignedRelease;
  if(!m||!releaseVersion.test(m.version)||m.file!==`Discorda-${m.version}-setup.exe`||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.size)||m.size<=0||m.size>250*1024**2||typeof m.signature!=='string')throw new Error('Invalid release');
  if(compareVersions(m.version,current)<=0)throw new Error('Outdated release');
  // The first release of the compatibility contract requires metadata: stripping it must fail closed.
  if(compareVersions(m.version,'0.13.1-beta.1')>=0&&!m.compatibility)throw Error('Missing compatibility signature');
  if(!verify(null,Buffer.from(JSON.stringify({version:m.version,file:m.file,sha256:m.sha256,size:m.size})),key,Buffer.from(m.signature,'base64')))throw new Error('Invalid update signature');
  if(m.compatibility){const c=m.compatibility;if(!Number.isSafeInteger(c.protocolMin)||!Number.isSafeInteger(c.protocolMax)||c.protocolMin<1||c.protocolMax<c.protocolMin||c.protocolMax>10000||typeof c.signature!=='string'||!verify(null,Buffer.from(JSON.stringify({version:m.version,sha256:m.sha256,protocolMin:c.protocolMin,protocolMax:c.protocolMax})),key,Buffer.from(c.signature,'base64')))throw Error('Invalid compatibility signature');}
  return m;
}
export function compatibilityIssue(release:SignedRelease,protocol:number|undefined):string|undefined{
  if(!release.compatibility)return;
  if(protocol===undefined)return 'Não foi possível confirmar a compatibilidade do servidor. Atualize o servidor e verifique sua conexão antes de instalar.';
  if(protocol<release.compatibility.protocolMin||protocol>release.compatibility.protocolMax)return 'Esta versão não é compatível com o servidor selecionado. Peça ao administrador para atualizar o servidor antes de instalar.';
}
export async function verifyInstaller(file:string,release:SignedRelease){
  if((await stat(file)).size!==release.size)throw new Error('Invalid installer size');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  if(hash.digest('hex')!==release.sha256)throw new Error('Invalid installer digest');
}
