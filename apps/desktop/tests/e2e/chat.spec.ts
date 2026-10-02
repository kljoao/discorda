import { chromium, expect, test } from '@playwright/test';
import { createServer } from 'vite';

test('chat preserves retry identity, edits, replies, deletion and channel creation', async () => {
  const server = await createServer({ server: { port: 5183, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 820 } });
    await page.addInitScript(() => {
      // Test-only preload simulation. Production never loads this file or bypasses Auth.
      let displayName='Pessoa de teste';
      const channels = [{id: '225a47d7-779e-4992-89d2-03b1517f9112', name: 'geral'}];
      const messages: import('../../src/shared/ipc/contracts').ChatMessage[] = [];
      let dropResponse = true;
      let memberFailure = true;
      const reactions=new Map<string,{id:string;emoji:string;count:number;mine:boolean}>();const pins=new Set<string>();
      const allowedUsers=[{email:'admin@example.test',enabled:true}];
      const listeners = new Set<(event: import('../../src/shared/ipc/contracts').LiveEvent) => void>();
      window.addEventListener('test-live', event => listeners.forEach(listener => listener((event as CustomEvent).detail)));
      window.discorda = {
        shortcuts:async()=>{},onShortcut:()=>()=>{},
        admin:async action=>{if(action.kind==='settings')return {ok:true,data:{adminEmail:'admin@example.test'}};if(action.kind==='users')return {ok:true,data:allowedUsers};if(action.kind==='network')return {ok:true,data:[]};if(action.kind==='user'){allowedUsers.push({email:action.email,enabled:action.enabled});return {ok:true,data:null};}return {ok:true,data:null};},notifyMessage:async()=>{},
        reconnectLive:async()=>{},diagnostics:async()=>({version:'test',platform:'win32',checkedAt:'',api:'online',database:'ready',chat:'connected',attempts:1,callActive:false,update:'idle'}),
        updates:async()=>({status:'ready',version:'9.0.0'}),importServer:async()=>false,connectServer:async()=>({ok:false}),voiceActivity:async()=>{},audioStatus:async()=>({supported:true,os:"test"}), devicePermissions: async()=>{}, audioApplications:async()=>[], applicationAudio:async()=>{}, onApplicationAudio:()=>()=>{}, onApplicationAudioEnd:()=>()=>{},
        microphoneTest: async () => {},
        media: async () => ({ok: false, message: "Media unavailable"}), captureSources: async () => [], selectCapture: async () => {},
      startLive: async () => { listeners.forEach(listener => listener({kind: 'connection', data: 'connected'})); }, stopLive: async () => {}, liveActivity: async () => {}, onLiveEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        getAppInfo: async () => ({version: 'test', platform: 'win32'}),
        checkServices: async () => ({api: 'online', database: 'ready', checkedAt: ''}),
        getAuthState: async () => ({status: 'signed-in', profile: {id: 'test-user', displayName, email: 'test@example.test'}}),
        signIn: async () => ({status: 'signed-out'}), signOut: async () => ({status: 'signed-out'}), cancelSignIn: async () => {},
        chat: async (action) => {
          if(action.kind==='manageMembers')return {ok:true,data:[{id:'test-user',displayName:'Meu apelido',role:'Owner'},{id:'past-member',displayName:'Amigo offline',role:'Member'}]};if(action.kind==='audit')return {ok:true,data:[]};
          if(action.kind==='reads')return {ok:true,data:{}};
          if(action.kind==='annotations')return {ok:true,data:{reactions:[...reactions.values()].filter(r=>action.ids.includes(r.id)),pins:[...pins].filter(id=>action.ids.includes(id))}};
          if(action.kind==='reaction'){const key=action.id+action.emoji;if(action.enabled)reactions.set(key,{id:action.id,emoji:action.emoji,count:1,mine:true});else reactions.delete(key);return {ok:true,data:null};}
          if(action.kind==='pin'){if(action.enabled)pins.add(action.id);else pins.delete(action.id);return {ok:true,data:null};}
          if(action.kind==='search'||action.kind==='pins')return {ok:true,data:{items:messages.filter(m=>m.channelId===action.channelId&&!m.deletedAt&&(action.kind==='pins'?pins.has(m.id):m.body.includes(action.query))),hasMore:false}};
          if (action.kind === 'members' && memberFailure) {memberFailure=false;return {ok:false,message:'Temporariamente indisponível'};}
          if (action.kind === 'members') return {ok:true,data:[{id:'past-member',name:'Amigo offline',status:'offline',typingChannelId:null,avatarUrl:null}]};
          if (action.kind === 'workspace') return {ok: true, data: {id: 'test', name: 'Grupo de teste', role: 'Owner',isAdmin:true, userId: 'test-user', channels,voiceChannels:[{id:'bde069ed-d1c4-4930-92d3-9360eab43cb8',name:'Sala de voz'}]}};
          if (action.kind === 'voiceRoster') return {ok:true,data:[{channelId:'bde069ed-d1c4-4930-92d3-9360eab43cb8',userId:'friend',name:'Amigo na voz'}]};
          if (action.kind === 'profile') {displayName=action.displayName;return {ok:true,data:{id:'test-user',displayName,email:'test@example.test'}};}
          if (action.kind === 'history') { const items = messages.filter(m => m.channelId === action.channelId && (!action.before || BigInt(m.id) < BigInt(action.before))); return {ok: true, data: {items: items.slice(-50), hasMore: items.length > 50}}; }
          if (action.kind === 'channel') { const channel = {id: crypto.randomUUID(), name: action.name}; channels.push(channel); return {ok: true, data: channel}; }
          if (action.kind === 'send') {
            let message = messages.find(m => m.clientId === action.clientId);
            if (!message) { message = {id: String(messages.length + 1), authorId: 'test-user', authorName: 'Pessoa de teste', channelId: action.channelId, clientId: action.clientId, body: action.body, replyToId: action.replyToId ?? null, version: 1, createdAt: new Date().toISOString(), editedAt: null, deletedAt: null}; messages.push(message); }
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
    });
    await page.goto('http://127.0.0.1:5183');
    await expect(page.getByRole('heading', {name: 'geral', exact: true})).toBeVisible();
    await expect(page.getByRole('region',{name:'Canais de voz'}).getByText('Amigo na voz')).toBeVisible();
    // Recover from failed initial fetch without a realtime presence event.
    await expect(page.getByText('Não foi possível atualizar a lista.')).toBeVisible();
    await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
    await expect(page.getByRole('region',{name:'Offline',exact:true}).getByText('Amigo offline')).toBeVisible();
    await page.screenshot({path:'test-results/offline-members.png',fullPage:true,animations:'disabled'});
    await page.getByRole('searchbox',{name:'Buscar membros'}).fill('ninguém com este nome');
    await expect(page.getByText('Nenhuma pessoa encontrada.')).toBeVisible();
    await page.getByRole('searchbox',{name:'Buscar membros'}).fill('');
    await page.getByRole('button',{name:'Mostrar membros',exact:true}).click();
    await expect(page.getByRole('complementary',{name:'Membros disponíveis'})).toBeHidden();
    await page.getByRole('button',{name:'Mostrar membros',exact:true}).click();
    await expect(page.getByRole('complementary',{name:'Membros disponíveis'})).toBeVisible();

    await page.getByRole('button',{name:'Administrar servidor',exact:true}).click();
    await page.getByRole('button',{name:'Acessos e rede do servidor'}).click();
    const administration=page.getByRole('dialog',{name:'Administrar servidor'});
    await expect(administration.getByRole('button',{name:'Bloquear'})).toBeDisabled();
    await administration.getByLabel('E-mail',{exact:true}).fill('friend@example.test');
    await administration.getByRole('button',{name:'Autorizar pessoa'}).click();
    await expect(administration.getByText('friend@example.test · Autorizado')).toBeVisible();
    await page.screenshot({path:'test-results/admin.png',fullPage:true,animations:'disabled'});
    await administration.getByRole('button',{name:'Fechar',exact:true}).click();
    await page.getByRole('dialog',{name:'Gerenciar grupo'}).getByRole('button',{name:'Fechar',exact:true}).click();
    for (const data of ['reconnecting','offline']) {
      await page.evaluate(data=>window.dispatchEvent(new CustomEvent('test-live',{detail:{kind:'connection',data}})),data);
      await expect(page.getByRole('region',{name:'Offline',exact:true}).getByText('Amigo offline')).toBeVisible();
      await expect(page.getByText('Não foi possível atualizar a lista.')).toHaveCount(0);
    }
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('test-live',{detail:{kind:'presence',data:[{id:'past-member',name:'Amigo offline',status:'online',typingChannelId:null,avatarUrl:null}]}})));
    await expect(page.getByRole('region',{name:'Offline',exact:true})).toHaveCount(0);
    await expect(page.getByRole('region',{name:'Disponíveis',exact:true}).getByText('Amigo offline')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button',{name:/Versão 9.0.0 pronta para instalar/}).click();
    await expect(page.getByRole('dialog',{name:'Configurações',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Instalar e reiniciar'})).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Versão instalada: test',{exact:true}).first()).toBeVisible();
    await page.getByRole('button',{name:'Voz e microfone',exact:true}).click();
    await expect(page.getByLabel('Volume de entrada',{exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/settings-redesign.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Conexão e diagnóstico',exact:true}).click();
    await expect(page.getByRole('button',{name:'Exportar diagnóstico'})).toBeVisible();
    await page.screenshot({path:'test-results/diagnostics.png',fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button',{name:'Editar nome',exact:true}).click();
    await page.getByRole('textbox',{name:'Nome no Discorda'}).fill('Meu apelido');
    await page.getByRole('button',{name:'Salvar nome'}).click();
    await expect(page.getByRole('heading',{name:'Bom te ver, Meu apelido.'})).toBeVisible();
    await page.getByRole('textbox', {name: 'Mensagem', exact: true}).fill('Olá, grupo 🙂');
    await page.getByRole('button', {name: 'Enviar mensagem', exact: true}).click();
    await expect(page.getByRole('alert')).toContainText('Resposta perdida');
    await page.getByRole('button', {name: 'Tentar enviar novamente'}).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeFocused();
    expect(await page.getByRole('textbox',{name:'Mensagem',exact:true}).evaluate(el=>getComputedStyle(el).resize)).toBe('none');
    await page.getByRole('button',{name:'Escolher emoji'}).click();
    await page.getByRole('button',{name:'Inserir 🎉',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toHaveValue('🎉');
    await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeFocused();
    await page.getByRole('textbox',{name:'Mensagem',exact:true}).fill('');
    await page.getByRole('button', {name: 'Editar', exact: true}).click();
    await page.getByRole('textbox', {name: 'Mensagem', exact: true}).fill('Mensagem editada');
    await page.getByRole('button', {name: 'Salvar edição'}).click();
    await expect(page.getByRole('article')).toContainText('Mensagem editada');
    await page.getByRole('button', {name: 'Responder', exact: true}).click();
    await page.getByRole('textbox', {name: 'Mensagem', exact: true}).fill('Combinado!');
    await page.getByRole('button', {name: 'Enviar mensagem', exact: true}).click();
    await expect(page.getByRole('article')).toHaveCount(2);
    await page.getByRole('article').first().getByRole('button', {name: 'Excluir', exact: true}).click();
    await page.locator('.delete-confirm').getByRole('button', {name: 'Excluir', exact: true}).click();
    await expect(page.getByRole('article').first()).toContainText('Mensagem excluída');
    await page.screenshot({path: 'test-results/chat.png', fullPage: true, animations: 'disabled'});
    await page.getByRole('button', {name: 'Criar canal'}).click();
    await page.getByRole('textbox', {name: 'Nome do canal'}).fill('música');
    await page.getByRole('button', {name: 'Criar', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'música', exact: true})).toBeVisible();
    await page.evaluate(async () => {
      const result = await window.discorda!.chat({kind: 'workspace'});
      if (!result.ok) throw new Error('fixture failure');
      const workspace = result.data as import('../../src/shared/ipc/contracts').ChatWorkspace;
      const channelId = workspace.channels.find(channel => channel.name === 'música')!.id;
      const first = await window.discorda!.chat({kind: 'send', channelId, clientId: crypto.randomUUID(), body: 'Primeira ao vivo'});
      if (!first.ok) throw new Error('fixture failure');
      window.dispatchEvent(new CustomEvent('test-live', {detail: {kind: 'message', data: first.data}}));
      window.dispatchEvent(new CustomEvent('test-live', {detail: {kind: 'message', data: first.data}}));
      window.dispatchEvent(new CustomEvent('test-live', {detail: {kind: 'presence', data: [{id: 'friend', name: 'Amigo remoto', status: 'online', avatarUrl:'https://lh3.googleusercontent.com/test-avatar', typingChannelId: channelId}]}}));
    });
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByText('Amigo remoto digitando…')).toBeVisible();
    await expect(page.getByRole('complementary',{name:'Membros disponíveis'}).getByText('Amigo remoto',{exact:true})).toBeVisible();
    expect(await page.locator('.members-rail').evaluate(el=>el.getBoundingClientRect().left)).toBeGreaterThan(900);
    await page.getByRole('textbox', {name: 'Mensagem', exact: true}).fill('Rascunho preservado');
    await page.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('test-live', {detail: {kind: 'connection', data: 'reconnecting'}}));
      const result = await window.discorda!.chat({kind: 'workspace'});
      if (!result.ok) throw new Error('fixture failure');
      const channelId = (result.data as import('../../src/shared/ipc/contracts').ChatWorkspace).channels.find(channel => channel.name === 'música')!.id;
      for (let index = 0; index < 64; index++) await window.discorda!.chat({kind: 'send', channelId, clientId: crypto.randomUUID(), body: `Durante queda ${index}`});
      window.dispatchEvent(new CustomEvent('test-live', {detail: {kind: 'connection', data: 'connected'}}));
    });
    await expect(page.getByRole('article')).toHaveCount(65);
    await expect(page.getByRole('textbox', {name: 'Mensagem', exact: true})).toHaveValue('Rascunho preservado');
    const composer=page.getByRole('textbox',{name:'Mensagem',exact:true});
    await composer.focus();await page.keyboard.press('Enter');await expect(composer).toHaveValue('');await expect(composer).toBeFocused();
    await page.keyboard.type('Segunda sem clicar');await page.keyboard.press('Enter');await expect(composer).toHaveValue('');await expect(composer).toBeFocused();
    await expect(page.getByRole('article').last()).toContainText('Segunda sem clicar');
    await page.locator('.message-list').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
    await page.getByRole('button',{name:'Voltar às mensagens recentes ↓'}).click();
    await expect(page.getByRole('button',{name:'Voltar às mensagens recentes ↓'})).toHaveCount(0);
    await page.getByRole('button',{name:'Silenciar este canal',exact:true}).click();
    await expect(page.getByRole('button',{name:'Ativar avisos deste canal',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.locator('.notification-preferences summary').click();await page.getByLabel('Notificações do Windows').check();
    await page.evaluate(async()=>{const r=await window.discorda!.chat({kind:'send',channelId:'225a47d7-779e-4992-89d2-03b1517f9112',clientId:crypto.randomUUID(),body:'Nova em outro canal'});if(!r.ok)throw Error('fixture');window.dispatchEvent(new CustomEvent('test-live',{detail:{kind:'message',data:r.data}}));});
    const general=page.getByRole('navigation',{name:'Canais',exact:true}).getByRole('button',{name:/geral/});
    await expect(general.getByLabel('Mensagens não lidas')).toBeVisible();
    await general.click();await expect(page.getByRole('article').last()).toContainText('Nova em outro canal');
    await expect(general.getByLabel('Mensagens não lidas')).toHaveCount(0);
    const latest=page.getByRole('article').last();
    await latest.getByRole('button',{name:'Reagir',exact:true}).click();
    await latest.getByRole('group',{name:'Escolher reação'}).getByRole('button',{name:'👍',exact:true}).click();
    await expect(latest.getByRole('button',{name:'👍 1 reações'})).toHaveAttribute('aria-pressed','true');
    await latest.getByRole('button',{name:'Fixar',exact:true}).click();
    await expect(latest.getByText('📌 Fixada')).toBeVisible();
    await page.getByRole('button',{name:'Mensagens fixadas',exact:true}).click();
    await expect(page.getByRole('region',{name:'Mensagens fixadas'}).getByText('Nova em outro canal')).toBeVisible();
    await page.getByRole('button',{name:'Fechar busca'}).click();
    await page.getByRole('button',{name:'Buscar mensagens',exact:true}).click();
    await page.getByRole('searchbox',{name:'Termos da busca'}).fill('Nova');
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByRole('region',{name:'Buscar no canal'}).getByText('Nova em outro canal')).toBeVisible();
    await page.screenshot({path:'test-results/chat-community.png',fullPage:true,animations:'disabled'});
    await page.getByRole('searchbox',{name:'Termos da busca'}).fill('semresultado');
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await expect(page.getByText('Nenhuma mensagem encontrada. Tente outras palavras.')).toBeVisible();

    await page.getByRole('button',{name:'Fechar busca'}).click();
    await page.getByRole('textbox',{name:'Mensagem',exact:true}).fill('Rascunho entre canais');
    await page.getByRole('navigation',{name:'Canais',exact:true}).getByRole('button',{name:/música/}).click();
    await general.click();await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toHaveValue('Rascunho entre canais');
    await page.getByRole('button',{name:'Administrar servidor',exact:true}).click();
    await page.screenshot({path:'test-results/management-community.png',fullPage:true,animations:'disabled'});
    await page.getByLabel('Mover ou remover Amigo offline').selectOption('remove');
    await expect(page.getByRole('region',{name:'Confirmar ação na chamada'})).toBeFocused();
    await page.getByRole('region',{name:'Confirmar ação na chamada'}).getByRole('button',{name:'Cancelar',exact:true}).click();
    await expect(page.getByLabel('Mover ou remover Amigo offline')).toBeFocused();

    await page.keyboard.press('Escape');
    await page.setViewportSize({width:900,height:650});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/chat-compact.png',fullPage:true,animations:'disabled'});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'Ajustar microfone',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Configurações',exact:true})).toBeVisible();
    expect(await page.locator('.settings-dialog').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'Ajustar microfone',exact:true})).toBeFocused();


  } finally { await browser.close(); await server.close(); }
});


