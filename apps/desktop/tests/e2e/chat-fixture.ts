export function installChatFixture(){
      // Test-only preload simulation. Production never loads this file or bypasses Auth.
      let displayName='Pessoa de teste';let workspaceName='Grupo de teste';
      const channels = [{id: '225a47d7-779e-4992-89d2-03b1517f9112', name: 'geral'}];
      const messages: import('../../src/shared/ipc/contracts').ChatMessage[] = [];
      const voiceChannels=[{id:'bde069ed-d1c4-4930-92d3-9360eab43cb8',name:'Sala de voz'}];
      const mediaPreviews=new Map<string,unknown>();
      window.addEventListener('test-media',event=>{for(const entry of (event as CustomEvent).detail){mediaPreviews.set(entry.file.id,entry.preview);const message={id:entry.id,authorId:entry.authorId??'test-user',authorName:entry.authorName??'Meu apelido',channelId:channels[0].id,clientId:crypto.randomUUID(),body:entry.file.name,attachments:[entry.file],replyToId:null,createdAt:new Date().toISOString(),editedAt:null,deletedAt:null,version:1};messages.push(message);listeners.forEach(listener=>listener({kind:'message',data:message}));}});
      window.addEventListener('test-seed',()=>{messages.length=0;for(let i=1;i<=1100;i++){const message={id:String(i),authorId:'other-user',authorName:'Histórico',channelId:channels[0].id,clientId:'seed-'+i,body:'Mensagem '+i,replyToId:null,createdAt:new Date().toISOString(),editedAt:null,deletedAt:null,version:1};messages.push(message);listeners.forEach(listener=>listener({kind:'message',data:message}));}});
      let dropVoiceResponse=false;window.addEventListener('test-fail-voice',()=>{dropVoiceResponse=true;});
      let dropResponse = true;let following=false;let inboxRead=false;let staged: {name:string;size:number}|undefined;
      let memberFailure = true;let inviteCreated=false;let inviteRevoked=false;
      const reactions=new Map<string,{id:string;emoji:string;count:number;mine:boolean}>();const pins=new Set<string>();
      const allowedUsers=[{email:'admin@example.test',enabled:true}];
      const listeners = new Set<(event: import('../../src/shared/ipc/contracts').LiveEvent) => void>();
      window.addEventListener('test-live', event => listeners.forEach(listener => listener((event as CustomEvent).detail)));
      window.discorda = {onPowerState:()=>()=>{},
        servers:async action=>({servers:[{id:'a'.repeat(64),name:'Grupo de teste',address:'https://grupo.example.test',current:true}],...(action.kind==='invite'?{invite:'discorda://join?server=https%3A%2F%2Fgrupo.example.test'}:{})}),onInvite:()=>()=>{},
        shortcuts:async()=>{},onShortcut:()=>()=>{},
        admin:async action=>{if(action.kind==='inviteCreate'){inviteCreated=true;return {ok:true,data:{link:'discorda://join?server=https%3A%2F%2Fgrupo.example.test&token='+'a'.repeat(64)}};}if(action.kind==='inviteRevoke'){inviteRevoked=true;return {ok:true,data:null};}if(action.kind==='invites')return {ok:true,data:inviteCreated?[{id:'invite-test',expiresAt:new Date(Date.now()+86400000).toISOString(),maxUses:5,uses:0,revoked:inviteRevoked}]:[]};if(action.kind==='joinRequests')return {ok:true,data:[]};if(action.kind==='storagePolicy')return {ok:true,data:{quotaMiB:512,retentionDays:0,version:1}};if(action.kind==='setup')return {ok:true,data:null};if(action.kind==='operations')return {ok:true,data:{checkedAt:new Date().toISOString(),api:'online',database:'ready',media:'online',activeCalls:0,process:{memoryBytes:1024,cpuAveragePercent:1,uptimeSeconds:60},storage:{databaseBytes:1024,freeBytes:2048,totalBytes:4096},backup:null}};if(action.kind==='settings')return {ok:true,data:{adminEmail:'admin@example.test'}};if(action.kind==='users')return {ok:true,data:allowedUsers};if(action.kind==='network')return {ok:true,data:[]};if(action.kind==='user'){allowedUsers.push({email:action.email,enabled:action.enabled});return {ok:true,data:null};}return {ok:true,data:null};},notifyMessage:async()=>{},
        reconnectLive:async()=>{},diagnostics:async()=>({version:'test',platform:'win32',checkedAt:'',api:'online',database:'ready',chat:'connected',attempts:1,callActive:false,update:'idle'}),
        updates:async()=>({status:'ready',version:'9.0.0'}),importServer:async()=>false,connectServer:async()=>({ok:false}),voiceActivity:async()=>{},audioStatus:async()=>({supported:true,os:"test"}), devicePermissions: async()=>{}, audioApplications:async()=>[], applicationAudio:async()=>{}, onApplicationAudio:()=>()=>{}, onApplicationAudioEnd:()=>()=>{},
        microphoneTest: async () => {},voiceRecording:async()=>{},
        media: async () => ({ok: false, message: "Media unavailable"}), captureSources: async () => [], selectCapture: async () => {},
      startLive: async () => { listeners.forEach(listener => listener({kind: 'connection', data: 'connected'})); }, stopLive: async () => {}, liveActivity: async () => {}, onLiveEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        getAppInfo: async () => ({version: 'test', platform: 'win32'}),
        checkServices: async () => ({api: 'online', database: 'ready', checkedAt: ''}),
        getAuthState: async () => ({status: 'signed-in', profile: {id: 'test-user', displayName, email: 'test@example.test'}}),
        signIn: async () => ({status: 'signed-out'}), signOut: async () => ({status: 'signed-out'}), cancelSignIn: async () => {},
        chat: async (action) => {
          if(action.kind==='voiceSend'){
            window.dispatchEvent(new CustomEvent('test-voice-send',{detail:{clientId:action.clientId,size:action.bytes.length}}));
            let message=messages.find(m=>m.clientId===action.clientId);
            if(!message){const file={id:crypto.randomUUID(),name:'voz-'+action.durationMs+'ms-'+action.clientId+'.weba',size:action.bytes.length};let binary='';action.bytes.forEach(byte=>binary+=String.fromCharCode(byte));mediaPreviews.set(file.id,{kind:'audio',content:btoa(binary),mime:'audio/webm',duration:action.durationMs/1000});message={id:String(messages.length+1),authorId:'test-user',authorName:'Pessoa de teste',channelId:action.channelId,clientId:action.clientId,body:file.name,attachments:[file],replyToId:null,createdAt:new Date().toISOString(),editedAt:null,deletedAt:null,version:1};messages.push(message);listeners.forEach(listener=>listener({kind:'message',data:message!}));}
            if(dropVoiceResponse){dropVoiceResponse=false;return {ok:false,message:'Resposta perdida. Seu áudio continua aqui para tentar novamente.'};}return {ok:true,data:message};
          }
          if(action.kind==='attachmentGet'){if(action.operation==='preview'||action.preview)return {ok:true,data:mediaPreviews.get(action.id)};window.dispatchEvent(new CustomEvent('test-attachment-action',{detail:action}));return {ok:true,data:{message:action.operation==='copyImage'?'Imagem copiada.':action.operation==='copyLink'?'Link copiado. O acesso exige uma sessão autorizada.':'Arquivo salvo.'}};}
          if(action.kind==='manageMembers')return {ok:true,data:[{id:'test-user',displayName:'Meu apelido',role:'Owner'},{id:'past-member',displayName:'Amigo offline',role:'Member'}]};if(action.kind==='audit')return {ok:true,data:[]};
          if(action.kind==='threadFollow'){if(action.enabled!==undefined)following=action.enabled;return {ok:true,data:{enabled:following}};}
          if(action.kind==='context')return {ok:true,data:{items:messages.filter(m=>m.channelId===action.channelId&&!m.threadRootId).slice(-50),hasMore:false}};
          if(action.kind==='message')return {ok:true,data:messages.find(m=>m.id===action.id)};
          if(action.kind==='inboxRead'){inboxRead=true;return {ok:true,data:null};}
          if(action.kind==='inbox'){const message=messages.find(m=>m.threadRootId);return {ok:true,data:{items:message&&(!action.unread||!inboxRead)?[{...message,channelName:'geral',kind:'reply',read:inboxRead}]:[],hasMore:false}};}
          if(action.kind==='attachmentStage'){staged={name:action.name,size:action.bytes.length};return {ok:true,data:{token:'file-token',...staged}};}
          if(action.kind==='attachmentCancel'){staged=undefined;return {ok:true,data:null};}
          if(action.kind==='attachmentProgress')return {ok:true,data:{progress:.5}};
          if(action.kind==='attachmentTransfer'){const message={id:String(messages.length+1),authorId:'test-user',authorName:'Pessoa de teste',channelId:action.channelId,clientId:action.clientId,body:staged!.name,attachments:[{id:'file-id',name:staged!.name,size:staged!.size}],replyToId:null,createdAt:new Date().toISOString(),editedAt:null,deletedAt:null,version:1};messages.push(message);staged=undefined;return {ok:true,data:message};}
          if(action.kind==='catchUp')return {ok:true,data:{since:new Date().toISOString(),channels:[],pins:[]}};
          if(action.kind==='reads')return {ok:true,data:{}};
          if(action.kind==='annotations')return {ok:true,data:{reactions:[...reactions.values()].filter(r=>action.ids.includes(r.id)),pins:[...pins].filter(id=>action.ids.includes(id))}};
          if(action.kind==='reaction'){const key=action.id+action.emoji;if(action.enabled)reactions.set(key,{id:action.id,emoji:action.emoji,count:1,mine:true});else reactions.delete(key);return {ok:true,data:null};}
          if(action.kind==='pin'){if(action.enabled)pins.add(action.id);else pins.delete(action.id);return {ok:true,data:null};}
          if(action.kind==='search'||action.kind==='pins')return {ok:true,data:{items:messages.filter(m=>m.channelId===action.channelId&&!m.deletedAt&&(action.kind==='pins'?pins.has(m.id):m.body.includes(action.query)&&(!action.fileType||!!m.attachments?.length)&&(!action.author||m.authorId===action.author))),hasMore:false}};
          if (action.kind === 'members' && memberFailure) {memberFailure=false;return {ok:false,message:'Temporariamente indisponível'};}
          if (action.kind === 'members') return {ok:true,data:[{id:'past-member',name:'Amigo offline',status:'offline',typingChannelId:null,avatarUrl:null}]};
          if(action.kind==='renameWorkspace'){workspaceName=action.name;return {ok:true,data:null};}
          if (action.kind === 'workspace') return {ok: true, data: {id: 'test', name: workspaceName, role: 'Owner',isAdmin:true, userId: 'test-user', channels,voiceChannels}};
          if (action.kind === 'voiceRoster') return {ok:true,data:[{channelId:'bde069ed-d1c4-4930-92d3-9360eab43cb8',userId:'friend',name:'Amigo na voz'}]};
          if (action.kind === 'profile') {displayName=action.displayName;return {ok:true,data:{id:'test-user',displayName,email:'test@example.test'}};}
          if (action.kind === 'history') { const items = messages.filter(m => m.channelId === action.channelId && (m.threadRootId??undefined)===action.thread && (!action.before || BigInt(m.id) < BigInt(action.before))); return {ok: true, data: {items: items.slice(-50), hasMore: items.length > 50}}; }
          if (action.kind === 'channel') { const channel = {id: crypto.randomUUID(), name: action.name}; (action.type==='voice'?voiceChannels:channels).push(channel); return {ok: true, data: channel}; }
          if (action.kind === 'send') {
            let message = messages.find(m => m.clientId === action.clientId);
            if (!message) { message = {id: String(messages.length + 1), authorId: 'test-user', authorName: 'Pessoa de teste', channelId: action.channelId, clientId: action.clientId, body: action.body, threadRootId:action.threadRootId, replyToId: action.replyToId ?? null, version: 1, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null}; messages.push(message); }
            if (dropResponse) { dropResponse = false; return {ok: false, message: 'Resposta perdida. Tente novamente.'}; }
            return {ok: true, data: message};
          }
          if (action.kind === 'edit' || action.kind === 'delete') {
            const message = messages.find(m => m.id === action.id)!;
            message.version++; message.body = action.kind === 'edit' ? action.body : '';
            if (action.kind === 'edit') message.editedAt = new Date().toISOString(); else message.deletedAt = new Date().toISOString();
            return {ok: true, data: message};
          }
          return {ok: true, data: null};
        }
      };
    }
