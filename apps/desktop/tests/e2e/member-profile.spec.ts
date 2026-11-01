import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
import {installChatFixture} from './chat-fixture';
import {installPermissionFixture} from './permissions.fixture';

test('member grouping persists, cards show identity and roles, and private membership remains scoped',async()=>{
 const server=await createServer({cacheDir:'node_modules/.vite-member-profiles',optimizeDeps:{entries:['index.html']},server:{port:5192,strictPort:true}});await server.listen();
 const browser=await chromium.launch({channel:'msedge',headless:true});const output=process.env.DISCORDA_UI_OUTPUT??'test-results/member-profiles/';await mkdir(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript({content:`(${installChatFixture.toString()})();(${installPermissionFixture.toString()})();
   const original=window.discorda.chat;window.discorda.chat=async action=>{const response=await original(action);if(action.kind==='members'&&response.ok)response.data=response.data.map(m=>({...m,accountName:m.name==='Ana Silva'?'Ana Carolina Silva':'Bruno Costa',roles:m.name==='Ana Silva'?[{id:'low',name:'Comunidade',position:1,color:'#a6b2ff'},{id:'high',name:'Equipe',position:30,color:'#76c7ad'}]:[]}));return response;};`});
  await page.goto('http://127.0.0.1:5192');const list=page.getByRole('complementary',{name:'Membros disponíveis'});await expect(list.getByText('Ana Silva',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ajustar microfone',exact:true}).click();const settings=page.getByRole('dialog',{name:'Configurações',exact:true});await settings.getByRole('tab',{name:'Aparência',exact:true}).click();
  await settings.getByRole('switch',{name:'Separar membros por cargo',exact:true}).check();await page.screenshot({path:output+'membros-configuracao.png',animations:'disabled'});
  await settings.getByRole('button',{name:'Fechar configurações',exact:true}).click();await expect(settings).toHaveCount(0);
  await page.getByRole('button',{name:'geral',exact:true}).click();await expect(list.getByRole('region',{name:'Sem cargo',exact:true})).toBeVisible();
  const headings=await list.locator('section>h2').allTextContents();expect(headings[0]).toContain('Equipe');expect(headings[1]).toContain('Sem cargo');expect(await list.getByRole('button',{name:'Ver perfil de Ana Silva',exact:true}).count()).toBe(1);
  await list.getByRole('button',{name:'Ver perfil de Ana Silva',exact:true}).click();const card=page.getByRole('dialog',{name:'Perfil de Ana Silva',exact:true});await expect(card.getByText('Ana Carolina Silva',{exact:true})).toBeVisible();await expect(card.getByText('Comunidade',{exact:true})).toBeVisible();await expect(card.getByText('Equipe',{exact:true})).toBeVisible();
  await page.screenshot({path:output+'membros-perfil.png',animations:'disabled'});await page.keyboard.press('Escape');await expect(card).toHaveCount(0);await expect(list.getByRole('button',{name:'Ver perfil de Ana Silva',exact:true})).toBeFocused();
  await page.reload();await expect(list.getByRole('region',{name:'Equipe',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'equipe',exact:true}).click();await expect(list.getByText('Bruno Costa',{exact:true})).toHaveCount(0);
  await list.getByRole('button',{name:'Ver perfil de Ana Silva',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('test-permission-reader')));await expect(page.getByRole('dialog',{name:'Perfil de Ana Silva',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
 }finally{await browser.close();await server.close();}
});
