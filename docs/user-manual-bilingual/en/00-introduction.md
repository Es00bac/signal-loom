# Introduction to Sloom Studio

Sloom Studio is a generative AI media workflow application. It combines a node-based automation canvas, a non-linear video editor, a layered image editor, and a desktop-publishing workspace into one environment. The goal is to let creators build repeatable pipelines that generate, edit, and publish images, video, audio, and print-ready documents without switching between many single-purpose tools.

This manual describes Sloom Studio from the user perspective: what each workspace does, how the interface is organized, where settings live, and how to complete common tasks. The application is built with React, Vite, and TypeScript, and runs as an Electron desktop app, in the browser, and as an Android build. Most features are the same across platforms, although native integrations such as file system access, Android acceleration, and LAN serving behave differently depending on where Sloom Studio is running.

## What Sloom Studio Is

At its core, Sloom Studio is a flow builder. You place nodes on a canvas, connect them, and run them. Nodes can generate images from text prompts, combine prompts, process lists, call external APIs, run small JavaScript or Python snippets, and route data to other workspaces. Once an asset is created, it lives in the Source Library, from which the Video, Image Editor, and Paper workspaces can pick it up for further editing.

The four workspaces are:

- **Flow** — The node canvas. Build generative pipelines, automate repetitive tasks, batch-process lists, and orchestrate calls to AI providers.
- **Video** — A non-linear editor with tracks, compositions, keyframes, effects, captions, and export presets.
- **Image** — A layered raster and vector image editor with selections, masks, adjustments, generative fill, brush engine, and PSD import.
- **Paper** — A desktop publishing workspace for multi-page documents, comics, and print layout, with vertical Japanese typography, spot colors, and PDF/X export.

You can switch between workspaces from the top navbar at any time. Projects can contain assets and sequences from all four workspaces, and assets created in one workspace can usually be sent to another.

## The Four Workspaces

### Flow Workspace

The Flow workspace is where automation happens. A flow is a directed graph of nodes. Each node performs one operation: generate an image, evaluate a math expression, compare two values, loop over a list, and so on. When you press the run button, Sloom Studio evaluates the graph from inputs to outputs, running only the nodes that are needed to produce the requested result.

Flow is useful for:

- Batch generating dozens or hundreds of images with varied prompts.
- Building reusable prompt templates that combine positive and negative prompts, LoRA specifications, and seed sequences.
- Gluing together external services through HTTP APIs, SQL queries, CSV files, or XML/YAML interop.
- Creating functions and groups that can be reused inside the same project or exported.

The Flow workspace has its own bottom toolbar for adding nodes, a context menu for common editing actions, and diagnostics panels that report errors, cycle detection, and layout suggestions.

### Video Workspace

The Video workspace is a track-based non-linear editor. You assemble compositions by dragging sources from the Source Bin onto tracks in the timeline. The Source Monitor lets you preview clips and mark in/out points before inserting them. The Program Monitor shows the current frame of the edited sequence and supports interactive transform controls for clips, text, shapes, and comic tails.

Video is useful for:

- Editing short-form social video, review cuts, and archival masters.
- Adding captions, narration, and generated audio.
- Applying clip effects such as chroma key, crop, stroke, and blend modes.
- Exporting to H.264, HEVC, ProRes, WebM VP9, GIF, or image sequences.

The Video workspace supports JKL shuttle transport, ripple and roll edits, keyframe animation, and FCP7 XML export for moving projects to other editors.

### Image Editor Workspace

The Image Editor workspace is a layered image editor similar to traditional bitmap editors, but with generative AI tools built in. You can paint, retouch, composite, and run generative operations such as inpaint, outpaint, background removal, and upscale. Selections, masks, adjustment layers, and blend modes behave like conventional image editors, while the Generative Fill bar connects to AI providers for content-aware editing.

Image Editor is useful for:

- Photo retouching and compositing.
- Creating assets for Flow, Video, and Paper workspaces.
- Generative edits guided by selections and masks.
- Working with PSD files and exporting masks, layers, or flattened images.

### Paper Workspace

The Paper workspace is for documents that need precise layout: comics, books, magazines, zines, and print-ready PDFs. It supports multi-page spreads, parent pages, margins and columns, baseline grids, and advanced Japanese typography including vertical writing, ruby, emphasis dots, and tate-chu-yoko. It also has comic-specific tools such as panel frames, speech bubbles, thought bubbles, SFX decals, and gutter knives.

Paper is useful for:

- Comics and manga production.
- Multi-page print documents with spot colors and PDF/X compliance.
- Mixed text and image layouts with text threading and wrap.
- Exporting to PDF/X-4, PDF/X-1a, KDP packages, IDML, CBZ, and webcomic image sets.

## First-Run Language Gate

