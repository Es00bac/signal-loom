# Blog post — ready to publish. Posting steps at the bottom.

**Suggested tags (dev.to):** `ai`, `webdev`, `performance`, `indiedev`

---

# Aggressive Laziness: I Didn't Write a Line of My App — I Talked It Into Existence

Full disclosure before anything else: I did not write a single line of code in my app. Not the
TypeScript, not the website's HTML, not one CSS rule. I don't actually know TypeScript — I've
read the code, I know other languages, but I never sat down and learned it.

I have a button on my mouse that activates voice dictation. I press it and I talk to an AI
coding agent. That's the workflow. That's the whole workflow. You know the scene in Star Trek
IV where Scotty picks up the mouse and says "Hello, computer"? I literally do that, except
it's "hey Claude, do the thing," and unlike Scotty I can't go back to a century where rent
doesn't exist.

What came out of it is [Signal Loom](https://sloom.studio) — a local-first generative-media
studio: a node graph for wiring AI models together (bring your own keys), a layered raster
editor with real brushes and stylus support, a comic/print page editor, and a video timeline.
One app, one shared project file, four workspaces. It's free for personal use, it sells a
one-time commercial license, and it shipped 0.9.10 this week. A team of humans would have
taken years. It took me months of talking.

So when someone in a thread asked me, quote, "how are you keeping this thing from eating a GPU
whole?" — I want to be honest about what happened next: I asked the agent, because the agent
wrote it. What follows is its answer, which I'm publishing because it's a better engineering
writeup than most humans would give you, and because this is what "solo dev" actually looks
like at my house.

## What my agent says about not eating your GPU

**Only one thing is alive at a time.** The four workspaces aren't four engines — they're four
views over one project model. Switch from the image editor to the video timeline and the image
editor's render surfaces unmount: canvases, previews, everything. Its *state* stays (cheap);
its *pixels on screen* don't (expensive).

**Pixels live in exactly one place.** Early versions embedded generated assets into the
project file as base64, and when we profiled why project files were enormous, embedded assets
were 97–98% of the bytes. Everything is file-backed references now. A clip generated in the
node graph isn't copied into the timeline — the timeline points at it. Decoded video frames
are never cached by the app at all; clips are metadata and previews decode on demand through
the platform's media stack.

**The raster editor fights dirty, with techniques old enough to rent a car.** Mid-brushstroke,
only the rectangle your dab touched gets recomposited — the active layer and everything above
it over a cached backdrop of everything below. Slider scrubbing composites a downscaled proxy,
not the full-res document. Full-quality composites happen off-thread in a worker that returns
one `ImageBitmap`, and the previous one is explicitly `.close()`d before the new one lands —
ImageBitmaps do not garbage-collect politely; skip that and you're curating a museum of your
own frames. And at high zoom, blits are clamped to the visible region of the document, because
asking a GPU compositor for a scaled destination far bigger than the screen is how artwork
"disappears" into the checkerboard.

WebGL2 is used narrowly — layer effects like shadows and strokes, with a CPU fallback — not as
a resident scene graph.

## The bug that shipped three times (and how a non-programmer debugged it)

Here's my favorite war story, because it shows what this workflow is actually like.

For three releases, people syncing a drawing between devices would sometimes see a blank
canvas. The pixels arrived perfectly. The screen lied. I tested it on my real phone, told the
agent "zero change in behavior" in increasingly colorful language, and eventually did the most
productive thing I've ever done as an engineering manager: I handed it my phone. Literally —
the agent drove my Android over adb and a desktop browser with Playwright, drew strokes with
synthetic stylus input on one device, took the editing baton on the other, and *looked at
screenshots of both screens* until it caught the bug in the act.

The root cause was beautiful: the compositor worker was built the "clever" way — stringify ~30
functions with `.toString()`, concatenate into a Blob, boot a Worker from the Blob URL. Worked
perfectly in development. In production, the minifier renames identifiers *per module*, so the
stringified functions called helper names from scopes that didn't come along for the ride —
`ReferenceError: _r is not defined`, in production only, unreproducible in dev, three releases
running. And the renderer had cached "I already composited this document state" *before* the
worker ran, so when the worker died, the canvas served a stale — often blank — composite
forever.

The fixes: a real bundled module worker (imports resolve under any minifier), the cache only
trusts itself when a result bitmap actually exists, a crashing worker gets three strikes before
the renderer stays on the synchronous path — and a test that fails the build if
`Function.prototype.toString` ever gets near a Worker again, because the agent apparently
doesn't trust its past self either. Fair.

## What I actually do all day

I'm not going to pretend "vibe coding" means the machine does everything. My job, it turns
out, is everything the code can't be: deciding what the app *is*, saying no, testing on real
hardware, refusing to accept "fixed" until I can see it with my eyes, choosing what ships,
and paying for all of it. The agent's job is the TypeScript. When it claims something works
and it doesn't, I say so, loudly, and it instruments both devices and finds out why. That
loop — me with taste and a phone, it with the codebase in its head — built in months what I
could not have built alone in any number of years.

If you ask me something deep about the compositor in the comments, I'll be honest: the answer
will come from the agent, checked against the actual source. That's not a gotcha. That's the
workflow, working in public. The commit history is signed by both of us — you can go look.

The app is free for personal use if you want to see whether any of this holds up on your
machine: [sloom.studio](https://sloom.studio). The rent line wasn't a joke, and between the
two of us, every comment gets answered.

---
---

## How to publish this (exact steps)

**dev.to (do this one — built-in audience, takes 5 minutes):**
1. Go to https://dev.to and log in (top-right **Log in** — you can use your GitHub account:
   click **Continue with GitHub**, then **Authorize**).
2. Click **Create Post** (top-right button).
3. In the **Title** field paste: `Aggressive Laziness: I Didn't Write a Line of My App — I Talked It Into Existence`
4. Click **Add up to 4 tags** and type, one at a time, pressing Enter after each:
   `ai` `webdev` `performance` `indiedev`
5. Copy everything between the FIRST `---` line and the DOUBLE `---` lines near the bottom
   (the post body, starting at "Full disclosure…" and ending at "…every comment gets
   answered.") and paste it into the big body field.
6. Click **Publish** (bottom-left). You should land on the live post.
7. Copy the live URL — drop it in any thread where someone asks how the app is built or
   whether it eats GPUs.

**Optional second home, itch devlog:** same title, same body, posted as a new devlog
(steps are in launch-kit-0.9.10.md, item #1).

## One more thing — a follow-up comment for your LIVE r/SideProject post

Your r/SideProject post is already up and says "ask me anything about how it's built." Add
this as a new comment on your own post (go to your post → comment box at the top → paste →
**Comment**). It converts the authorship question into content before anyone else raises it:

---
Full disclosure, since I promised to answer anything: I didn't hand-write the code. I'm one
person directing an AI coding agent — I literally use voice dictation, I talk and it builds,
and I test everything on real hardware and refuse to accept "fixed" until I can see it. The
commit history is co-signed by the agent, it's a public repo, go look. Happy to answer
questions about that workflow too — honestly it's the part people ask most about.
---
