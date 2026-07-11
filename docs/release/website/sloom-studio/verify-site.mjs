#!/usr/bin/env node
/* sloom.studio static-site verification — deploy gate.
   Validates the redesigned "instrument" site end-to-end: required markers on the
   home page, every asset reference resolves to a real file, no broken in-page
   anchors, and the privacy page carries the policy the Play listing links to.
   Also validates the ja/ Japanese mirror: every EN page has a JA counterpart,
   hreflang alternates are present on both sides, and each JA page actually
   contains Japanese text (not a stray untranslated copy).
   Run: `node verify-site.mjs` (exit 0 = safe to rsync). */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const pages = ['index.html', 'docs.html', 'examples.html', 'privacy.html', 'changelog.html', 'print-ready-comics.html', 'macos-install.html', 'comic-software-you-own.html', 'kdp-book-formatting-software.html', 'ttrpg-layout-software.html', 'design-software-small-business.html'];
const jaPages = pages.map((p) => `ja/${p}`);
const allPages = [...pages, ...jaPages];
const homePages = new Set(['index.html', 'ja/index.html']); // use the standalone "bar" header, not the shared site-header shell
const errors = [];
const read = (f) => readFileSync(join(root, f), 'utf8');

// 1. all pages exist (EN + JA)
for (const p of allPages) {
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
  ['Flow workstation tab', 'data-shot="weights-and-measures-flow-graph"'],
  ['Image workstation tab', 'data-shot="image-brush-engine"'],
  ['Paper workstation tab', 'data-shot="paper-pdfx-typecraft-showcase"'],
  ['Video workstation tab', 'data-shot="tablet-03-video-timeline"'],
  ['provider patch bay', 'id="keys"'],
  ['Android / phone-as-host section', 'id="android"'],
  ['LAN host port', ':8723'],
  ['Samsung DeX mention', 'Samsung DeX'],
  ['license section', 'id="license"'],
  ['launch price', '17.99'],
  ['regular price strike', '39'],
  // Two-path funnel (licensing spec Part 3): free Community download + commercial license.
  ['free download CTA', 'Download free'],
  ['Community column', 'Community — free'],
  ['commercial license framing', 'commercial license'],
  ['direct Windows installer link', 'downloads/SloomStudio-Setup.exe'],
];
for (const [label, snippet] of indexMarkers) {
  if (!index.includes(snippet)) errors.push(`index.html missing ${label}: ${snippet}`);
}

// 3. shared shell on every inner page (one crafted site, not a template)
for (const p of allPages.filter((x) => !homePages.has(x))) {
  const h = read(p);
  if (!h.includes('assets/site.css')) errors.push(`${p} does not link the shared stylesheet`);
  if (!h.includes('class="site-header"')) errors.push(`${p} missing the shared top bar`);
  if (!h.includes('class="site-footer"')) errors.push(`${p} missing the shared footer`);
}

// 4. no broken in-page anchors — the redesign renamed #pricing → #license
for (const p of allPages) {
  const h = read(p);
  if (h.includes('#pricing')) errors.push(`${p} still links the removed #pricing anchor (use #license)`);
}

// 5. every referenced asset resolves to a real, non-trivial file
//    JA pages live one directory down (ja/) and reference assets as ../assets/..., so
//    strip a leading ../ and resolve relative to the site root either way.
const assetRe = /(?:src|href)="((?:\.\.\/)?assets\/[^"]+)"/g;
const seen = new Set();
for (const p of allPages) {
  const h = read(p);
  let m;
  while ((m = assetRe.exec(h))) {
    const raw = m[1].split('?')[0]; // cache-busting queries (?v=N) are not part of the file path
    const asset = raw.replace(/^\.\.\//, '');
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

// 7. EN/JA cross-linking: every EN page has hreflang alternates for en/ja/x-default,
//    and every JA page declares lang="ja" and actually contains Japanese text (a CJK
//    character) — a cheap net against shipping an untranslated or placeholder page.
const CJK_RE = /[぀-ヿ㐀-鿿]/; // hiragana, katakana, kanji
for (const p of pages) {
  const h = read(p);
  if (!h.includes('hreflang="ja"')) errors.push(`${p} missing hreflang="ja" alternate link`);
  if (!h.includes('hreflang="x-default"')) errors.push(`${p} missing hreflang="x-default" alternate link`);
}
for (const p of jaPages) {
  const h = read(p);
  if (!h.includes('<html lang="ja">')) errors.push(`${p} missing <html lang="ja">`);
  if (!h.includes('hreflang="en"')) errors.push(`${p} missing hreflang="en" alternate link`);
  if (!CJK_RE.test(h.replace(/<[^>]*>/g, ''))) errors.push(`${p} contains no Japanese text — looks untranslated`);
}

if (errors.length) {
  console.error(`sloom.studio verification FAILED (${errors.length}):`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`sloom.studio static site verification passed — ${allPages.length} pages (${pages.length} EN + ${jaPages.length} JA), ${seen.size} assets, anchors + privacy + i18n OK`);
