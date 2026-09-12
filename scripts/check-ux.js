#!/usr/bin/env node
/**
 * Concord UI/UX regression gate.
 * Keeps the interaction/accessibility foundations added in the premium shell
 * from being accidentally removed by a future visual refactor.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const shell = read('apps/web/components/AppShell.tsx');
const navigation = read('apps/web/components/workspace-navigation.tsx');
const palette = read('apps/web/components/CommandPalette.tsx');
const css = read('apps/web/app/globals.css');
const env = read('.env.example');

const checks = [
  ['permission-filtered adaptive navigation', shell.includes("NAV.filter((n) => !n.needs") && shell.includes('is-sidebar-collapsed')],
  ['shared primary navigation and discoverable specialist tools', shell.includes('PRIMARY_NAV.includes') && shell.includes('href="/workspace"') && ['Draft & review', 'Library & insights', 'Signing', 'Administration'].every(x => navigation.includes(x))],
  ['full mobile More sheet', shell.includes('mobile-sheet') && shell.includes('Everything in one place')],
  ['mobile dialog traps keyboard focus', shell.includes('trapDialogTab') && shell.includes('aria-modal="true"')],
  ['command centre exposes recent + quick actions', palette.includes("section: 'Recent'") && palette.includes("section: 'Quick actions'")],
  ['command centre traps keyboard focus', palette.includes("e.key === 'Tab'") && palette.includes('aria-modal="true"')],
  ['slash and Cmd/Ctrl-K shortcuts', shell.includes("e.key === '/'") && shell.includes("e.key.toLowerCase() === 'k'")],
  ['system/light/dark appearance controls', shell.includes("chooseAppearance('system')") && shell.includes("chooseAppearance('light')") && shell.includes("chooseAppearance('dark')")],
  ['route motion layer', css.includes('@keyframes routeEnter') && css.includes('.route-view')],
  ['reduced-motion safety', css.includes('@media(prefers-reduced-motion:reduce)') || css.includes('@media (prefers-reduced-motion:reduce)')],
  ['progressive reduced-transparency support', css.includes('@media(prefers-reduced-transparency:reduce)')],
  ['keyboard focus-visible treatment', css.includes(':focus-visible') && css.includes('--focus-ring')],
  ['safe-area-aware mobile chrome', css.includes('env(safe-area-inset-bottom)')],
  ['phone topbar preserves title instead of compressing it', css.includes('.topbar>.hamburger,.topbar>.quick-menu,.topbar>.icon-btn{display:none}') && css.includes('.page-title{flex:1;min-width:0}')],
  ['phone search and sheet close meet 44px premium touch target', css.includes('.top-search{margin-left:0;width:44px;min-width:44px;height:44px;min-height:44px') && css.includes('.sheet-close{width:44px;height:44px}')],
  ['mobile e-sign utility controls meet 44px target', css.includes('.signatory-row>button{width:44px;height:44px}')],
  ['showcase splash is opt-in', env.includes('NEXT_PUBLIC_SHOWCASE_SPLASH=false')],
];

let failed = 0;
console.log('Concord — UI/UX regression gate\n' + '='.repeat(40));
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
}
console.log('='.repeat(40));
console.log(`  ${checks.length - failed} passed · ${failed} failed`);
if (failed) process.exit(1);
