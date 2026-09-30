import {it,expect} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyRelease} from '../../src/main/update-verification';
import {verifyInstaller} from '../../src/main/update-verification';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
it('accepts only a newer release signed by the pinned author key',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519'),key=publicKey.export({type:'spki',format:'pem'}).toString();
 const m={version:'0.8.0',file:'Discorda-0.8.0-setup.exe',sha256:'a'.repeat(64),size:123};
 const release={...m,signature:sign(null,Buffer.from(JSON.stringify(m)),privateKey).toString('base64')};
 expect(verifyRelease(release,key,'0.7.0').version).toBe('0.8.0');
 expect(()=>verifyRelease({...release,sha256:'b'.repeat(64)},key,'0.7.0')).toThrow();
 expect(()=>verifyRelease(release,key,'0.9.0')).toThrow();
 expect(()=>verifyRelease({...release,file:'../../evil.exe'},key,'0.7.0')).toThrow();
 const other=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();expect(()=>verifyRelease(release,other,'0.7.0')).toThrow();
});
it('rejects a downloaded installer modified after signature verification',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'discorda-update-test-')),file=path.join(dir,'setup.exe');
 try{await writeFile(file,'original');const release={version:'0.8.0',file:'Discorda-0.8.0-setup.exe',sha256:createHash('sha256').update('original').digest('hex'),size:8,signature:''};
 await expect(verifyInstaller(file,release)).resolves.toBeUndefined();await writeFile(file,'modified');await expect(verifyInstaller(file,release)).rejects.toThrow('digest');
 }finally{await rm(dir,{recursive:true,force:true});}
});
