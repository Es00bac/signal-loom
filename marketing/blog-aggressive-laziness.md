# Blog post — ready to publish. Posting steps at the bottom.

**Suggested tags (dev.to):** `webdev`, `performance`, `javascript`, `indiedev`

---

# Aggressive Laziness: Closing ImageBitmaps Like Your Rent Depends On It

I'm a solo dev building [Signal Loom](https://sloom.studio) — a local-first generative-media
studio that crams a node graph, a layered raster editor, a comic page editor, and a video
timeline into one app, sharing one project file. When people hear that, the polite ones ask
"how?" and the honest ones ask "how has that not eaten your GPU whole?"

Fair question. It runs on Chromium (Electron on desktop, a WebView on Android), which means I
get a world-class compositor and a world-class opportunity to hold memory wrong. Here's the
actual answer, including the bug that shipped three broken releases before I caught it.

## Rule 1: Only one thing is alive at a time

The four workspaces aren't four engines — they're four views over one project model. Switch
from the image editor to the video timeline and the image editor's render surfaces unmount:
canvases, previews, the works. Its *state* stays (cheap), its *pixels on screen* don't
(expensive). "Hot-swapping between editors" sounds unhinged until you realize it's just
"one renderer at a time over shared data."

## Rule 2: Pixels live in exactly one place

Early versions embedded generated assets into the project file as base64. When I profiled why
project files were enormous, embedded assets were **97–98% of the bytes**. Not the node graph.
Not the layer structure. Copies of pixels, re-encoded as text, inflating by a third.

Now everything is file-backed references. A clip you generate in the node graph isn't copied
into the timeline — the timeline points at it. The shared asset library hands out URLs, and
consumers resolve them live instead of caching their own copy. Decoded video frames are never
cached by my code at all: clips are metadata, and the preview decodes on demand through the
platform's media stack, which is better at this than I will ever be.

## Rule 3: The raster editor fights dirty

The layered editor is where the real memory fight happens, and it's won with techniques old
enough to rent a car:

- **Dirty-rect recompositing.** Mid-brushstroke, only the rectangle your dab touched gets
  recomposited — the active layer plus everything above it, drawn over a cached backdrop of
  everything below. The unchanged 95% of your document doesn't get looked at.
- **Proxy compositing.** Dragging an opacity slider recomposites a downscaled copy of the
  document, not the full-res one. Full quality returns the moment you let go.
- **One result bitmap, ever.** Full-quality composites happen off the main thread in a worker
  that returns a single `ImageBitmap`. The previous one is explicitly `.close()`d before the
  new one takes its place. ImageBitmaps do not garbage-collect politely — if you don't close
  them, you are building a museum of your own frames.
- **Clamped blits.** At high zoom, naively drawing a scaled full-document composite asks the
  GPU for a destination surface far bigger than the screen. Some compositors respond by
  silently dropping the draw — your artwork "disappears" and only the checkerboard survives.
  So the blit is clamped to the visible region of the document, always. The GPU only ever
  gets asked for pixels someone can see.

GPU acceleration (WebGL2) is used narrowly — layer effects like drop shadows and strokes,
with a CPU fallback — not as a resident scene graph. Textures are RGBA8, allocated when an
effect runs, not held forever "in case."

## The bug that only existed in production

Here's the embarrassing one, as a payment for reading this far.

My composite worker was built the "clever" way: take the compositing functions, call
`.toString()` on ~30 of them, concatenate into a Blob, and boot a Worker from the Blob URL.
Zero build configuration. Worked perfectly in dev.

In production it crashed every single time with `ReferenceError: _r is not defined`.

Because of course it did: the minifier renames identifiers *per module*. A stringified
function's body still calls its helpers by their minified names — names that exist in the
original module's scope and nowhere else. My Blob was a bag of functions from different
modules, each calling names from a scope that didn't come along for the ride. Dev builds
don't minify, so the bug was **unreproducible anywhere I looked** and shipped in three
releases.

The kicker: the worker crashing didn't throw anything user-visible. The renderer had cached
"I already produced a composite for this document state" *before* the worker ran, so when it
died, the canvas served a stale — sometimes empty — composite forever. Users saw synced
drawings render as blank canvases. The pixels were perfect in memory. The display was lying.

The fixes, in order of what I'd tell past-me:

1. **Never build workers from stringified functions.** Bundlers have supported real module
   workers (`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`) for
   years. Imports resolve correctly under any minifier because they're actual imports.
2. **Never mark work done before it's done.** The cache signature is now only trusted when a
   result bitmap actually exists; a worker failure un-poisons it and falls back to a
   synchronous composite. Blank-canvas-forever is no longer a reachable state.
3. **A failing worker gets three strikes**, then the renderer stays on the synchronous path
   instead of crash-looping a Worker boot loop in the background.

And because I clearly can't be trusted, there's now a test that greps the renderer source and
fails if `Function.prototype.toString` ever gets near a Worker again.

## The philosophy, if you can call it that

Most of this isn't clever. It's refusing to hold anything twice, refusing to render anything
nobody can see, and refusing to trust "it works on my machine" from a machine that doesn't
minify. Modern web APIs are genuinely great — OffscreenCanvas, ImageBitmap, module workers —
but they hand you the exact same footguns 90s graphics programmers had, wearing nicer names.

Aggressive laziness. The app is free for personal use if you want to see whether it holds up
on your machine: [sloom.studio](https://sloom.studio). I'm the only dev, the rent line wasn't
a joke, and I answer every comment.

---
---

## How to publish this (exact steps)

**dev.to (do this one — built-in audience, takes 5 minutes):**
1. Go to https://dev.to and log in (top-right **Log in** — you can use your GitHub account:
   click **Continue with GitHub**, then **Authorize**).
2. Click **Create Post** (top-right button).
3. In the **Title** field paste: `Aggressive Laziness: Closing ImageBitmaps Like Your Rent Depends On It`
4. Click **Add up to 4 tags** and type, one at a time, pressing Enter after each:
   `webdev` `performance` `javascript` `indiedev`
5. Copy everything in this file between the FIRST `---` line and the DOUBLE `---` lines near
   the bottom (i.e., the post body starting at "I'm a solo dev…" and ending at "…I answer
   every comment.") and paste it into the big body field.
6. Click **Publish** (bottom-left). You should land on the live post.
7. Copy the live URL — you can now link it from Reddit comments when anyone asks "how does
   it not eat the GPU?"

**Optional second home, itch devlog (same steps as the launch kit's devlog #1, new post):**
title it the same, paste the same body. itch followers get notified again.
