/* eslint-disable @typescript-eslint/no-require-imports -- standalone browser test, configurable local Playwright installation */
// Browser-side API fixtures isolate UI checks from external sources and production data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/run/current-system/sw/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const totals={kcal:250,protein:10,fat:5,carbs:40};
 await page.route('**/api/**',r=>{
 const path=new URL(r.request().url()).pathname; let body;
 if(path==='/api/classes')body={ok:true,classes:['10-4','11-1'],count:2};
 if(path==='/api/bells')body={ok:true,bells:[{begin:'08:30',end:'09:15',pair:1,pairName:'Первая пара'}]};
 if(path==='/api/schedule')body={ok:true,days:{1:[{weekday:1,begin:'08:30',end:'09:15',lesson:'Математика',type:1,typeName:'Лекция',classroom:'3_4',teacher:'Иванов И.И.',classes:['10-4'],date:null}]},totalLessons:1};
 if(path==='/api/menu')body={ok:true,date:'15.09.2026',requestedDate:'15.09.2026',availableDates:['15.09.2026'],pdfUrl:'https://example.org/menu.pdf',meals:[{type:'завтрак',dishes:[{name:'Каша овсяная',weight:200,...totals,ingredients:'молоко, овсяные хлопья'}],totals}],dayTotals:totals,stale:false};
 return r.fulfill({status:body?200:503,contentType:'application/json',body:JSON.stringify(body||{ok:false,error:'Тест: недоступно'})});
 });
 await page.goto((process.env.SITE_URL || 'http://127.0.0.1:3198')+'/?tab=schedule');
 await page.getByRole('button',{name:'Пн',exact:true}).click();
 await page.getByText('Математика',{exact:true}).first().waitFor();
 assert.ok((await page.locator('main').innerText()).includes('3.4'));
 await page.getByRole('combobox').click(); await page.getByRole('option').filter({hasText:'11-1'}).click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('sunc_user_class')),'11-1');
 await page.reload(); await page.getByRole('combobox').waitFor();
 assert.ok((await page.getByRole('combobox').innerText()).includes('11-1'));
 await page.getByRole('navigation',{name:'Разделы'}).getByRole('button',{name:'Столовая',exact:true}).click();
 await page.getByText('Каша овсяная',{exact:true}).first().waitFor();
 const search=page.getByPlaceholder('Поиск блюда или состава…');
 await search.fill('несуществующее'); assert.equal(await page.getByText('Каша овсяная',{exact:true}).count(),0);
 await search.fill(''); await page.getByText('Каша овсяная',{exact:true}).first().waitFor();
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.screenshot({path:'/tmp/sunc-site-menu-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]); console.log('PASS: populated schedule, classroom format, class selection/persistence, menu search and reset, responsive layout, no React errors.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
