import {afterAll,beforeAll,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createServer,connect} from 'node:tls';
import {normalizeRadminIp,readServerCertificate} from '../../src/main/server-discovery';
import {parseServerConfig} from '../../src/main/server-config';
let directory:string,certificate:string,key:string;
beforeAll(()=>{
 directory=mkdtempSync(path.join(os.tmpdir(),'discorda-cert-test-'));
 const openssl=process.platform==='win32'&&existsSync('C:/Program Files/Git/usr/bin/openssl.exe')?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';
 execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(directory,'key.pem'),'-out',path.join(directory,'cert.pem'),'-days','1','-subj','/CN=Discorda test','-addext','subjectAltName=IP:127.0.0.1,IP:26.10.10.1'],{stdio:'ignore'});
 certificate=readFileSync(path.join(directory,'cert.pem'),'utf8');key=readFileSync(path.join(directory,'key.pem'),'utf8');
});
afterAll(()=>{if(directory)rmSync(directory,{recursive:true,force:true});});
it('accepts only explicit Radmin IPv4, not URLs, hostnames or ports',()=>{
 expect(normalizeRadminIp(' 26.10.10.1 ')).toBe('26.10.10.1');
 for(const input of ['127.0.0.1','26.1',['26','010','10','1'].join('.'),'26.10.10.1:7443','https://26.10.10.1','localhost','26.10.10.1/path','26.10.10.1@evil.test',{},null])expect(()=>normalizeRadminIp(input)).toThrow();
});
it('collects a certificate without sending application data, then validates it for persistence',async()=>{
 let bytes=0;
 const server=createServer({cert:certificate,key},socket=>socket.on('data',data=>{bytes+=data.length;}));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=(server.address() as {port:number}).port;
  const pem=await readServerCertificate('127.0.0.1',port);
  expect(parseServerConfig(JSON.stringify({apiUrl:'https://26.10.10.1:7443',certificate:pem})).certificate.trim()).toBe(certificate.trim());
  expect(()=>parseServerConfig(JSON.stringify({apiUrl:'https://26.10.10.2:7443',certificate:pem}))).toThrow();
  expect(bytes).toBe(0);
  await new Promise<void>((resolve,reject)=>{
   const socket=connect({host:'127.0.0.1',port,ca:pem,allowPartialTrustChain:true,rejectUnauthorized:true},()=>{expect(socket.authorized).toBe(true);socket.destroy();resolve();});socket.on('error',reject);
  });
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


