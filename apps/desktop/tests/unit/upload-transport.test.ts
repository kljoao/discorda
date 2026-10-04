import {it,expect,vi} from 'vitest';
import {createServer} from 'node:http';
vi.mock('electron',()=>({shell:{},safeStorage:{}}));
import {AuthController} from '../../src/main/auth/auth-controller';
import type {SessionVault} from '../../src/main/auth/session-vault';
it('streams authenticated bounded JSON with measured progress and awaits server confirmation',async()=>{
 let body='',authorization='';
 const server=createServer(async(req,res)=>{authorization=req.headers.authorization??'';for await(const chunk of req)body+=chunk.toString();res.writeHead(200,{'Content-Type':'application/json'});res.end('{"saved":true}');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const address=server.address() as {port:number};const auth=new AuthController('http://127.0.0.1:'+address.port,{} as SessionVault);
  // Use a synthetic session; no provider or real account participates in this transport test.
  (auth as unknown as {client:unknown}).client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-token'}},error:null})}};
  const progress:number[]=[];const payload={content:'x'.repeat(200_000),name:'example.txt'};
  const result=await auth.chatRequest('/channels/test/attachments','POST',payload,'chat',{signal:new AbortController().signal,progress:f=>progress.push(f)});
  expect(result).toEqual({ok:true,data:{saved:true}});expect(JSON.parse(body)).toEqual(payload);expect(authorization).toBe('Bearer synthetic-token');
  expect(progress.length).toBeGreaterThan(1);expect(progress.at(-1)).toBe(1);expect(progress.every((p,i)=>i===0||p>=progress[i-1])).toBe(true);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
