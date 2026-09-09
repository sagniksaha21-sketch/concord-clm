#!/usr/bin/env node
/**
 * End-to-end user journey against a running stack (API + web).
 *
 *   API_URL=http://localhost:4000 WEB_URL=http://localhost:3000 \
 *   node scripts/e2e-journey.mjs
 *
 * Drives a real browser through sign-in and the core screens, and fails on any
 * uncaught page error or 5xx response. This is the check that the application
 * actually works for a person — unit and API tests cannot see a blank page
 * caused by a client-side crash.
 */
const API = process.env.API_URL || 'http://localhost:4000';
const WEB = process.env.WEB_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL || '';
const PASSWORD = process.env.E2E_PASSWORD || '';
const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN || '';
const MODULE = process.env.PLAYWRIGHT_MODULE || 'playwright-core';
const SSO = process.env.E2E_SSO === 'true';

if (!SESSION_TOKEN && (!EMAIL || !PASSWORD)) {
  console.error('E2E_EMAIL and E2E_PASSWORD are required unless E2E_SESSION_TOKEN is supplied.');
  process.exit(2);
}

const failures = [];
const note = (ok, label, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

// playwright-core is CommonJS: a dynamic import may surface it under `default`.
const pw = await import(MODULE);
const chromium = pw.chromium ?? pw.default?.chromium;
if (!chromium) {
  console.error(`Could not load chromium from "${MODULE}".`);
  process.exit(1);
}

// CHROMIUM_PATH lets the runner pin a browser build when the bundled
// playwright download does not match what is installed in the image.
const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const pageErrors = [];
const serverErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('response', (r) => {
  if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.url()}`);
});

console.log('\nConcord — end-to-end user journey\n' + '='.repeat(46));

// 0. The web server must be serving the build that is on disk.
//
// `next start` reads the build manifest once, at startup. Rebuild underneath a
// running server and it keeps serving chunk URLs that no longer exist: the page
// HTML still renders, no page error is raised, but no JavaScript loads — so the
// login form falls back to a native submit and every screen comes back empty.
// That looks exactly like a product regression and is not one. Catch it here
// rather than spending the debugging time again.
try {
  const onDisk = (await import('node:fs')).readFileSync(
    new URL('../apps/web/.next/BUILD_ID', import.meta.url),
    'utf8',
  ).trim();
  const home = await page.request.get(`${WEB}/login`);
  const html = await home.text();
  const servedMatch = html.match(/\/_next\/static\/([^/"']+)\/_buildManifest\.js/);
  const served = servedMatch?.[1];
  // A matching BUILD_ID is NOT sufficient. A build interrupted part-way leaves
  // the server referencing asset hashes that were never written, so the page
  // renders with no stylesheet — every screen looks broken in a way that mimics
  // a design regression. Fetch the stylesheet the page actually asks for.
  const cssRef = html.match(/\/_next\/static\/css\/[^"']+\.css/)?.[0];
  const cssOk = cssRef ? (await page.request.get(`${WEB}${cssRef}`)).ok() : true;
  note(
    (!served || served === onDisk) && cssOk,
    'Web server is serving a complete, current build',
    !cssOk
      ? `stylesheet ${cssRef} is referenced but does not resolve — the build is incomplete; rebuild and restart`
      : served && served !== onDisk
        ? `served ${served}, on disk ${onDisk} — restart \`next start\` before trusting this run`
        : '',
  );
} catch {
  // No build on disk (dev server) — nothing to compare.
}

// 1. API is alive
const health = await page.request.get(`${API}/api/health`);
note(health.ok(), 'API health endpoint responds');

