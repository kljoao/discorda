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
      const listeners = new Set<(event: import('../../src/shared/ipc/contracts').LiveEvent) => void>();
      window.addEventListener('test-live', event => listeners.forEach(listener => listener((event as CustomEvent).detail)));
      window.discorda = {
        updates:async()=>({status:'idle'}),importServer:async()=>false,voiceActivity:async()=>{},audioStatus:async()=>({supported:true,os:"test"}), devicePermissions: async()=>{}, audioApplications:async()=>[], applicationAudio:async()=>{}, onApplicationAudio:()=>()=>{}, onApplicationAudioEnd:()=>()=>{},
        microphoneTest: async () => {},
        media: async () => ({ok: false, message: "Media unavailable"}), captureSources: async () => [], selectCapture: async () => {},
      startLive: async () => { listeners.forEach(listener => listener({kind: 'connection', data: 'connected'})); }, stopLive: async () => {}, liveActivity: async () => {}, onLiveEvent: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        getAppInfo: async () => ({version: 'test', platform: 'win32'}),
        checkServices: async () => ({api: 'online', database: 'ready', checkedAt: ''}),
        getAuthState: async () => ({status: 'signed-in', profile: {id: 'test-user', displayName, email: 'test@example.test'}}),
        signIn: async () => ({status: 'signed-out'}), signOut: async () => ({status: 'signed-out'}), cancelSignIn: async () => {},
        chat: async (action) => {
          if (action.kind === 'workspace') return {ok: true, data: {id: 'test', name: 'Grupo de teste', role: 'Owner', userId: 'test-user', channels,voiceChannels:[{id:'bde069ed-d1c4-4930-92d3-9360eab43cb8',name:'Sala de voz'}]}};
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
    await page.screenshot({path: 'test-results/chat.png', fullPage: true});
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
  } finally { await browser.close(); await server.close(); }
});


