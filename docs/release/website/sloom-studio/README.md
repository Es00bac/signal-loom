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
│   │   └── feature-graphic-1024x500.png  OG image / Play Store feature graphic
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

## Deploy command

```sh
rsync -avz --delete \
  /home/cabewse/work_SPaC3/flow/docs/release/website/sloom-studio/ \
  <user>@<vpn-host>:/var/www/sloom.studio/html/
```

Replace `<user>` and `<vpn-host>` with your actual VPN server credentials.
The `--delete` flag removes stale files from the remote. Omit it on a first
run if you want to be cautious.

## Privacy page note

`privacy.html` reproduces the exact policy text from
`release/play-store/privacy-policy.html`, restyled to match the site theme.
The Play Store listing points to `https://sloom.studio/privacy` — this file
satisfies that requirement. No symlink needed; nginx serves it directly.

## No external dependencies

All fonts use the system font stack. No CDN links. No JavaScript frameworks.
The site works fully offline and loads with zero network round-trips beyond
the HTML, one CSS file, and whichever images the browser requests.
