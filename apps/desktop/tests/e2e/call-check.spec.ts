import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';
test('guided call check stops synthetic capture, confirms output and explains denied access',async()=>{
 const server=await createServer({cacheDir:'node_modules/.vite-e2e-call-check',optimizeDeps:{entries:['tests/e2e/call-check.fixture.html']},server:{port:5188,strictPort:true}});await server.listen();
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5188/tests/e2e/call-check.fixture.html');
  await page.getByRole('button',{name:'Testar minha chamada'}).click();
  await expect(page.getByRole('button',{name:'Ouvi o sinal',exact:true})).toBeVisible({timeout:15000});
  expect(await page.evaluate(()=>(window as unknown as {capturesStopped:()=>boolean}).capturesStopped())).toBe(true);
  await page.getByRole('button',{name:'Ouvi o sinal',exact:true}).click();await expect(page.getByText('Saída confirmada.')).toBeVisible();
  await page.getByRole('button',{name:'Testar minha chamada'}).click();await page.getByRole('button',{name:'Cancelar teste'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {capturesStopped:()=>boolean}).capturesStopped())).toBe(true);
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
  await page.getByRole('button',{name:'Testar minha chamada'}).click();await expect(page.getByText(/Acesso ao microfone\/câmera negado/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Testar minha chamada'})).toBeVisible();
  await page.screenshot({path:'test-results/call-check.png',fullPage:true});
 }finally{await browser.close();await server.close();}
});
