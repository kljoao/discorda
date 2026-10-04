import {it,expect} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {compatibilityIssue,verifyRelease} from '../../src/main/update-verification';
import {publicOperations,type Report} from '../../src/shared/operations';
import {videoHealth} from '../../src/renderer/features/chat/media-quality';
it('binds compatibility to the signed release and rejects removed or changed requirements',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519'),key=publicKey.export({type:'spki',format:'pem'}).toString();
 const base={version:'0.14.0',file:'Discorda-0.14.0-setup.exe',sha256:'a'.repeat(64),size:123};
 const signed=(value:unknown)=>sign(null,Buffer.from(JSON.stringify(value)),privateKey).toString('base64');
 const release={...base,signature:signed(base),compatibility:{protocolMin:1,protocolMax:1,signature:signed({version:base.version,sha256:base.sha256,protocolMin:1,protocolMax:1})}};
 expect(verifyRelease(release,key,'0.13.0')).toEqual(release);
 expect(()=>verifyRelease({...release,compatibility:undefined},key,'0.13.0')).toThrow();
 expect(()=>verifyRelease({...release,compatibility:{...release.compatibility,protocolMax:2}},key,'0.13.0')).toThrow();
 expect(compatibilityIssue(release,1)).toBeUndefined();expect(compatibilityIssue(release,2)).toContain('não é compatível');expect(compatibilityIssue(release,undefined)).toContain('confirmar');
});
it('exports only allowlisted health fields, never server-provided text or extra properties',()=>{
 const report={checkedAt:'2026-10-03T00:00:00Z',api:'online',database:'ready',media:'online',activeCalls:2,versions:{api:'1.0.0',runtime:'10.0.0',database:'secret@example.test',protocol:1},process:{memoryBytes:12,cpuAveragePercent:NaN,uptimeSeconds:3,token:'secret'},storage:{databaseBytes:4,freeBytes:5,totalBytes:6},backup:null,email:'secret@example.test'} as Report;
 const output=publicOperations(report);expect(JSON.stringify(output)).not.toContain('secret');expect(output.process.cpuAveragePercent).toBeNull();expect(output.versions.database).toBeNull();expect(output.activeCalls).toBe(2);
});
it('uses elapsed time for actual frame rate and rejects reset counters',()=>{const previous={timestamp:1000,bytes:100,received:10,lost:0,dropped:0,frames:10,jitter:0};const next={...previous,timestamp:3000,bytes:2000100,frames:130};expect(videoHealth(next,previous)).toMatchObject({fps:60,mbps:8});expect(videoHealth({...next,frames:0},previous)).toBeUndefined();});
