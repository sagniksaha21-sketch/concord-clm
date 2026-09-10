#!/usr/bin/env node
/**
 * Public, read-only post-deploy smoke test for the Railway staging origin.
 * It intentionally never authenticates or mutates application data.
 */

const base = (process.env.CONCORD_STAGING_URL || 'https://concord-web-production-2f17.up.railway.app').replace(/\/$/, '');
const attempts = Number(process.env.STAGING_SMOKE_ATTEMPTS || 36);
const delayMs = Number(process.env.STAGING_SMOKE_DELAY_MS || 10_000);
const timeoutMs = Number(process.env.STAGING_SMOKE_TIMEOUT_MS || 8_000);

const checks = [
  { name: 'login shell', path: '/login', expected: (response, body) => response.ok && body.includes('Sign in to Concord') },
  { name: 'liveness', path: '/api/health', expected: (response, body) => response.ok && JSON.parse(body).status === 'ok' },
  { name: 'readiness', path: '/api/health/ready', expected: (response, body) => response.ok && JSON.parse(body).status === 'ready' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      redirect: 'manual',
      headers: { accept: path === '/login' ? 'text/html' : 'application/json' },
      signal: controller.signal,
    });
    return { response, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  let lastFailure = 'unknown failure';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const results = [];
      for (const check of checks) {
        const { response, body } = await request(check.path);
        let passed = false;
        try {
          passed = check.expected(response, body);
        } catch {
          passed = false;
        }
        results.push({ name: check.name, status: response.status, passed });
      }
      const failed = results.filter((result) => !result.passed);
      if (!failed.length) {
        console.log(`PASS staging smoke · ${base} · ${results.map((result) => `${result.name}=${result.status}`).join(' · ')}`);
        return;
      }
      lastFailure = failed.map((result) => `${result.name}=${result.status}`).join(', ');
    } catch (error) {
      lastFailure = error?.name === 'AbortError' ? 'request timeout' : error?.message || 'request failed';
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(`FAIL staging smoke after ${attempts} attempts · ${lastFailure}`);
  process.exitCode = 1;
}

run();
