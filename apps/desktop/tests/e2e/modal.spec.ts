import {chromium,expect,test} from '@playwright/test';
import {createServer} from 'vite';

test('capture dialog traps keyboard focus and Escape returns it to the trigger',async()=>{
  const server=await createServer({cacheDir:'node_modules/.vite-e2e-modal',optimizeDeps:{entries:['tests/e2e/modal.fixture.html']},server:{port:5184,strictPort:true}});
  await server.listen();
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();await page.goto('http://127.0.0.1:5184/tests/e2e/modal.fixture.html');
    const trigger=page.getByRole('button',{name:'Compartilhar',exact:true});await trigger.click();
    const dialog=page.getByRole('dialog',{name:'Compartilhar tela'});await expect(dialog).toBeVisible();
    for(let i=0;i<5;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement)||document.activeElement===document.body)).toBe(true);}
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  }finally{await browser.close();await server.close();}
});
