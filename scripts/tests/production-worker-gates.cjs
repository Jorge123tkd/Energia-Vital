// Live read-only smoke checks for the DEPLOYED Bonaire Worker.
// Uses GET only, no secrets or credentials, and no D1/R2 mutations.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const root = resolve(__dirname, '../..');
const worker = 'https://energia-vital-api.astrustrus.workers.dev';
const config = readFileSync(resolve(root, 'apps/api/wrangler.toml'), 'utf8');
const warehouseSource = readFileSync(resolve(root, 'apps/api/src/routes/warehouse.ts'), 'utf8');
const financeSource = readFileSync(resolve(root, 'apps/api/src/routes/business-finance.ts'), 'utf8');

async function getJson(path, expectedStatus) {
  const response = await fetch(worker + path, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20000)
  });
  assert.equal(response.status, expectedStatus, path + ': unexpected HTTP status');
  assert.match(response.headers.get('content-type') || '', /^application\/json/i, path + ': JSON response expected');
  assert.equal(response.headers.get('location'), null, path + ': redirects forbidden');
  const body = await response.json();
  assert.ok(body && typeof body === 'object' && !Array.isArray(body), path + ': JSON object expected');
  return body;
}

test('The production Worker responds to read-only health checks', async () => {
  const health = await getJson('/health', 200);
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'energia-vital-api');
});

test('Enterprise warehouse and finance remain closed until a separate activation', async () => {
  assert.match(warehouseSource, /WAREHOUSE_ENABLED\s*!==\s*'true'/);
  assert.match(financeSource, /BUSINESS_FINANCE_ENABLED\s*!==\s*'true'/);
  assert.match(warehouseSource, /requireAdminAuth/);
  assert.match(financeSource, /requireAdminAuth/);
  assert.doesNotMatch(config, /(?m)^WAREHOUSE_ENABLED\s*=\s*["']true["']/);
  assert.doesNotMatch(config, /(?m)^BUSINESS_FINANCE_ENABLED\s*=\s*["']true["']/);
  const warehouse = await getJson('/api/warehouse/items', 503);
  assert.equal(typeof warehouse.error, 'string');
  const finance = await getJson('/api/business-finance/payables', 503);
  assert.equal(typeof finance.error, 'string');
  console.log('[OK] Warehouse and finance gates closed; admin authorization required when enabled.');
});
