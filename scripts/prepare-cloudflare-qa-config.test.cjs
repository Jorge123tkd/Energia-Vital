'use strict';
const assert=require('node:assert/strict');
const {validate,render}=require('./prepare-cloudflare-qa-config.cjs');
const ok={
 QA_D1_DATABASE_ID:'12345678-aaaa-bbbb-cccc-123456789abc',
 QA_D1_DATABASE_NAME:'energia-vital-qa-db',
 QA_R2_BUCKET_NAME:'energia-vital-qa-assets',
 QA_WORKER_NAME:'energia-vital-api-qa',
 QA_PAGES_PROJECT:'energia-vital-qa-web',
 QA_API_URL:'https://energia-vital-api-qa.test-subdomain.workers.dev',
 QA_SITE_URL:'https://energia-vital-qa-web.pages.dev'
};
const c=validate(ok),toml=render(c);
assert.match(toml,/ENVIRONMENT = "qa"/);
assert.match(toml,/binding = "DB"/);
assert.match(toml,/binding = "BUCKET"/);
assert.ok(!toml.includes('[triggers]'),'QA must not schedule production reminders');
assert.ok(!toml.includes('TELEGRAM_BOT_TOKEN'),'QA must not inherit messaging secrets');
assert.ok(!toml.includes('bbb91e7a-37c6-4290-aa9c-29a8022226b4'),'No prod D1 UUID');
for(const [key,val] of Object.entries({
 QA_D1_DATABASE_ID:'bbb91e7a-37c6-4290-aa9c-29a8022226b4',
 QA_D1_DATABASE_NAME:'energia-vital-db',QA_R2_BUCKET_NAME:'energia-vital-assets',
 QA_WORKER_NAME:'energia-vital-api',QA_PAGES_PROJECT:'energia-vital-web',
 QA_API_URL:'https://energia-vital-api.astrustrus.workers.dev',
 QA_SITE_URL:'https://energia-vital-web.pages.dev'
})){
 assert.throws(()=>validate({...ok,[key]:val}),key+' must reject prod binding');
}
assert.throws(()=>validate({...ok,QA_API_URL:'http://energia-vital-api-qa.test.workers.dev'}));
assert.throws(()=>validate({...ok,QA_D1_DATABASE_ID:''}));
console.log('PASS QA preview config refuses production D1/R2/Worker/Pages, URLs, missing values and cron');
