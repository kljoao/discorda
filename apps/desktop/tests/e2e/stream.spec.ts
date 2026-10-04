import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';
test('stream popout displays video without duplicating audio and closes when removed',async()=>{
 const server=await createServer({cacheDir:"node_modules/.vite-e2e-stream",optimizeDeps:{entries:["tests/e2e/stream.fixture.html"]},server:{port:5186,strictPort:true}});await server.listen();
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://localhost:5186/tests/e2e/stream.fixture.html');
  const [popup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:'Abrir em outra janela'}).first().click()]);
  await expect(popup).toHaveTitle('Amigo · Tela · Discorda');
  await expect.poll(()=>popup.locator('video').evaluate(el=>(el as HTMLVideoElement).videoWidth)).toBe(640);
  await popup.getByRole('button',{name:'Aumentar zoom'}).click();
  await expect(popup.getByLabel('Zoom da transmissão')).toHaveText('125%');
  await expect(popup.locator('video')).toHaveCSS('transform',/1.25/);
  await popup.getByRole('button',{name:'Ajustar',exact:true}).click();
  await expect(popup.getByLabel('Zoom da transmissão')).toHaveText('100%');
  await popup.getByRole('button',{name:'Tamanho original'}).click();
  await popup.getByRole('button',{name:'Silenciar transmissão',exact:true}).click();
  await expect(popup.getByRole('button',{name:'Ouvir transmissão',exact:true})).toHaveAttribute('aria-pressed','true');
  await popup.getByRole('button',{name:'Modo compacto',exact:true}).click();
  await expect(popup.locator('body')).toHaveClass(/compact-viewer/);
  await popup.getByRole('button',{name:'Expandir',exact:true}).click();
  await popup.screenshot({path:'test-results/stream-zoom.png'});

  expect(await popup.locator('video').evaluate(el=>({muted:(el as HTMLVideoElement).muted,controls:(el as HTMLVideoElement).controls}))).toEqual({muted:true,controls:false});
  await page.getByRole('button',{name:'Alternar chat'}).click();
  expect(popup.isClosed()).toBe(false);
  await page.getByLabel('Mensagem').fill('O chat continua disponível');
  await popup.screenshot({path:'test-results/community-stream-window.png'});
  await page.getByRole('button',{name:'Alternar chat'}).click();
  const nextWaiting=page.waitForEvent('popup');await page.getByRole('button',{name:'Abrir em outra janela'}).nth(1).click();const next=await nextWaiting;
  await expect.poll(()=>popup.isClosed()).toBe(true);await expect(next).toHaveTitle('Outra pessoa · Tela · Discorda');
  await expect(next.locator('video')).toHaveCount(1);
  await page.getByRole('button',{name:'Remover primeira pessoa'}).click();expect(next.isClosed()).toBe(false);
  await page.getByRole('button',{name:'Encerrar transmissão'}).click();await expect.poll(()=>next.isClosed()).toBe(true);
 }finally{await browser.close();await server.close();}
});