The first time Sloom Studio launches, it shows a language gate. The gate lets you choose the interface language and locale before the main UI appears. This choice affects menus, dialogs, date and number formatting, and default typography settings. You can change the language later in **Settings > Interface > Language / Locale**, but the first-run gate is the fastest way to start in the right language.

If you are working with Japanese documents, comics, or vertical text, selecting Japanese at the language gate will also set Paper defaults such as binding direction and appropriate font presets.

## Community vs Commercial Licensing

Sloom Studio has two licensing modes:

- **Community** — Free to use. Community builds can create, edit, and export most content. Some export formats and high-volume features may show reminders or watermarks. Community licenses are verified offline using Ed25519 signatures and do not require an internet connection after initial setup.
- **Commercial** — Requires a purchased license key. Commercial builds unlock gated export formats, remove reminders, and enable commercial usage rights for generated output. License status is shown in **Settings > License**.

When a feature is gated by license, the UI shows a clear indicator. Export dialogs will warn you before producing output that requires a Commercial license. If you intend to sell or distribute the output of your projects, use a Commercial license.

## Basic Navigation

### Top Navbar

The top navbar runs across the top of the window. On the left it shows the Sloom Studio wordmark and workspace tabs: **Flow**, **Video**, **Image**, and **Paper**. In the center are tool slots that change depending on the active workspace. On the right are project-level buttons, the Usage Bar, zoom and fullscreen controls, and the app menu.

### Workspace Tabs

Click a workspace tab to switch contexts. Your project state is preserved across switches: a video timeline stays open when you switch to Flow to generate a new image, and the image appears in the Source Bin when you return.

### App Menu

The app menu can appear in two styles:

- **Compact** — A single menu button in the top navbar that opens a dropdown with all commands.
- **Menubar** — A traditional menu bar with File, Edit, View, Window, and Help menus. On macOS this integrates with the system menu bar.

You can switch between compact and menubar styles in **Settings > Interface > App Menu Style**.

### Bottom Toolbar

In the Flow workspace, the bottom toolbar provides quick access to node insertion, layout commands, and run controls. Other workspaces replace or hide the bottom toolbar depending on context.

### Command Palette

Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS) to open the Command Palette. The palette lists every available command and can be searched by name or keyword. It is the fastest way to reach settings, run diagnostics, switch workspaces, or trigger actions without memorizing shortcuts.

## Project Files

Sloom Studio uses several file types to organize work:

| Extension | Purpose |
|-----------|---------|
| `.sloom` | The main project file. Contains workspace state, flow graphs, video timelines, paper pages, settings overrides, and references to source assets. |
| `.slimg` | A packaged image asset. Stores raster or vector image data, layers, masks, and metadata in a format Sloom Studio can reopen for editing. |
| `.slppr` | A packaged Paper document. Stores page layout, typography, linked images, and print settings. |
| `.sloom-script` | A portable Flow script. Can be imported into a project or shared between users. |

Project files do not usually embed large media. Instead they reference assets in the Source Library and scratch folder. When you move a project to another machine, use **File > Package Project** or **Export Assets** to gather all referenced files into a portable bundle.

### Creating a New Project

Choose **File > New Project** or press `Ctrl+N` / `Cmd+N`. A new project starts with a single Flow workspace and an empty Source Bin. You can add a starter sequence, starter image, or starter paper document from the workspace menus.

### Opening and Saving

Use **File > Open** (`Ctrl+O` / `Cmd+O`) to open an existing `.sloom` project. Use **File > Save** (`Ctrl+S` / `Cmd+S`) to save. Sloom Studio autosaves workspace state to a recovery file at regular intervals; the recovery file is used to restore your session if the app closes unexpectedly.

### Importing and Exporting

- **Import Media** — Adds files to the Source Bin without changing the current workspace.
- **Export Project** — Writes the `.sloom` file and optional asset bundle.
- **Export Assets** — Exports selected Source Bin items to a folder in common formats.

### Scratch Folder

The scratch folder is where generated and imported assets are cached. Set it with **File > Set Scratch Folder**. If the scratch folder is on a fast drive, large video and image workflows will be smoother. The scratch folder can be local, on an external drive, or on a network location, depending on the platform.

## Where to Go Next

- For the main interface, see `01-app-interface.md`.
- For settings and licensing, see `02-settings.md`.
- For detailed workspace guides, see `03-flow-workspace.md`, `04-video-workspace.md`, `05-image-editor-workspace.md`, and `06-paper-workspace.md`.
- For the Source Library, see `07-source-library.md`.
- For the Flow node catalog, see `08-node-reference.md`.
- For keyboard shortcuts and gamepad support, see `09-shortcuts.md`.
- For an assessment of the Japanese translation, see `10-translation-assessment.md`.
