import {it,expect,vi} from 'vitest';
vi.mock('electron',()=>({nativeImage:{createFromBuffer:vi.fn()}}));
import {stagedAttachmentAction} from '../../src/main/attachment-transfer';
import {validateChatAction} from '../../src/main/chat';
import type {AuthController} from '../../src/main/auth/auth-controller';
it('rejects unbounded buffers and paths at the IPC boundary',()=>{
 expect(()=>validateChatAction({kind:'attachmentStage',name:'a',bytes:new Uint8Array(8*1024*1024+1)})).toThrow();
 expect(()=>validateChatAction({kind:'attachmentTransfer',channelId:'../admin',token:crypto.randomUUID(),clientId:crypto.randomUUID()})).toThrow();
});
it('stages without sending, rejects stale sessions and cancels the active request',async()=>{
 const auth={contextVersion:1,chatRequest:vi.fn()} as unknown as AuthController;
 const stage=()=>stagedAttachmentAction(auth,{kind:'attachmentStage',name:'hello.txt',bytes:new TextEncoder().encode('hello')});
 const prepared=await stage();expect(prepared.ok).toBe(true);expect(auth.chatRequest).not.toHaveBeenCalled();
 const token=(prepared as {data:{token:string}}).data.token;
 expect((await stagedAttachmentAction(auth,{kind:'attachmentProgress',token:crypto.randomUUID()})).ok).toBe(false);
 (auth as unknown as {contextVersion:number}).contextVersion=2;
 expect((await stagedAttachmentAction(auth,{kind:'attachmentTransfer',channelId:crypto.randomUUID(),clientId:crypto.randomUUID(),token})).ok).toBe(false);
 const second=await stage();const next=(second as {data:{token:string}}).data.token;
 vi.mocked(auth.chatRequest).mockImplementation(async(_r,_m,_b,_a,transfer)=>new Promise(resolve=>{transfer!.progress(.5);transfer!.signal.addEventListener('abort',()=>resolve({ok:false,message:'Canceled'}));}));
 const pending=stagedAttachmentAction(auth,{kind:'attachmentTransfer',channelId:crypto.randomUUID(),clientId:crypto.randomUUID(),token:next});
 const progress=await stagedAttachmentAction(auth,{kind:'attachmentProgress',token:next});expect(progress).toEqual({ok:true,data:{progress:.5}});
 expect((await stagedAttachmentAction(auth,{kind:'attachmentCancel',token:next})).ok).toBe(true);expect((await pending).ok).toBe(false);
 expect((await stagedAttachmentAction(auth,{kind:'attachmentStage',name:'../secret',bytes:new Uint8Array([1])})).ok).toBe(false);
});
