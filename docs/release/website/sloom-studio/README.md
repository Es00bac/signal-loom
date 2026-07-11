# sloom.studio static site

Fully static site for https://sloom.studio. No build step — raw HTML + CSS.
Deploy by rsyncing this directory to the nginx root on the VPN host.

## File list

```
sloom-studio/
├── index.html                      Home / marketing page
├── docs.html                       Getting-started + per-workspace documentation
├── examples.html                   Five example projects (fabricated-but-accurate)
├── privacy.html                    Privacy policy (exact content from play-store source)
├── README.md                       This file
├── assets/
│   ├── site.css                    Shared stylesheet (dark theme, cyan/pink/gold palette)
│   ├── graphics/
│   │   ├── icon-512.png            App icon (512×512) — used as favicon
│   │   ├── feature-graphic-sloom-1024x500.png  Current OG/Twitter share card; every og:image/twitter:image points here
│   │   └── feature-graphic-1024x500.png  Old Signal-Loom-branded card, kept in place (unreferenced) so cached links don't 404
│   └── screenshots/
│       ├── 01-portrait-painting.png        Phone: Image workspace portrait painting
│       ├── 02-atlas-ink-color.png          Phone: Atlas ink + colour pass
│       ├── 03-sketch-workflow.png          Phone: Sketch workflow in Image
│       ├── 04-video-timeline.png           Phone: Video timeline
│       ├── 05-paper-layout.png             Phone: Paper comic layout
│       ├── 06-flow-nodes.png               Phone: Flow node graph
│       ├── flow-workspace.png              Desktop: Flow workspace
│       ├── image-brush-engine.png          Desktop: Brush engine panel
│       ├── image-generative-fill.png       Desktop: Generative fill result
│       ├── tablet-01-flow-node-graph.png   Tablet: Flow node graph
│       ├── tablet-02-image-editor.png      Tablet: Image editor
│       ├── tablet-03-video-timeline.png    Tablet: Video timeline
│       ├── tablet-04-paper-layout.png      Tablet: Paper layout
│       ├── dex-image-workspace.png         DeX: Image workspace (from dev-dashboard)
│       └── phone-chrome-portrait.png       Phone chrome portrait (from dev-dashboard)
```

## URL → file mapping

| URL                         | File           | nginx try_files note          |
|-----------------------------|----------------|-------------------------------|
| https://sloom.studio/       | index.html     | default index                 |
| https://sloom.studio/docs   | docs.html      | needs `try_files $uri $uri.html` |
| https://sloom.studio/examples | examples.html | needs `try_files $uri $uri.html` |
| https://sloom.studio/privacy | privacy.html  | needs `try_files $uri $uri.html` |

The existing `nginx-sloom.studio.conf` in this directory already has `try_files`
configured. If you want clean URLs without `.html` extensions, ensure the nginx
config includes:

```nginx
try_files $uri $uri/ $uri.html =404;
```

## Deploy

Use the wrapper — it runs the verification gate first, excludes the source-only
files (`verify-site.mjs`, `deploy.sh`, `README.md`, the nginx conf), and confirms
the privacy URL is live afterward:

```sh
./deploy.sh user@vpn-host          # DRY RUN — shows what would change, touches nothing
./deploy.sh user@vpn-host --go     # real deploy (rsync --delete) + privacy-URL check
```

In a Claude Code session you can run it inline so the output lands in chat:
`! ./deploy.sh user@vpn-host` (dry run) then `! ./deploy.sh user@vpn-host --go`.

Or the raw equivalent:

```sh
rsync -avz --delete \
  --exclude verify-site.mjs --exclude deploy.sh --exclude README.md --exclude nginx-sloom.studio.conf \
  /home/cabewse/work_SPaC3/flow/docs/release/website/sloom-studio/ \
  <user>@<vpn-host>:/var/www/sloom.studio/html/
```

## Privacy page note

`privacy.html` reproduces the exact policy text from
`release/play-store/privacy-policy.html`, restyled to match the site theme.
The Play Store listing points to `https://sloom.studio/privacy` — this file
satisfies that requirement. No symlink needed; nginx serves it directly.

## Maintenance: single-source values (don't hand-edit every page)

Values that used to be duplicated across pages now have a single source, so a
change is one command instead of editing every file by hand.

### Downloads — stable symlinks (implemented)

Every HTML download link points at a **version-agnostic** name in `downloads/`
(e.g. `downloads/SloomStudio-Setup.exe`). Those are symlinks to the current
versioned build. nginx follows them, so the pages never contain a version number.

On a new release, drop the new build files into `downloads/` and run:

```sh
./repoint-downloads.sh 0.9.11     # repoints all stable symlinks to that version
./deploy.sh user@host --go        # ships the symlinks (rsync -a preserves them)
```

Stable name → what it points to:

| link in HTML                     | symlink target (current)              |
|----------------------------------|---------------------------------------|
| downloads/SloomStudio-Setup.exe  | SloomStudio-Setup-<ver>.exe           |
| downloads/SloomStudio.AppImage   | SloomStudio-<ver>-x86_64.AppImage     |
| downloads/SloomStudio.deb        | SloomStudio-<ver>-amd64.deb           |
| downloads/SloomStudio-arm64.dmg  | SloomStudio-<ver>-arm64.dmg           |
| downloads/SloomStudio-x64.dmg    | SloomStudio-<ver>-x64.dmg             |

`SHA256SUMS.txt` stays versioned on purpose (it's a checksum manifest). The
`repoint-downloads.sh` helper is source-only and excluded from deploy.

### Price change (launch $17.99 → $39 after 100 sales) — one command

The display price is hardcoded in the HTML on purpose (static price = good for
SEO and AI answer engines). When it changes, do it in one pass:

```sh
# from this directory:
sed -i 's/\$17\.99/\$39/g; s/>17\.99</>39</g' *.html
# then update the verify marker if needed and deploy
```

Check afterward with `grep -rn '17\.99' *.html` (changelog history entries may
legitimately keep an old price — review before blanket-replacing).

### Stripe buy link

English pages use one checkout URL; Japanese pages use a separate JPY checkout URL. To update them:

```sh
# English
sed -i 's#buy\.stripe\.com/OLD_EN_ID#buy.stripe.com/NEW_EN_ID#g' *.html
# Japanese
sed -i 's#buy\.stripe\.com/OLD_JA_ID#buy.stripe.com/NEW_JA_ID#g' ja/*.html
```

(A cleaner long-term option is an nginx redirect `location = /buy { return 302 <stripe-url>; }`
and linking `/buy` everywhere — server-side, do when touching the nginx config.)

## No external dependencies

All fonts use the system font stack. No CDN links. No JavaScript frameworks.
The site works fully offline and loads with zero network round-trips beyond
the HTML, one CSS file, and whichever images the browser requests.
