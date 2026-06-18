# 1. Overview & concepts

Signal Loom is one application with four **workspaces**. They are not separate programs that
happen to be bundled together — they share a single project file, a single asset library, and a
single set of provider connections. Understanding the handful of ideas below makes everything
else fall into place.

## The big idea: one project, four tools

Most AI media work today means hopping between a chat tool, an image tool, a video editor, and a
layout program — exporting and re-importing at every step. Signal Loom collapses that into one
place:

- **Flow** is where you *generate*. You build a graph of nodes — prompts, text, image, video,
  audio, and composition — wire them together, and run them. Every result is captured.
- **Image** is where you *paint and edit* stills, with layers, masks, and a real brush engine.
- **Video** is where you *sequence* clips on a timeline with overlays, keyframes, and audio.
- **Paper** is where you *lay out* pages for a comic, book, or document and export print-ready
  files.

A clip you generate in Flow appears in Image, Video, and Paper automatically. A panel you paint in
Image can be dropped onto a Paper page. Nothing is exported and re-imported between the four.

## Core concepts

### Projects (`.sloom`)
A **project** is one `.sloom` file that holds the state of all four workspaces plus the shared
asset library. Open a project and you're back exactly where you left off in Flow, Image, Video,
and Paper at once. See [Projects & files](03-projects-and-files.md).

Individual workspaces also have their own standalone document formats — `.slimg` for an Image
document and `.slppr` for a Paper layout — so you can hand a single image or layout to someone, or
pull one into a larger `.sloom` project.

### The source library
Every project has a **source library** (the Source Bin): a shared, named-bin collection of
assets. Anything you generate or import lands here and is available from every workspace. This is
what keeps the four tools in sync. See [The source library](09-source-library.md).

### Bring your own keys
Signal Loom does not generate anything by itself and has no servers. It calls the AI **providers**
you connect with your **own API keys** — Google Gemini and Vertex AI, OpenAI, Hugging Face,
Stability AI, Black Forest Labs (FLUX), Atlas Cloud, and ElevenLabs for audio. You talk to those
providers directly, so you control cost and data. See [Providers & API keys](04-providers-and-keys.md).

### Capabilities follow the model, not the menu
A model that supports reference images or masks exposes those abilities wherever it runs —
whether you reach it through a direct provider key or through a cloud gateway. Signal Loom reads
each model's real capabilities and shows you only the controls that model actually supports, so
the interface never promises something the model can't do.

### Local-first and private
Your keys and your work stay on your device. There is no Signal Loom account, no telemetry of your
content, and no cloud round-trip except the calls you make directly to your chosen providers.

## Where it runs

| Surface | Notes |
|---|---|
| **Desktop** | Linux, Windows, macOS. The full experience, with a native menu bar and floating/dockable panels. |
| **Android phone** | A focused, touch-first shell. Desktop-only features are hidden rather than crammed in. |
| **Android tablet / Samsung DeX / ChromeOS / Aluminium OS** | Treated as a touch-usable desktop — close to the full desktop experience, with pen and touch input. |

Pen input — pressure, tilt, and barrel rotation, including the Samsung S Pen and graphics tablets —
is supported across the Image brush engine. See [Keyboard & stylus](11-keyboard-and-stylus.md).

---

Next: [Getting started →](02-getting-started.md)
