# Warm-up community drafts — 0.9.10, open-authorship voice

These are the posts for the communities that need warm-up first (see
`community-targets.md` postures). Day-1 posts (itch devlog, r/SideProject, r/androidapps)
live in `launch-kit-0.9.10.md` — **r/SideProject is already posted, don't repost it.**

Voice rule for everything below (owner decision 2026-07-04): **we own the AI-orchestration
story openly.** You made the app by directing an AI coding agent by voice; you don't
hand-write the code; deep technical answers come from the agent and we say so. Never claim
hand-authorship, never promise expertise you'd have to fake. The commit history is co-signed
and public — the story is verifiable, which is what makes it safe.

Rules of engagement: warm up first (real comments for a few days), post ONE sub at a time,
reply to every comment (bring me the technical ones), never paste identical text into two subs.

---

## r/StableDiffusion  (🟡 post a RESULT, not a pitch — after a few days of real comments)

**Attach:** `marketing/assets/case-file-2033-flip.gif` (or a fresh piece you make that week)

**Title:** Went from generations → inked, lettered comic page without leaving one app — a studio I had an AI agent build for me

**Body:**
> I wanted my FLUX/SD generations to flow straight into editing and page layout without
> round-tripping five tools, so I had one built: a node graph for generation, a layered editor
> with generative fill, and a comic/print layout workspace, all sharing one library. BYOK —
> your own provider keys, local-first, nothing leaves your machine.
>
> Full honesty because it's the interesting part: I didn't write the code. I'm one person
> directing an AI coding agent by voice — I test everything on real hardware and steer, it
> writes the TypeScript. Months instead of years. The repo's public and the commits are
> co-signed if you want to see what that actually looks like.
>
> Here's a page made with it end to end (attached). It's free for personal use
> (sloom.studio); technical questions welcome — between me and the agent, you'll get a real
> answer about the mask/reference handling or provider routing, and I'll say which of us it
> came from.

---

## r/comicmaking / r/webcomics  (🟡 the comic IS the content — lead with the page)

**Attach:** a real page (`marketing/assets/case-file-2033-page-001.jpg` or newer work)

**Title:** Made this page start-to-finish in one app — sketch, AI ink/colour pass, panels and bubbles

**Body:**
> Sharing a page from my project. Workflow: rough sketch in the layered editor, generative-fill
> ink + colour pass (my own model keys), then panel grid and speech bubbles in the page-layout
> workspace — one app, one file. Happy to break down any step.
>
> The tool is mine in an unusual sense: I designed and direct it, but an AI agent writes the
> actual code from my voice notes. Free for personal use if anyone wants to try the workflow
> (sloom.studio) — and if the AI-assisted part isn't for you, every AI feature is optional and
> it works as a plain editor + layout tool.

---

## Hacker News — Show HN  (one shot; weekday 8–10am ET; expect the authorship question IMMEDIATELY — it's the hook)

**Title:** Show HN: I voice-directed an AI agent to build a local-first media studio (I wrote none of the code)

**Body:**
> Signal Loom is a generative-media studio: a node graph for wiring AI models (BYOK — your
> keys, paid to providers directly), a layered raster editor, a comic/print layout workspace,
> and a video timeline, over one local project file. No accounts, no servers of mine, free for
> personal use, one-time $17.99 commercial license. Windows/Linux on the site, Android in
> closed testing.
>
> The part HN will care about: I don't know TypeScript and I didn't write a line of this. I
> have a mouse button bound to voice dictation and I talk to a coding agent — "Hello,
> computer," except it's real and it argues back. My contribution is product direction,
> testing on real hardware, and refusing to accept "fixed" until I can see it. The commit
> history is co-signed by the agent (github.com/Es00bac/signal-loom) if you want to audit
> what months of that loop produces — including the bug it shipped three times because the
> compositor worker only crashed under minification.
>
> Ask me anything about the workflow; ask the hard compositor questions too and I'll relay
> the agent's answers, labeled as such. https://sloom.studio

**HN survival notes:** answer fast, concede real limitations immediately (they respect it),
never argue about whether AI-built software "counts" — say "the download link settles it
either way" and move on. If someone finds a real bug, thank them and bring it to me live.

---

## r/AIArt / r/generative  (🟡 showcase a piece; tool mention in comments when asked)

Post artwork only. When someone asks what made it, reply:

> A studio I had an AI agent build to my spec — node-graph generation into a layered editor
> into page layout, one app, own keys. Free for personal use: sloom.studio. (And yes, the
> app itself is AI-written — I direct, it codes. The repo's public.)