// 2. Sign in through the same identity path a user uses. Local CI uses an
//    explicitly seeded disposable account; staging should use either an Entra
//    automation account or a short-lived session token injected by the staging
//    test runner. The script never carries default credentials.
if (SESSION_TOKEN) {
  await ctx.addCookies([{ name: 'concord_token', value: SESSION_TOKEN, url: WEB, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' });
  note(!page.url().endsWith('/login'), 'Injected staging session is accepted', page.url());
} else {
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
  if (SSO) {
    note((await page.getByRole('link', { name: /continue with microsoft/i }).count()) > 0, 'Enterprise login page renders');
    await page.getByRole('link', { name: /continue with microsoft/i }).click();
    await page.waitForURL(/login\.microsoftonline\.com/i, { timeout: 30_000 });
    await page.locator('input[type="email"], input[name="loginfmt"]').fill(EMAIL);
    await page.locator('input[type="submit"], button:has-text("Next")').first().click();
    await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('input[type="submit"], button:has-text("Sign in")').first().click();
    const stay = page.locator('input[type="submit"][value="Yes"], button:has-text("Yes")').first();
    if (await stay.isVisible({ timeout: 5_000 }).catch(() => false)) await stay.click();
    await page.waitForURL((url) => url.toString().startsWith(WEB), { timeout: 45_000 });
  } else {
    note((await page.locator('input[type="email"]').count()) > 0, 'Development login page renders');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 }).catch(() => {});
  }
  note(!page.url().endsWith('/login'), 'Sign-in succeeds and redirects', page.url());
}

// 3. Core screens load with real content (not an empty shell).
//
// Scoped to `main.stage` — the page body INSIDE the shell. Reading
// `body.innerText` was a false pass waiting to happen: once the sidebar started
// listing every screen by name on every page, "intake", "repository",
// "obligations" and "signature" all appeared in the body text of a page that had
// crashed to an empty stage, and each needle matched its own nav link. The
// needles below are also chosen to be page-specific rather than nav labels.
for (const [path, needle] of [
  ['/', 'contracts in the portfolio'],
  ['/intake', 'contract requests'],
  ['/pipeline', 'contract pipeline'],
  ['/review', 'review queue'],
  ['/repository', 'ask your contracts'],
  ['/obligations', 'key dates'],
  ['/esign', 'send & track signatures'],
  ['/notifications', 'notification'],
  ['/audit', 'audit'],
]) {
  await page.goto(`${WEB}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(900);
  const stage = page.locator('main.stage');
  const hasStage = (await stage.count()) > 0;
  const body = hasStage ? ((await stage.innerText().catch(() => '')) || '') : '';
  const ok = hasStage && body.toLowerCase().includes(needle) && body.trim().length > 200;
  note(
    ok,
    `${path} renders content`,
    hasStage ? `${body.trim().length} chars in main.stage` : 'no main.stage — shell did not render',
  );
}

// 3b. The needles above must actually be capable of failing. If the stage of a
// blank page still contains them, every check in step 3 is decorative.
{
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle' }).catch(() => {});
  const leaked = await page.evaluate(() => {
    const stage = document.querySelector('main.stage');
    const outside = document.body.innerText.length - (stage?.innerText.length ?? 0);
    return { stageChars: stage?.innerText.length ?? 0, outsideChars: outside };
  });
  note(
    leaked.outsideChars > 0 && leaked.stageChars > 0,
    'Stage text is separable from the shell chrome',
    `stage ${leaked.stageChars} chars, chrome ${leaked.outsideChars} chars`,
  );
}

// 4. Open a real persisted contract from the review queue. This catches hardcoded
//    sample IDs, broken dynamic routes and server/client cookie forwarding.
await page.goto(`${WEB}/review`, { waitUntil: 'networkidle' }).catch(() => {});
const reviewLink = page.locator('a[href^="/review/"]').first();
if (await reviewLink.count()) {
  await reviewLink.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  const detail = ((await page.locator('main.stage').innerText().catch(() => '')) || '').toLowerCase();
  note(detail.includes('ai-assisted contract review') && detail.includes('approval routing'), 'Persisted contract review opens end-to-end');
} else {
  note(false, 'Persisted contract review opens end-to-end', 'no reviewable contract link found');
}

// 5. No client-side crashes or server errors anywhere in the journey
note(pageErrors.length === 0, 'No uncaught page errors', pageErrors.slice(0, 2).join(' | '));
note(serverErrors.length === 0, 'No 5xx responses', serverErrors.slice(0, 2).join(' | '));

await browser.close();

console.log('='.repeat(46));
if (failures.length) {
  console.log(`  ${failures.length} journey check(s) FAILED\n`);
  process.exit(1);
}
console.log('  Journey GREEN — a user can sign in and use the core screens.\n');
