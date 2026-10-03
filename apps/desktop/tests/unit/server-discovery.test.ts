import {createServer as httpsServer} from 'node:https';
import {request,getGlobalDispatcher,setGlobalDispatcher} from 'undici';
import {WebSocketServer} from 'ws';
import {serverDispatcher,serverTls} from '../../src/main/server-transport';
import {LiveChatClient} from '../../src/main/live-chat';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createServer,connect} from 'node:tls';
import {normalizeRadminIp,normalizeServerAddress,readServerCertificate} from '../../src/main/server-discovery';
import {ServerLibrary} from '../../src/main/server-library';
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
it('accepts HTTPS domains without weakening private certificate configuration',()=>{
 expect(normalizeServerAddress('group.example.com')).toBe('https://group.example.com');
 expect(normalizeServerAddress('26.10.10.1')).toBe('26.10.10.1');
 expect(parseServerConfig('{"apiUrl":"https://group.example.com","trust":"system"}')).toEqual({apiUrl:'https://group.example.com',trust:'system'});
 for(const value of ['http://group.example.com','https://user:pass@group.example.com','group.example.com/path','group.example.com:7443','localhost','127.0.0.1','group.example.com?x=1'])expect(()=>normalizeServerAddress(value)).toThrow();
 expect(()=>parseServerConfig('{"apiUrl":"https://group.example.com","trust":"system","certificate":"bad"}')).toThrow();
});
it('collects a certificate without sending application data, then validates it for persistence',async()=>{
 let bytes=0;
 const server=createServer({cert:certificate,key},socket=>socket.on('data',data=>{bytes+=data.length;}));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const port=(server.address() as {port:number}).port;
  const pem=await readServerCertificate('127.0.0.1',port);
  await expect(readServerCertificate('localhost',port,2000,true)).rejects.toThrow();
  expect(parseServerConfig(JSON.stringify({apiUrl:'https://26.10.10.1:7443',certificate:pem})).certificate?.trim()).toBe(certificate.trim());
  expect(()=>parseServerConfig(JSON.stringify({apiUrl:'https://26.10.10.2:7443',certificate:pem}))).toThrow();
  expect(bytes).toBe(0);
  await new Promise<void>((resolve,reject)=>{
   const socket=connect({host:'127.0.0.1',port,ca:pem,allowPartialTrustChain:true,rejectUnauthorized:true},()=>{expect(socket.authorized).toBe(true);socket.destroy();resolve();});socket.on('error',reject);
  });
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it('preserves expired saved certificates in the library but refuses connecting with them',async()=>{
 const config=parseServerConfig(JSON.stringify({apiUrl:'https://26.10.10.1:7443',certificate}));
 const library=new ServerLibrary(directory);await library.remember(config);
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+3*86400000);
 try{expect(await library.entries()).toHaveLength(1);await library.remember({apiUrl:'https://group.example.test',trust:'system'});expect(await library.entries()).toHaveLength(2);expect(()=>parseServerConfig(JSON.stringify(config))).toThrow();}finally{clock.mockRestore();}
});

it('scopes a private certificate to one origin for HTTP and authenticated WebSockets',async()=>{
 let foreignRequests=0;
 const first=httpsServer({cert:certificate,key},(_,response)=>response.end('ok'));
 const foreign=httpsServer({cert:certificate,key},(_,response)=>{foreignRequests++;response.end('unexpected');});
 await new Promise<void>(resolve=>first.listen(0,'127.0.0.1',resolve));
 await new Promise<void>(resolve=>foreign.listen(0,'127.0.0.1',resolve));
 const origin='https://127.0.0.1:'+(first.address() as {port:number}).port;
 const other='https://127.0.0.1:'+(foreign.address() as {port:number}).port;
 const config={apiUrl:origin,certificate},dispatcher=serverDispatcher(config);
 const ws=new WebSocketServer({server:first});let authorized=0;
 ws.on('connection',(socket,req)=>{if(req.headers.authorization==='Bearer isolated-test')authorized++;socket.on('message',raw=>{
  for(const frame of raw.toString().split('\x1e').filter(Boolean)){const message=JSON.parse(frame);if(message.protocol)socket.send('{}\x1e');if(message.type===1)socket.send(JSON.stringify({type:3,invocationId:message.invocationId})+'\x1e');}
 });});
 const client=new LiveChatClient(origin,async()=> 'isolated-test',()=>{},()=>false,config);
 const previous=getGlobalDispatcher();setGlobalDispatcher(dispatcher);
 try{
  expect(await (await request(origin,{dispatcher})).body.text()).toBe('ok');
  expect(await (await fetch(origin)).text()).toBe('ok');
  await expect(fetch(other)).rejects.toThrow();
  await expect(request(other,{dispatcher,headers:{Authorization:'Bearer must-not-leak'}})).rejects.toThrow();
  expect(foreignRequests).toBe(0);expect(serverTls(other,config)).toBeUndefined();
  client.start();await expect.poll(()=>client.snapshot.state).toBe('connected');expect(authorized).toBe(1);
  await new Promise<void>((resolve,reject)=>{const socket=connect({host:'127.0.0.1',port:(first.address() as {port:number}).port,...serverTls(origin,config)},()=>{
   expect(serverTls(origin,config)!.checkServerIdentity!('127.0.0.1',{...socket.getPeerCertificate(),fingerprint256:'wrong'})).toBeInstanceOf(Error);socket.destroy();resolve();});socket.on('error',reject);});
 }finally{setGlobalDispatcher(previous);await client.stop();for(const peer of ws.clients)peer.terminate();await new Promise<void>(resolve=>ws.close(()=>resolve()));await dispatcher.close();first.closeAllConnections();foreign.closeAllConnections();await Promise.all([new Promise<void>(resolve=>first.close(()=>resolve())),new Promise<void>(resolve=>foreign.close(()=>resolve()))]);}
},15000);
