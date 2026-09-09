#!/usr/bin/env node
/** Screenshots the standalone concept prototype for side-by-side comparison. */
const FILE = process.argv[2];
const OUT = process.argv[3] || '/tmp/proto';
const MODULE = process.env.PLAYWRIGHT_MODULE || 'playwright-core';

const { mkdirSync } = await import('node:fs');
mkdirSync(OUT, { recursive: true });

const pw = await import(MODULE);
const chromium = pw.chromium ?? pw.default?.chromium;
const opts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(opts);
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`file://${FILE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// The prototype opens on a branded splash overlay — sign in to reveal the app.
for (const sel of ['button:has-text("Sign in")', 'form button', '#splash button']) {
  const el = page.locator(sel).first();
  if (await el.count()) {
    await el.click().catch(() => {});
    break;
  }
}
await page.waitForTimeout(2500);

// The prototype is a single page with a JS router: click each nav item.
const navs = await page.locator('[data-nav]').all();
console.log(`prototype nav items: ${navs.length}`);
await page.screenshot({ path: `${OUT}/proto-00-landing.png`, fullPage: true });

let i = 1;
for (const nav of navs) {
  const key = await nav.getAttribute('data-nav');
  await nav.click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/proto-${String(i).padStart(2, '0')}-${key}.png`, fullPage: true });
  console.log(`  captured ${key}`);
  i += 1;
}
await browser.close();
