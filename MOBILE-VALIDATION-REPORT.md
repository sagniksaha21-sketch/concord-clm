# Concord CLM — Mobile UI/UX Validation Report

Date: 2026-09-08  
Build: Concord CLM Premium UI/UX 2026, with mobile-validation remediation applied

## Executive result

**Mobile browser-layout validation: PASS after remediation.**

The first 360/390/430 px rendering pass found one material phone-shell issue: the desktop action cluster remained too dense on phones. There was no page-level horizontal overflow, but the page title was compressed to 0 px at 360, 19 px at 390 and 59 px at 430, while the mobile search target collapsed to about 20×20 px.

That was not accepted. The phone chrome was simplified so the persistent top bar now prioritizes the current page title, search and account identity. Navigation, creation, notifications and appearance remain available through the bottom navigation, More sheet and account controls.

After remediation, at 360 / 390 / 430 px:

| Check | 360 px | 390 px | 430 px | Result |
| --- | ---: | ---: | ---: | --- |
| Page-title allocation | 230 px | 260 px | 300 px | PASS |
| Search target | 44×44 | 44×44 | 44×44 | PASS |
| Account target | 46×44 | 46×44 | 46×44 | PASS |
| Page-level horizontal overflow | none | none | none | PASS |
| Bottom-nav item height | 50 px | 50 px | 50 px | PASS |
| Bottom-nav item width | 66 px | 72 px | 80 px | PASS |

## What was rendered and checked

The validation used the exact production `globals.css` from this build and DOM/class structures matching the current application shell and dense workflow components. Chromium was driven headlessly with 360×800, 390×844 and 430×932 viewports.

### Application shell

- Sticky top bar
- Page title
- Search affordance
- Account control
- Five-item mobile bottom navigation
- Cards, metrics and a wide contract table
- No document-level horizontal overflow at any tested width

### Full “More” sheet

At 360 px the sheet renders at 344 px wide with a 44×44 close control. Quick actions are ~51 px high and destination rows ~54 px high. At 430 px quick actions grow to ~77 px high. The sheet stays within the viewport and uses an internal scroll region for the destination list.

### Command centre

At 360 px the command surface is 332 px wide with no horizontal overflow. Result rows are 53–70 px high. At 390 and 430 px the layout also remains contained and readable.

### Login

The Microsoft sign-in control renders 44 px high at all three sizes. The sign-in card stays inside the viewport with no horizontal overflow.

### Dense legal workflows

Representative intake, AI-review, e-sign, pipeline and table layouts were rendered using the exact production classes:

- Intake becomes one column.
- Review document + review side panel stack vertically.
- Review tabs scroll inside their own strip rather than widening the page.
- E-sign fields stack vertically.
- Signer remove control is 44×44 after remediation.
- Stamp fields stack vertically.
- Pipeline preserves horizontal board scrolling inside the pipeline container.
- Wide contract tables scroll inside `.tbl-wrap` rather than widening the document.

At 360 px, intentional internal scroll widths were:

- Section tabs: 490 px content inside a ~326 px viewport.
- Pipeline: 936 px board inside a ~328 px viewport.
- Contract table: 640 px table inside a ~328 px viewport.

The document itself remained 360 px wide, confirming contained horizontal scrolling rather than page overflow.

## Motion, dark mode and accessibility

A 360×800 dark-mode + reduced-motion pass also passed:

- document overflow: none
- dark design tokens resolved to the expected dark surface/ink values
- route animation duration resolved to `0s`
- nav transitions collapsed to effectively zero under reduced motion

The mobile CSS also uses `env(safe-area-inset-bottom)` for bottom chrome and sheet/footer spacing. The source-level UX regression gate now explicitly protects the phone title allocation and 44 px touch targets.

## Regression gates after remediation

- UI/UX regression gate: **17 passed / 0 failed**
- Offline security preflight: **23 passed / 0 failed**
- Source invariants: **PASS**
- CSS structural check: **PASS**
- `scripts/check-ux.js` syntax: **PASS**

## Important limitation

This is a real headless-Chromium rendering and geometry validation of the exact production CSS and current application DOM/class structures, but **not a full Next.js/NestJS mobile E2E run**. The current sandbox still cannot install the workspace dependencies from the package registry, so the complete application cannot be booted here. Physical iOS Safari/Android Chrome testing, device safe-area behavior, virtual-keyboard behavior and production API interactions should still be exercised in staging before final release sign-off.

## Release view

**Phone UI architecture is now strong enough for release-candidate status.** The mobile shell, navigation, menus, command centre, login and dense workflow layouts no longer show a source/rendering blocker at the tested viewports. Final production UX certification still depends on a live staging run on real mobile browsers/devices.
