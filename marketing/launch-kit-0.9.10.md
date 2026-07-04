# 0.9.10 Launch Kit — finished posts, exact steps, fire in this order

Everything below is **ready to paste**. No placeholders except where marked ⚠️ (each one tells you
exactly where to get the value). Links that are already correct:

- Free download page: **https://sloom.studio**
- itch listing (paid $17.99): **https://sloomstudio.itch.io/signal-loom**
- Changelog: **https://sloom.studio/changelog.html**
- GitHub (source-available): **https://github.com/Es00bac/signal-loom**

Media that exists in this repo, ready to attach:
- `marketing/assets/case-file-2033-flip.gif` — comic page-flip GIF (best single attachment)
- `marketing/assets/case-file-2033-showcase.jpg` — still showcase image
- `marketing/sim-videos/brush-replay.mp4`, `flow-replay.mp4`, `paper-replay.mp4`, `video-replay.mp4`

Rules that keep posts alive: post ONE community per day, reply to every comment in the first
2 hours, never paste identical text into two subreddits. Post between 8–11am US Eastern for
Reddit if you can.

---

## 1) itch devlog — do this one first (it's your own page, nothing can go wrong)

**Why first:** itch devlogs go to everyone who ever viewed/followed the project AND show up in
itch's fresh-devlogs feed. It's free discovery with zero gatekeepers, and the buy button is on
the same page.

**Exact steps:**
1. Go to https://itch.io/dashboard (log in if asked).
2. Find **Signal Loom** in your project list → click it.
3. In the project menu bar, click **Devlog**.
4. Click the red **Create new devlog post** button.
5. **Title** — paste:
   `0.9.10 — draw on your phone, keep drawing on your desktop`
6. **Body** — paste everything between the lines:

---
Signal Loom 0.9.10 is up (Windows + Linux builds on this page are already updated).

The headline: **cross-device drawing actually works now.** Start a sketch in the Image editor on
your Android phone, open your phone's address in any desktop browser on the same Wi-Fi, hit
"Take over here" — and the full document, layers and all, is there under your cursor. Draw,
hand it back, every stroke travels both ways. No account, no cloud, nothing leaves your network.

Also in 0.9.10:
- Fixed synced documents sometimes rendering blank until the next brushstroke (compositor bug — gone).
- License activation on Android: one offline key covers desktop and phone.
- Everything from 0.9.9 rides along: motion-comic bubbles/captions on the video timeline,
  pro three-point editing (JKL shuttle, insert/overwrite, ripple/roll trims), Premiere XML export,
  AI Fix Frame in the comic-page editor.

Signal Loom is free for personal use — the one-time $17.99 commercial license unlocks the
print-production exports (KDP, PDF/X, IDML, CMYK) when you start earning with what you make.
No subscription, no watermarks, your AI keys, your files.

Full changelog: https://sloom.studio/changelog.html
---

