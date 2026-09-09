#!/usr/bin/env node
/**
 * Captures a screenshot of every Concord screen against a RUNNING stack, so the
 * question "is it actually running?" has a picture rather than an assurance.
 *
 *   API_URL=http://localhost:4000 WEB_URL=http://localhost:3000 \
 *   node scripts/screenshot-tour.mjs [outDir]
 */
import { mkdirSync } from 'node:fs';

const API = process.env.API_URL || 'http://localhost:4000';
const WEB = process.env.WEB_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL || 'sagnik.saha@lakmelever.com';
const PASSWORD = process.env.E2E_PASSWORD || 'concord';
const MODULE = process.env.PLAYWRIGHT_MODULE || 'playwright-core';
const OUT = process.argv[2] || '/tmp/shots';

mkdirSync(OUT, { recursive: true });

const pw = await import(MODULE);
const chromium = pw.chromium ?? pw.default?.chromium;
const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
});

const shot = async (name, label) => {
  await page.waitForTimeout(900); // let animations settle
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const text = (await page.locator('body').innerText().catch(() => '')) || '';
  console.log(`  captured  ${name.padEnd(22)} ${label} · ${text.length} chars of content`);
};

console.log(`\nConcord — live screenshot tour (${WEB})\n${'='.repeat(52)}`);

// Health first, so the picture is of something demonstrably alive.
const health = await page.request.get(`${API}/api/health`);
console.log(`  API /health → ${health.status()} ${JSON.stringify(await health.json())}`);

await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await shot('01-login', 'sign-in');

await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(3000);
console.log(`  signed in → ${page.url()}`);

const screens = [
  ['', '02-command-center', 'Command Center dashboard'],
  ['pipeline', '02b-pipeline', 'lifecycle pipeline board'],
  ['notifications', '02c-notifications', 'Outlook notification history'],
  ['audit', '02d-audit', 'immutable audit trail'],
  ['intake', '03-intake', 'contract intake + AI triage'],
  ['ingest', '04-ingest', 'bulk ingestion / OCR extraction'],
  [process.env.REVIEW_PATH || 'review/CLM-2026-0442', '05-review', 'AI review + risk scoring'],
  ['authoring', '06-authoring', 'templates & clause library'],
  ['repository', '07-repository', 'repository + semantic Q&A'],
  ['obligations', '08-obligations', 'key dates & Outlook digest'],
  ['esign', '09-esign', 'e-signature, e-stamp, executed archive'],
  ['templates', '10-templates', 'template storage'],
];

for (const [path, name, label] of screens) {
  const res = await page.goto(`${WEB}/${path}`, { waitUntil: 'networkidle' }).catch(() => null);
  if (!res || res.status() >= 400) {
    console.log(`  skipped   ${name.padEnd(22)} (/${path} → ${res ? res.status() : 'no response'})`);
    continue;
  }
  await shot(name, label);
}

console.log('='.repeat(52));
console.log(errors.length ? `  ${errors.length} page/server error(s):` : '  No page errors, no 5xx responses.');
for (const e of errors.slice(0, 8)) console.log(`   - ${e}`);
console.log(`  Screenshots in ${OUT}\n`);

await browser.close();
process.exit(errors.length ? 1 : 0);
