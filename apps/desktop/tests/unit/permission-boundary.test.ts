import {describe,it,expect,vi} from 'vitest';
vi.mock('electron',()=>({shell:{openExternal:vi.fn()}}));
import {validateChatAction,chatAction} from '../../src/main/chat';
import type {AuthController} from '../../src/main/auth/auth-controller';

describe('modular permission IPC',()=>{
 const channel=crypto.randomUUID(),role=crypto.randomUUID(),member=crypto.randomUUID();
 it('limits permission masks, targets, versions and membership payloads',()=>{
  const valid={kind:'channelRuleSave',channelId:channel,targetType:'role',targetId:role,allow:1,deny:2,version:0};
  expect(()=>validateChatAction(valid)).not.toThrow();
  for(const change of [{channelId:'../private'},{targetType:'everyone'},{targetId:'bad'},{allow:4096},{allow:131072},{allow:2},{deny:-1},{version:NaN}])expect(()=>validateChatAction({...valid,...change})).toThrow();
  expect(()=>validateChatAction({kind:'permissionAssign',userId:member,roleIds:[role],version:1})).not.toThrow();
  expect(()=>validateChatAction({kind:'permissionAssign',userId:member,roleIds:[role,role],version:1})).toThrow();
  expect(()=>validateChatAction({kind:'members',channelId:'https://evil.test'})).toThrow();
 });
 it('uses fixed same-server routes and preserves optimistic versions',async()=>{
  const request=vi.fn().mockResolvedValue({ok:true,data:null});const auth={chatRequest:request} as unknown as AuthController;
  await chatAction(auth,{kind:'members',channelId:channel});expect(request).toHaveBeenLastCalledWith('/members?channelId='+channel);
  await chatAction(auth,{kind:'channelRuleSave',channelId:channel,targetType:'member',targetId:member,allow:1,deny:2,version:3});expect(request).toHaveBeenLastCalledWith('/channels/'+channel+'/permissions','PUT',{targetType:'member',targetId:member,allow:1,deny:2,version:3});
  await chatAction(auth,{kind:'permissionAssign',userId:member,roleIds:[role],version:4});expect(request).toHaveBeenLastCalledWith('/permissions/members/'+member,'PUT',{roleIds:[role],version:4});
 });
});
