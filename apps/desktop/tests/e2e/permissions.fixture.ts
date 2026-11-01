export function installPermissionFixture(){
 const api=window.discorda!,original=api.chat;
 const general='225a47d7-779e-4992-89d2-03b1517f9112',privateId='10000000-0000-4000-8000-000000000001';
 const everyone='20000000-0000-4000-8000-000000000001',team='20000000-0000-4000-8000-000000000002';
 const anna='30000000-0000-4000-8000-000000000001',bruno='30000000-0000-4000-8000-000000000002';
 const roles=[{id:team,name:'Equipe',color:'#76c7ad',permissions:0,position:10,isEveryone:false,version:1,editable:true},{id:everyone,name:'@todos',color:'#a6b2ff',permissions:3871,position:0,isEveryone:true,version:1,editable:true}];
 const members=[{id:anna,name:'Ana Silva',roleIds:[team],version:1,editable:true},{id:bruno,name:'Bruno Costa',roleIds:[] as string[],version:1,editable:true}];
 const overwrites=[{id:'40000000-0000-4000-8000-000000000001',roleId:everyone as string|null,userId:null as string|null,allow:0,deny:1,version:1},{id:'40000000-0000-4000-8000-000000000002',roleId:team as string|null,userId:null as string|null,allow:1,deny:0,version:1}];
 const actions:unknown[]=[];let reader=false;
 const emit=()=>window.dispatchEvent(new CustomEvent('test-live',{detail:{kind:'channels',data:{id:'test'}}}));
 window.addEventListener('test-permission-reader',()=>{reader=true;emit();});
 Object.assign(window,{permissionFixture:()=>({actions,roles,members,overwrites,general,privateId,anna,bruno})});
 api.chat=async action=>{
  if(action.kind==='workspace')return {ok:true,data:{id:'test',name:'Aurora · comunidade',userId:'test-user',role:reader?'Member':'Owner',isAdmin:!reader,permissionsVersion:1,permissions:reader?257:262143,channels:[{id:general,name:'geral',permissions:reader?9:262143,version:1},...reader?[]:[{id:privateId,name:'equipe',permissions:262143,version:1}]],voiceChannels:[{id:'bde069ed-d1c4-4930-92d3-9360eab43cb8',name:'Sala da equipe',permissions:reader?1:262143,version:1}]}};
  if(action.kind==='members'){
   actions.push(action);const entries=action.channelId===privateId?members.filter(m=>m.id===anna):members;
   return {ok:true,data:entries.map(m=>({id:m.id,name:m.name,status:'online',typingChannelId:null,avatarUrl:null}))};
  }
  if(action.kind==='permissionRoles')return {ok:true,data:{roles,members,granted:262143,position:1000}};
  if(action.kind==='permissionRoleSave'){
   actions.push(action);const row=roles.find(r=>r.id===action.id);if(row)Object.assign(row,{name:action.name,color:action.color,permissions:action.permissions,position:action.position,version:row.version+1});
   else roles.unshift({id:crypto.randomUUID(),name:action.name,color:action.color,permissions:action.permissions,position:action.position,isEveryone:false,version:1,editable:true});
   return {ok:true,data:{id:(row??roles[0]).id}};
  }
  if(action.kind==='permissionAssign'){actions.push(action);const row=members.find(m=>m.id===action.userId)!;row.roleIds=action.roleIds;row.version++;return {ok:true,data:null};}
  if(action.kind==='channelPolicy')return {ok:true,data:{channel:{id:action.channelId,name:action.channelId===general?'geral':'equipe',version:1},granted:262143,roles,members:members.map(m=>({id:m.id,name:m.name,access:action.channelId!==privateId||m.id===anna})),overwrites:action.channelId===privateId?overwrites:[]}};
  if(action.kind==='channelRuleSave'){actions.push(action);const row=overwrites.find(r=>action.targetType==='role'?r.roleId===action.targetId:r.userId===action.targetId);if(row){row.allow=action.allow;row.deny=action.deny;row.version++;}else overwrites.push({id:crypto.randomUUID(),roleId:action.targetType==='role'?action.targetId:null,userId:action.targetType==='member'?action.targetId:null,allow:action.allow,deny:action.deny,version:1});return {ok:true,data:null};}
  if(action.kind==='channelRuleDelete'){actions.push(action);const index=overwrites.findIndex(r=>r.id===action.id);if(index>=0)overwrites.splice(index,1);return {ok:true,data:null};}
  return original(action);
 };
}