7. Under the body, click **Add image** and attach `marketing/assets/case-file-2033-flip.gif`
   from this repo (it's on your disk at `~/work_SPaC3/flow/marketing/assets/`).
8. Click **Save & publish** (bottom of the page). You should land on the published post.

---

## 2) r/SideProject — the launch post (🟢 promo is welcome there, no warm-up needed)

**Exact steps:**
1. Go to https://www.reddit.com/r/SideProject/submit
2. Click the **Images & Video** tab.
3. Drag in `marketing/assets/case-file-2033-flip.gif`
   (from `~/work_SPaC3/flow/marketing/assets/`).
4. **Title** — paste:
   `I'm a broke solo dev and I built a local-first AI art studio you actually own — this week it learned to hand a drawing between your phone and your PC mid-stroke`
5. Reddit image posts don't take a body, so immediately after posting, click your post and
   paste this as the **first comment**:

---
Signal Loom is one app with four connected workspaces — a node graph for wiring AI models
together (bring your own keys — Gemini, OpenAI, FLUX, Stability…), a layered image editor,
a comic/print page editor, and a video timeline. One project, one shared library.

The thing I just shipped in 0.9.10: start drawing on your Android phone, open the phone's
address in your desktop browser, click "take over," and the drawing — layers and all — is live
under your mouse. Hand it back the same way. All local network, no account, no cloud.

It's free for personal use (real free — no watermarks, no trial). The one-time $17.99
commercial license unlocks print-production exports when you start selling what you make.

Free download: https://sloom.studio
itch (if you prefer it there): https://sloomstudio.itch.io/signal-loom

I'm a solo dev and this launch genuinely decides whether I can keep building it, so ask me
absolutely anything — architecture, the cross-device sync, how BYOK works, anything.
---

6. Click **Post**. Stay near your phone/PC for 2 hours and answer every comment — that's what
   the algorithm rewards.

---

## 3) r/androidapps — showcase post (🟡 read the pinned rules first; do this a day after #2)

**Exact steps:**
1. Go to https://www.reddit.com/r/androidapps/submit
2. Use the **Text** tab.
3. **Title** — paste:
   `[DEV] Signal Loom — free AI art studio (image/comic/video) that hands your drawing to your desktop browser live. No account, offline license, one-time commercial key.`
4. **Body** — paste:

---
Solo dev here. Signal Loom is a generative-media studio: node-graph AI workflows
(bring-your-own-key), a layered image editor with proper brushes and stylus support, a comic
page editor, and a video timeline — in one app, sharing one project.

The feature I'm proudest of, shipped this week: your phone can *serve* the whole app to a
desktop browser on your Wi-Fi. Draw on the phone with your S Pen, click "take over" on the PC,
and the document (layers included) continues there live. Hand it back whenever. No cloud, no
account — it's your network.

Free for personal use, no watermarks. One-time $17.99 license only if you sell what you make
with it (unlocks KDP/PDF-X/CMYK print exports).

Android build is in closed testing on Play right now — comment or DM if you want in (it's the
same free app; testers get it straight from Play). Desktop builds: https://sloom.studio
---

5. Click **Post**.

---

## 4) Play closed-testing recruitment (unlocks Play production = the long-term storefront)

You need **12 people opted in for 14 straight days**. The post above (#3) recruits them; here's
where to send people who say yes.

**Get your opt-in link (one time):**
1. Go to https://play.google.com/console and click **Signal Loom: AI Art Studio**.
2. Left sidebar → **Test and release** → **Testing** → **Closed testing**.
3. On the "Closed testing - Alpha" row, click **Manage track**.
4. Click the **Testers** tab (next to "Releases").
5. Scroll to **"How testers join your test"** → under "Join on the web", click **Copy link**.
   It looks like `https://play.google.com/apps/testing/studio.sloom.signalloom`.
6. Paste that link into a note — that's what you send every tester.

**Reply to send anyone who volunteers (paste, add the link from step 5):**

---
Thank you! Two steps:
1. Make sure the Gmail you use on your phone is the one you tell me (Google gates testers by
   account — if the group is set to a specific list I'll add you; if it's link-open, skip this).
2. Open this link on your phone and tap "Become a tester", then install from the Play page it
   shows you: <PASTE OPT-IN LINK>
Use the app whenever you like — it counts you as an active tester just by being opted in and
installed. That's it. You're directly unlocking the public Play release.
---

---

## 5) What NOT to do yet

- **r/StableDiffusion / r/comicmaking** — highest-value audiences but they burn drive-by
  promoters. They need a few days of you (or Hermes) genuinely commenting first, and the post
  must lead with an artwork/result, not the app. The drafts live in `marketing/reddit-posts.md`
  (I'll refresh them to 0.9.10 + $17.99 before you use them).
- Posting the same day everywhere. One per day. Reddit notices simultaneous cross-posts.

## The order, as a checklist

- [ ] Day 1 (today): itch devlog (#1) + r/SideProject (#2) — ~15 minutes total
- [ ] Day 1: grab the Play opt-in link (#4 steps 1–6) — 3 minutes
- [ ] Day 2: r/androidapps (#3)
- [ ] Every volunteer → send the tester reply (#4)
- [ ] I refresh the r/StableDiffusion + comic-sub drafts and the calendar (my job, not yours)
