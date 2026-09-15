/* eslint-disable @typescript-eslint/no-require-imports -- standalone browser test, configurable local Playwright installation */
// Browser-side API fixtures isolate UI checks from external sources and production data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/run/current-system/sw/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const page = await browser.newPage({viewport:{width:390,height:844}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**', r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Тест: источник недоступен'})}));
 await page.goto((process.env.SITE_URL || 'http://127.0.0.1:3198'));
 await page.waitForTimeout(1200);
 const results=[];
 for(const label of ['Расписание','Столовая','Мероприятия','Дежурства','Вожатые','Погода','Новости','Инфо','Аудитория','Главная']) {
  await page.getByRole('navigation',{name:'Разделы'}).getByRole('button',{name:label,exact:true}).click();
  await page.waitForTimeout(1500);
  results.push({label,url:page.url(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),main:(await page.locator('main').innerText()).slice(0,180)});
 }
 await page.screenshot({path:'/tmp/sunc-site-mobile.png',fullPage:true});
 const assert = require('node:assert/strict');
 assert.equal(errors.length, 0, errors.join('\n'));
 assert.ok(results.every(result => !result.overflow && result.main.length > 0), JSON.stringify(results));
 await page.getByRole('navigation',{name:'Разделы'}).getByRole('button',{name:'Расписание',exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get('tab'), 'schedule');
 await page.reload(); await page.waitForTimeout(500);
 assert.equal(await page.locator('nav [aria-current="page"]').innerText(), 'Расписание');
 await page.getByRole('navigation',{name:'Разделы'}).getByRole('button',{name:'Столовая',exact:true}).click();
 await page.getByRole('tab',{name:'Аналитика',exact:true}).click();
 assert.equal(new URL(page.url()).searchParams.get('view'), 'analytics');
 await page.reload(); await page.waitForTimeout(500);
 assert.equal(await page.getByRole('tab',{name:'Аналитика',exact:true}).getAttribute('aria-selected'), 'true');
 await page.goBack(); await page.waitForTimeout(500);
 assert.equal(await page.getByRole('tab',{name:'Меню',exact:true}).getAttribute('aria-selected'), 'true');
 await page.goBack(); await page.waitForTimeout(500);
 assert.equal(await page.locator('nav [aria-current="page"]').innerText(), 'Расписание');
 await page.goForward(); await page.waitForTimeout(500);
 assert.equal(await page.locator('nav [aria-current="page"]').innerText(), 'Столовая');
 await page.keyboard.press('Alt+7');
 assert.equal(new URL(page.url()).searchParams.get('tab'), 'weather');
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth), false);
 console.log(JSON.stringify({results,errors,navigation:'PASS: URL, reload, Back, canteen view, shortcuts; mobile and desktop width'},null,2));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
