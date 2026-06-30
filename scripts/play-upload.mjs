#!/usr/bin/env node
// scripts/play-upload.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Upload a signed AAB to a Google Play track via the Play Developer API (headless).
//
// WHAT THIS DOES
//   Authenticates with a Google Cloud *service account* and uploads a signed bundle
//   (default: android/app/build/outputs/bundle/release/app-release.aab) to a Play
//   track, then commits the edit. Repeatable from the command line / CI.
//
// WHAT THIS DOES *NOT* DO (so there's no confusion):
//   • It does NOT create your developer account, verify identity, or set up payments.
//   • It does NOT create the app listing or fill declarations.
//   • It does NOT bypass the 12-testers / 14-day closed-test rule — that's a Google
//     *policy* gate, not a technical one. No API or CLI skips it.
//   It only automates the bundle upload once the app already exists in Console.
//
// ONE-TIME SETUP (do this in your own browser — account/identity steps aren't mine to do):
//   1. Play Console → Setup → API access → create/link a Google Cloud project.
//   2. In that GCP project: create a Service Account → create a JSON key → download it.
//   3. Play Console → Users & permissions → invite the service-account email →
//      grant "Release to testing tracks".
//   4. Enable "Google Play Android Developer API" in the GCP project.
//   5. Save the JSON key OUTSIDE the repo, e.g. ~/.config/sloom/play-sa.json
//      (it is a credential — never commit it).
//
// INSTALL (one-time):   npm i -D googleapis
//
// RUN:
//   PLAY_SA_KEY=~/.config/sloom/play-sa.json node scripts/play-upload.mjs --track alpha
//   PLAY_SA_KEY=~/.config/sloom/play-sa.json node scripts/play-upload.mjs --track internal \
//       --aab release/play-store/SignalLoom-1.0.0.aab
//
// TRACKS:  internal | alpha (= Closed testing) | beta (= Open testing) | production
//   For the 12-tester unlock you want a CLOSED test → use  --track alpha
//   (internal is instant but does NOT count toward the 14 days).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PKG = 'studio.sloom.signalloom';

// tiny --flag value parser
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    args[k] = v;
  }
}

const track = String(args.track || 'internal');
const releaseNotes = typeof args.notes === 'string'
  ? args.notes
  : 'Initial release of Signal Loom — local-first AI media suite: Flow, Image, Video, Paper.';
const keyPath = process.env.PLAY_SA_KEY || args.key;
const aabPath = resolve(String(args.aab || 'android/app/build/outputs/bundle/release/app-release.aab'));

const die = (m) => { console.error('\n✖ ' + m + '\n'); process.exit(1); };

if (!keyPath) die('Set PLAY_SA_KEY=/path/to/service-account.json (see header). That is your Google Cloud service-account key.');
if (!existsSync(keyPath)) die(`Service-account key not found: ${keyPath}`);
if (!existsSync(aabPath)) die(`AAB not found: ${aabPath}\n  Build one with:  cd android && ./gradlew bundleRelease`);

let google;
try { ({ google } = await import('googleapis')); }
catch { die('The "googleapis" package is not installed. Run:  npm i -D googleapis'); }

const auth = new google.auth.GoogleAuth({
  keyFile: keyPath,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const publisher = google.androidpublisher({ version: 'v3', auth });

console.log(`→ Package : ${PKG}`);
console.log(`→ Track   : ${track}`);
console.log(`→ Bundle  : ${aabPath}`);

try {
  const { data: edit } = await publisher.edits.insert({ packageName: PKG });
  const editId = edit.id;
  console.log(`→ Edit    : ${editId}`);

  const { data: bundle } = await publisher.edits.bundles.upload({
    packageName: PKG,
    editId,
    media: { mimeType: 'application/octet-stream', body: readFileSync(aabPath) },
  });
  const versionCode = bundle.versionCode;
  console.log(`✓ Uploaded versionCode ${versionCode}`);

  await publisher.edits.tracks.update({
    packageName: PKG,
    editId,
    track,
    requestBody: {
      track,
      releases: [{
        status: 'completed',
        versionCodes: [String(versionCode)],
        releaseNotes: [{
          language: 'en-US',
          text: releaseNotes,
        }],
      }],
    },
  });
  console.log(`✓ Assigned versionCode ${versionCode} to "${track}"`);

  await publisher.edits.commit({ packageName: PKG, editId });
  console.log(`\n✅ Committed. The build is now on the "${track}" track in Play Console.`);
  if (track === 'internal') {
    console.log('   Note: internal testing does NOT count toward the 14-day rule — use --track alpha (Closed testing) for the clock.');
  }
} catch (e) {
  const detail = e?.response?.data ? JSON.stringify(e.response.data, null, 2) : (e?.message || String(e));
  die('Play API call failed:\n' + detail +
    '\n\nCommon causes:\n' +
    '  • the app must already exist in Console (create it once via the guide §2)\n' +
    '  • the service account needs the "Release to testing tracks" permission\n' +
    '  • the Google Play Android Developer API is not enabled in the GCP project');
}
