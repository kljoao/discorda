import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';
import {installChatFixture} from './chat-fixture';

test('one update click checkpoints the conversation and restores the draft, cursor and reading position',async()=>{
 const server=await createServer({cacheDir:'node_modules/.vite-e2e-update',optimizeDeps:{entries:['index.html']},server:{port:5189,strictPort:true}});await server.listen();
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1240,height:820}});
  await page.addInitScript({content:`(${installChatFixture.toString()})();window.dispatchEvent(new Event('test-seed'));`});
  await page.goto('http://127.0.0.1:5189');
  const composer=page.getByRole('textbox',{name:'Mensagem',exact:true});await expect(composer).toBeVisible();
  await expect(page.locator('#message-1100')).toBeAttached();
  await composer.fill('Continuar esta conversa depois da atualização');
  await composer.evaluate((node:HTMLTextAreaElement)=>node.setSelectionRange(4,12));
  await page.locator('.message-list').evaluate(node=>{node.scrollTop=200;});
  await expect(page.getByRole('button',{name:/Voltar às mensagens recentes/})).toBeVisible();
  const anchor=await page.locator('.message-list').evaluate(node=>{const bounds=node.getBoundingClientRect();const first=[...node.querySelectorAll<HTMLElement>('.chat-message')].find(item=>item.getBoundingClientRect().bottom>bounds.top)!;return {id:first.id,offset:first.getBoundingClientRect().top-bounds.top};});
  await page.evaluate(()=>{
   const api=window.discorda!;let calls=0;
   api.updates=async action=>{if(action==='install'){calls++;(window as any).updateCalls=calls;return new Promise(resolve=>{(window as any).finishUpdate=()=>resolve({status:'installing',version:'9.0.0'});});}return {status:'ready',version:'9.0.0'};};
   window.confirm=()=>{throw Error('Updates must not open a confirmation dialog.');};
  });
  await page.getByRole('button',{name:'Ajustar microfone',exact:true}).click();
  await page.getByRole('tab',{name:'Atualizações',exact:true}).click();
  await page.getByRole('button',{name:'Atualizar e reiniciar',exact:true}).click();
  await expect(page.getByRole('button',{name:'Atualizando…',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>(window as any).updateCalls)).toBe(1);
  await page.evaluate(()=>(window as any).finishUpdate());
  await expect(page.getByText('Aplicando atualização… o Discorda será reaberto automaticamente.',{exact:true})).toBeVisible();
  // The native installer handoff is covered separately; reload simulates the new renderer opening in the same profile.
  await page.reload();await expect(composer).toHaveValue('Continuar esta conversa depois da atualização');
  await expect(composer).toBeFocused();expect(await composer.evaluate((node:HTMLTextAreaElement)=>[node.selectionStart,node.selectionEnd])).toEqual([4,12]);
  await expect(page.locator('#'+anchor.id)).toBeAttached();
  await expect.poll(()=>page.locator('#'+anchor.id).evaluate((node,offset)=>Math.abs(node.getBoundingClientRect().top-node.closest('.message-list')!.getBoundingClientRect().top-offset),anchor.offset)).toBeLessThan(1);
  await expect(page.getByRole('dialog',{name:'Configurações',exact:true})).toHaveCount(0);
 }finally{await browser.close();await server.close();}
});
