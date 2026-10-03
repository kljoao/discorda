
import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';
import path from 'node:path';
test('voice channel opens avatars and screen replacement preserves publication and audio',async()=>{
 test.setTimeout(60000);
 const server=await createServer({resolve:{alias:[{find:/^livekit-client$/,replacement:path.resolve('tests/e2e/livekit.fixture.ts')}]},server:{port:5187,strictPort:true}});await server.listen();
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1240,height:820}});
  page.on('pageerror',error=>console.error(error.message));
  await page.goto('http://127.0.0.1:5187/tests/e2e/voice.fixture.html');
  const voice=page.getByRole('button',{name:/Conversa/});
  await voice.click();
  await expect(page.locator('.avatar-tile')).toHaveCount(5);
  await expect(page.locator('.voice-avatar img')).toHaveCount(5);
  await expect(page.locator('.avatar-tile.speaking')).toHaveCount(1);
  expect(await page.locator('.avatar-tile').evaluateAll(tiles=>tiles.every(tile=>{const r=tile.getBoundingClientRect();return r.right<=window.innerWidth&&r.bottom<=window.innerHeight&&r.top>=0&&r.width>0;}))).toBe(true);
  await page.screenshot({path:'test-results/voice-grid.png',fullPage:true});
  await page.getByRole('button',{name:'geral',exact:true}).click();
  await expect(page.getByText('Chat de texto',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sair da chamada'})).toBeVisible();
  await voice.click();await expect(page.getByRole('region',{name:'Chamada Conversa'})).toBeVisible();
  await page.getByRole('button',{name:'Compartilhar tela',exact:true}).click();
  await page.getByRole('button',{name:'screen:1',exact:true}).click();
  const snapshot=()=>page.evaluate(()=>(window as unknown as {voiceSnapshot:()=>{starts:number;stops:number;old:string;current:string;audio:number}}).voiceSnapshot());
  await expect(page.getByRole('button',{name:'Parar tela',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Parar tela',exact:true}).click({button:'right'});
  await page.getByRole('button',{name:'Ativar som do PC',exact:true}).click();
  await expect.poll(async()=>(await snapshot()).audio).toBe(1);
  await page.getByRole('button',{name:'Opções da transmissão',exact:true}).click();
  await page.screenshot({path:'test-results/share-options.png',fullPage:true});
  await page.getByRole('button',{name:'Trocar tela ou janela'}).click();
  await page.getByRole('button',{name:'Cancelar compartilhamento'}).click();
  expect(await snapshot()).toMatchObject({starts:1,stops:0,current:'live',old:'live',audio:1});
  await page.getByRole('button',{name:'Parar tela',exact:true}).click({button:'right'});
  await page.getByRole('button',{name:'Trocar tela ou janela'}).click();
  await page.getByRole('button',{name:'screen:2',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Compartilhar tela'})).toHaveCount(0);
  expect(await snapshot()).toMatchObject({starts:1,stops:0,current:'live',old:'ended',audio:1});
  await page.getByRole('button',{name:'Parar tela',exact:true}).click({button:'right'});
  await page.getByRole('button',{name:'Desativar som do PC',exact:true}).click();
  await expect.poll(async()=>(await snapshot()).audio).toBe(0);
  expect(await snapshot()).toMatchObject({starts:1,stops:0,current:'live'});
  await page.getByRole('button',{name:'Parar tela',exact:true}).click();
  await expect.poll(async()=>(await snapshot()).stops).toBe(1);
 }finally{await browser.close();await server.close();}
});
