#!/usr/bin/env node
/* sloom.studio static-site verification — deploy gate.
   Validates the redesigned "instrument" site end-to-end: required markers on the
   home page, every asset reference resolves to a real file, no broken in-page
   anchors, and the privacy page carries the policy the Play listing links to.
   Run: `node verify-site.mjs` (exit 0 = safe to rsync). */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const pages = ['index.html', 'docs.html', 'examples.html', 'privacy.html', 'changelog.html'];
const errors = [];
const read = (f) => readFileSync(join(root, f), 'utf8');

// 1. all pages exist
for (const p of pages) {
  if (!existsSync(join(root, p))) errors.push(`Missing page: ${p}`);
}

// 2. redesigned home page carries its key markers
const index = read('index.html');
const indexMarkers = [
  ['instrument theme color', 'content="#04070d"'],
  ['hero node-graph canvas', 'id="loom"'],
  ['hero headline', 'One you own.'],
  ['workstation section', 'id="workstation"'],
  ['interactive workstation stage', 'id="stage-img"'],
  ['Flow workstation tab', 'data-shot="tablet-01-flow-node-graph"'],
  ['Image workstation tab', 'data-shot="tablet-02-image-editor"'],
  ['Paper workstation tab', 'data-shot="tablet-04-paper-layout"'],
  ['Video workstation tab', 'data-shot="tablet-03-video-timeline"'],
  ['provider patch bay', 'id="keys"'],
  ['Android / phone-as-host section', 'id="android"'],
  ['LAN host port', ':8723'],
  ['Samsung DeX mention', 'Samsung DeX'],
  ['license section', 'id="license"'],
  ['launch price', '9.99'],
  ['regular price strike', '19.99'],
];
for (const [label, snippet] of indexMarkers) {
  if (!index.includes(snippet)) errors.push(`index.html missing ${label}: ${snippet}`);
}

// 3. shared shell on every inner page (one crafted site, not a template)
for (const p of pages.filter((x) => x !== 'index.html')) {
  const h = read(p);
  if (!h.includes('assets/site.css')) errors.push(`${p} does not link the shared stylesheet`);
  if (!h.includes('class="site-header"')) errors.push(`${p} missing the shared top bar`);
  if (!h.includes('class="site-footer"')) errors.push(`${p} missing the shared footer`);
}

// 4. no broken in-page anchors — the redesign renamed #pricing → #license
for (const p of pages) {
  const h = read(p);
  if (h.includes('#pricing')) errors.push(`${p} still links the removed #pricing anchor (use #license)`);
}

// 5. every referenced asset resolves to a real, non-trivial file
const assetRe = /(?:src|href)="(assets\/[^"]+)"/g;
const seen = new Set();
for (const p of pages) {
  const h = read(p);
  let m;
  while ((m = assetRe.exec(h))) {
    const asset = m[1].split('?')[0]; // cache-busting queries (?v=N) are not part of the file path
    if (seen.has(asset)) continue;
    seen.add(asset);
    const path = join(root, asset);
    if (!existsSync(path)) { errors.push(`Missing asset (${p}): ${asset}`); continue; }
    if (statSync(path).size < 256) errors.push(`Asset suspiciously small (${p}): ${asset}`);
  }
}

// 6. privacy page satisfies the Play Store policy-URL requirement
const privacy = read('privacy.html');
for (const [label, snippet] of [
  ['policy heading', 'Privacy Policy'],
  ['local-first statement', 'local-first'],
  ['no-data-collection statement', 'no personal data'],
  ['contact email', '@sloom.studio'],
]) {
  if (!privacy.includes(snippet)) errors.push(`privacy.html missing ${label}: ${snippet}`);
}

if (errors.length) {
  console.error(`sloom.studio verification FAILED (${errors.length}):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`sloom.studio static site verification passed — ${pages.length} pages, ${seen.size} assets, anchors + privacy OK`);
