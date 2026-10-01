import {it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {LiveChatClient} from '../../src/main/live-chat';
import type {LiveEvent} from '../../src/shared/ipc/contracts';
const {Server}=createRequire(import.meta.url)('ws');
it('two real WebSocket clients receive events again after reconnecting',async()=>{
 const server=new Server({port:0,host:'127.0.0.1'});await new Promise<void>(resolve=>server.on('listening',resolve));
 let authorized=0;server.on('connection',(socket:any,request:any)=>{
  if(request.headers.authorization==='Bearer test-session')authorized++;
  socket.on('message',(raw:Buffer)=>{for(const frame of raw.toString().split('\x1e').filter(Boolean)){
   const message=JSON.parse(frame);if(message.protocol)socket.send('{}\x1e');
   if(message.type===1){socket.send(JSON.stringify({type:3,invocationId:message.invocationId})+'\x1e');for(const peer of server.clients)peer.send(JSON.stringify({type:1,target:'ChatEvent',arguments:[{kind:'presence',data:[]}]})+'\x1e');}
  }});
 });
 const a:LiveEvent[]=[],b:LiveEvent[]=[];const origin='http://127.0.0.1:'+server.address().port;
 const first=new LiveChatClient(origin,async()=> 'test-session',e=>a.push(e),()=>false),second=new LiveChatClient(origin,async()=> 'test-session',e=>b.push(e),()=>false);
 try{
  first.start();second.start();await expect.poll(()=>authorized).toBe(2);await expect.poll(()=>a.some(e=>e.kind==='presence')&&b.some(e=>e.kind==='presence')).toBe(true);
  for(const peer of server.clients)peer.terminate();
  await expect.poll(()=>authorized).toBeGreaterThanOrEqual(4);await expect.poll(()=>first.snapshot.state==='connected'&&second.snapshot.state==='connected').toBe(true);
  a.length=0;b.length=0;first.activity('225a47d7-779e-4992-89d2-03b1517f9112',true);await first.reconnect();await expect.poll(()=>a.some(e=>e.kind==='presence')&&b.some(e=>e.kind==='presence')).toBe(true);
 }finally{await first.stop();await second.stop();for(const peer of server.clients)peer.terminate();await new Promise<void>(resolve=>server.close(resolve));}
},15000);
