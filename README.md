# Signal Loom

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-es00bac-FFDD00?logo=buymeacoffee&logoColor=000)](https://buymeacoffee.com/es00bac)

Signal Loom is a local-first AI media suite with four applications sharing one project model and one source library:

- **Flow**: build generation and orchestration graphs.
- **Video**: edit timeline sequencing, compositing, keyframes, and rendering.
- **Image**: perform layer-based image editing and model-driven visual retouching.
- **Paper**: do page-based publishing and print-ready layout for comics, books, and long-form documents.

The suite runs from the same `.sloom` project and automatically synchronizes media between apps so Flow outputs can be consumed in Image, Paper, or Video without re-importing assets.

The app runs in a normal browser through Vite, ships as an Electron desktop app with native file dialogs and a KDE Plasma global menu, and ships as an Android/DeX app (Capacitor) with file-manager intents, volume-key modifiers, an on-device LAN app server, and an on-device upscaler.

> **Complete, code-audited feature inventory** (every node, tool, capability, provider, and Desktop/Android availability): [`docs/FEATURE_BREAKDOWN.md`](docs/FEATURE_BREAKDOWN.md).

## Screenshots

<figure>
  <img src="docs/assets/signal-loom-current.png" alt="Signal Loom current application snapshot" />
  <figcaption><strong>Current version.</strong> Current application screenshot from a recent desktop run.</figcaption>
</figure>

<figure>
  <img src="docs/assets/signal-loom-flow.png" alt="Signal Loom flow workspace showing connected generation nodes, the persistent source bin, provider telemetry, and a composition node." />
  <figcaption><strong>Flow workspace.</strong> Build reusable generation graphs with prompt, image, video, source-bin, and composition nodes while tracking run cost and keeping generated assets in the project library.</figcaption>
</figure>

<figure>
  <img src="docs/assets/signal-loom-editor.png" alt="Signal Loom video workspace showing the source/program monitors, timeline, and clip controls." />
  <figcaption><strong>Video workspace.</strong> Assemble source-bin media on a multi-track timeline, tune source/program monitors, and keyframe clip transform and opacity from the inspector.</figcaption>
</figure>

## Features

- **Flow:** node graph (React Flow) of **60 node types** in 10 categories — Generate (image/video/audio/composition), Inputs & Data, Lists & Envelopes, Flow Control, Logic & Math (JS/Python/SQL/regex/JSON/HTTP/CSV/XML-YAML/math), Text & Story tools, Reuse & Layout (functions/groups/portals/aliases), Monitor, and Settings; per-node cost + execution telemetry.
- **Image:** **26 tools** with selection modes + Quick Mask + Select & Mask; layers with **16 blend modes**, **9 layer effects**, **8 adjustment layers**, **7 filters**; full pressure/tilt/symmetry brush engine; gradients and vector shapes; artboards + CMYK soft-proof; **model-in-the-loop AI** (text-to-image, edit, mask-inpaint, outpaint, erase, search-replace/recolor, remove-background, relight, upscale); PNG/PSD/`.slimg` export.
- **Paper:** **16 tools**, 8 frame kinds; page presets (Letter→Webtoon), columns, document + baseline grids, spreads; threaded text with runaround, OpenType, hyphenation, drop caps, styles, find/change, hyperlinks, tables; comic bubbles (with same-speaker bridge), captions, panels, gutter knife, Comic SFX Designer; CMYK/spot swatches and **PDF/X-4 / X-1a** print production; export to PDF, KDP, reader-spreads, booklet, webcomic, HTML, IDML, CBZ, stories (TXT/HTML/RTF/DOCX), JSON.
- **Video:** multitrack timeline (visual + 4 audio tracks), transitions, 8 clip filters, stage objects with blend modes; keyframe animation of transform/opacity/crop/volume; **10 render presets** (H.264/HEVC/ProRes/VP9/GIF/PNG-JPEG sequences) over AMD-VAAPI → native-CPU → browser-FFmpeg backends.
- Browser, Electron, and Android project workflows that save/reopen `.sloom` (plus `.slimg`/`.slppr`).
- Shared Source Library + per-project scratch so generated/imported assets are reused across all four apps.
- Optional local native FFmpeg render helper (desktop); optional remote preview gateway / Android LAN app server.
- API keys encrypted at rest (OS keychain on desktop, WebCrypto on web/Android).

## Providers

Signal Loom uses your own provider accounts and model access. Provider keys are not included in this repository.

Currently wired provider paths include:

- Text: Google Gemini, OpenAI-compatible chat, Hugging Face chat completion.
- Image: Google Gemini, OpenAI, Atlas Cloud, Hugging Face, Black Forest Labs, Stability AI, Local/Open models, and the Android Accelerator (on-device).
- Video: Google Veo (via Gemini long-running jobs and Atlas), Hugging Face text-to-video.
- Audio: Google Gemini, ElevenLabs, Hugging Face — speech, sound-effect, and voice-change modes.
- Desktop also bridges Google Vertex AI (Imagen/Gemini/Veo) via `gcloud` login or ADC/service account.

In browser mode, provider keys are entered in the app settings and stored in local browser storage. In Electron mode, the renderer uses the same settings flow with native project/file integration.

## Requirements

- Node.js 20 or newer.
- npm.
- Optional: Electron-capable desktop session for the native app.
- Optional: FFmpeg for local/native rendering paths.

## Development

Install dependencies:

```bash
npm install
```

Run the browser app:

```bash
npm run dev
```

Run the Electron app:

```bash
npm run electron
```

Run the Electron app against the Vite dev server:

```bash
npm run electron:dev
```

Build, test, and lint:

```bash
npm run build
npm run test
npm run lint
```

## Desktop Integration

The desktop launcher files live in `packaging/` and `scripts/`. The public launcher assumes `signal-loom-electron` is installed somewhere on your `PATH`.

The systemd units under `ops/` are examples for local native rendering and optional remote access. Copy the matching `.env.example` file, replace all placeholder values locally, and do not commit the real environment file.

## Security Notes

- Never commit real provider API keys, tunnel tokens, SSH keys, project scratch directories, rendered output, or `.sloom` project files that contain private media references.
- `.env`, `.env.*`, scratch folders, generated output, Playwright state, and local notes are ignored by default.
- Remote access helpers are optional and must be configured with your own secrets outside the repository.

## Documentation

- Complete code-audited feature inventory: `docs/FEATURE_BREAKDOWN.md`
- Full user guide and feature help: `docs/PROJECT_DOCUMENTATION.md`
- Current task list: `docs/TASK_LIST.md`
- Handoff and architecture notes: `docs/HANDOFF.md`

## License

Signal Loom is **source-available** under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). See `LICENSE`.

In plain terms: you're welcome to read the code, build it, and use it for any **noncommercial** purpose — personal projects, study, hobby tinkering, research, education, and nonprofit use. What the license does **not** grant is the right to sell it, redistribute it commercially, or publish it on an app store. Official, supported builds — and the only place to buy the app — come from the developer through [sloom.studio](https://sloom.studio) and the official Samsung Galaxy Store and Google Play listings.

**"Signal Loom" is a trademark of Sloom Software.** The license covers copyright only; it grants no right to use the name, logo, or branding.

Earlier releases were published under the GNU Affero General Public License v3.0; those specific releases remain available under AGPL-3.0. Everything from the relicensing commit onward is under PolyForm Noncommercial.
