import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const html = readFileSync(join(root, 'index.html'), 'utf8');

const requiredSnippets = [
  ['hero section', 'data-site-section="hero"'],
  ['feature documentation section', 'data-site-section="features"'],
  ['workspace documentation section', 'data-site-section="workspaces"'],
  ['mobile interface demo section', 'data-site-section="mobile-demo"'],
  ['platform section', 'data-site-section="platform"'],
  ['phone demo shell', 'data-mobile-demo-shell="true"'],
  ['top drawer', 'data-demo-drawer="top"'],
  ['left drawer', 'data-demo-drawer="left"'],
  ['right drawer', 'data-demo-drawer="right"'],
  ['bottom drawer', 'data-demo-drawer="bottom"'],
  ['hide interface button', 'data-demo-action="hide-interface"'],
  ['restore interface button', 'data-demo-action="restore-interface"'],
  ['Flow demo tab', 'data-demo-workspace="flow"'],
  ['Image demo tab', 'data-demo-workspace="image"'],
  ['Paper demo tab', 'data-demo-workspace="paper"'],
  ['Video demo tab', 'data-demo-workspace="video"'],
  ['simulated mock document copy', 'Mock project'],
  ['Signal Loom product description', 'AI post-production studio'],
  ['Android DeX mention', 'Samsung DeX'],
];

for (const [label, snippet] of requiredSnippets) {
  if (!html.includes(snippet)) {
    throw new Error(`Missing ${label}: ${snippet}`);
  }
}

for (const asset of [
  'assets/generated/signal-loom-hero.png',
  'assets/generated/signal-loom-workspaces.png',
]) {
  const size = statSync(join(root, asset)).size;
  if (size < 1024) {
    throw new Error(`Generated asset is too small: ${asset}`);
  }
}

console.log('sloom.studio static site verification passed');
