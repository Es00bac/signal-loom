# How we handle credentials (the secure way)

A chat window is **not** a vault. Anything pasted into the conversation is written to the session
transcript and processed by the model provider. So:

## Hard lines (never)
- ❌ **Never paste passwords, bank account numbers, or credit-card numbers into the chat.**
- ❌ The agent **never holds, stores, transmits, or operates** your bank account or credit cards.
- ❌ No account passwords handed to the agent — ever.

These aren't needed for anything on the roadmap.

## Safe mechanisms (by what a task actually needs)

1. **Account-bound web actions** (Reddit, X, Play Console, itch…) → the agent drives **your
   already-logged-in browser**, supervised, one approved action at a time. The session cookie does the
   auth — the agent never sees your password.
2. **CLI login** (gcloud, gh, rsync/ssh to the VPN…) → **you** run it in-session with the `!` prefix
   (e.g. `! gh auth login`). The credential never passes through the agent; the session inherits the
   authenticated state.
3. **Scoped API tokens** (only if a task truly needs one — e.g. a Buffer or provider token) → put it in
   a **gitignored** `.env` at the repo root or the OS keyring via `secret-tool`, **not** in chat. Use
   the **narrowest scope** and a **revocable** token. The agent reads it at runtime and never echoes it
   back. Rotate/revoke anytime.
   - keyring example: `secret-tool store --label='buffer' service buffer key token` → the agent reads
     `secret-tool lookup service buffer key token` at runtime.
   - `.env` example: one `KEY=value` per line; confirm `.env` is in `.gitignore`.
4. **Payments / receiving money** → handled by **PCI-compliant platforms** (Stripe, itch.io, Gumroad,
   Google Play) under **your** identity. You connect your bank to those platforms yourself; buyers pay
   the platform; the platform pays you. The agent never touches a card or bank number. For one-off
   spending you check out yourself, or use a **low-limit virtual/single-use card** in a supervised
   browser session (number never stored).

## The agent's commitment
- Always name the **minimum** credential a task needs and the **narrowest** scope.
- Prefer the browser-session / `!`-login path so no secret is ever handed over.
- Never write a secret into chat, memory, notes, or any committed file.
