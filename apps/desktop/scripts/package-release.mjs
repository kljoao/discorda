import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import path from 'node:path';
const key = createPrivateKey(readFileSync(process.env.DISCORDA_UPDATE_SIGNING_KEY ?? path.join(process.env.LOCALAPPDATA,'DiscordaBuild/update-signing.pem')));
if (!readFileSync('src/main/update-key.ts','utf8').includes(JSON.stringify(createPublicKey(key).export({type:'spki',format:'pem'}))))
  throw Error('A chave de assinatura não corresponde ao aplicativo.');
function run(command,args,shell=false) {
  const result=spawnSync(command,args,{stdio:'inherit',shell,env:{...process.env,DISCORDA_OFFICIAL_RELEASE:'1'}});
  if(result.status!==0)process.exit(result.status??1);
}
const npm=process.platform==='win32'?'npm.cmd':'npm';
run(npm,['test'],process.platform==='win32');
run(npm,['run','build:audio'],process.platform==='win32');
run(npm,['run','build'],process.platform==='win32');
run(npm,['run','test:desktop'],process.platform==='win32');
run(process.execPath,['../../tools/media-lab/smoke.mjs','--regression']);
run(npm,['exec','--','electron-builder','--win','nsis','--x64','--publish','never'],process.platform==='win32');
run(process.execPath,['scripts/check-package.mjs']);
run(process.execPath,['scripts/sign-release.mjs']);
