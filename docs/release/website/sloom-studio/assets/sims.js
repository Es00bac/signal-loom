/* Signal Loom interface replays — <sl-sim kind="flow|paper|sfx|brush|video">
   Grounded in the real application source:
   - tokens from src/index.css       (--sl-surface #11141d, --sl-panel #1a1b23,
                                       --sl-border #263244, --sl-accent #22d3ee,
                                       --sl-text #f3f7fb, --sl-muted #92a3b8)
   - Flow nodes from BaseNode.tsx + nodeTheme.ts (260px cards, gradient tints,
     24px round ports w/ 3px #1e2027 border, white Run pill, blue segmented tabs)
   - Image toolbar from ImageEditorToolbar.tsx (64px, 2-col 32px square tiles,
     #151720 bg, #252936 borders, solid cyan active tile, FG/BG color well)
   - Paper tools from paperToolRegistry.ts (16 tools incl. gutter knife)
   - dockable panel chrome + collapsed side drawers from the shipped app        */
(function(){
'use strict';

var ASSETS = 'sim-assets/';

/* ── minimal stroke icons (lucide-style, 24 viewBox, stroke=currentColor) ── */
function ic(paths, extra){
  return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">'+paths+(extra||'')+'</svg>';
}
var ICONS = {
  undo: ic('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: ic('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  cut: ic('<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8 7.5 20 20M8 16.5 20 4"/>'),
  copy: ic('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  paste: ic('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 6 0"/>'),
  pointer: ic('<path d="M5 3 12 21l2.2-6.8L21 12z"/>'),
  hand: ic('<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v6.5"/><path d="M17 12.5c1.5-1.5 3.2-.6 2.4 1.2L17 19a5 5 0 0 1-4.6 3H11a5 5 0 0 1-5-5v-4a1.5 1.5 0 0 1 3-.3"/>'),
  marquee: ic('<path d="M5 3h-1a1 1 0 0 0-1 1v1M10 3h2M17 3h2M21 8v2M21 15v2M3 8v2M3 15v2M5 21h-1a1 1 0 0 1-1-1v-1M10 21h2M17 21h2M21 20a1 1 0 0 1-1 1M20 3a1 1 0 0 1 1 1"/>'),
  lasso: ic('<ellipse cx="12" cy="9" rx="8" ry="5.5"/><path d="M6.5 13.5C5 16 5.5 19 8 20.5"/><circle cx="8.5" cy="20.5" r="1.6"/>'),
  wand: ic('<path d="m14 6 4 4L7 21l-4-4z"/><path d="M15 3v2M20 8h2M18 4l1.5-1.5"/>'),
  brush: ic('<path d="m15 4 5 5-8.5 8.5a3 3 0 0 1-5-2.2c0-1.9-1.5-2.3-3-1.8C5.5 10 9 6 15 4z"/>'),
  eraser: ic('<path d="m6 20 -3-3a2 2 0 0 1 0-2.8l9-9a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L13 20z"/><path d="M6 20h14"/>'),
  stamp: ic('<path d="M6 21h12"/><path d="M5 17a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1H5z"/><path d="M14 8.5c0-2 1-3 1-4.5a3 3 0 0 0-6 0c0 1.5 1 2.5 1 4.5 0 2-1.5 3.5-4 4.5v3h12v-3c-2.5-1-4-2.5-4-4.5z" transform="scale(.9) translate(1.4 0)"/>'),
  bandage: ic('<rect x="2" y="8" width="20" height="8" rx="3" transform="rotate(-35 12 12)"/><path d="M11 11h.01M13 13h.01"/>'),
  droplet: ic('<path d="M12 3c3.5 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2.5-6 6-10z"/>'),
  focus: ic('<circle cx="12" cy="12" r="4"/><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/>'),
  wind: ic('<path d="M3 8h9a2.5 2.5 0 1 0-2.4-3.2"/><path d="M3 12h13a2.5 2.5 0 1 1-2.4 3.2"/><path d="M3 16h6a2 2 0 1 1-1.9 2.6"/>'),
  sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: ic('<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z"/>'),
  bucket: ic('<path d="m5 11 8-8 7 7-8 8a2.5 2.5 0 0 1-3.5 0L5 14.5a2.5 2.5 0 0 1 0-3.5z"/><path d="M2 21c0-1.2 1-3 2-3s2 1.8 2 3a2 2 0 0 1-4 0z"/>'),
  blend: ic('<circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>'),
  pen: ic('<path d="m12 19-7 2 2-7L16.5 4.5a2.1 2.1 0 0 1 3 3z"/><path d="m14 7 3 3"/>'),
  square: ic('<rect x="4" y="4" width="16" height="16" rx="1.5"/>'),
  circle: ic('<circle cx="12" cy="12" r="8.5"/>'),
  crop: ic('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>'),
  type: ic('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  pipette: ic('<path d="m3 21 1-4L14 7l3 3L7 20z"/><path d="m13 6 2-2a2.5 2.5 0 0 1 3.5 0l1.5 1.5a2.5 2.5 0 0 1 0 3.5l-2 2"/>'),
  sparkles: ic('<path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7z"/><path d="M19 15v4M17 17h4"/>'),
  imageoff: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 21 7-7 3 3"/><path d="M3 3l18 18" stroke-width="1.6"/>'),
  swap: ic('<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>'),
  reset: ic('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  more: ic('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  bookmark: ic('<path d="M6 4h12v17l-6-4-6 4z"/>'),
  play: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" style="display:block"><path d="M6 4l14 8-14 8z"/></svg>',
  layers: ic('<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
  image: ic('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5.5-5.5L15 18l3-3 3 3"/>'),
  text: ic('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  panel: ic('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 10h18M12 10v11"/>'),
  line: ic('<path d="M5 19 19 5"/>'),
  triangle: ic('<path d="M12 4 21 20H3z"/>'),
  pentagon: ic('<path d="M12 3l8.5 6.2-3.2 9.8H6.7L3.5 9.2z"/>'),
  hexagon: ic('<path d="M8 3h8l4 9-4 9H8l-4-9z" transform="rotate(90 12 12)"/>'),
  polygon: ic('<path d="M4 8 12 3l8 5-2 10-6 3-8-4z"/>'),
  speech: ic('<path d="M21 12a8 8 0 0 1-8 8H5l2-3a8 8 0 1 1 14-5z"/>'),
  thought: ic('<circle cx="12" cy="10" r="7"/><circle cx="6.5" cy="19" r="1.6"/><circle cx="4" cy="22" r="1"/>'),
  caption: ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h6"/>'),
  knife: ic('<path d="M4 20 18 6a2.5 2.5 0 0 0-3.5-3.5L4 13v7z"/><path d="m9 8 6 6"/>')
};

/* ───────────────────────── shared CSS (real app tokens) ───────────────────────── */
var CSS = `
:host{display:block;width:100%;
  --bg:#060a0e; --surface:#0a1118; --panel:#0d151d; --border:#1d3d4b;
  --ink:#d9edf4; --muted:#6e93a4; --accent:#22d3ee; --danger:#fb7185;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --sans:'IBM Plex Sans',system-ui,sans-serif;
  --ease:cubic-bezier(.22,.61,.2,1);
  font-family:var(--sans);color:var(--ink)}
*{box-sizing:border-box;margin:0;padding:0}
img{-webkit-user-drag:none;user-select:none}
.fd-stage{position:relative;width:100%;aspect-ratio:1100/640;container-type:inline-size;
  font-size:clamp(6px,1.1cqw,12px);overflow:hidden;background:var(--bg);border-radius:8px;
  border:1px solid var(--border)}
.fd-canvas{position:absolute;inset:10.4% 0 0 0;
  background-image:radial-gradient(rgba(146,163,184,.16) 1px,transparent 1px);background-size:2.2em 2.2em}
.fd-canvas>*{position:absolute}
.pp .fd-canvas,.sx .fd-canvas{background-image:none;background:#0d0f15}
.vd .fd-canvas{background-image:none;background:#08090d}
.br .fd-canvas{background-image:none;background:#0b0c10;top:14.8%}

/* ── app chrome: workspace switcher row + menu row + doc tabs ── */
.fd-bar1{position:absolute;inset:0 0 auto 0;height:5.6%;display:flex;align-items:center;gap:.4em;
  padding-inline:.9em;background:color-mix(in srgb,var(--surface) 92%,black);
  border-bottom:1px solid color-mix(in srgb,var(--accent) 22%,transparent);z-index:6;
  font-size:.95em;color:var(--muted)}
.fd-appico{width:2.2em;height:2.2em;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);border-radius:.45em;display:grid;
  place-items:center;color:var(--accent);font-size:.9em;flex:none;background:rgba(34,211,238,.06)}
.fd-wsgroup{display:flex;gap:.35em;border:1px solid var(--border);border-radius:.6em;
  padding:.22em .35em;background:color-mix(in srgb,var(--panel) 72%,transparent);flex:none}
.fd-wsgroup i{height:1.5em;width:1.7em;border-radius:.35em;border:1px solid transparent;
  display:grid;place-items:center;font-style:normal;flex:none}
.fd-wsgroup i img{width:1.1em;height:1.1em;border-radius:.22em;display:block;object-fit:contain}
.fd-wsgroup i.on{border-color:color-mix(in srgb,var(--accent) 65%,transparent);background:rgba(34,211,238,.12);position:relative}
.fd-wsgroup i.on::after{content:"";position:absolute;right:-.28em;top:-.28em;width:.5em;height:.5em;border-radius:50%;background:#f472b6}
.fd-chipbtn{border:1px solid color-mix(in srgb,var(--accent) 18%,transparent);border-radius:.45em;padding:.24em .5em;font-size:.6em;
  color:var(--ink);background:color-mix(in srgb,var(--panel) 72%,transparent);white-space:nowrap;flex:none}
.fd-chipbtn.hot{color:#ffe9ad;border-color:rgba(255,181,61,.4)}
.fd-chipbtn.lit{background:color-mix(in srgb,var(--accent) 18%,var(--panel));border-color:color-mix(in srgb,var(--accent) 54%,transparent);font-weight:600}
.fd-bar1 .grow{flex:1}
.fd-zoom{display:flex;gap:.3em;align-items:center;font-size:.72em;flex:none}
.fd-zoom b{border:1px solid var(--border);border-radius:.45em;padding:.28em .6em;font-weight:500;color:var(--muted);background:color-mix(in srgb,var(--panel) 72%,transparent)}
.fd-cost{display:flex;align-items:center;gap:.5em;border:1px solid var(--border);border-radius:.55em;
  padding:.32em .8em;font-family:var(--mono);font-size:.7em;color:#5ce6a1;white-space:nowrap;background:color-mix(in srgb,var(--panel) 72%,transparent)}
.fd-cost::after{content:"▾";color:var(--muted)}
.fd-bar2{position:absolute;left:0;right:0;top:5.6%;height:4.6%;display:flex;align-items:center;gap:.35em;
  padding-inline:.9em;background:color-mix(in srgb,var(--bg) 86%,var(--panel));border-bottom:1px solid var(--border);z-index:6}
.fd-bar2 b{border:1px solid color-mix(in srgb,var(--border) 82%,transparent);border-radius:.4em;padding:.22em .75em;font-size:.68em;
  font-weight:480;color:var(--muted);background:color-mix(in srgb,var(--panel) 45%,transparent)}
.fd-bar2 .grow{flex:1}
.fd-bar2 u{text-decoration:none;color:var(--muted);font-size:.85em}
.fd-tabsrow{position:absolute;left:0;right:0;top:10.2%;height:4.4%;display:flex;align-items:center;gap:.4em;
  padding-inline:.9em;background:color-mix(in srgb,var(--bg) 92%,black);border-bottom:1px solid var(--border);z-index:6;font-size:.7em}
.fd-tabsrow b{color:var(--muted);font-weight:400;padding:.15em .4em}
.fd-tabsrow .doctab{display:flex;align-items:center;gap:.6em;border:1px solid var(--border);
  border-bottom-color:transparent;border-radius:.45em .45em 0 0;padding:.28em .9em;color:var(--ink);
  background:color-mix(in srgb,var(--panel) 76%,transparent)}
.fd-tabsrow .doctab i{width:.45em;height:.45em;border-radius:50%;background:#5ce6a1;font-style:normal}

/* ── dockable panel chrome (DockablePanel) ── */
.slp{position:absolute;background:var(--panel);border:1px solid var(--border);
  border-radius:.35em;overflow:hidden;display:flex;flex-direction:column;
  box-shadow:0 18px 48px rgba(0,0,0,.45)}
.slp-h{display:flex;align-items:center;gap:.5em;font-size:.62em;font-weight:600;letter-spacing:.14em;
  text-transform:uppercase;color:#57b8cf;padding:.55em .9em;border-bottom:1px solid var(--border);
  background:color-mix(in srgb,var(--panel) 78%,var(--surface));white-space:nowrap;overflow:hidden;flex:none}
.slp-h::before{content:"⋮⋮⋮";letter-spacing:-.1em;color:var(--muted)}
.slp-h .grow{flex:1}
.slp-h s{text-decoration:none;border:1px solid var(--border);border-radius:.3em;padding:.05em .45em;
  letter-spacing:.02em;color:var(--muted);flex:none;font-weight:400}
.slp-b{padding:.7em .8em;display:flex;flex-direction:column;gap:.55em;min-height:0;overflow:hidden;flex:1}
.slp-sec{font-size:.6em;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-top:.3em}
.slp-row{display:flex;align-items:center;gap:.6em;font-size:.72em;color:var(--ink)}
.slp-row>span:first-child{flex:1;white-space:nowrap;overflow:hidden;color:var(--muted)}
.slp-row b{font-family:var(--mono);font-size:.9em;color:var(--ink);white-space:nowrap;font-weight:500}
.slp-slider{flex:none;width:7.2cqw;height:.4em;border-radius:99em;background:color-mix(in srgb,var(--border) 80%,transparent);position:relative}
.slp-slider i{position:absolute;left:0;top:0;bottom:0;background:var(--accent);border-radius:99em;transition:width .7s var(--ease)}
.slp-slider i::after{content:"";position:absolute;right:-.45em;top:50%;width:.9em;height:.9em;margin-top:-.45em;
  border-radius:50%;background:var(--accent);box-shadow:0 0 4px rgba(0,0,0,.6)}
.slp-select{border:1px solid var(--border);border-radius:.4em;padding:.32em .6em;font-size:.7em;
  color:var(--ink);background:color-mix(in srgb,var(--bg) 66%,var(--panel));display:flex;justify-content:space-between;gap:.6em}
.slp-select::after{content:"▾";color:var(--muted)}
.slp-input{border:1px solid var(--border);border-radius:.4em;padding:.3em .55em;font-size:.72em;
  color:var(--ink);background:color-mix(in srgb,var(--bg) 66%,var(--panel));font-family:var(--mono)}
.slp-tabs{display:flex;gap:.25em;align-items:center;border-bottom:1px solid var(--border);padding-bottom:.45em}
.slp-tabs b{font-size:.62em;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
  padding:.25em .65em;border-radius:.35em;font-weight:500}
.slp-tabs b.on{color:var(--ink);background:color-mix(in srgb,var(--accent) 14%,var(--panel));border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)}
.slp-swatch{width:1.3em;height:1.3em;border-radius:.3em;border:1px solid rgba(255,255,255,.3);flex:none;transition:background .5s}
.slp-ok{color:#5ce6a1;font-size:.62em;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.slp-seg{display:grid;grid-template-columns:1fr 1fr;gap:.4em}
.slp-seg b{border:1px solid var(--border);border-radius:.4em;padding:.35em .5em;text-align:center;
  font-size:.62em;font-weight:500;color:var(--muted);background:color-mix(in srgb,var(--panel) 60%,transparent)}
.slp-seg b.on{color:var(--ink);background:color-mix(in srgb,var(--accent) 15%,var(--panel));border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.slp-btn{border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:.4em;padding:.3em .7em;
  color:var(--ink);background:color-mix(in srgb,var(--accent) 12%,var(--panel));font-size:.62em;font-weight:600;text-align:center;white-space:nowrap}
/* collapsed dock drawers on the panel rail (right edge) */
.slp.dock{border-radius:.15em;box-shadow:none}
.br .itb{left:13cqw}
.br .sl-drawer{right:15.2cqw}
.fd-seg2{display:inline-flex;border:1px solid var(--border);border-radius:.45em;overflow:hidden;flex:none;font-size:.6em}
.fd-seg2 b{padding:.28em .6em;color:var(--muted);font-weight:500}
.fd-seg2 b.on{color:#bfefff;background:color-mix(in srgb,var(--accent) 14%,var(--panel))}
.fd-tabsrow .grow{flex:1}
.fd-tabsrow .doctab.dim{color:var(--muted);background:transparent;border-color:transparent}
.env-grp{display:flex;flex-direction:column;gap:.15em;font-size:.6em;font-weight:600;color:#c9a9f2;
  background:linear-gradient(90deg,rgba(139,92,246,.16),rgba(139,92,246,.04));
  border:1px solid rgba(139,92,246,.3);border-radius:.35em;padding:.4em .5em;margin-top:.2em}
.env-grp i{font-style:normal;font-size:.82em;font-weight:500;letter-spacing:.1em;color:#9a86c0}
.bin-item.ass{align-items:stretch;gap:.4em;padding:.4em .45em;position:relative}
.bin-item.ass .ck{width:.85em;height:.85em;border:1px solid var(--border);border-radius:.2em;flex:none;margin-top:.1em;background:#07090c}
.bin-item.ass img{width:2.6em;height:2em;border-radius:.25em;object-fit:cover;flex:none}
.bin-item.ass .col{display:flex;flex-direction:column;gap:.1em;min-width:0;flex:1}
.bin-item.ass .nm{color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.92em}
.bin-item.ass .mt{font-size:.78em;letter-spacing:.06em;color:var(--muted)}
.bin-item.ass .drg{font-size:.78em;color:#57b8cf}
.bin-item.ass .rowb{display:flex;flex-direction:column;gap:.2em;flex:none}
.bin-item.ass .rowb i{font-style:normal;width:1.2em;height:1.1em;display:grid;place-items:center;border:1px solid var(--border);border-radius:.2em;color:var(--muted);font-size:.62em}
.slp-mini2{display:grid;grid-template-columns:1fr 1fr;gap:.4em}
.slp-mini2 label{display:flex;flex-direction:column;gap:.15em;font-size:.6em;color:var(--muted)}
.slp-mini2 span{border:1px solid var(--border);border-radius:.35em;padding:.25em .45em;color:var(--ink);font-family:var(--mono);font-size:.9em;text-align:right;background:#07090c}
.slp-chks{display:flex;flex-wrap:wrap;gap:.7em;font-size:.66em;color:var(--muted)}
.slp-chks span{display:flex;align-items:center;gap:.35em}
.slp-chks .chk{width:.8em;height:.8em;border:1px solid var(--border);border-radius:.2em;background:#07090c;display:inline-block}
.slp-sec .actn{float:right;font-style:normal;font-size:.82em;font-weight:600;letter-spacing:.08em;color:#57b8cf;
  border:1px solid var(--border);border-radius:.3em;padding:.02em .4em}
.lybtn{width:1.5em;height:1.4em;display:grid;place-items:center;border:1px solid var(--border);border-radius:.3em;
  color:var(--muted);font-size:.9em;flex:none}
.slp-mgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.3em}
.slp-filters{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.25em;font-size:.56em}
.slp-filters span{border:1px solid var(--border);border-radius:.3em;padding:.2em .35em;color:var(--muted);
  background:#07090c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl-drawer{position:absolute;right:0;width:2cqw;background:color-mix(in srgb,var(--surface) 92%,black);
  border:1px solid var(--border);border-right:0;border-radius:.4em 0 0 .4em;z-index:5;
  display:flex;flex-direction:column;align-items:center;gap:.6em;padding:.6em 0}
.sl-drawer u{text-decoration:none;color:var(--muted);font-size:.75em}
.sl-drawer span{writing-mode:vertical-rl;font-size:.6em;font-weight:600;letter-spacing:.18em;
  text-transform:uppercase;color:var(--muted);white-space:nowrap}

/* ── source bin / library items ── */
.bin-item{display:flex;align-items:center;gap:.6em;border:1px solid var(--border);border-radius:.45em;padding:.45em .55em;
  font-size:.66em;color:var(--muted);background:color-mix(in srgb,var(--bg) 55%,var(--panel));white-space:nowrap;overflow:hidden;transition:border-color .3s,box-shadow .3s}
.bin-item img,.bin-item svg.wave{width:2.4em;height:2.4em;border-radius:.3em;object-fit:cover;flex:none}
.bin-item .nm{color:var(--ink);font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis}
.bin-item .mt{font-size:.85em;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.bin-item.new,.bin-item.sel{border-color:color-mix(in srgb,var(--accent) 55%,transparent);
  box-shadow:0 0 .9em -.2em color-mix(in srgb,var(--accent) 70%,transparent)}
.bin-head{display:flex;align-items:center;gap:.4em;font-size:.72em;font-weight:600;color:var(--ink)}
.bin-head u{text-decoration:none;margin-left:auto;font-family:var(--mono);font-size:.8em;color:var(--muted);
  border:1px solid var(--border);border-radius:.4em;padding:.05em .45em}
.bin-sub{font-size:.56em;color:var(--muted);line-height:1.45}
.bin-chips{display:flex;flex-wrap:wrap;gap:.3em;font-size:.56em;color:var(--muted)}
.bin-chips b{font-weight:450;border:1px solid var(--border);border-radius:.4em;padding:.18em .45em;white-space:nowrap}
.bin-search{border:1px solid var(--border);border-radius:.4em;padding:.3em .55em;font-size:.62em;color:var(--muted);
  background:color-mix(in srgb,var(--bg) 66%,var(--panel))}

/* ── FLOW: node cards measured from Screenshot_20260701_094431 ── */
.nd{position:absolute;z-index:3;font-size:.78em;border-radius:.9em;
  border:1px solid color-mix(in srgb,var(--acc,#8b8f98) 22%,#232a2f);
  background:linear-gradient(165deg,color-mix(in srgb,var(--acc,#8b8f98) 7%,#171b1d),#14181b 40%,#111518);
  box-shadow:0 18px 40px -18px rgba(0,0,0,.65);
  opacity:0;transform:scale(.9);transition:opacity .45s var(--ease),transform .45s var(--ease)}
.nd.on{opacity:1;transform:none}
.nh{display:flex;align-items:center;gap:.5em;padding:.55em .7em;border-radius:.9em .9em 0 0;
  border-bottom:1px solid color-mix(in srgb,var(--acc) 18%,transparent);
  background:linear-gradient(90deg,color-mix(in srgb,var(--acc) 12%,transparent),transparent 70%);
  font-size:.72em;font-weight:600;color:#dbe5e0;white-space:nowrap;overflow:hidden}
.nh .nico{width:1.1em;height:1.1em;flex:none;color:color-mix(in srgb,var(--acc) 80%,#fff)}
.nh .nico svg{width:100%;height:100%}
.nh .nact{margin-left:auto;display:flex;gap:.3em;flex:none}
.nh .nact i{min-width:1.5em;height:1.3em;padding:0 .2em;border-radius:.3em;border:1px solid rgba(90,100,110,.4);
  background:rgba(10,12,15,.4);color:#8b98a3;display:grid;place-items:center;font-style:normal;font-size:.72em;line-height:1}
.nh em{font-style:normal;color:var(--accent);opacity:0}
.nd.editing .nh em{opacity:1;animation:ndblink .8s steps(1) infinite}
@keyframes ndblink{50%{opacity:0}}
.nb{padding:.55em;display:flex;flex-direction:column;gap:.45em;font-size:.72em}
.nseg{display:flex;background:rgba(9,11,14,.7);border-radius:.5em;padding:.14em;gap:.14em}
.nseg b{flex:1;border-radius:.4em;padding:.3em 0;text-align:center;font-weight:600;font-size:.82em;color:#78838d}
.nseg b.on{background:#3a434d;color:#eef2f5}
.nta{position:relative;background:rgba(8,10,13,.6);border:1px solid rgba(58,67,77,.5);border-radius:.5em;
  padding:.45em .55em;font-size:.8em;color:#dfe6ea;min-height:4.2em;line-height:1.45}
.nta .ph{color:#5c6871}
.nta em{font-style:normal;color:var(--accent);animation:ndblink .8s steps(1) infinite}
.ntaexp{position:absolute;top:.3em;right:.35em;color:#5c6871;font-size:.9em;line-height:1}
.nrefdesc{border:1px solid rgba(58,67,77,.5);background:rgba(8,10,13,.5);border-radius:.4em;
  padding:.36em .5em;font-size:.66em;color:#aeb9c2;line-height:1.4;min-height:2.2em}
.nrefdesc .ph{color:#5c6871}
.nlbl .rnum{font-style:normal;font-weight:500;letter-spacing:.06em;color:#5c6871;text-transform:none}
.nsel{background:rgba(8,10,13,.6);border:1px solid rgba(58,67,77,.5);border-radius:.45em;
  padding:.38em .55em;font-size:.78em;font-weight:500;color:#dfe6ea;display:flex;justify-content:space-between;gap:.4em}
.nsel::after{content:"▾";color:#5c6871}
.nnote{border:1px solid rgba(45,106,79,.45);background:rgba(22,52,38,.5);border-radius:.45em;
  padding:.4em .55em;font-size:.66em;color:#a7cdb6;line-height:1.35}
.ninfo{border:1px solid rgba(43,84,120,.5);background:rgba(18,38,58,.45);border-radius:.45em;
  padding:.4em .55em;font-size:.62em;color:#93b9d6;line-height:1.35}
.ncaps{display:flex;gap:.3em;flex-wrap:wrap}
.ncaps b{border:1px solid rgba(70,80,90,.5);border-radius:.3em;padding:.14em .4em;font-size:.5em;letter-spacing:.1em;color:#8b98a3;font-weight:600}
.ncost{display:flex;justify-content:space-between;align-items:center;border:1px solid rgba(58,67,77,.5);border-radius:.4em;
  background:rgba(8,10,13,.5);padding:.32em .5em;font-family:var(--mono);font-size:.6em;color:#7d8a94}
.ncost b{color:#5ce6a1;font-weight:500}
.nlbl{font-size:.52em;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#69757f;margin-top:.2em;display:flex;justify-content:space-between;align-items:center}
.nrefs{display:grid;grid-template-columns:1fr 1fr;gap:.4em}
.nref{border:1px dashed rgba(70,80,90,.55);border-radius:.4em;background:rgba(8,10,13,.55);min-height:3.6em;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.2em;font-size:.5em;
  letter-spacing:.08em;text-transform:uppercase;color:#5c6871;text-align:center;position:relative;overflow:hidden;padding:.3em}
.nref img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .4s}
.nref.filled{border-style:solid;border-color:color-mix(in srgb,var(--acc) 40%,transparent)}
.nref.filled img{opacity:1}
.nresult{position:relative;border:1px dashed rgba(70,80,90,.55);border-radius:.5em;overflow:hidden;
  background:rgba(8,10,13,.55);height:9cqw;display:flex;align-items:center;justify-content:center}
.nresult img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;opacity:0;transition:opacity .6s}
.nresult.done{border-style:solid;border-color:color-mix(in srgb,var(--acc) 40%,transparent)}
.nresult.done img{opacity:1}
.nawait{position:absolute;inset:0;display:grid;place-items:center;font-size:.6em;
  letter-spacing:.12em;text-transform:uppercase;color:#5c6871;transition:opacity .3s}
.nresult.done .nawait,.nresult.running .nawait{opacity:0}
.nprog{position:absolute;left:8%;right:8%;top:50%;height:.4em;border-radius:99em;background:rgba(146,163,184,.15);opacity:0;transition:opacity .3s}
.nresult.running .nprog{opacity:1}
.nprog i{display:block;height:100%;width:0%;border-radius:99em;background:linear-gradient(90deg,var(--accent),#8b5cf6);transition:width 2.4s linear}
.nresult.running .nprog i{width:100%}
.nf{display:flex;align-items:center;justify-content:space-between;gap:.5em;padding:.1em .55em .6em;font-size:.72em}
.nsave{border:1px solid rgba(70,80,90,.5);border-radius:.5em;padding:.32em .7em;color:#c3ccd3;font-weight:500;font-size:.82em}
.nrun{background:#fff;color:#0a0c0e;border-radius:.5em;padding:.32em .85em;font-weight:700;font-size:.82em;
  display:inline-flex;align-items:center;gap:.35em;transition:.15s}
.nrun svg{width:.8em;height:.8em}
.nrun.running{background:rgba(59,130,246,.55);color:#fff}
.nthumb{border-radius:.4em;overflow:hidden;background:#08090c;border:1px solid rgba(55,65,81,.5);
  height:11.5cqw;display:flex;align-items:center;justify-content:center;padding:2px}
.nthumb img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}
.nh .nact .ncol{font-style:normal;color:#6b7883;font-size:.95em;border:0;background:none;min-width:auto;height:auto;padding:0 .1em}
.nsq{position:relative;aspect-ratio:1;border:1px solid rgba(55,65,81,.55);border-radius:.4em;
  background:#08090c;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:2px}
.nsq img{width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .4s}
.nsq span{color:#9aa4ad;font-size:.9em;font-weight:500}
.nsq.src{width:6cqw}
.nsq.filled{border-color:color-mix(in srgb,var(--acc) 40%,transparent)}
.nsq.filled img{opacity:1}
.nsq.filled span{display:none}
.nrefgrid{display:grid;grid-template-columns:1fr 1fr;gap:.35em}
.nd.gen .nb{font-size:.64em;gap:.42em}
.nruns{display:flex;gap:.4em}
.nrun-t{width:3.2em;height:3.2em;border-radius:.4em;background:#dfe0d8;border:1px solid rgba(0,0,0,.35);flex:none}
.ngi{display:flex;background:rgba(9,11,14,.7);border-radius:.55em;padding:.16em;gap:.16em}
.ngi b{flex:1;text-align:center;padding:.42em;border-radius:.45em;font-weight:600;color:#9ca3af}
.ngi b.on{background:#1f6f5c;color:#eafff7}
.nrefhdr{display:grid;grid-template-columns:1fr 1fr;gap:.35em;font-size:.82em;letter-spacing:.14em;text-transform:uppercase;color:#69757f}
.nsq.srcbig{width:100%;aspect-ratio:auto;height:8.5cqw}
.nd.gen .nrefgrid .nsq{aspect-ratio:auto;height:6.5cqw}
.nmeta{font-size:.52em;letter-spacing:.12em;text-transform:uppercase;color:#69757f}
.nstats{display:grid;grid-template-columns:repeat(4,1fr);gap:.3em}
.nstats div{border:1px solid rgba(70,80,90,.45);border-radius:.35em;padding:.3em .35em;background:rgba(8,10,13,.4)}
.nstats i{display:block;font-style:normal;font-size:.45em;letter-spacing:.14em;text-transform:uppercase;color:#69757f;font-weight:700}
.nstats b{font-size:.72em;color:#e8eef2;font-weight:600}
.nvar{border:1px solid rgba(58,67,77,.6);background:#07090c;border-radius:.4em;padding:.34em .5em;font-family:var(--mono);font-size:.72em;color:#e8eef2}
.nitembtn{border:1px solid rgba(192,132,252,.4);border-radius:.35em;padding:.1em .4em;color:#d8b4fe;font-size:.9em;font-weight:600;letter-spacing:.02em;text-transform:none}
.nitems{display:flex;flex-direction:column;gap:.35em}
.nitem{border:1px solid rgba(70,80,90,.45);border-radius:.4em;background:rgba(8,10,13,.45);padding:.3em .4em;
  display:flex;flex-direction:column;gap:.25em;transition:border-color .3s,box-shadow .3s}
.nitem.new{border-color:rgba(192,132,252,.55);box-shadow:0 0 .8em -.2em rgba(192,132,252,.7)}
.nitem-t{display:flex;align-items:center;gap:.25em}
.nitem-sel{border:1px solid rgba(58,67,77,.6);border-radius:.3em;padding:.12em .4em;font-size:.62em;color:#cfd8de;flex:1}
.nitem-sel::after{content:" ▾";color:#5c6871}
.nitem-t i{font-style:normal;min-width:1.3em;height:1.2em;display:grid;place-items:center;border:1px solid rgba(70,80,90,.45);border-radius:.25em;color:#8b98a3;font-size:.6em}
.nitem-in{border:1px solid rgba(58,67,77,.5);background:#07090c;border-radius:.3em;padding:.24em .4em;font-family:var(--mono);font-size:.58em;color:#aeb9c2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nport{position:absolute;width:.62em;height:.62em;border-radius:50%;z-index:4;transform:translate(-50%,-50%);transition:box-shadow .25s}
.nport.in{left:0}
.nport.out{left:100%}
.nport.sq{border-radius:.14em}
.pc-green{background:#4ade80;color:#4ade80}
.pc-orange{background:#fb923c;color:#fb923c}
.pc-pink{background:#f472b6;color:#f472b6}
.pc-purple{background:#c084fc;color:#c084fc}
.nport.hot{box-shadow:0 0 .8em .18em currentColor}
.fd-svg{inset:0;width:100%;height:100%;z-index:2;overflow:visible;position:absolute}
.fd-svg path{fill:none;stroke-width:.09cqw;stroke-linecap:round}

/* ── IMAGE: floating tool palette (measured from Screenshot_20260704_154723) ── */
.itb{position:absolute;left:1cqw;top:1cqw;width:3.9cqw;background:#12181d;z-index:5;
  border:1px solid #2a343c;border-radius:2px;box-shadow:0 20px 50px rgba(0,0,0,.55);overflow:hidden}
.itb-drag{display:flex;align-items:center;justify-content:space-between;padding:.4em .55em;
  border-bottom:1px solid #222b32;background:#0e141a}
.itb-drag .dots{width:1.15em;height:.75em;color:#4a5a63;
  background-image:radial-gradient(currentColor 42%,transparent 46%);background-size:.34em .34em}
.itb-drag .chev{color:#6b7a83;font-size:.85em;line-height:1}
.itb-grid{display:grid;grid-template-columns:1fr 1fr}
.itb b{position:relative;aspect-ratio:1/.72;display:grid;place-items:center;
  border-right:1px solid #1b232a;border-bottom:1px solid #1b232a;background:#12181d;
  color:#9fb0ba;font-weight:400;font-size:.92em}
.itb b:nth-child(2n){border-right:0}
.itb b svg{width:1.12em;height:1.12em;stroke-width:1.7}
.itb b.on{background:#22d3ee;color:#052027}
.itb b.on svg{stroke-width:2}
.itb b.dis{color:#3f4c54}
.itb b .fcorner{position:absolute;bottom:.22em;right:.24em;width:.5em;height:.5em;
  border-bottom:1.5px solid currentColor;border-right:1.5px solid currentColor;opacity:.5}
.itb-well{position:relative;height:2.7cqw;border-top:1px solid #222b32;background:#12181d}
.itb-well .bg{position:absolute;left:1.7em;top:1.5em;width:2em;height:2em;
  border:1.5px solid #05080b;background:#0b0c10;transition:background .4s}
.itb-well .fg{position:absolute;left:.6em;top:.55em;width:2.2em;height:2.2em;z-index:2;
  border:1.5px solid #d3dade;box-shadow:0 0 0 1.5px #05080b;background:#ffffff;transition:background .4s}
.itb-well .swp{position:absolute;right:.45em;top:.4em;width:1.3em;height:1.3em;display:grid;place-items:center;color:#7f9099}
.itb-well .rst{position:absolute;left:.4em;bottom:.35em;width:1.2em;height:1.2em;display:grid;place-items:center;color:#7f9099}
.itb-well .swp svg,.itb-well .rst svg{width:1em;height:1em;stroke-width:1.7}

/* image canvas + stylus */
.br-canvas{position:absolute;left:15cqw;top:2.2cqw;width:47cqw;height:35.2cqw;background:#f4f2ee;border-radius:.2em;
  box-shadow:0 1.6em 3em -1.4em #000}
.br-c2{background:transparent;pointer-events:none}
.br-stylus{position:absolute;z-index:9;transition:left .1s linear,top .1s linear;transform-origin:20% 92%;filter:drop-shadow(0 3px 6px #0009)}
.br-stylus svg{display:block;transform:rotate(24deg);transform-origin:50% 95%;transition:transform .7s var(--ease)}
.br-stylus i{position:absolute;left:50%;top:88%;width:2.2em;height:2.2em;margin:-1.1em;border-radius:50%;
  border:2px solid color-mix(in srgb,var(--accent) 75%,transparent);transform:scale(.4);transition:transform .12s linear;pointer-events:none}
.lay-row{display:flex;align-items:center;gap:.55em;border:1px solid var(--border);border-radius:.45em;padding:.32em .5em;
  font-size:.68em;color:var(--muted);background:color-mix(in srgb,var(--bg) 55%,var(--panel))}
.lay-row.on{border-color:color-mix(in srgb,var(--accent) 50%,transparent);color:var(--ink)}
.lay-row canvas,.lay-row .bgthumb{width:2.7em;height:2em;border-radius:.25em;background:#f4f2ee;border:1px solid var(--border);flex:none}
.lay-row u{text-decoration:none;filter:saturate(.4);font-size:.9em}
.lay-row.hidden u{opacity:.28}
.lay-row span{flex:1;white-space:nowrap;overflow:hidden}
.lay-row em{font-style:normal;font-family:var(--mono);font-size:.72em;color:var(--muted);border:1px solid var(--border);
  border-radius:99em;padding:.1em .5em}
.lay-foot{display:flex;gap:.35em;justify-content:flex-end;border-top:1px solid var(--border);padding-top:.45em;color:var(--muted);font-size:.75em}
.lay-foot i{font-style:normal;width:1.8em;height:1.8em;display:grid;place-items:center;border:1px solid var(--border);border-radius:.3em}
.key-chip{z-index:9;font-family:var(--mono);font-size:.8em;letter-spacing:.14em;padding:.35em .7em;border-radius:.4em;
  border:1px solid color-mix(in srgb,var(--accent) 50%,transparent);background:color-mix(in srgb,var(--accent) 14%,transparent);
  color:#cffafe;opacity:0;transition:opacity .25s;position:absolute;
  box-shadow:0 0 .8em -.2em color-mix(in srgb,var(--accent) 70%,transparent)}
.key-chip.on{opacity:1}

/* ── PAPER ── */
.ptb{width:6cqw}
.pp .ptb,.sx .ptb{left:12.4cqw;top:1cqw}
.ptb .itb-grid{grid-template-columns:1fr 1fr 1fr}
.ptb b:nth-child(2n){border-right:1px solid #1b232a}
.ptb b:nth-child(3n){border-right:0}
.ptb b.sfx{aspect-ratio:auto;font-size:.5em;font-weight:700;letter-spacing:.02em;color:#ffd23d;padding:.55em 0}
.ptb.pulse b.sfx{background:rgba(255,210,61,.12);box-shadow:inset 0 0 .8em -.25em rgba(255,210,61,.8)}
.pp-hruler{position:absolute;height:1.4em;left:12.8cqw;right:23cqw;top:.35cqw;font-family:var(--mono);font-size:.58em;color:var(--muted);
  background:color-mix(in srgb,var(--surface) 92%,black);border:1px solid var(--border);overflow:hidden;z-index:4;
  background-image:repeating-linear-gradient(90deg,rgba(146,163,184,.3) 0 1px,transparent 1px 5%)}
.pp-hruler span{position:absolute;top:.15em}
.pp-ruler{position:absolute;width:1.4em;left:11cqw;top:2cqw;bottom:.4cqw;font-family:var(--mono);font-size:.58em;color:var(--muted);
  background:color-mix(in srgb,var(--surface) 92%,black);border:1px solid var(--border);overflow:hidden;z-index:4;
  background-image:repeating-linear-gradient(180deg,rgba(146,163,184,.3) 0 1px,transparent 1px 5%)}
.pp-ruler span{position:absolute;left:.3em}
.pp-page{position:absolute;left:26cqw;top:2.2cqw;width:47cqw;height:37.4cqw;background:#fff;border-radius:.15em;
  box-shadow:0 1.6em 3em -1.4em #000;transition:background .8s}
.pp-page svg{position:absolute;inset:0;width:100%;height:100%}
.pp-page::before{content:"";position:absolute;inset:-.55em;border:1px solid rgba(224,53,154,.75);border-radius:.15em;pointer-events:none}
.pp-frame{fill:rgba(255,255,255,0);stroke:#181b20;stroke-width:1.6;transition:stroke .5s}
.pp-frame.sel{stroke:#22d3ee !important}
.pp-handles{position:absolute;inset:0;pointer-events:none}
.pp-handles i{position:absolute;width:.75em;height:.75em;margin:-.375em;background:#fff;
  border:1.5px solid #0b0c10;opacity:0;transition:opacity .3s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.pp-handles i.mid{width:.6em;height:.6em;margin:-.3em;background:#22d3ee;border-color:#04252b;border-radius:0}
.pp-handles.on i{opacity:1}
.pp-guide{position:absolute;top:0;bottom:0;width:1px;background:rgba(224,53,154,.4);pointer-events:none}
.pp-bleedtag{position:absolute;z-index:4;font-family:var(--mono);font-size:.6em;letter-spacing:.08em;
  padding:.15em .5em;border-radius:.25em;color:#fff}
.pp-bleedtag.bleed{background:#e0359a}
.pp-bleedtag.cut{background:#12181d;border:1px solid var(--border);color:var(--muted)}
.pp-knifeline{position:absolute;width:2px;background:repeating-linear-gradient(180deg,#22d3ee 0 6px,transparent 6px 11px);
  opacity:0;transition:opacity .2s;z-index:3;pointer-events:none}

/* ── SFX ── */
.sx-panelart{position:absolute;left:14cqw;top:2.4cqw;width:47cqw;height:36.6cqw;border-radius:.3em;overflow:hidden;
  background:#0d0f15 url(${ASSETS}wnm-aisle.jpg) center/cover;box-shadow:0 1.6em 3em -1.4em #000;border:.35em solid #fff}
.sx-burst{position:absolute;inset:-20%;background:repeating-conic-gradient(from 0deg,rgba(255,210,61,.16) 0deg 7deg,transparent 7deg 16deg);
  opacity:0;transition:opacity .5s;transform-origin:50% 52%}
.sx-panelart svg{position:absolute;inset:0;width:100%;height:100%}
#sx-decal text{font-family:'Chakra Petch',sans-serif;font-weight:700;font-size:86px;text-anchor:middle;
  paint-order:stroke fill;letter-spacing:0;transition:letter-spacing .6s}
#sx-main{fill:#ffd23d;stroke:#b91c1c;stroke-width:6px;filter:drop-shadow(4px 5px 0 #1f2937)}
.sx-echo{fill:none;stroke:#b91c1c;opacity:0}
.sx-echo.e1{stroke-width:4px}.sx-echo.e2{stroke-width:3px}.sx-echo.e3{stroke-width:2px}
#sx-decal.copies .e1{opacity:.42;transform:translate(-10px,7px)}
#sx-decal.copies .e2{opacity:.26;transform:translate(-20px,14px)}
#sx-decal.copies .e3{opacity:.14;transform:translate(-30px,21px)}
.sx-echo,#sx-main{transition:transform .5s var(--ease),opacity .5s,stroke-width .5s}
.sx-step{border:1px solid var(--border);border-radius:.4em;padding:.15em .7em}

/* ── VIDEO: sequencer timeline (real layout) ── */
.vd-mh{display:flex;flex-direction:column;gap:.15em;font-size:.6em;color:var(--muted);
  padding:.45em .9em;border-bottom:1px solid var(--border);flex:none}
.vd-mh .ttl{color:var(--ink);font-weight:600;font-size:1.12em}
.vd-mtoggle{display:inline-flex;border:1px solid var(--border);border-radius:.5em;overflow:hidden;flex:none;font-size:.6em}
.vd-mtoggle b{font-weight:500;padding:.25em .7em;color:var(--muted)}
.vd-mtoggle b.on{color:var(--ink);background:color-mix(in srgb,var(--accent) 14%,var(--panel))}
.vd-pmbody{display:flex;flex:1;min-height:0}
.vd-pstage{flex:1;min-width:0;display:flex;flex-direction:column;padding:.45em .55em;gap:.4em}
.vd-banner{font-size:.55em;border:1px solid rgba(92,230,161,.4);background:rgba(92,230,161,.08);color:#bde9cd;
  border-radius:.3em;padding:.35em .6em;white-space:nowrap;overflow:hidden;flex:none}
.vd-banner b{color:#5ce6a1;font-family:var(--mono);letter-spacing:.1em}
.vd-pctl{display:flex;align-items:center;gap:.6em;font-family:var(--mono);font-size:.6em;color:var(--muted);flex:none}
.vd-pctl i{font-style:normal;color:var(--ink)}
.vd-pinfo{width:12.6cqw;flex:none;border-left:1px solid var(--border);padding:.5em .6em;overflow:hidden;
  display:flex;flex-direction:column;gap:.4em}
.vd-ih{font-size:.52em;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.vd-btn{font-size:.56em;text-align:center;border:1px solid var(--border);border-radius:.4em;
  padding:.32em .5em;color:var(--muted)}
.vd-btn.lit{background:color-mix(in srgb,var(--accent) 18%,var(--panel));border-color:color-mix(in srgb,var(--accent) 54%,transparent);color:var(--ink);font-weight:600}
.vd-irow{display:flex;justify-content:space-between;gap:.5em;font-size:.56em;color:var(--muted);white-space:nowrap;overflow:hidden}
.vd-irow b{font-family:var(--mono);font-weight:500;color:var(--ink)}
.vd-screen{position:relative;background:#000;overflow:hidden;flex:none;aspect-ratio:16/9;min-height:0}
.vd-pstage .vd-screen{flex:1;aspect-ratio:auto}
.vd-screen img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .3s linear}
#vd-p1,#vd-p2,#vd-sm{opacity:0}
.vd-smempty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:1em;
  color:var(--muted);font-size:.62em;transition:opacity .3s}
.vd-smempty b{display:block;color:var(--ink);font-size:1.15em;margin-bottom:.4em}
.vd-minfo{display:flex;align-items:center;gap:.5em;padding:.4em .7em;border-top:1px solid var(--border);
  white-space:nowrap;overflow:hidden;transition:opacity .3s;flex:none}
.vd-minfo .nm{font-size:.64em;font-weight:560;color:var(--ink)}
.vd-minfo .mt{font-family:var(--mono);font-size:.52em;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.vd-minfo .grow{flex:1}
.vd-minfo .add{font-family:var(--mono);font-size:.56em;border:1px solid var(--border);border-radius:.4em;
  padding:.2em .5em;color:var(--muted);background:color-mix(in srgb,var(--bg) 55%,var(--panel));flex:none}
.vd-minfo .add.hot{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.vd-lib{left:.3cqw;top:.3cqw;width:12.4cqw;height:25.75cqw}
.vd-smon{left:13cqw;top:.3cqw;width:31.5cqw;height:25.75cqw}
.vd-pmon{left:44.8cqw;top:.3cqw;width:44cqw;height:25.75cqw}
.vd-insp{left:89.1cqw;top:.3cqw;width:10.6cqw;height:25.75cqw}
.vd-insp .slp-b{gap:.35em}
.vd-insp .inote{font-size:.54em;color:var(--muted);line-height:1.4}
.vd-insp .iname{font-size:.6em;font-weight:600;color:var(--ink);border:1px solid var(--border);
  border-radius:.35em;padding:.25em .45em;white-space:nowrap;overflow:hidden}
.vd-islider{height:.35em;border-radius:99em;background:color-mix(in srgb,var(--border) 80%,transparent);position:relative}
.vd-islider u{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:99em;background:var(--accent);display:block}
.vd-addkey{border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:.4em;padding:.25em .6em;
  color:var(--ink);background:color-mix(in srgb,var(--accent) 10%,var(--panel));font-size:.6em;text-align:center;font-weight:600}
.vd-tl{left:.3cqw;right:.3cqw;bottom:.3cqw;top:26.35cqw}
.vd-tlbody{padding:.3em .8em 0;overflow:hidden;flex:1;min-height:0;position:relative}
.vd-th{font-size:.66em;color:var(--ink);padding-bottom:.15em;font-weight:600}
.vd-tdesc{font-size:.54em;color:var(--muted);padding-bottom:.35em}
.vd-msl{display:inline-block;width:3.2em;height:.4em;border-radius:99em;background:color-mix(in srgb,var(--border) 80%,transparent);
  vertical-align:middle;margin-inline:.3em;position:relative;font-style:normal}
.vd-msl u{position:absolute;left:0;top:0;bottom:0;border-radius:99em;background:var(--accent);display:block}
.vd-tools{display:flex;flex-wrap:nowrap;gap:.4em;align-items:center;font-size:.64em;letter-spacing:.02em;
  color:var(--muted);padding-bottom:.5em;border-bottom:1px solid var(--border);white-space:nowrap;overflow:hidden}
.vd-tools b{font-weight:500;border:1px solid var(--border);border-radius:.45em;padding:.25em .55em;flex:none;white-space:nowrap;
  background:color-mix(in srgb,var(--panel) 72%,transparent)}
.vd-tools b.on{color:var(--ink);border-color:color-mix(in srgb,var(--accent) 45%,transparent);background:color-mix(in srgb,var(--accent) 12%,var(--panel))}
.vd-tools em{margin-left:auto;font-style:normal;flex:none;white-space:nowrap;font-family:var(--mono);font-size:.9em;color:var(--muted)}
.vd-ruler{position:relative;display:flex;font-family:var(--mono);font-size:.62em;color:var(--muted);
  margin:.4em 0 .1em 6em;border-bottom:1px solid var(--border);overflow:hidden}
.vd-ruler::before{content:"";position:absolute;left:0;top:0;height:2px;width:100%;background:color-mix(in srgb,var(--accent) 45%,transparent)}
.vd-ruler span{flex:1;padding:.3em 0 .25em .45em;border-left:1px solid color-mix(in srgb,var(--border) 80%,transparent)}
.vd-ruler span:first-child{border-left:0}
.vd-track{display:flex;align-items:stretch;gap:.5em;margin-top:.3em}
.vd-track u{text-decoration:none;font-family:var(--mono);font-size:.6em;letter-spacing:.08em;color:var(--ink);
  width:6.6em;flex:none;text-transform:uppercase;border:1px solid var(--border);border-radius:.3em;
  background:color-mix(in srgb,var(--panel) 85%,black);padding:.3em .55em;display:flex;flex-direction:column;justify-content:center;gap:.15em}
.vd-track u i{font-style:normal;font-size:.72em;letter-spacing:.14em;color:var(--muted)}
.vd-lane{position:relative;flex:1;height:2.6em;border-radius:.25em;background:color-mix(in srgb,var(--bg) 78%,var(--panel))}
.vd-hint{position:absolute;inset:0;display:flex;align-items:center;padding-left:1em;font-size:.56em;
  color:var(--muted);opacity:.65;transition:opacity .3s;white-space:nowrap;overflow:hidden}
.vd-clip{position:absolute;top:.18em;bottom:.18em;border-radius:.3em;overflow:hidden;
  border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));
  background:#10202b left center/2.4em 100% repeat-x;opacity:0;transform:scale(.94);transition:opacity .4s,transform .4s var(--ease);
  font-size:.58em;color:#e6f8ff}
.vd-clip.on{opacity:1;transform:none}
.vd-clip.sel{box-shadow:0 0 .9em -.2em color-mix(in srgb,var(--accent) 90%,transparent);border-color:var(--accent)}
.vd-clip .cnm{position:absolute;left:.6em;bottom:1.5em;font-weight:600;text-shadow:0 1px 2px #000;white-space:nowrap}
.vd-clip .crange{position:absolute;left:.6em;bottom:.25em;font-family:var(--mono);font-size:.86em;color:#9fd8e8;text-shadow:0 1px 2px #000}
.vd-clip .ctag{position:absolute;right:.5em;top:.3em;font-size:.8em;letter-spacing:.14em;color:#a5f3fc;
  border:1px solid rgba(103,232,249,.4);border-radius:.3em;padding:.05em .4em;opacity:0;transition:opacity .3s}
.vd-clip.sel .ctag{opacity:1}
.vd-gap{position:absolute;top:.4em;bottom:.4em;border:1px dashed color-mix(in srgb,var(--border) 90%,#fff);border-radius:.25em;
  display:grid;place-items:center;font-family:var(--mono);font-size:.52em;letter-spacing:.1em;color:var(--muted);opacity:0;transition:opacity .4s}
.vd-gap.on{opacity:.8}
.vd-oline{position:absolute;inset:0;z-index:2;width:100%;height:100%}
.vd-oline polyline{fill:none;stroke:#7fe3ff;stroke-width:2;vector-effect:non-scaling-stroke;
  filter:drop-shadow(0 0 3px rgba(34,211,238,.6))}
.vd-okf{position:absolute;width:.65em;height:.65em;background:var(--accent);z-index:3;
  transform:translate(-50%,-50%) rotate(45deg);box-shadow:0 0 .5em color-mix(in srgb,var(--accent) 90%,transparent)}
.vd-clip .kf{position:absolute;top:.3em;width:.7em;height:.7em;background:var(--accent);transform:rotate(45deg) scale(0);
  transition:transform .3s var(--ease);box-shadow:0 0 .5em color-mix(in srgb,var(--accent) 80%,transparent)}
.vd-clip .kf.on{transform:rotate(45deg) scale(1)}
.vd-aclip{position:absolute;top:.18em;bottom:.18em;border-radius:.3em;border:1px solid rgba(92,230,161,.45);
  background:rgba(8,18,13,.9);opacity:0;transform:scale(.94);transition:opacity .4s,transform .4s var(--ease);overflow:hidden}
.vd-aclip.on{opacity:1;transform:none}
.vd-aclip svg{position:absolute;inset:0;width:100%;height:100%}
.vd-playhead{position:absolute;top:4.2em;bottom:.4em;left:8em;width:2px;background:#f43f5e;
  box-shadow:0 0 .5em rgba(244,63,94,.7);z-index:3}
.vd-playhead::before{content:"";position:absolute;top:-.55em;left:50%;margin-left:-.45em;border:.45em solid transparent;
  border-top-color:#f43f5e}
.vd-ghost{position:absolute;z-index:8;width:5.5em;height:3.4em;border-radius:.4em;overflow:hidden;
  border:1px solid color-mix(in srgb,var(--accent) 60%,transparent);
  box-shadow:0 0 1.2em -.2em color-mix(in srgb,var(--accent) 80%,transparent);opacity:0;
  transition:left .9s var(--ease),top .9s var(--ease),opacity .25s;background:#0b0c10 center/cover}

/* ── cursor / caption / loop chrome ── */
.fd-cursor{z-index:9;left:50%;top:80%;transition:left .8s var(--ease),top .8s var(--ease);filter:drop-shadow(0 2px 6px #000);position:absolute}
.fd-cursor i{position:absolute;left:.2em;top:.2em;width:1.6em;height:1.6em;border-radius:50%;
  border:2px solid color-mix(in srgb,var(--accent) 90%,transparent);opacity:0;transform:scale(.4)}
.fd-cursor.click i{animation:fdclick .5s var(--ease)}
@keyframes fdclick{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1.4)}}
.fd-caption{left:50%;bottom:3.5%;transform:translateX(-50%);z-index:8;white-space:nowrap;
  font-family:var(--mono);font-size:.95em;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);
  background:rgba(8,10,15,.92);border:1px solid var(--border);border-radius:99em;padding:.7em 1.3em;
  transition:opacity .4s;backdrop-filter:blur(6px);position:absolute}
.fd-caption.off{opacity:0}
.fd-loop{position:absolute;left:0;right:0;bottom:0;height:2px;background:color-mix(in srgb,var(--border) 60%,transparent);z-index:9}
.fd-loop i{display:block;height:100%;width:0%;background:var(--accent);opacity:.7}
.fd-tag{position:absolute;right:1em;bottom:.55em;z-index:6;font-family:var(--mono);font-size:.75em;
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted);border:1px solid var(--border);border-radius:99em;padding:.35em .8em;
  background:rgba(8,10,15,.85)}
`;

/* ─────────────────────── chrome fragments ─────────────────────── */
function wsGroup(on){
  var ws = [['flow','Flow'],['editor','Video'],['image','Image'],['paper','Paper']];
  return '<span class="fd-wsgroup">'+ws.map(function(w){
    return '<i'+(w[0]===on?' class="on"':'')+'><img src="'+ASSETS+'ws-'+w[0]+'.png" alt="'+w[1]+'"/></i>';
  }).join('')+'</span>';
}
function zoomGroup(pre){
  return '<span class="fd-zoom">'+(pre?'<b>100%</b>':'')+'<b>−</b><b>Fit</b><b>+</b><b>⤢</b><b>📂</b><b>⚙</b></span>';
}
function cursorEl(){
  return '<div class="fd-cursor"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 3l14 8-6.5 1.5L9 19z" fill="#fff" stroke="#04070d" stroke-width="1.4"/></svg><i></i></div>';
}
function menubar(items){
  return '<div class="fd-bar2">'+items.map(function(m){return '<b>'+m+'</b>';}).join('')+'<span class="grow"></span><u>☰</u></div>';
}
function drawer(top, h, label){
  return '<div class="sl-drawer" style="top:'+top+';height:'+h+'"><u>‹</u><span>'+label+'</span></div>';
}
var PAPER_BAR1 = '<div class="fd-bar1"><span class="fd-appico">◈</span>'+wsGroup('paper')+
  '<span class="fd-chipbtn">＋ New</span><span class="fd-chipbtn">Page</span><span class="fd-chipbtn">Duplicate</span><span class="fd-chipbtn">✓ 0 warnings</span><span class="fd-chipbtn hot">⬇ Export Document ▾</span><span class="fd-chipbtn">Place PDF/document</span><span class="fd-chipbtn">Rulers</span><span class="fd-chipbtn">Guides</span><span class="fd-chipbtn">Grid</span><span class="fd-chipbtn hot">Snap Guides</span><span class="grow"></span>'+zoomGroup()+'<span class="fd-cost">$0.0000</span></div>';

/* paper floating tool palette — 16 real tools (paperToolRegistry.ts) + SFX presets */
function paperTools(){
  var t = ICONS, fly = '<span class="fcorner"></span>';
  return '<div class="itb ptb" id="ptb">'+
    '<div class="itb-drag"><span class="dots"></span><span class="chev">⌃</span></div>'+
    '<div class="itb-grid"><b class="dis">'+t.undo+'</b><b class="dis">'+t.redo+'</b><b>'+t.cut+'</b>'+
      '<b>'+t.copy+'</b><b>'+t.paste+'</b><b>'+t.pipette+'</b></div>'+
    '<div class="itb-grid">'+
      '<b class="on" id="tool-select" title="Select">'+t.pointer+'</b><b title="Hand">'+t.hand+'</b><b title="Text frame">'+t.type+'</b>'+
      '<b id="tool-frame" title="Image frame">'+t.image+fly+'</b><b title="Comic panel">'+t.panel+'</b><b title="Line">'+t.line+'</b>'+
      '<b title="Rectangle">'+t.square+fly+'</b><b title="Ellipse">'+t.circle+'</b><b title="Triangle">'+t.triangle+'</b>'+
      '<b title="Pentagon">'+t.pentagon+'</b><b title="Hexagon">'+t.hexagon+'</b><b title="Polygon">'+t.polygon+fly+'</b>'+
      '<b title="Pen">'+t.pen+'</b><b id="tool-bubble" title="Speech bubble">'+t.speech+fly+'</b><b title="Thought bubble">'+t.thought+'</b>'+
      '<b title="Caption">'+t.caption+'</b><b id="tool-knife" title="Gutter knife">'+t.knife+'</b><b title="Eyedropper">'+t.pipette+'</b></div>'+
    '<div class="itb-grid">'+
      '<b class="sfx">BANG</b><b class="sfx" id="sx-pick">KAPO</b><b class="sfx">SCRE</b>'+
      '<b class="sfx">WHIR</b><b class="sfx">BOOM</b><b class="sfx">CRAS</b>'+
      '<b class="sfx">ZAP</b><b class="sfx">SLAM</b><b></b></div>'+
    '<div class="itb-well"><i class="bg"></i><i class="fg"></i>'+
      '<i class="swp">'+t.swap+'</i><i class="rst">'+t.reset+'</i></div>'+
  '</div>';
}
function paperBin(extraId){
  return '<div class="slp" style="left:.3cqw;top:.3cqw;bottom:.3cqw;width:10.4cqw">'+
    '<div class="slp-h">Source Bin<span class="grow"></span><s>⧉</s></div>'+
    '<div class="slp-b"><div class="bin-head">🗄 Source Library<u>206</u></div>'+
    '<div class="bin-sub">Organize assets into named bins. Anything added here stays with the current project.</div>'+
    '<div class="slp-tabs"><b class="on">Source Library</b><b>Generated Pool</b></div>'+
    '<div class="bin-search">🔎 Search sources</div>'+
    '<div class="bin-item" id="pbin1"><img src="'+ASSETS+'wnm-tank.jpg" alt=""/><span><span class="nm">p02-panel-01</span><span class="mt">image · png</span></span></div>'+
    '<div class="bin-item" id="pbin2"><img src="'+ASSETS+'wnm-fountain.jpg" alt=""/><span><span class="nm">p02-panel-02</span><span class="mt">image · png</span></span></div>'+
    '<div class="bin-item" id="pbin3"><img src="'+ASSETS+'wnm-town.jpg" alt=""/><span><span class="nm">p01-panel-05</span><span class="mt">image · png</span></span></div>'+
    (extraId ? '' : '')+
    '</div></div>';
}

/* Speech-bubble path — verbatim port of src/lib/paperBubblePaths.ts (0-100 space,
   single closed path: elliptical body + tail as a Bezier protrusion of the outline). */
function slBubblePath(o){
  o=o||{}; var CX=50,CY=50,M=0.3;
  function cl(v,a,b){ if(!isFinite(v))return a; return Math.max(a,Math.min(b,v)); }
  function fo(v,f){ return (typeof v==='number'&&isFinite(v))?v:f; }
  function rd(v){ return Number(v.toFixed(3)); }
  function pe(rx,ry,a){ return {x:rd(CX+Math.cos(a)*rx),y:rd(CY+Math.sin(a)*ry)}; }
  function lp(f,t,m){ return {x:rd(f.x+(t.x-f.x)*m),y:rd(f.y+(t.y-f.y)*m)}; }
  function nm(p){ var L=Math.hypot(p.x,p.y); if(L<0.001)return{x:0,y:1}; return {x:p.x/L,y:p.y/L}; }
  function ft(p){ return rd(p.x)+' '+rd(p.y); }
  function arc(rx,ry,sa,ea){ var d=ea-sa,sg=Math.max(1,Math.ceil(Math.abs(d)/(Math.PI/2))),st=d/sg,c=[];
    for(var i=0;i<sg;i++){ var a0=sa+st*i,a1=a0+st,al=(4/3)*Math.tan((a1-a0)/4);
      var c1={x:rd(CX+rx*(Math.cos(a0)-al*Math.sin(a0))),y:rd(CY+ry*(Math.sin(a0)+al*Math.cos(a0)))};
      var c2={x:rd(CX+rx*(Math.cos(a1)+al*Math.sin(a1))),y:rd(CY+ry*(Math.sin(a1)-al*Math.cos(a1)))};
      c.push('C '+ft(c1)+' '+ft(c2)+' '+ft(pe(rx,ry,a1))); } return c; }
  var tail={x:fo(o.tailX,72),y:fo(o.tailY,92)};
  var rxB=43,ryB=37, tX=cl(fo(o.pinchX,58),0,100),tY=cl(fo(o.pinchY,75),0,100);
  var nX=(tX-CX)/rxB,nY=(tY-CY)/ryB,ln=Math.hypot(nX,nY);
  var base = ln<0.001?pe(rxB,ryB,Math.PI/2):{x:rd(CX+(nX/ln)*rxB),y:rd(CY+(nY/ln)*ryB)};
  var tw=cl(fo(o.tailWidth,18),4,38), wp=cl(fo(o.warp,0.18),-0.35,0.5);
  var rx=45+wp*4, ry=38+wp*5;
  var ba=Math.atan2((base.y-CY)/ry,(base.x-CX)/rx), gap=cl(tw/110,0.06,0.4);
  var sa=ba-gap, ea=ba+gap, start=pe(rx,ry,sa), end=pe(rx,ry,ea);
  var ax=nm({x:tail.x-base.x,y:tail.y-base.y}), dist=Math.max(1,Math.hypot(tail.x-base.x,tail.y-base.y));
  var mid=lp(base,tail,0.5), nr={x:-ax.y,y:ax.x}, ca=(cl(fo(o.curve,55),0,100)-50)/50, off=dist*M*ca;
  var h={x:rd(mid.x+nr.x*off),y:rd(mid.y+nr.y*off)};
  var ti=lp(end,h,0.62),to=lp(tail,h,0.52),ri=lp(tail,h,0.52),ro=lp(start,h,0.62);
  var body=arc(rx,ry,sa,ea-Math.PI*2);
  return 'M '+ft(start)+' '+body.join(' ')+' C '+ft(ti)+' '+ft(to)+' '+ft(tail)+' C '+ft(ri)+' '+ft(ro)+' '+ft(start)+' Z';
}

/* ─────────────────────── templates ─────────────────────── */
var TPL = {};

/* ── FLOW ── */
TPL.flow = '<div class="fd-stage">'+
  '<div class="fd-bar1"><span class="fd-appico">◈</span>'+wsGroup('flow')+
  '<span class="fd-chipbtn">✨ Generate ▾</span><span class="fd-chipbtn">🗃 Inputs &amp; Data ▾</span><span class="fd-chipbtn">≡ Lists &amp; Envelopes ▾</span><span class="fd-chipbtn">⟳ Flow Control ▾</span><span class="fd-chipbtn">Σ Logic &amp; Math ▾</span><span class="fd-chipbtn">≡ Text Tools ▾</span><span class="fd-chipbtn">🖋 Story Tools ▾</span><span class="fd-chipbtn">{} Reuse &amp; Layout ▾</span><span class="fd-chipbtn">∿ Monitor &amp; Debug ▾</span><span class="fd-chipbtn">⚙ Settings ▾</span><span class="grow"></span><span class="fd-chipbtn hot">Main Flow ▾</span><span class="fd-chipbtn">Functions</span><span class="fd-chipbtn">⬇ Export</span>'+zoomGroup()+'<span class="fd-cost">$0.74</span></div>'+
  menubar(['Project','Flow','View','Window','Help'])+
  '<div class="fd-canvas">'+
    '<svg class="fd-svg" id="fd-svg"></svg>'+
    '<div class="slp" style="left:.3cqw;top:.5cqw;bottom:.5cqw;width:13.2cqw;z-index:5">'+
      '<div class="slp-h">Source Bin<span class="grow"></span><s>⧉</s></div>'+
      '<div class="slp-b">'+
        '<div class="slp-sec" style="margin-top:0">Saved assets</div>'+
        '<div class="bin-head">Source Library<u>2</u></div>'+
        '<div class="bin-sub">Anything added here stays with the current project and can be dragged back onto the flow canvas as a reusable source node.</div>'+
        '<div class="slp-tabs"><b class="on">Source Library</b><b>Generated Pool</b></div>'+
        '<div class="bin-search">🔎 Search sources</div>'+
        '<div class="bin-item" id="fbin1"><img src="'+ASSETS+'sketch-crop.jpg" alt=""/><span><span class="nm">rough sketch</span><span class="mt">image · jpeg</span></span></div>'+
        '<div class="bin-item" id="fbin2"><img src="'+ASSETS+'ref-style.jpg" alt=""/><span><span class="nm">style ref</span><span class="mt">image · jpeg</span></span></div>'+
        '<div class="bin-item" id="fbin-new" style="display:none"><img src="'+ASSETS+'result-crop.jpg" alt=""/><span><span class="nm">portrait-inked</span><span class="mt">image · png</span></span></div>'+
      '</div></div>'+
    '<div class="nd" id="fdA" style="--acc:#4ade80;left:15cqw;top:2.5cqw;width:16cqw">'+
      '<div class="nh"><span class="nico">'+ICONS.image+'</span><span id="fdA-title">Image</span><em id="fdA-caret">|</em><span class="nact"><i>⋯</i><i>🔖</i></span></div>'+
      '<div class="nb"><div class="nthumb"><img src="'+ASSETS+'sketch-crop.jpg" alt=""/></div>'+
      '<div class="nmeta">ROUGH SKETCH · IMAGE/JPEG</div></div>'+
      '<b class="nport out pc-green" style="top:50%"></b></div>'+
    '<div class="nd" id="fdB" style="--acc:#4ade80;left:15cqw;top:20cqw;width:16cqw">'+
      '<div class="nh"><span class="nico">'+ICONS.image+'</span><span id="fdB-title">Image</span><em id="fdB-caret">|</em><span class="nact"><i>⋯</i><i>🔖</i></span></div>'+
      '<div class="nb"><div class="nthumb"><img src="'+ASSETS+'ref-style.jpg" alt=""/></div>'+
      '<div class="nmeta">STYLE REF · IMAGE/JPEG</div></div>'+
      '<b class="nport out pc-green" style="top:50%"></b></div>'+
    '<div class="nd" id="fdC" style="--acc:#fb923c;left:15cqw;top:37.5cqw;width:16cqw">'+
      '<div class="nh"><span class="nico">'+ICONS.type+'</span><span>Prompt Input</span><span class="nact"><i>⋯</i><i>🔖</i></span></div>'+
      '<div class="nb"><div class="nseg"><b class="on">Prompt</b><b>Model</b></div>'+
      '<div class="nta" style="min-height:3.4em"><span id="fd-prompt"></span><em id="fdC-tcaret">|</em><span class="ph" id="fd-prompt-ph">ink &amp; colour this sketch — keep the slate-blue top</span></div></div>'+
      '<b class="nport out pc-orange" style="top:62%"></b></div>'+
    '<div class="nd gen" id="fdD" style="--acc:#4ade80;left:37cqw;top:0.8cqw;width:17cqw">'+
      '<div class="nh"><span class="nico">'+ICONS.image+'</span><span>Image Generation</span><span class="nact"><i>🔖</i><i>⤢</i></span></div>'+
      '<div class="nb">'+
        '<div class="nnote">Restored bytedance/seedream-v4.5 from project source bin</div>'+
        '<div class="nlbl">Runs</div>'+
        '<div class="nruns"><span class="nrun-t"></span><span class="nrun-t"></span></div>'+
        '<div class="nlbl">Variable</div>'+
        '<div class="nvar">brand_kit</div>'+
        '<div class="ngi"><b class="on">Generate</b><b>Import</b></div>'+
        '<div class="nsel">Atlas Cloud</div>'+
        '<div class="nsel">Atlas Seedream v4.5 Edit</div>'+
        '<div class="nsel">1:1 Square</div>'+
        '<div class="nlbl">Capabilities</div>'+
        '<div class="ncaps"><b>PROMPT EDIT</b><b>10 REFS</b><b>TEXT EDITS</b></div>'+
        '<div class="nlbl">Pre-run cost</div>'+
        '<div class="ncost"><span>Est</span><b>$0.036 ($0.036/each)</b></div>'+
        '<div class="ninfo">Reference images are connected. This model uses them as style, asset, character, or composition guidance.</div>'+
        '<div class="nlbl">Source image</div>'+
        '<div class="nsq srcbig" id="fd-src"><img src="'+ASSETS+'sketch-crop.jpg" alt=""/><span>Connect the source image</span></div>'+
        '<div class="nrefhdr"><span>REFERENCE 1</span><span>REFERENCE 2</span></div>'+
        '<div class="nrefgrid">'+
          '<div class="nsq" id="fd-ref1"><img src="'+ASSETS+'ref-style.jpg" alt=""/><span>Connect ref</span></div>'+
          '<div class="nsq" id="fd-ref2"><span>Connect<br>reference</span></div>'+
        '</div>'+
        '<div class="nlbl">Result</div>'+
        '<div class="nresult" id="fd-result"><img src="'+ASSETS+'result-crop.jpg" alt=""/>'+
          '<div class="nprog"><i></i></div><span class="nawait">awaiting inputs</span></div>'+
      '</div>'+
      '<div class="nf"><span class="nsave">⬇ Save</span><span class="nrun" id="fd-run">'+ICONS.play+'<span id="fd-run-t">Run</span></span></div>'+
      '<b class="nport in pc-pink sq i3" style="top:8%"></b>'+
      '<b class="nport in pc-green i1" style="top:57%"></b>'+
      '<b class="nport in pc-green i2" style="top:72%"></b>'+
      '<b class="nport out pc-green" style="top:60%"></b></div>'+
    '<div class="nd" id="fdE" style="--acc:#c084fc;left:59cqw;top:4cqw;width:15cqw">'+
      '<div class="nh"><span class="nico">'+ICONS.layers+'</span><span>Envelope</span><span class="nact"><i>⋯</i><i>⛶</i></span></div>'+
      '<div class="nb">'+
        '<div class="nstats"><div><i>Type</i><b>Mixed</b></div><div><i>Items</i><b id="fd-count">2</b></div><div><i>Manual</i><b>0</b></div><div><i>Warn</i><b>0</b></div></div>'+
        '<div class="nlbl">Variable</div>'+
        '<div class="nvar">brand_kit</div>'+
        '<div class="nlbl">Envelope item type<b class="nitembtn">＋ Item</b></div>'+
        '<div class="nsel">Mixed</div>'+
        '<div class="nlbl">Contents</div>'+
        '<div class="nitems" id="fd-items">'+
          '<div class="nitem"><div class="nitem-t"><span class="nitem-sel">Image</span><i>↑</i><i>⧉</i><i>🗑</i></div><div class="nitem-in">loom-logo.png</div></div>'+
          '<div class="nitem"><div class="nitem-t"><span class="nitem-sel">Image</span><i>↑</i><i>⧉</i><i>🗑</i></div><div class="nitem-in">weave-tile.png</div></div>'+
        '</div>'+
      '</div>'+
      '<b class="nport in pc-purple" style="top:30%"></b></div>'+
    '<div class="vd-ghost" id="fd-ghost"></div>'+
    cursorEl()+
    '<div class="fd-caption">Drag a source from the bin</div>'+
  '</div>'+
  '<div class="fd-loop"><i></i></div><span class="fd-tag">replay · signal loom flow</span></div>';

/* ── BRUSH / IMAGE ── */
function imageToolbar(){
  var t = ICONS, fly = '<span class="fcorner"></span>';
  return '<div class="itb">'+
    '<div class="itb-drag"><span class="dots"></span><span class="chev">⌃</span></div>'+
    '<div class="itb-grid"><b class="dis">'+t.undo+'</b><b class="dis">'+t.redo+'</b>'+
      '<b>'+t.cut+'</b><b>'+t.copy+'</b><b>'+t.paste+'</b><b></b></div>'+
    '<div class="itb-grid">'+
      '<b title="Move">'+t.pointer+'</b><b title="Hand">'+t.hand+'</b>'+
      '<b title="Marquee">'+t.marquee+fly+'</b><b class="on" title="Brush">'+t.brush+fly+'</b>'+
      '<b title="Eraser">'+t.eraser+fly+'</b><b title="Clone Stamp">'+t.stamp+fly+'</b>'+
      '<b title="Blur">'+t.droplet+fly+'</b><b title="Dodge">'+t.sun+fly+'</b>'+
      '<b title="Paint Bucket">'+t.bucket+fly+'</b><b title="Pen">'+t.pen+fly+'</b>'+
      '<b title="Crop">'+t.crop+'</b><b title="Type">'+t.type+'</b>'+
      '<b title="Eyedropper">'+t.pipette+'</b><b></b></div>'+
    '<div class="itb-well"><i class="bg" id="br-bg"></i><i class="fg" id="br-fg"></i>'+
      '<i class="swp">'+t.swap+'</i><i class="rst">'+t.reset+'</i></div>'+
  '</div>';
}

TPL.brush = '<div class="fd-stage br">'+
  '<div class="fd-bar1"><span class="fd-appico">◈</span>'+wsGroup('image')+
  '<span class="fd-chipbtn">Tools</span><span class="fd-chipbtn">Panels</span><span class="fd-chipbtn">Assets</span><span class="fd-chipbtn">Rulers</span><span class="fd-chipbtn">Grid</span><span class="fd-chipbtn hot">Guides</span><span class="fd-chipbtn">Clear Guides</span><span class="fd-chipbtn">Layout&nbsp;&nbsp;Retouching ▾</span><span class="fd-chipbtn">Save Layout</span><span class="fd-chipbtn">Reset Panels</span><span class="fd-seg2"><b class="on">Editor</b><b>Automation</b></span><span class="grow"></span>'+zoomGroup(true)+'<span class="fd-chipbtn">175%</span><span class="fd-chipbtn">Fit</span><span class="fd-chipbtn">Projects</span><span class="fd-cost">$0.94</span></div>'+
  menubar(['Project','File','Edit','Image','Select','Tools','View','Window','Help'])+
  '<div class="fd-tabsrow"><b>＋</b><b>📂</b><b>⎘</b><span class="doctab dim">FlowImage<b>×</b></span><span class="doctab dim">p04-panel-05<b>×</b></span><span class="doctab dim">p03-panel-03<b>×</b></span><span class="doctab"><i></i>portrait.slimg<b>×</b></span><span class="grow"></span><span class="fd-chipbtn">↩ Save &amp; Return to Paper</span></div>'+
  '<div class="fd-canvas">'+
    /* docked Source Bin (left) — envelope groups + Drag to flow rows */
    '<div class="slp dock" style="left:0;top:0;bottom:0;width:12.4cqw">'+
      '<div class="slp-h"><span style="color:var(--muted)">🗑</span>Source Bin<span class="grow"></span><s>◫</s></div>'+
      '<div class="slp-b" style="gap:.45em">'+
        '<div class="slp-sec" style="margin-top:0">Saved Assets</div>'+
        '<div class="bin-head" style="font-size:.82em">Source Library<u>97 items</u></div>'+
        '<div class="bin-sub">Organize assets into named bins. Anything added here stays with the current project and can be dragged back onto the flow canvas as a reusable source node.</div>'+
        '<div class="slp-tabs"><b class="on">Source Library</b><b>Generated Pool</b></div>'+
        '<div class="bin-search">🔎 Search sources</div>'+
        '<div class="bin-chips"><b>＋ New Bin</b><b>› Collapse All</b><b>⌄ Expand All</b></div>'+
        '<div class="env-grp">▾ PAGE 4 — company store; the Gate seeded (5)<i>ENVELOPE · 13 ITEMS</i></div>'+
        '<div class="bin-item ass"><span class="ck"></span><img src="'+ASSETS+'sketch-crop.jpg" alt=""/><span class="col"><span class="nm">portrait-sketch</span><span class="mt">IMAGE · IMAGE/PNG</span><span class="drg">＋ Drag to flow</span></span><span class="rowb"><i>T</i><i>🗑</i></span></div>'+
        '<div class="bin-item ass"><span class="ck"></span><img src="'+ASSETS+'ref-style.jpg" alt=""/><span class="col"><span class="nm">style-ref</span><span class="mt">IMAGE · IMAGE/PNG</span><span class="drg">＋ Drag to flow</span></span><span class="rowb"><i>T</i><i>🗑</i></span></div>'+
        '<div class="bin-item ass"><span class="ck"></span><img src="'+ASSETS+'result-crop.jpg" alt=""/><span class="col"><span class="nm">portrait-inked</span><span class="mt">IMAGE · IMAGE/PNG</span><span class="drg">＋ Drag to flow</span></span><span class="rowb"><i>T</i><i>🗑</i></span></div>'+
        '<div class="env-grp">▾ PAGE 2 — Cold Aisle, Rocío at work (5)<i>ENVELOPE · 7 ITEMS</i></div>'+
        '<div class="bin-item ass"><span class="ck"></span><img src="'+ASSETS+'wnm-aisle.jpg" alt=""/><span class="col"><span class="nm">p02-panel-01</span><span class="mt">IMAGE · IMAGE/PNG</span><span class="drg">＋ Drag to flow</span></span><span class="rowb"><i>T</i><i>🗑</i></span></div>'+
      '</div></div>'+
    imageToolbar()+
    '<canvas id="br-canvas" class="br-canvas"></canvas>'+
    '<canvas id="br-canvas2" class="br-canvas br-c2"></canvas>'+
    /* Properties / Tool Options — docked column */
    '<div class="slp dock" style="right:15.4cqw;top:0;bottom:0;width:13.4cqw">'+
      '<div class="slp-h">Properties / Tool Options<span class="grow"></span><s>◫</s><s>⚙</s></div>'+
      '<div class="slp-b">'+
        '<div class="slp-sec" style="margin-top:0">Tool Options</div>'+
        '<div style="font-size:.8em;font-weight:600;color:var(--ink)">Brush</div>'+
        '<div class="slp-sec">Custom</div>'+
        '<div class="slp-row"><span>Size</span><div class="slp-slider"><i style="width:38%"></i></div><b>24 px</b></div>'+
        '<div class="slp-row"><span>Opacity</span><div class="slp-slider"><i style="width:90%"></i></div><b>90%</b></div>'+
        '<div class="slp-row"><span>Hardness</span><div class="slp-slider"><i style="width:55%"></i></div><b>55%</b></div>'+
        '<div class="slp-row"><span>Flow</span><div class="slp-slider"><i style="width:80%"></i></div><b>80%</b></div>'+
        '<div class="slp-row"><span>Colour Rate</span><div class="slp-slider"><i id="br-sl-rate" style="width:0%"></i></div><b id="br-rate-val">0%</b></div>'+
        '<div class="slp-sec">Symmetry</div>'+
        '<div class="slp-seg"><b class="on">Off</b><b>Vertical</b><b>Horizontal</b><b>Four-Way</b></div>'+
        '<div class="slp-sec">Pressure Dynamics</div>'+
        '<div class="slp-row"><span>Size</span><div class="slp-slider"><i style="width:65%"></i></div><b>65%</b></div>'+
        '<div class="slp-row"><span>Flow</span><div class="slp-slider"><i style="width:35%"></i></div><b>35%</b></div>'+
        '<div class="slp-row"><span>Angle</span><div class="slp-slider"><i style="width:20%"></i></div><b>Tilt</b></div>'+
        '<div class="slp-sec">Tilt &amp; Rotation</div>'+
        '<div class="slp-seg"><b class="on">Tilt→Shade</b><b>Rotation→Angle</b></div>'+
        '<div class="slp-row"><span class="slp-ok" id="br-gpu">GPU brush engine · WebGL2</span></div>'+
        '<div class="slp-sec">Document Properties</div>'+
        '<div class="slp-mini2"><label>W<span>2048</span></label><label>H<span>2048</span></label></div>'+
      '</div></div>'+
    /* Layers — docked column, real fields */
    '<div class="slp dock" style="right:0;top:0;height:27cqw;width:15cqw">'+
      '<div class="slp-h">Layers<span class="grow"></span><s>◫</s><s>⚙</s></div>'+
      '<div class="slp-b" style="gap:.4em">'+
        '<div class="slp-tabs"><b class="on">Layers</b><b>Channels</b><b>Paths</b><span style="flex:1"></span><span class="lybtn" id="br-add">＋</span><span class="lybtn">−</span></div>'+
        '<div class="slp-row"><span>Mode</span><div class="slp-select" id="br-mode" style="flex:1">Normal</div></div>'+
        '<div class="slp-row"><span>Opacity</span><div class="slp-slider"><i id="br-sl-op" style="width:100%"></i></div><b id="br-op-val">100%</b></div>'+
        '<div class="slp-chks"><span><b class="chk"></b>Pixels</span><span><b class="chk"></b>Position</span></div>'+
        '<div class="slp-row"><span>Label</span><div class="slp-select" style="flex:1">No Label</div></div>'+
        '<div class="slp-chks"><span><b class="chk"></b>Clip to layer below</span></div>'+
        '<div class="slp-sec">Filters<i class="actn">0 ACTIVE</i></div>'+
        '<div class="slp-select">Add filter…</div>'+
        '<div class="slp-sec">Effects<i class="actn">0 ACTIVE</i></div>'+
        '<div class="slp-select">Add effect…</div>'+
        '<div class="slp-sec">Mask<i class="actn" style="color:var(--muted)">NONE</i></div>'+
        '<div class="slp-mgrid"><span class="vd-btn">From Sel</span><span class="vd-btn">Reveal</span><span class="vd-btn">Hide</span><span class="vd-btn">Invert</span><span class="vd-btn">Apply</span><span class="vd-btn">Delete</span></div>'+
        '<div class="bin-search">🔎 Search layers</div>'+
        '<div class="slp-filters"><span>All Types ▾</span><span>All Visibility ▾</span><span>All Locks ▾</span></div>'+
        '<div style="display:grid;gap:.35em" id="br-lrows">'+
          '<div class="lay-row on" id="br-lrow-line"><u>👁</u><canvas width="46" height="34" id="br-th-line"></canvas><span>Line art</span><em>Normal</em></div>'+
          '<div class="lay-row"><u>👁</u><i class="bgthumb" style="width:2.7em;height:2em;border-radius:.25em;background:#f4f2ee;border:1px solid var(--border);flex:none;font-style:normal"></i><span>Background</span><em>Normal</em></div>'+
        '</div>'+
        '<div class="lay-foot"><i>⧉</i><i>🗑</i><i>↓</i><i>≡</i><i>◐</i></div>'+
      '</div></div>'+
    /* History — docked below Layers */
    '<div class="slp dock" style="right:0;top:27.6cqw;bottom:0;width:15cqw">'+
      '<div class="slp-h">History<span class="grow"></span><i class="actn" style="border:0">0 states</i><s>◫</s></div>'+
      '<div class="slp-b" style="gap:.4em">'+
        '<div class="slp-mgrid" style="grid-template-columns:1fr 1fr 1fr"><span class="vd-btn">↶ Undo</span><span class="vd-btn">↷ Redo</span><span class="vd-btn">✕ Clear</span></div>'+
        '<div class="slp-row" style="border:1px solid var(--border);border-radius:.35em;padding:.3em .5em"><span style="color:var(--ink)">Open Document</span><b style="color:#5ce6a1;font-size:.72em">CURRENT STATE</b></div>'+
        '<div class="slp-sec">Snapshots<i class="actn" style="border:0">New Snapshot</i></div>'+
        '<div class="slp-input" style="color:var(--muted)">Snapshot 1</div>'+
        '<div class="slp-sec">Actions<i class="actn" style="border:0">0 saved</i></div>'+
        '<div class="vd-btn">● Record Action</div>'+
        '<div class="bin-sub">No saved actions</div>'+
      '</div></div>'+
    /* collapsed Brushes drawer against the panel column */
    drawer('1cqw','13cqw','Brushes')+
    '<div class="br-stylus" id="br-stylus"><i id="br-ring"></i><svg viewBox="0 0 40 40" width="34" height="34"><path d="M20 38 L16 26 L24 26 Z" fill="#e5e7eb"/><rect x="16.5" y="2" width="7" height="24" rx="2.5" fill="#94a3b8"/><rect x="16.5" y="18" width="7" height="4" fill="#22d3ee"/></svg></div>'+
    '<div class="key-chip" id="br-key">SHIFT</div>'+
    '<div class="fd-caption">A pressure-, tilt-, rotation-aware brush</div>'+
  '</div>'+
  '<div class="fd-loop"><i></i></div><span class="fd-tag">replay · signal loom image</span></div>';

/* ── PAPER ── */
TPL.paper = '<div class="fd-stage pp">'+PAPER_BAR1+
  menubar(['Project','File','Edit','Layout','Insert','Tools','View','Window','Help'])+
  '<div class="fd-canvas">'+
    paperBin()+
    paperTools()+
    '<div class="pp-hruler"><span style="left:6%">10</span><span style="left:26%">50</span><span style="left:47%">90</span><span style="left:68%">130</span><span style="left:88%">170</span></div>'+
    '<div class="pp-ruler"><span style="top:8%">5</span><span style="top:28%">15</span><span style="top:48%">25</span><span style="top:68%">35</span><span style="top:88%">45</span></div>'+
    '<div class="pp-page" id="pp-page">'+
      '<span class="pp-bleedtag bleed" style="left:-.4em;top:-1.6em">BLEED</span>'+
      '<span class="pp-bleedtag cut" style="right:-.4em;top:-1.6em">CUT</span>'+
      '<div class="pp-guide" style="left:49.4%"></div><div class="pp-guide" style="left:50.6%"></div>'+
      '<svg id="pp-svg" viewBox="0 0 640 460" preserveAspectRatio="none">'+
        '<defs><clipPath id="ppc1"><polygon id="ppc1p" points="18,16 318,16 318,256 18,256"/></clipPath>'+
        '<clipPath id="ppc2"><polygon id="ppc2p" points="338,16 622,16 622,256 338,256"/></clipPath>'+
        '<clipPath id="ppc3"><polygon id="ppc3p" points="18,272 622,272 622,444 18,444"/></clipPath>'+
        '<clipPath id="ppc4"><polygon id="ppc4p" points="18,272 622,272 622,444 18,444"/></clipPath></defs>'+
        '<image id="pp-art1" href="'+ASSETS+'wnm-tank.jpg" x="18" y="16" width="300" height="240" preserveAspectRatio="xMidYMid meet" clip-path="url(#ppc1)" opacity="0"/>'+
        '<image id="pp-art2" href="'+ASSETS+'wnm-fountain.jpg" x="338" y="16" width="284" height="240" preserveAspectRatio="xMidYMid meet" clip-path="url(#ppc2)" opacity="0"/>'+
        '<image id="pp-art3" href="'+ASSETS+'wnm-town.jpg" x="18" y="272" width="604" height="172" preserveAspectRatio="xMidYMid meet" clip-path="url(#ppc3)" opacity="0"/>'+
        '<image id="pp-art4" href="'+ASSETS+'wnm-town.jpg" x="18" y="272" width="604" height="172" preserveAspectRatio="xMidYMid slice" clip-path="url(#ppc4)" opacity="0"/>'+
        '<polygon id="ppF1" class="pp-frame" points="18,16 318,16 318,256 18,256" opacity="0"/>'+
        '<polygon id="ppF2" class="pp-frame" points="338,16 622,16 622,256 338,256" opacity="0"/>'+
        '<polygon id="ppF3" class="pp-frame" points="18,272 622,272 622,444 18,444" opacity="0"/>'+
        '<polygon id="ppF4" class="pp-frame" points="18,272 622,272 622,444 18,444" opacity="0"/>'+
        '<g id="pp-bubble" opacity="0">'+
          '<g transform="translate(80,11) scale(1.4,0.86)"><path id="pp-b1-blk" d="'+slBubblePath({})+'" fill="#181b20" stroke="#181b20" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>'+
          '<polygon id="pp-bridge-blk" points="204,44 228,42 230,62 206,64" fill="#181b20" stroke="#181b20" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity="0"/>'+
          '<g id="pp-b2blkg" opacity="0" transform="translate(214,16) scale(1.1,0.72)"><path id="pp-b2-blk" d="'+slBubblePath({tailX:44,tailY:96,pinchX:44,pinchY:82})+'" fill="#181b20" stroke="#181b20" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>'+
          '<g transform="translate(80,11) scale(1.4,0.86)"><path id="pp-bubble-body" d="'+slBubblePath({})+'" fill="#fff"/></g>'+
          '<polygon id="pp-bridge" points="204,44 228,42 230,62 206,64" fill="#fff" opacity="0"/>'+
          '<g id="pp-b2whg" opacity="0" transform="translate(214,16) scale(1.1,0.72)"><path id="pp-bubble2-body" d="'+slBubblePath({tailX:44,tailY:96,pinchX:44,pinchY:82})+'" fill="#fff"/></g>'+
          '<rect id="pp-bubble-tbox" x="102" y="38" width="96" height="34" rx="3" fill="none" stroke="#35d5f2" stroke-width="1" stroke-dasharray="5 3" opacity="0"/>'+
          '<text text-anchor="middle" font-size="13" fill="#181b20" style="font-family:\'IBM Plex Sans\',sans-serif;font-weight:600"><tspan id="pp-bubble-t1" x="150" y="50"></tspan><tspan id="pp-bubble-t2" x="150" y="68"></tspan></text>'+
          '<text id="pp-b2txt" opacity="0" text-anchor="middle" font-size="13" fill="#181b20" style="font-family:\'IBM Plex Sans\',sans-serif;font-weight:600"><tspan id="pp-bubble2-t1" x="269" y="48"></tspan><tspan id="pp-bubble2-t2" x="269" y="64"></tspan></text></g>'+
      '</svg>'+
      '<div class="pp-handles" id="pp-handles"></div>'+
      '<div class="pp-knifeline" id="pp-knife"></div>'+
    '</div>'+
    /* Inspector */
    '<div class="slp" style="right:.3cqw;top:.3cqw;bottom:.3cqw;width:12.2cqw">'+
      '<div class="slp-h">Inspector<span class="grow"></span><s>◫</s><s>⧉</s></div>'+
      '<div class="slp-b" style="overflow-y:auto">'+
        '<div class="slp-sec" style="margin-top:0;color:var(--accent)">Selection — Image frame</div>'+
        '<div style="font-size:.66em;color:var(--ink)">issue-01 — Page 1 of 4</div>'+
        '<div class="slp-sec">Transform</div>'+
        '<div class="slp-seg" style="grid-template-columns:1fr 1fr"><b>X 12.0</b><b>Y 18.0</b></div>'+
        '<div class="slp-seg" style="grid-template-columns:1fr 1fr"><b>W 78.0</b><b>H 96.0</b></div>'+
        '<div class="slp-row"><span>Rotation</span><div class="slp-slider" style="width:3.6cqw"><i style="width:50%"></i></div><b>0°</b></div>'+
        '<div class="slp-sec">Frame</div>'+
        '<div class="slp-row"><span>Border width</span><div class="slp-slider" style="width:3.6cqw"><i id="pp-sl-bw" style="width:24%"></i></div><b id="pp-bw-val">0.5 mm</b></div>'+
        '<div class="slp-row"><span>Border colour</span><span class="slp-swatch" id="pp-sw-border" style="background:#181b20"></span></div>'+
        '<div class="slp-row"><span>Corner radius</span><div class="slp-slider" style="width:3.6cqw"><i style="width:8%"></i></div><b>0 mm</b></div>'+
        '<div class="slp-sec">Image</div>'+
        '<div class="slp-row"><span>Fit mode</span><div class="slp-select" id="pp-fit" style="flex:1">Fit within frame</div></div>'+
        '<div class="slp-seg" style="grid-template-columns:1fr 1fr"><b>Focal X 50</b><b>Focal Y 50</b></div>'+
        '<div class="slp-row"><span>Scale</span><div class="slp-slider" style="width:3.6cqw"><i style="width:40%"></i></div><b>100%</b></div>'+
        '<div class="slp-sec">Document background</div>'+
        '<div class="slp-row"><span>Solid color</span><span class="slp-swatch" id="pp-sw-page" style="background:#ffffff"></span></div>'+
        '<div class="slp-sec">Effects</div>'+
        '<div class="slp-chks"><span><b class="chk"></b>Drop shadow</span><span><b class="chk"></b>Inner glow</span></div>'+
        '<div class="slp-sec">Print production</div>'+
        '<div class="slp-select">PDF target — PDF/X-4</div>'+
        '<div class="slp-select">Output intent — US Web Coated (SWOP)</div>'+
        '<div class="slp-row"><span>Total ink limit</span><div class="slp-slider" style="width:3.6cqw"><i style="width:80%"></i></div><b>300%</b></div>'+
        '<div class="slp-row"><span>Bleed</span><b style="font-family:var(--mono);font-size:.85em;color:var(--ink)">3 mm</b></div>'+
        '<div class="slp-chks"><span><b class="chk"></b>Overprint preview</span><span><b class="chk"></b>Spot plate</span></div>'+
        '<div class="slp-row"><span class="slp-ok">✓ Preflight · CMYK ready</span></div>'+
      '</div></div>'+
    cursorEl()+
    '<div class="key-chip" id="pp-key">CTRL</div>'+
    '<div class="fd-caption">Rule the page into panels</div>'+
  '</div>'+
  '<div class="fd-loop"><i></i></div><span class="fd-tag">replay · signal loom paper</span></div>';

/* ── SFX ── */
TPL.sfx = '<div class="fd-stage sx">'+PAPER_BAR1+
  menubar(['Project','File','Edit','Layout','Insert','Tools','View','Window','Help'])+
  '<div class="fd-canvas">'+
    paperTools()+
    '<div class="sx-panelart"><div class="sx-burst" id="sx-burst"></div>'+
      '<svg id="sx-svg" viewBox="0 0 560 360"><g id="sx-decal" opacity="0" transform="translate(0,0)">'+
      '<text class="sx-echo e3" x="280" y="205">KAPOW!</text><text class="sx-echo e2" x="280" y="205">KAPOW!</text>'+
      '<text class="sx-echo e1" x="280" y="205">KAPOW!</text><text id="sx-main" x="280" y="205">KAPOW!</text></g></svg></div>'+
    '<div class="slp" style="right:.3cqw;top:.3cqw;bottom:.3cqw;width:13cqw">'+
      '<div class="slp-h">Comic SFX Designer<span class="grow"></span><s>◫</s><s>⧉</s></div>'+
      '<div class="slp-b">'+
        '<div class="slp-sec" style="margin-top:0">Design · KAPOW!</div>'+
        '<div class="slp-row"><span>Stroke width</span><div class="slp-slider" style="width:4.6cqw"><i id="sx-sl-stroke" style="width:30%"></i></div><b id="sx-stroke-val">1.2 mm</b></div>'+
        '<div class="slp-row"><span>Skew X</span><div class="slp-slider" style="width:4.6cqw"><i id="sx-sl-skew" style="width:0%"></i></div><b id="sx-skew-val">0°</b></div>'+
        '<div class="slp-row"><span>Tracking</span><div class="slp-slider" style="width:4.6cqw"><i id="sx-sl-track" style="width:10%"></i></div><b id="sx-track-val">0</b></div>'+
        '<div class="slp-row"><span>Trailing copies</span><b class="sx-step" id="sx-copies">0</b></div>'+
        '<div class="slp-row"><span>Fill · Stroke · Shadow</span><span class="slp-swatch" style="background:#ffd23d"></span><span class="slp-swatch" style="background:#b91c1c"></span><span class="slp-swatch" style="background:#1f2937"></span></div>'+
      '</div></div>'+
    cursorEl()+
    '<div class="fd-caption">Pick a Comic SFX preset</div>'+
  '</div>'+
  '<div class="fd-loop"><i></i></div><span class="fd-tag">replay · comic sfx designer</span></div>';

/* ── VIDEO ── */
TPL.video = '<div class="fd-stage vd">'+
  '<div class="fd-bar1"><span class="fd-appico">◈</span>'+wsGroup('editor')+
  '<span class="fd-chipbtn">Source Library · 3 assets</span><span class="fd-chipbtn">composition-04982a… ▾</span><span class="fd-chipbtn">↶ Undo</span><span class="fd-chipbtn">↷ Redo</span><span class="fd-chipbtn">＋ Source Bin</span><span class="fd-chipbtn">＋ Composition</span><span class="fd-chipbtn lit">▶ Render</span><span class="fd-chipbtn">Bin</span><span class="fd-chipbtn">Source</span><span class="fd-chipbtn">Program</span><span class="fd-chipbtn">Inspector</span><span class="fd-chipbtn">Help</span><span class="grow"></span>'+zoomGroup(true)+'<span class="fd-cost">$0.94</span></div>'+
  menubar(['Project','Edit','Timeline','Keyframes','View','Window','Help'])+
  '<div class="fd-canvas">'+
    '<div class="slp vd-lib" id="vd-lib">'+
      '<div class="slp-h">Project Source Bin<span class="grow"></span><s>⧉</s></div>'+
      '<div class="slp-b"><div class="bin-head">🗄 Source Library<u>3</u></div>'+
      '<div class="bin-sub">Mixed media, generated assets, captions and reusable timeline elements.</div>'+
      '<div class="slp-tabs"><b class="on">Library</b><b>Design Assets</b></div>'+
      '<div class="bin-chips"><b>⬆ Import Media</b><b>Video</b><b>Audio</b><b>Captions</b></div>'+
      '<div class="bin-item" id="vd-it1"><img src="'+ASSETS+'poster-walk.jpg" alt=""/><span><span class="nm">walk-wide.mp4</span><span class="bin-chips" style="margin-top:.3em"><b>V1</b><b>V2</b><b>V3</b><b>V4</b></span></span></div>'+
      '<div class="bin-item" id="vd-it2"><img src="'+ASSETS+'poster-turn.jpg" alt=""/><span><span class="nm">turn-cu.mp4</span><span class="bin-chips" style="margin-top:.3em"><b>V1</b><b>V2</b><b>V3</b><b>V4</b></span></span></div>'+
      '<div class="bin-item" id="vd-it3"><svg class="wave" viewBox="0 0 24 14"><path d="M1 7 L4 3 L7 11 L10 5 L13 9 L16 2 L19 12 L23 7" stroke="#22d3ee" fill="none" stroke-width="1.6"/></svg><span><span class="nm">score.wav</span><span class="bin-chips" style="margin-top:.3em"><b>A1</b><b>A2</b></span></span></div>'+
      '</div></div>'+
    '<div class="slp vd-smon">'+
      '<div class="slp-h">Source Monitor<span class="grow"></span></div>'+
      '<div class="vd-mh"><span class="ttl">Source Monitor</span><span>Preview the selected source asset before dropping it into the cut.</span></div>'+
      '<div class="vd-screen"><img id="vd-sm" src="'+ASSETS+'poster-walk.jpg" alt=""/>'+
        '<div class="vd-smempty" id="vd-smempty"><span><b>No source selected</b>Select a source item from the source bin to inspect it here before you place it on the timeline.</span></div></div>'+
      '<div class="vd-minfo" id="vd-minfo" style="opacity:0"><span class="nm">walk-wide.mp4</span><span class="mt">video · video/mp4</span><span class="grow"></span><span class="add hot" id="vd-addv">🎞 V1</span><span class="add">🎞 V2</span><span class="add">🎞 V3</span><span class="add">🎞 V4</span></div></div>'+
    '<div class="slp vd-pmon">'+
      '<div class="slp-h">Program Monitor<span class="grow"></span><s>＋ New Comp</s><s>Hide Controls</s></div>'+
      '<div class="vd-pmbody"><div class="vd-pstage">'+
        '<div style="display:flex;align-items:center;gap:.6em;flex:none"><span class="vd-mtoggle"><b>Edit Stage</b><b class="on">Rendered Preview</b></span></div>'+
        '<div class="vd-banner"><b>PREVIEW READY</b> — Rendered editor sequence · 2 visual clips · 30 fps · Review H.264 1080p · <b>COMPLETED</b></div>'+
        '<div class="vd-screen"><img id="vd-p1" src="'+ASSETS+'poster-walk.jpg" alt=""/><img id="vd-p2" src="'+ASSETS+'poster-turn.jpg" alt=""/></div>'+
        '<div class="vd-pctl">▶&nbsp; <i id="vd-tc">0:00</i>&thinsp;/&thinsp;0:12<span style="flex:1"></span>🔊&nbsp;⛶</div></div>'+
        '<div class="vd-pinfo"><span class="vd-ih">Sequence Info</span>'+
        '<div class="vd-irow"><span>Canvas</span><b>16:9 · 1080p</b></div>'+
        '<div class="vd-irow"><span>Timebase</span><b>30 fps</b></div>'+
        '<div class="vd-irow"><span>Length</span><b>12.0s</b></div>'+
        '<div class="vd-irow"><span>Tracks</span><b>V:2 · A:1</b></div>'+
        '<span class="vd-ih" style="margin-top:.35em">Settings</span>'+
        '<div class="vd-irow"><span>Size</span><b>1080p ▾</b></div>'+
        '<div class="vd-irow"><span>Codec</span><b>H.264 ▾</b></div>'+
        '<span style="flex:1"></span><span class="vd-btn">Save Video</span><span class="vd-btn lit">▶ Render</span></div></div></div>'+
    '<div class="slp vd-insp">'+
      '<div class="slp-h">Inspector<span class="grow"></span></div>'+
      '<div class="slp-b"><div class="inote">Tune the selected clip, or inspect the currently selected source asset.</div>'+
      '<span class="vd-ih">Selected Visual Clip</span><div class="iname">turn-cu.mp4</div>'+
      '<div class="vd-irow"><span>Track</span><b>Video 2</b></div>'+
      '<div class="vd-irow"><span>Start</span><b>4.1s</b></div>'+
      '<div class="vd-irow"><span>Duration</span><b>8.0s</b></div>'+
      '<div class="vd-irow"><span>Fit mode</span><b>Contain</b></div>'+
      '<div class="vd-irow"><span>Zoom</span><b id="vd-kf-s">100%</b></div>'+
      '<div class="vd-irow"><span>Opacity</span><b id="vd-kf-o">100%</b></div>'+
      '<div class="vd-islider"><u></u></div>'+
      '<span class="vd-ih">Keyframes</span><div class="vd-addkey" id="vd-addkey">◇ Add Key</div></div></div>'+
    '<div class="slp vd-tl">'+
      '<div class="slp-h">Timeline<span class="grow"></span></div>'+
      '<div class="vd-tlbody"><div class="vd-th">▦ Sequencer Timeline</div>'+
      '<div class="vd-tdesc">Visual clips and audio clips live on independent timed lanes. Use the tool strip for select vs cut, drag clips for rough placement, then use the inspector and program stage for precise timing and framing.</div>'+
      '<div class="vd-tools"><b class="on">▷ Select</b><b>✂ Cut</b><b>⇆ Slip</b><b>🖐 Hand</b><b>＋ Snap</b><b>‹ Key</b><b>◇ Add Key</b><b>Key ›</b><em>Zoom <i class="vd-msl"><u style="width:55%"></u></i> 150% · V H <i class="vd-msl"><u style="width:70%"></u></i> 84 · A H <i class="vd-msl"><u style="width:52%"></u></i> 64</em><b>Zoom To Fit</b><b id="vd-clipn">No clips yet</b></div>'+
      '<div class="vd-ruler"><span>0s</span><span>2s</span><span>4s</span><span>6s</span><span>8s</span><span>10s</span><span>12s</span></div>'+
      '<div class="vd-track"><u><b>V1</b><i id="vd-n-v1">0 clips</i></u><div class="vd-lane" id="vd-v1"><span class="vd-hint" id="vd-hint-v">Add image, video, composition, or text items from the source bin into this video lane.</span></div></div>'+
      '<div class="vd-track"><u><b>V2</b><i id="vd-n-v2">0 clips</i></u><div class="vd-lane" id="vd-v2"><div class="vd-gap" id="vd-gap1" style="left:2%;width:30%">GAP 4.1</div></div></div>'+
      '<div class="vd-track"><u><b>V3</b><i>0 clips</i></u><div class="vd-lane"><span class="vd-hint">Add image, video, composition, or text items from the source bin into this video lane.</span></div></div>'+
      '<div class="vd-track"><u><b>V4</b><i>0 clips</i></u><div class="vd-lane"><span class="vd-hint">Add image, video, composition, or text items from the source bin into this video lane.</span></div></div>'+
      '<div class="vd-track"><u><b>A1</b><i id="vd-n-a1">0 clips</i></u><div class="vd-lane" id="vd-a1"><span class="vd-hint" id="vd-hint-a">Add audio clips or video-with-audio clips from the source bin into this lane.</span></div></div>'+
      '<i class="vd-playhead" id="vd-playhead"></i></div></div>'+
    '<div class="vd-ghost" id="vd-ghost"></div>'+
    cursorEl()+
    '<div class="fd-caption">Select a source — it opens in the Source Monitor</div>'+
  '</div>'+
  '<div class="fd-loop"><i></i></div><span class="fd-tag">replay · signal loom video</span></div>';

/* ─────────────────────── sim engine ─────────────────────── */
function makeEngine(host){
  var root = host.shadowRoot;
  var stage = root.querySelector('.fd-stage');
  var canvas = stage.querySelector('.fd-canvas');
  var cursor = stage.querySelector('.fd-cursor');
  var caption = stage.querySelector('.fd-caption');
  var loopbar = stage.querySelector('.fd-loop i');
  var timers = [], intervals = [];
  var sim = {root: root, stage: stage, canvas: canvas, cursor: cursor,
    $: function(id){ return root.getElementById(id); }};
  sim.later = function(t, fn){ timers.push(setTimeout(fn, t*1000)); };
  sim.every = function(ms, fn){ var iv = setInterval(fn, ms); intervals.push(iv); return iv; };
  sim.raf = function(fn){ var stopped = false;
    (function loop(){ if(stopped || !host.isConnected) return; if(fn() !== false) requestAnimationFrame(loop); })();
    return function(){ stopped = true; }; };
  sim.clear = function(){ timers.forEach(clearTimeout); timers = []; intervals.forEach(clearInterval); intervals = []; };
  sim.rel = function(el){ var c = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    var k = canvas.offsetWidth ? c.width / canvas.offsetWidth : 1;
    return {x:(r.left-c.left)/k, y:(r.top-c.top)/k, w:r.width/k, h:r.height/k,
            cx:(r.left-c.left+r.width/2)/k, cy:(r.top-c.top+r.height/2)/k}; };
  sim.move = function(x, y, dur){ if(!cursor) return;
    cursor.style.transition = 'left '+dur+'s cubic-bezier(.22,.61,.2,1), top '+dur+'s cubic-bezier(.22,.61,.2,1)';
    cursor.style.left = x+'px'; cursor.style.top = y+'px'; };
  sim.moveTo = function(el, dur, dx, dy){ if(!cursor || !el) return; var r = sim.rel(el); sim.move(r.cx+(dx||0), r.cy+(dy||0), dur||.8); };
  sim.click = function(){ if(!cursor) return; cursor.classList.remove('click'); void cursor.offsetWidth; cursor.classList.add('click'); };
  sim.cap = function(t){ if(!caption) return; caption.classList.add('off');
    sim.later(.32, function(){ caption.textContent = t; caption.classList.remove('off'); }); };
  sim.home = function(){ if(!cursor) return; cursor.style.transition = 'none';
    cursor.style.left = (canvas.offsetWidth*.5)+'px'; cursor.style.top = (canvas.offsetHeight*.82)+'px'; };
  sim.loopStart = function(TOTAL){
    loopbar.style.transition = 'none'; loopbar.style.width = '0%';
    loopbar.getBoundingClientRect();
    loopbar.style.transition = 'width '+TOTAL+'s linear'; loopbar.style.width = '100%'; };
  sim.ghostDrag = function(fromEl, toX, toY, img, dur){
    var ghost = sim.$('fd-ghost') || sim.$('vd-ghost');
    if(!ghost) return;
    var r = sim.rel(fromEl);
    ghost.style.transition = 'none';
    ghost.style.backgroundImage = img ? 'url('+img+')' : 'none';
    ghost.style.left = (r.cx-30)+'px'; ghost.style.top = (r.cy-18)+'px'; ghost.style.opacity = 1;
    ghost.getBoundingClientRect();
    ghost.style.transition = 'left '+dur+'s cubic-bezier(.22,.61,.2,1), top '+dur+'s cubic-bezier(.22,.61,.2,1), opacity .25s';
    ghost.style.left = (toX-30)+'px'; ghost.style.top = (toY-18)+'px';
    sim.move(toX, toY, dur);
    return ghost;
  };
  return sim;
}

/* ─────────────────────── scripts ─────────────────────── */
var SCRIPTS = {};

/* — flow: a real node run — */
SCRIPTS.flow = {TOTAL: 25, run: function(sim){
  var $ = sim.$;
  var A=$('fdA'), B=$('fdB'), C=$('fdC'), D=$('fdD'), E=$('fdE'), svg=$('fd-svg');
  if(!sim._wires){
    sim._wires = [];
    var mk = function(f, t, ts){
      var p = document.createElementNS('http://www.w3.org/2000/svg','path');
      p.setAttribute('stroke','rgba(148,163,184,.7)'); svg.appendChild(p);
      var w = {path:p, f:f, t:t, ts:ts, drawn:false}; sim._wires.push(w); return w; };
    sim._wAD = mk(A, D, '.nport.in.i1');
    sim._wBD = mk(B, D, '.nport.in.i2');
    sim._wCD = mk(C, D, '.nport.in.i3');
    sim._wDE = mk(D, E, '.nport.in');
  }
  function port(node, sel){ return node.querySelector(sel); }
  function layoutWires(){
    sim._wires.forEach(function(w){
      var po = port(w.f,'.nport.out'), pi = port(w.t, w.ts || '.nport.in');
      if(!po || !pi) return;
      var a = sim.rel(po), b = sim.rel(pi), dx = Math.max(24,((b.cx)-(a.cx))*.5);
      w.path.setAttribute('d','M'+a.cx+','+a.cy+' C'+(a.cx+dx)+','+a.cy+' '+(b.cx-dx)+','+b.cy+' '+b.cx+','+b.cy);
      var L = w.path.getTotalLength();
      w.path.style.transition = 'none';
      w.path.style.strokeDasharray = L+' '+L;
      w.path.style.strokeDashoffset = w.drawn ? 0 : L; });
  }
  function drawWire(w, dur){
    w.drawn = true; w.animating = true;
    port(w.f,'.nport.out').classList.add('hot');
    w.path.getBoundingClientRect();
    w.path.style.transition = 'stroke-dashoffset '+dur+'s cubic-bezier(.22,.61,.2,1)';
    w.path.style.strokeDashoffset = 0;
    sim.later(dur*.9, function(){ port(w.t, w.ts || '.nport.in').classList.add('hot'); });
    sim.later(dur, function(){ w.animating = false; });
  }
  // live wire tracking — drawn wires follow their real port handles every frame
  sim._flowGen = (sim._flowGen || 0) + 1;
  var myGen = sim._flowGen;
  sim.raf(function(){
    if(myGen !== sim._flowGen || !sim._wires) return false;
    sim._wires.forEach(function(w){
      if(!w.drawn || w.animating) return;
      var po = port(w.f,'.nport.out'), pi = port(w.t, w.ts || '.nport.in');
      if(!po || !pi) return;
      var a = sim.rel(po), b = sim.rel(pi), dx = Math.max(24,(b.cx-a.cx)*.5);
      w.path.setAttribute('d','M'+a.cx+','+a.cy+' C'+(a.cx+dx)+','+a.cy+' '+(b.cx-dx)+','+b.cy+' '+b.cx+','+b.cy);
      w.path.style.strokeDasharray = 'none';
      w.path.style.strokeDashoffset = '0';
    });
    return true;
  });
  var typing = null;
  function typePrompt(text, dur){
    C.classList.add('editing');
    var ph = $('fd-prompt-ph'); if(ph) ph.style.display = 'none';
    var el = $('fd-prompt'); el.textContent = '';
    var i = 0, step = Math.max(16, dur*1000/text.length);
    var iv = sim.every(step, function(){
      i++; el.textContent = text.slice(0, i);
      if(i >= text.length){ clearInterval(iv);
        sim.later(.4, function(){ C.classList.remove('editing'); }); } });
  }
  var newRow = null;
  function addEnvelopeItem(){
    newRow = document.createElement('div');
    newRow.className = 'nitem new';
    newRow.innerHTML = '<div class="nitem-t"><span class="nitem-sel">Image</span><i>↑</i><i>⧉</i><i>🗑</i></div><div class="nitem-in">portrait-inked.png</div>';
    $('fd-items').appendChild(newRow);
    $('fd-count').textContent = '3';
  }
  /* reset */
  [A,B,C,D,E].forEach(function(n){ n.classList.remove('on','editing'); });
  $('fd-prompt').textContent = ''; var pph = $('fd-prompt-ph'); if(pph) pph.style.display = '';
  $('fd-result').classList.remove('running','done');
  $('fd-run').classList.remove('running'); $('fd-run-t').textContent = 'Run';
  $('fd-src').classList.remove('filled'); $('fd-ref1').classList.remove('filled');
  sim.root.querySelectorAll('.nitem.new').forEach(function(n){ n.remove(); });
  $('fd-count').textContent = '2';
  $('fbin-new').style.display = 'none';
  sim.stage.querySelectorAll('.nport.hot').forEach(function(p){ p.classList.remove('hot'); });
  sim._wires.forEach(function(w){ w.drawn = false; w.animating = false; });
  layoutWires();
  sim.home();
  sim.cap('Drag the rough sketch in as a source');
  sim.later(.4,  function(){ E.classList.add('on'); layoutWires(); });
  sim.later(.5,  function(){ sim.moveTo($('fbin1'), .7); });
  sim.later(1.2, function(){ sim.click(); var r = sim.rel(A); sim.ghostDrag($('fbin1'), r.cx, r.cy, ASSETS+'sketch-crop.jpg', .8); });
  sim.later(2.1, function(){ var g = $('fd-ghost'); if(g) g.style.opacity = 0; A.classList.add('on'); });
  sim.later(2.5, function(){ sim.cap('And the style reference'); sim.moveTo($('fbin2'), .6); });
  sim.later(3.2, function(){ sim.click(); var r = sim.rel(B); sim.ghostDrag($('fbin2'), r.cx, r.cy, ASSETS+'ref-style.jpg', .8); });
  sim.later(4.1, function(){ var g = $('fd-ghost'); if(g) g.style.opacity = 0; B.classList.add('on'); layoutWires(); });
  sim.later(4.6, function(){ sim.cap('Add a Prompt Input'); C.classList.add('on'); layoutWires(); });
  sim.later(5.2, function(){ typePrompt('ink & colour this sketch — keep the slate-blue top', 2.4); });
  sim.later(8.2, function(){ sim.cap('Wire the sketch into Image Generation'); D.classList.add('on'); layoutWires(); });
  sim.later(8.6, function(){ sim.moveTo(port(A,'.nport.out'), .5); });
  sim.later(9.1, function(){ sim.click(); drawWire(sim._wAD, .7); sim.moveTo(port(D,'.nport.in.i1'), .7); });
  sim.later(9.9, function(){ $('fd-src').classList.add('filled'); });
  sim.later(10.2,function(){ sim.cap('The style reference in too'); sim.moveTo(port(B,'.nport.out'), .5); });
  sim.later(10.7,function(){ sim.click(); drawWire(sim._wBD, .7); sim.moveTo(port(D,'.nport.in.i2'), .7); });
  sim.later(11.5,function(){ $('fd-ref1').classList.add('filled'); });
  sim.later(11.8,function(){ sim.cap('And the prompt'); sim.moveTo(port(C,'.nport.out'), .5); });
  sim.later(12.3,function(){ sim.click(); drawWire(sim._wCD, .7); sim.moveTo(port(D,'.nport.in.i3'), .7); });
  sim.later(13.2,function(){ sim.cap('Run it — the cost is on the node'); sim.moveTo($('fd-run'), .6); });
  sim.later(13.9,function(){ sim.click(); $('fd-run').classList.add('running'); $('fd-run-t').textContent = 'Running'; $('fd-result').classList.add('running'); });
  sim.later(16.4,function(){ $('fd-result').classList.remove('running'); $('fd-result').classList.add('done'); $('fd-run').classList.remove('running'); $('fd-run-t').textContent = 'Run'; });
  sim.later(17.0,function(){ sim.cap('Wire the result into an Envelope'); sim.moveTo(port(D,'.nport.out'), .6); });
  sim.later(17.8,function(){ sim.click(); drawWire(sim._wDE, .9); sim.moveTo(port(E,'.nport.in'), .9); });
  sim.later(19.0,function(){ sim.click(); addEnvelopeItem(); });
  sim.later(20.0,function(){ sim.cap('It lands in the Source Library'); });
  sim.later(20.8,function(){ var el = $('fbin-new'); el.style.display = ''; el.classList.add('new'); sim.moveTo(el, .8); });
  sim.later(22.8,function(){ sim.cap('Every workspace sees it now'); });
}};

/* — paper: build a page for real — */
SCRIPTS.paper = {TOTAL: 47, run: function(sim){
  function showImgHandles(fr){
    hideImgHandles();
    var wrap = document.createElement('div'); wrap.id='pp-imgh';
    wrap.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:6';
    var r = fr.getAttribute('points').split(' ').map(function(s){ return s.split(',').map(Number); });
    var cx = r.reduce(function(a,p){return a+p[0];},0)/r.length;
    var cy = r.reduce(function(a,p){return a+p[1];},0)/r.length;
    r.concat([[cx,cy]]).forEach(function(p,i){
      var d=document.createElement('div'); var ctr=(i===r.length);
      d.style.cssText='position:absolute;left:'+(p[0]/640*100)+'%;top:'+(p[1]/460*100)+'%;'+
        'width:'+(ctr?1.5:1.2)+'em;height:'+(ctr?1.5:1.2)+'em;margin:'+(ctr?-.75:-.6)+'em;border-radius:50%;'+
        'background:#e0359a;border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,.6);color:#fff;'+
        'font-size:.7em;line-height:'+(ctr?1.4:1.05)+'em;text-align:center;font-weight:700';
      d.textContent = ctr ? '\u2725' : '+';
      wrap.appendChild(d);
    });
    $('pp-page').appendChild(wrap);
  }
  function hideImgHandles(){ var e=sim.root.getElementById('pp-imgh'); if(e) e.remove(); }
  var $ = sim.$;
  var page = $('pp-page'), handles = $('pp-handles');
  var F = [$('ppF1'), $('ppF2'), $('ppF3'), $('ppF4')];
  var RECTS = [
    [[18,16],[318,16],[318,256],[18,256]],
    [[338,16],[622,16],[622,256],[338,256]],
    [[18,272],[622,272],[622,444],[18,444]]];
  var F2_SCULPT = [[338,16],[622,16],[622,256],[470,196],[338,256]];
  var F3_FROM = [[18,272],[480,272],[480,272],[480,272],[622,272],[622,444],[18,444]];
  var F3_KEY  = [[18,272],[352,272],[470,212],[602,272],[622,272],[622,444],[18,444]];
  /* gutter-knife split of the sculpted bottom frame at x=380 with a 10-unit gutter */
  var F3_LEFT  = [[18,272],[380,308],[380,444],[18,444]];
  var F4_RIGHT = [[390,309],[480,318],[622,272],[622,444],[390,444]];
  function pts(a){ return a.map(function(p){ return p[0]+','+p[1]; }).join(' '); }
  function setPts(el, a){ el.setAttribute('points', pts(a)); }
  function lerpPts(a, b, t){ return b.map(function(p, i){ var q = a[Math.min(i, a.length-1)];
    return [q[0]+(p[0]-q[0])*t, q[1]+(p[1]-q[1])*t]; }); }
  function animPts(el, from, to, dur, alsoClip){
    var t0 = performance.now();
    sim.raf(function(){
      var t = Math.min(1,(performance.now()-t0)/(dur*1000));
      var e = 1-Math.pow(1-t,3);
      var cur = lerpPts(from, to, e);
      setPts(el, cur);
      if(alsoClip) setPts(alsoClip, cur);
      return t < 1; });
  }
  function tweenArt(el, attrs, dur){
    var t0 = performance.now(); var from = {};
    Object.keys(attrs).forEach(function(k){ from[k] = parseFloat(el.getAttribute(k)); });
    sim.raf(function(){
      var t = Math.min(1,(performance.now()-t0)/(dur*1000));
      var e = 1-Math.pow(1-t,3);
      Object.keys(attrs).forEach(function(k){ el.setAttribute(k, from[k]+(attrs[k]-from[k])*e); });
      return t < 1; });
  }
  function svgPt(x, y){ var r = sim.rel(page);
    return {x: r.x + x/640*r.w, y: r.y + y/460*r.h}; }
  function drawFrame(el, rect, t, dur, clip){
    sim.later(t, function(){ var s = svgPt(rect[0][0], rect[0][1]); sim.move(s.x, s.y, .5); });
    sim.later(t+.55, function(){ sim.click(); el.setAttribute('opacity', 1);
      var collapsed = [rect[0], rect[0], rect[0], rect[0]];
      setPts(el, collapsed);
      animPts(el, collapsed, rect, dur, clip);
      var e = svgPt(rect[2][0], rect[2][1]); sim.move(e.x, e.y, dur); });
  }
  function buildHandles(poly){
    handles.innerHTML = '';
    var arr = poly.getAttribute('points').split(' ').map(function(s2){ return s2.split(',').map(Number); });
    arr.forEach(function(p2, k){
      var put = function(x, y, cls){ var i2 = document.createElement('i'); if(cls) i2.className = cls;
        i2.style.left = (x/640*100)+'%'; i2.style.top = (y/460*100)+'%'; handles.appendChild(i2); };
      put(p2[0], p2[1]);
      var q = arr[(k+1)%arr.length];
      put((p2[0]+q[0])/2, (p2[1]+q[1])/2, 'mid'); });
  }
  var key = $('pp-key');
  function toolOn(id){ ['tool-select','tool-frame','tool-bubble','tool-knife'].forEach(function(t){ $(t).classList.toggle('on', t === id); }); }
  function selFrame(el){ F.forEach(function(f){ f.classList.remove('sel'); }); if(el) el.classList.add('sel'); }
  /* reset */
  F.forEach(function(el, i){ if(i<3) setPts(el, RECTS[i]); el.setAttribute('opacity', 0); el.classList.remove('sel'); });
  setPts(F[3], F4_RIGHT);
  setPts($('ppc1p'), RECTS[0]); setPts($('ppc2p'), RECTS[1]); setPts($('ppc3p'), RECTS[2]); setPts($('ppc4p'), F4_RIGHT);
  ['pp-art1','pp-art2','pp-art3','pp-art4'].forEach(function(id){ $(id).setAttribute('opacity', 0); });
  ['pp-art1','pp-art2','pp-art3','pp-art4'].forEach(function(id){ var a=$(id); if(a) a.setAttribute('preserveAspectRatio','xMidYMid meet'); });
  var _pf=$('pp-fit'); if(_pf) _pf.textContent='Fit within frame';
  var _a2r=$('pp-art2'); if(_a2r){ _a2r.setAttribute('x',338); _a2r.setAttribute('y',16); _a2r.setAttribute('width',284); _a2r.setAttribute('height',240); _a2r.removeAttribute('transform'); }
  hideImgHandles();
  var art3 = $('pp-art3'); art3.setAttribute('y', 272); art3.setAttribute('height', 172);
  var art4 = $('pp-art4'); art4.setAttribute('y', 272); art4.setAttribute('height', 172);
  $('pp-bubble').setAttribute('opacity', 0);
  ['pp-bridge-blk','pp-b2blkg','pp-bridge','pp-b2whg','pp-b2txt'].forEach(function(id){ var e=$(id); if(e) e.setAttribute('opacity',0); });
  var _tb = $('pp-bubble-tbox'); if(_tb) _tb.setAttribute('opacity', 0);
  $('pp-bubble-t1').textContent = ''; $('pp-bubble-t2').textContent = '';
  $('pp-bubble2-t1').textContent = ''; $('pp-bubble2-t2').textContent = '';
  $('pp-bubble-body').setAttribute('d', slBubblePath({})); $('pp-b1-blk').setAttribute('d', slBubblePath({}));
  handles.classList.remove('on'); handles.innerHTML = '';
  key.classList.remove('on');
  $('pp-knife').style.opacity = 0;
  page.style.background = '#ffffff';
  $('pp-sl-bw').style.width = '24%'; $('pp-bw-val').textContent = '0.5 mm';
  $('pp-sw-border').style.background = '#181b20'; $('pp-sw-page').style.background = '#ffffff';
  F.forEach(function(el){ el.style.stroke = '#181b20'; el.setAttribute('stroke-width', 1.6); });
  ['pp-b1-blk','pp-b2-blk','pp-bridge-blk'].forEach(function(id){ var e=$(id); if(e){ e.style.fill='#181b20'; e.style.stroke='#181b20'; } });
  $('pp-bridge').style.stroke = '#181b20';
  ['pbin1','pbin2','pbin3'].forEach(function(id){ $(id).classList.remove('sel'); });
  toolOn('tool-select');
  sim.home();
  /* 1 — rule the panels (empty frames) */
  sim.cap('Grab the frame tool');
  sim.later(.4, function(){ sim.moveTo($('tool-frame'), .6); });
  sim.later(1.1, function(){ sim.click(); toolOn('tool-frame'); });
  sim.later(1.4, function(){ sim.cap('Rule the page into panels'); });
  drawFrame(F[0], RECTS[0], 1.6, .7, $('ppc1p'));
  drawFrame(F[1], RECTS[1], 2.8, .7, $('ppc2p'));
  drawFrame(F[2], RECTS[2], 4.0, .7, $('ppc3p'));
  /* 2 — place art: select frame, click source */
  sim.later(5.2, function(){ sim.cap('Select a frame — click a source to place it, fit inside');
    sim.moveTo($('tool-select'), .5); });
  sim.later(5.8, function(){ sim.click(); toolOn('tool-select'); });
  sim.later(6.1, function(){ var m = svgPt(168, 136); sim.move(m.x, m.y, .5); });
  sim.later(6.7, function(){ sim.click(); selFrame(F[0]); });
  sim.later(7.1, function(){ sim.moveTo($('pbin1'), .6); });
  sim.later(7.8, function(){ sim.click(); $('pbin1').classList.add('sel');
    $('pp-art1').setAttribute('opacity', 1); });
  /* 3 — or drag from the bin */
  sim.later(8.6, function(){ sim.cap('…or drag it straight onto the frame');
    var m = svgPt(480, 136);
    sim.moveTo($('pbin2'), .5);
    sim.later(.6, function(){ sim.click(); sim.ghostDrag($('pbin2'), m.x, m.y, ASSETS+'wnm-fountain.jpg', .9); }); });
  sim.later(10.4, function(){ var g = $('vd-ghost') || $('fd-ghost'); if(g) g.style.opacity = 0;
    selFrame(F[1]); $('pp-art2').setAttribute('opacity', 1); });
  sim.later(11.0, function(){ var m = svgPt(320, 358); sim.move(m.x, m.y, .5); });
  sim.later(11.6, function(){ sim.click(); selFrame(F[2]); });
  sim.later(12.0, function(){ sim.moveTo($('pbin3'), .5); });
  sim.later(12.6, function(){ sim.click(); $('pp-art3').setAttribute('opacity', 1); });
  /* 4 — ctrl vertex sculpt + interlock */
  var pf1 = RECTS[1].map(function(p){ return p.slice(); });
  var pf2 = RECTS[2].map(function(p){ return p.slice(); });
  function applyF(el, clip, pts){ var s = pts.map(function(p){ return p[0]+','+p[1]; }).join(' ');
    el.setAttribute('points', s); if(clip) clip.setAttribute('points', s); }
  function dragVtx(el, clip, pts, i, to, dur){ var from = pts[i].slice(), t0 = performance.now();
    sim.raf(function(){ var t = Math.min(1,(performance.now()-t0)/(dur*1000)), e = 1-Math.pow(1-t,3);
      pts[i] = [from[0]+(to[0]-from[0])*e, from[1]+(to[1]-from[1])*e]; applyF(el, clip, pts); return t < 1; }); }
  sim.later(13.4, function(){ sim.cap('Hold Ctrl — vertex handles appear'); selFrame(F[1]); });
  sim.later(13.7, function(){ key.classList.add('on'); var m = svgPt(480, 256);
    key.style.left = (m.x+26)+'px'; key.style.top = (m.y-30)+'px';
    buildHandles(F[1]); handles.classList.add('on'); sim.move(m.x, m.y, .6); });
  sim.later(13.9, function(){ sim.cap('Ctrl-click a midpoint — adds ONE vertex'); sim.click();
    pf1.splice(3, 0, [480,256]); applyF(F[1], $('ppc2p'), pf1); buildHandles(F[1]); });
  sim.later(14.5, function(){ sim.cap('Drag it down the grid — a clean chevron');
    var m = svgPt(480, 318); sim.move(m.x, m.y, .9);
    key.style.left = (m.x+26)+'px'; key.style.top = (m.y-30)+'px';
    dragVtx(F[1], $('ppc2p'), pf1, 3, [480,318], .9); });
  sim.later(15.6, function(){ buildHandles(F[1]);
    sim.cap('Interlock the neighbour — one matching vertex'); buildHandles(F[2]); selFrame(F[2]);
    var m = svgPt(480, 272); sim.move(m.x, m.y, .5); key.style.left = (m.x+26)+'px'; key.style.top = (m.y-30)+'px'; });
  sim.later(16.2, function(){ sim.click(); pf2.splice(1, 0, [480,272]); applyF(F[2], $('ppc3p'), pf2); buildHandles(F[2]); });
  sim.later(16.6, function(){ var m = svgPt(480, 318); sim.move(m.x, m.y, .9);
    key.style.left = (m.x+26)+'px'; key.style.top = (m.y-30)+'px';
    dragVtx(F[2], $('ppc3p'), pf2, 1, [480,318], .9); tweenArt($('pp-art3'), {y: 272, height: 172}, .9); });
  sim.later(17.7, function(){ buildHandles(F[2]); });
  sim.later(19.5, function(){ key.classList.remove('on'); handles.classList.remove('on'); selFrame(null); });
  /* 5 — gutter knife */
  sim.later(20.0, function(){ sim.cap('The gutter knife — one stroke, two panels');
    sim.moveTo($('tool-knife'), .7); });
  sim.later(20.8, function(){ sim.click(); toolOn('tool-knife'); });
  sim.later(21.2, function(){
    var a = svgPt(380, 258), b = svgPt(380, 452);
    var kn = $('pp-knife');
    kn.style.left = ((380/640)*100)+'%'; kn.style.top = ((250/460)*100)+'%'; kn.style.height = '0%';
    kn.style.opacity = 1;
    sim.move(a.x, a.y, .5);
    sim.later(.55, function(){ sim.click();
      kn.style.transition = 'height .9s cubic-bezier(.22,.61,.2,1)';
      kn.style.height = ((200/460)*100)+'%';
      sim.move(b.x, b.y, .9); }); });
  sim.later(23.0, function(){
    $('pp-knife').style.opacity = 0;
    /* split: F3 → left part; F4 appears as right part; art clones + reclips */
    setPts(F[2], F3_LEFT); setPts($('ppc3p'), F3_LEFT);
    F[3].setAttribute('opacity', 1); setPts(F[3], F4_RIGHT); setPts($('ppc4p'), F4_RIGHT);
    var a3 = $('pp-art3');
    var a4 = $('pp-art4');
    a4.setAttribute('y', a3.getAttribute('y')); a4.setAttribute('height', a3.getAttribute('height'));
    a4.setAttribute('preserveAspectRatio','xMidYMid meet');
    a4.setAttribute('opacity', 1); });
  /* 6 — bubbles + bridge */
  sim.later(24.0, function(){ sim.cap('Speech bubbles — drag the tail to the speaker');
    sim.moveTo($('tool-bubble'), .6); });
  sim.later(24.7, function(){ sim.click(); toolOn('tool-bubble'); });
  sim.later(25.0, function(){ var b = svgPt(168, 64); sim.move(b.x, b.y, .7); });
  sim.later(25.8, function(){ sim.click(); $('pp-bubble').setAttribute('opacity', 1); });
  sim.later(26.1, function(){
    var t1 = 'A town holding', t2 = 'its breath.', i = 0;
    sim.every(42, function(){ i++;
      $('pp-bubble-t1').textContent = t1.slice(0, i);
      $('pp-bubble-t2').textContent = i > t1.length ? t2.slice(0, i-t1.length) : ''; }); });
  sim.later(27.6, function(){ var tp2 = svgPt(84, 112); sim.move(tp2.x, tp2.y, .5); });
  sim.later(28.2, function(){ sim.click();
    var _t0 = performance.now();
    sim.raf(function(){ var t = Math.min(1,(performance.now()-_t0)/700);
      var tx = 72+(28-72)*t, ty = 92+(106-92)*t;
      var _d = slBubblePath({tailX:tx, tailY:ty}); $('pp-bubble-body').setAttribute('d', _d); $('pp-b1-blk').setAttribute('d', _d);
      return t < 1; });
    var tp2 = svgPt(80+28*1.4, 11+106*0.86); sim.move(tp2.x, tp2.y, .7); });
  sim.later(29.2, function(){ sim.cap('Same speaker again? Bridge the balloons');
    var b = svgPt(412, 52); sim.move(b.x, b.y, .8); });
  sim.later(30.1, function(){ sim.click(); ['pp-bridge-blk','pp-b2blkg','pp-bridge','pp-b2whg','pp-b2txt'].forEach(function(id){ var e=$(id); if(e) e.setAttribute('opacity',1); }); });
  sim.later(30.4, function(){
    var t1 = 'Still is.', i = 0;
    sim.every(55, function(){ i++; $('pp-bubble2-t1').textContent = t1.slice(0, i); }); });
  sim.later(31.0, function(){ sim.cap('Text is its own element — reposition &amp; restyle it');
    var _tb = $('pp-bubble-tbox'); if(_tb) _tb.setAttribute('opacity', 1); });
  sim.later(32.1, function(){ var _tb = $('pp-bubble-tbox'); if(_tb) _tb.setAttribute('opacity', 0); });
  /* 7 — border + tint + preflight */
  sim.later(32.6, function(){ sim.cap('Border weight & colour, in millimetres');
    sim.moveTo($('pp-sl-bw'), .7); });
  sim.later(33.4, function(){ sim.click();
    $('pp-sl-bw').style.width = '62%'; $('pp-bw-val').textContent = '1.2 mm';
    F.forEach(function(el){ el.setAttribute('stroke-width', 3.2); }); });
  sim.later(34.2, function(){ sim.moveTo($('pp-sw-border'), .5); });
  sim.later(34.8, function(){ sim.click();
    $('pp-sw-border').style.background = '#1e3a5f';
    F.forEach(function(el){ el.style.stroke = '#1e3a5f'; });
    ['pp-b1-blk','pp-b2-blk','pp-bridge-blk'].forEach(function(id){ var e=$(id); if(e){ e.style.fill='#1e3a5f'; e.style.stroke='#1e3a5f'; } });
    $('pp-bridge').style.stroke = '#1e3a5f'; });
  sim.later(35.4, function(){ sim.moveTo($('pp-sw-page'), .5); });
  sim.later(36.0, function(){ sim.click();
    $('pp-sw-page').style.background = '#f6efe1'; page.style.background = '#f6efe1'; });
  sim.later(36.6, function(){ sim.cap('Preflight ✓ — CMYK, print-ready'); });
  sim.later(37.4, function(){ sim.cap('Fit is the default — set every panel to Fill (cover)'); sim.moveTo($('pp-fit'), .6); });
  sim.later(38.1, function(){ sim.click(); var _pf=$('pp-fit'); if(_pf) _pf.textContent='Fill (cover)';
    ['pp-art1','pp-art2','pp-art3','pp-art4'].forEach(function(id){ var a=$(id); if(a) a.setAttribute('preserveAspectRatio','xMidYMid slice'); }); });
  sim.later(39.2, function(){ sim.cap('Magenta handles pan, scale &amp; rotate the image inside the frame');
    selFrame(F[1]); showImgHandles(F[1]); var m=svgPt(480,130); sim.move(m.x,m.y,.6); });
  sim.later(40.1, function(){ tweenArt($('pp-art2'), {width:352, height:298, x:314, y:2}, 1.2);
    var m=svgPt(500,120); sim.move(m.x,m.y,1.2); });
  sim.later(41.5, function(){ sim.cap('Pan it to reframe'); tweenArt($('pp-art2'), {x:286, y:18}, 1.1);
    var m=svgPt(452,150); sim.move(m.x,m.y,1.1); });
  sim.later(42.9, function(){ sim.cap('Rotate inside the frame'); var a=$('pp-art2'); if(a) a.setAttribute('transform','rotate(-5 480 136)');
    var m=svgPt(560,90); sim.move(m.x,m.y,.9); });
  sim.later(44.2, function(){ sim.cap('Frames scale &amp; rotate as objects too'); hideImgHandles(); selFrame(F[1]); });
  sim.later(45.2, function(){ sim.cap('One project — written, drawn, generated, laid out, printed'); });
}};

/* — sfx — */
SCRIPTS.sfx = {TOTAL: 20, run: function(sim){
  var $ = sim.$;
  var decal = $('sx-decal'), main = $('sx-main'), pick = $('sx-pick'),
      presets = $('ptb'), burst = $('sx-burst');
  function setDecal(skew, rot, track){
    decal.setAttribute('transform','rotate('+rot+' 280 190) skewX('+skew+')');
    [].forEach.call(decal.querySelectorAll('text'), function(t){ t.style.letterSpacing = track+'px'; });
  }
  decal.setAttribute('opacity', 0); decal.classList.remove('copies');
  setDecal(0, 0, 0);
  main.style.strokeWidth = '6px'; main.style.filter = 'drop-shadow(4px 5px 0 #1f2937)';
  pick.classList.remove('on'); presets.classList.remove('pulse');
  burst.style.opacity = 0;
  $('sx-sl-stroke').style.width = '30%'; $('sx-stroke-val').textContent = '1.2 mm';
  $('sx-sl-skew').style.width = '0%'; $('sx-skew-val').textContent = '0°';
  $('sx-sl-track').style.width = '10%'; $('sx-track-val').textContent = '0';
  $('sx-copies').textContent = '0';
  sim.home();
  sim.cap('Pick a Comic SFX preset');
  sim.later(.6, function(){ sim.moveTo(pick, .8); });
  sim.later(1.5, function(){ sim.click(); pick.classList.add('on'); });
  sim.later(2.0, function(){ decal.setAttribute('opacity', 1); burst.style.opacity = 1;
    var art = sim.rel(sim.stage.querySelector('.sx-panelart'));
    sim.move(art.cx, art.cy, .8); });
  sim.later(4.0, function(){ sim.cap('Skew, rotate, track the letterforms');
    sim.moveTo($('sx-sl-skew'), .7); });
  sim.later(4.9, function(){ sim.click();
    $('sx-sl-skew').style.width = '58%'; $('sx-skew-val').textContent = '−14°';
    setDecal(-14, -5, 0); });
  sim.later(6.4, function(){ sim.moveTo($('sx-sl-track'), .5); });
  sim.later(7.0, function(){ sim.click();
    $('sx-sl-track').style.width = '46%'; $('sx-track-val').textContent = '+3';
    setDecal(-14, -5, 3); });
  sim.later(8.4, function(){ sim.cap('Stroke & shadow — real millimetres');
    sim.moveTo($('sx-sl-stroke'), .6); });
  sim.later(9.2, function(){ sim.click();
    $('sx-sl-stroke').style.width = '66%'; $('sx-stroke-val').textContent = '2.6 mm';
    main.style.strokeWidth = '11px'; main.style.filter = 'drop-shadow(7px 8px 0 #1f2937)'; });
  sim.later(12.0, function(){ sim.cap('Trailing copies sell the motion');
    sim.moveTo($('sx-copies'), .7); });
  sim.later(12.9, function(){ sim.click(); $('sx-copies').textContent = '1'; });
  sim.later(13.4, function(){ sim.click(); $('sx-copies').textContent = '2'; });
  sim.later(13.9, function(){ sim.click(); $('sx-copies').textContent = '3'; decal.classList.add('copies'); });
  sim.later(16.4, function(){ sim.cap('BANG! KAPOW! SLAM — eight presets, all yours');
    presets.classList.add('pulse'); });
}};

/* — brush — */
SCRIPTS.brush = {TOTAL: 32, run: function(sim){
  var $ = sim.$;
  var cv = $('br-canvas'), cv2 = $('br-canvas2');
  var stylus = $('br-stylus'), ring = $('br-ring');
  var pen = stylus.querySelector('svg');
  var key = $('br-key');
  var ctx = null, ctx2 = null, DPR = Math.min(2, window.devicePixelRatio||1);
  function sizeCanvases(){
    var w = cv.offsetWidth, h = cv.offsetHeight; if(w < 4) return;
    [[cv,'#f4f2ee'],[cv2,null]].forEach(function(pair){
      pair[0].width = w*DPR; pair[0].height = h*DPR;
      var c = pair[0].getContext('2d'); c.setTransform(DPR,0,0,DPR,0,0);
      if(pair[1]){ c.fillStyle = pair[1]; c.fillRect(0,0,w,h); } else { c.clearRect(0,0,w,h); } });
    ctx = cv.getContext('2d'); ctx2 = cv2.getContext('2d');
  }
  function updateThumb(canvas, thumbId){
    var th = $(thumbId); if(!th) return;
    var c = th.getContext('2d'); if(!c) return;
    c.clearRect(0,0,th.width,th.height);
    c.drawImage(canvas, 0, 0, th.width, th.height);
  }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function hueMix(t){ return 'rgba('+Math.round(lerp(34,212,t))+','+Math.round(lerp(184,54,t))+','+Math.round(lerp(212,168,t))+','; }
  function stroke(o){
    var t0 = performance.now(), prev = null, target = o.layer === 2 ? ctx2 : ctx;
    sim.raf(function(){
      var t = Math.min(1,(performance.now()-t0)/(o.dur*1000));
      var u = 1-t, x = u*u*o.p0[0] + 2*u*t*o.p1[0] + t*t*o.p2[0],
                  y = u*u*o.p0[1] + 2*u*t*o.p1[1] + t*t*o.p2[1];
      var press = o.pressure(t);
      var cvr = sim.rel(cv);
      stylus.style.transition = 'none';
      stylus.style.left = (cvr.x + x - 8)+'px'; stylus.style.top = (cvr.y + y - 30)+'px';
      ring.style.transform = 'scale('+(0.3 + press*.9)+')';
      if(target && prev){
        var dist = Math.hypot(x-prev.x, y-prev.y), steps = Math.max(1, Math.round(dist/2));
        for(var i2 = 1; i2 <= steps; i2++){
          var xx = lerp(prev.x, x, i2/steps), yy = lerp(prev.y, y, i2/steps);
          var r = o.base*press + .4, a = o.alpha*press + .02;
          target.fillStyle = (o.mix ? hueMix(t) : o.color) + a + ')';
          target.beginPath();
          if(o.tilt){ target.ellipse(xx, yy, r*2.6, r*.85, o.tiltAngle, 0, 6.2832); }
          else { target.arc(xx, yy, r, 0, 6.2832); }
          target.fill(); } }
      prev = {x:x, y:y};
      if(t >= 1){ ring.style.transform = 'scale(.3)';
        updateThumb(o.layer === 2 ? cv2 : cv, o.layer === 2 ? 'br-th-col' : 'br-th-line');
        return false; }
      return true; });
  }
  function pressSin(t){ return .18 + .82*Math.sin(t*Math.PI); }
  function pressWave(t){ return .3 + .55*Math.abs(Math.sin(t*Math.PI*2.2)); }
  function addColourLayer(){
    var colourRow = document.createElement('div');
    colourRow.className = 'lay-row on'; colourRow.id = 'br-lrow-col';
    colourRow.innerHTML = '<u>👁</u><canvas width="46" height="34" id="br-th-col"></canvas><span>Colour</span><em id="br-mode-col">Normal</em>';
    var rows = $('br-lrows');
    rows.insertBefore(colourRow, rows.firstChild);
    $('br-lrow-line').classList.remove('on');
  }
  /* reset */
  sizeCanvases();
  pen.style.transform = 'rotate(24deg)';
  key.classList.remove('on');
  var fgw0 = $('br-fg'), bgw0 = $('br-bg');
  if(fgw0) fgw0.style.background = '#ffffff';
  if(bgw0) bgw0.style.background = '#0b0c10';
  stylus.style.opacity = 1;
  $('br-sl-rate').style.width = '0%'; $('br-rate-val').textContent = '0%';
  $('br-sl-op').style.width = '100%'; $('br-op-val').textContent = '100%';
  var old = $('br-lrow-col'); if(old) old.remove();
  $('br-mode').textContent = 'Normal';
  $('br-lrow-line').classList.add('on');
  cv2.style.mixBlendMode = 'normal'; cv2.style.opacity = '1'; cv2.style.visibility = 'visible';
  updateThumb(cv, 'br-th-line');
  sim.home();
  var W = cv.offsetWidth, H = cv.offsetHeight;
  sim.cap('Pressure drives size & flow');
  sim.later(.9, function(){ stroke({p0:[W*.12,H*.72], p1:[W*.38,H*.05], p2:[W*.62,H*.62],
    dur:2.4, base:11, alpha:.5, color:'rgba(36,41,48,', pressure:pressSin}); });
  sim.later(3.6, function(){ stroke({p0:[W*.3,H*.85], p1:[W*.55,H*.35], p2:[W*.86,H*.7],
    dur:2.2, base:11, alpha:.5, color:'rgba(36,41,48,', pressure:pressWave}); });
  sim.later(6.2, function(){ sim.cap('Tilt shades like the side of the lead');
    pen.style.transform = 'rotate(52deg)'; });
  sim.later(7.0, function(){ stroke({p0:[W*.14,H*.3], p1:[W*.44,H*.14], p2:[W*.78,H*.3],
    dur:2.2, base:10, alpha:.16, color:'rgba(70,78,90,', pressure:function(t){ return .5+.4*Math.sin(t*Math.PI); },
    tilt:true, tiltAngle:.35}); });
  sim.later(9.7, function(){ sim.cap('A real layer stack — add one for colour');
    pen.style.transform = 'rotate(24deg)';
    var add = $('br-add'), r = sim.rel(add);
    stylus.style.transition = 'left .8s cubic-bezier(.22,.61,.2,1), top .8s cubic-bezier(.22,.61,.2,1)';
    stylus.style.left = (r.cx-8)+'px'; stylus.style.top = (r.cy-30)+'px'; });
  sim.later(10.8, function(){ addColourLayer(); });
  sim.later(11.6, function(){ sim.cap('Colour Rate mixes FG → BG mid-stroke');
    var fgw = $('br-fg'), bgw = $('br-bg');
    if(fgw) fgw.style.background = '#22b8d4';
    if(bgw) bgw.style.background = '#d436a8';
    $('br-sl-rate').style.width = '65%'; $('br-rate-val').textContent = '65%'; });
  sim.later(12.4, function(){ stroke({p0:[W*.12,H*.52], p1:[W*.5,H*.92], p2:[W*.88,H*.44],
    dur:3.0, base:9, alpha:.6, mix:true, pressure:pressSin, layer:2}); });
  sim.later(16.0, function(){ sim.cap('Per-layer blend mode + opacity');
    var mode = $('br-mode-col'); if(mode) mode.textContent = 'Multiply';
    $('br-mode').textContent = 'Multiply';
    cv2.style.mixBlendMode = 'multiply'; });
  sim.later(17.6, function(){
    $('br-sl-op').style.width = '70%'; $('br-op-val').textContent = '70%';
    cv2.style.opacity = '.7'; });
  sim.later(19.2, function(){ sim.cap('Non-destructive — toggle the layer off…');
    var row = $('br-lrow-col'); if(row) row.classList.add('hidden');
    cv2.style.visibility = 'hidden'; });
  sim.later(21.0, function(){ sim.cap('…and back on');
    var row = $('br-lrow-col'); if(row) row.classList.remove('hidden');
    cv2.style.visibility = 'visible'; });
  sim.later(22.6, function(){ sim.cap('Hold Shift — dead-straight, still pressure-live');
    key.classList.add('on');
    var cvr = sim.rel(cv);
    key.style.left = (cvr.x + cvr.w*.5)+'px'; key.style.top = (cvr.y + cvr.h*.12)+'px'; });
  sim.later(23.4, function(){ stroke({p0:[W*.15,H*.18], p1:[W*.5,H*.18], p2:[W*.85,H*.18],
    dur:1.8, base:7, alpha:.55, color:'rgba(34,68,120,', pressure:function(t){ return .25+.65*Math.sin(t*Math.PI); }, layer:2}); });
  sim.later(25.9, function(){ key.classList.remove('on'); });
  sim.later(26.5, function(){ sim.cap('GPU brush engine — WebGL2, dirty-rect fast');
    $('br-gpu').style.textShadow = '0 0 12px rgba(92,230,161,.9)'; });
  sim.later(29.4, function(){ sim.cap('Masks, groups, clipping — S Pen & Wacom native'); });
}};

/* — video — */
SCRIPTS.video = {TOTAL: 30, run: function(sim){
  var $ = sim.$;
  var v1 = $('vd-v1'), v2 = $('vd-v2'), a1 = $('vd-a1');
  var ghost = $('vd-ghost'), ph = $('vd-playhead');
  var p1 = $('vd-p1'), p2 = $('vd-p2'), tc = $('vd-tc');
  var sm = $('vd-sm'), smEmpty = $('vd-smempty'), smInfo = $('vd-minfo'),
      addV = $('vd-addv'), it1 = $('vd-it1'),
      hintV = $('vd-hint-v'), hintA = $('vd-hint-a'), clipN = $('vd-clipn');
  function setCount(id, n){ $(id).textContent = n+(n === 1 ? ' clip' : ' clips'); }
  function setClipN(n){ clipN.textContent = n === 0 ? 'No clips yet' : n+(n === 1 ? ' clip' : ' clips'); }
  function mkClip(lane, name, range, left, width, img){
    var d = document.createElement('div');
    d.className = 'vd-clip';
    d.style.left = left+'%'; d.style.width = width+'%';
    if(img) d.style.backgroundImage = 'url('+img+')';
    d.innerHTML = '<span class="cnm">🎞 '+name+'</span><span class="crange">'+range+'</span><span class="ctag">OPACITY</span>'+
      '<i class="kf" style="left:12%"></i><i class="kf" style="left:88%"></i>';
    lane.appendChild(d); return d;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function addOpacityKey(clip, xPct, yPct){
    var d = document.createElement('i');
    d.className = 'vd-okf';
    d.style.left = xPct+'%'; d.style.top = yPct+'%';
    clip.appendChild(d); return d;
  }
  function addOpacityLine(clip){
    var svg = document.createElementNS(SVGNS,'svg');
    svg.setAttribute('class','vd-oline'); svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('preserveAspectRatio','none');
    var pl = document.createElementNS(SVGNS,'polyline');
    pl.setAttribute('points','0,14 100,14');
    svg.appendChild(pl); clip.appendChild(svg);
    return pl;
  }
  function mkAudio(lane){
    var d = document.createElement('div');
    d.className = 'vd-aclip'; d.style.left = '0%'; d.style.width = '92%';
    var bars = '';
    for(var i2 = 0; i2 < 60; i2++){ var h = 22+Math.round(20*Math.abs(Math.sin(i2*.7)+Math.sin(i2*.23)));
      bars += '<rect x="'+(i2*10+2)+'" y="'+(50-h/2)+'" width="5" height="'+h+'" fill="rgba(92,230,161,.65)"/>'; }
    d.innerHTML = '<svg viewBox="0 0 600 100" preserveAspectRatio="none">'+bars+'</svg>';
    lane.appendChild(d); return d;
  }
  function dragFromLib(item, lane, atPct, img, t, onland){
    sim.later(t, function(){ sim.moveTo(item, .7); });
    sim.later(t+.8, function(){ sim.click();
      var lr = sim.rel(lane);
      var gx = lr.x + lr.w*atPct/100 + 24, gy = lr.cy;
      sim.ghostDrag(item, gx, gy, img, .9); });
    sim.later(t+1.9, function(){ ghost.style.opacity = 0; onland(); });
  }
  /* reset */
  [v1, v2, a1].forEach(function(lane){ lane.querySelectorAll('.vd-clip,.vd-aclip').forEach(function(c){ c.remove(); }); });
  $('vd-gap1').classList.remove('on');
  ghost.style.transition = 'none'; ghost.style.opacity = 0;
  ph.style.transition = 'none';
  var lr0 = sim.rel(v1), tlr = sim.rel(sim.stage.querySelector('.vd-tlbody'));
  ph.style.left = (lr0.w > 4 ? (lr0.x - tlr.x) : 62)+'px';
  p1.style.opacity = 0; p2.style.opacity = 0; p2.style.transform = 'none';
  sm.style.opacity = 0;
  smEmpty.style.opacity = 1; smInfo.style.opacity = 0;
  it1.classList.remove('sel');
  hintV.style.opacity = .65; hintA.style.opacity = .65;
  setCount('vd-n-v1', 0); setCount('vd-n-v2', 0); setCount('vd-n-a1', 0); setClipN(0);
  tc.textContent = '0:00';
  $('vd-kf-o').textContent = '100%'; $('vd-kf-s').textContent = '100%';
  sim.home();
  var c1 = null, c2 = null, ac = null;
  sim.cap('Select a source — it opens in the Source Monitor');
  sim.later(.5, function(){ sim.moveTo(it1, .7); });
  sim.later(1.3, function(){ sim.click();
    it1.classList.add('sel');
    smEmpty.style.opacity = 0; sm.style.opacity = 1; smInfo.style.opacity = 1; });
  sim.later(2.4, function(){ sim.cap('One tap on the V1 track chip drops it on the timeline');
    sim.moveTo(addV, .8); });
  sim.later(3.3, function(){ sim.click();
    c1 = mkClip(v1, 'walk-wide.mp4', '0.0s → 4.1s', 2, 32, ASSETS+'poster-walk.jpg');
    requestAnimationFrame(function(){ c1.classList.add('on'); });
    hintV.style.opacity = 0; setCount('vd-n-v1', 1); setClipN(1);
    p1.style.opacity = 1; });
  sim.later(4.4, function(){ sim.cap('Or drag straight from the bin'); $('vd-gap1').classList.add('on'); });
  dragFromLib($('vd-it2'), v2, 34, ASSETS+'poster-turn.jpg', 4.5, function(){
    c2 = mkClip(v2, 'turn-cu.mp4', '4.1s → 9.1s', 34, 42, ASSETS+'poster-turn.jpg');
    requestAnimationFrame(function(){ c2.classList.add('on'); });
    setCount('vd-n-v2', 1); setClipN(2); });
  var opl = null, ok1 = null;
  sim.later(7.7, function(){ sim.cap('Crossfade the overlap — two opacity keys');
    if(c2) c2.classList.add('sel');
    sim.moveTo($('vd-addkey'), .8); });
  sim.later(8.7, function(){ sim.click();
    if(!c2) return;
    opl = addOpacityLine(c2);
    ok1 = addOpacityKey(c2, 0, 14); });
  sim.later(9.3, function(){ sim.click(); if(c2) addOpacityKey(c2, 23.8, 14); });
  sim.later(9.9, function(){ sim.cap('Drag the first key to 0% — the line IS the fade');
    if(c2){ var r = sim.rel(c2); sim.move(r.x + 4, r.y + r.h*.14, .6); } });
  sim.later(10.6, function(){ sim.click();
    if(!c2 || !opl) return;
    var r = sim.rel(c2);
    sim.move(r.x + 4, r.y + r.h*.86, .9);
    var t0 = performance.now();
    var dragT = sim.every(40, function(){
      var t = Math.min(1,(performance.now()-t0)/900);
      var y = 14 + (86-14)*t;
      if(ok1) ok1.style.top = y+'%';
      opl.setAttribute('points','0,'+y+' 23.8,14 100,14');
      $('vd-kf-o').textContent = Math.round(100-100*t)+' → 100%';
      if(t >= 1){ clearInterval(dragT); } }); });
  sim.later(12.3, function(){ sim.cap('Score it on the audio lane'); });
  dragFromLib($('vd-it3'), a1, 4, null, 12.7, function(){
    ac = mkAudio(a1);
    requestAnimationFrame(function(){ ac.classList.add('on'); });
    hintA.style.opacity = 0; setCount('vd-n-a1', 1); setClipN(3); });
  sim.later(15.4, function(){ sim.cap('◇ Scale keyframes animate the push-in');
    sim.moveTo($('vd-addkey'), .7); });
  sim.later(16.3, function(){ sim.click(); if(c2) c2.querySelectorAll('.kf')[0].classList.add('on'); });
  sim.later(16.9, function(){ sim.click(); if(c2) c2.querySelectorAll('.kf')[1].classList.add('on');
    $('vd-kf-s').textContent = '100 → 126%'; });
  sim.later(18.0, function(){ sim.cap('Scrub, or J-K-L shuttle — the Program plays the cut');
    sim.moveTo(ph, .6); });
  sim.later(18.8, function(){
    var lanes = sim.rel(v1);
    var tl0 = sim.rel(sim.stage.querySelector('.vd-tlbody'));
    var t0 = performance.now(), DUR = 9000;
    ph.style.transition = 'none';
    var phT = sim.every(50, function(){
      var t = Math.min(1,(performance.now()-t0)/DUR);
      ph.style.left = (lanes.x - tl0.x + lanes.w*t)+'px';
      var pct = t*100;
      tc.textContent = '0:' + String(Math.floor(t*12)).padStart(2,'0');
      if(pct < 2){ p1.style.opacity = 0; p2.style.opacity = 0; }
      else if(pct < 34){ p1.style.opacity = 1; p2.style.opacity = 0; }
      else if(pct < 44){ var f = (pct-34)/10; p1.style.opacity = 1-f; p2.style.opacity = f; }
      else if(pct <= 76){ p1.style.opacity = 0; p2.style.opacity = 1; }
      else { p1.style.opacity = 0; p2.style.opacity = 0; }
      if(pct >= 34 && pct <= 76){ var k = (pct-34)/42;
        var kk = Math.min(1, Math.max(0,(k-.1)/.8));
        p2.style.transform = 'scale('+(1+.26*kk)+')';
        $('vd-kf-s').textContent = Math.round(100+26*kk)+' → 126%'; }
      if(t >= 1 && phT){ clearInterval(phT); phT = null; } }); });
  sim.later(28.1, function(){ sim.cap('Export — FFmpeg native, or in the browser'); });
}};

/* ─────────────────────── the element ─────────────────────── */
class SlSim extends HTMLElement {
  static get observedAttributes(){ return ['kind','restart']; }
  constructor(){ super(); this.attachShadow({mode:'open'}); this._sim = null; this._kind = null; }
  connectedCallback(){ this._build(); }
  disconnectedCallback(){ if(this._sim) this._sim.clear(); this._sim = null; this._kind = null; }
  attributeChangedCallback(name){
    if(!this.isConnected) return;
    if(name === 'kind' && this.getAttribute('kind') !== this._kind) this._build();
    else if(name === 'restart' && this._sim) this._cycle();
  }
  _build(){
    var kind = this.getAttribute('kind') || 'flow';
    if(!TPL[kind]) kind = 'flow';
    this._kind = kind;
    if(this._sim) this._sim.clear();
    this.shadowRoot.innerHTML = '<style>'+CSS+'</style>'+TPL[kind];
    this._sim = makeEngine(this);
    var self = this;
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ self._cycle(); }); });
  }
  _cycle(){
    var self = this, sim = this._sim, kind = this._kind;
    if(!sim || !self.isConnected) return;
    var script = SCRIPTS[kind];
    sim.clear();
    sim.loopStart(script.TOTAL);
    script.run(sim);
    sim.later(script.TOTAL, function(){ self._cycle(); });
  }
}
if(!customElements.get('sl-sim')) customElements.define('sl-sim', SlSim);
})();
