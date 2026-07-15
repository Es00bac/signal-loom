# Handoff Document: Signal Loom

## Overview
Signal Loom is a React-based AI media studio built around `@xyflow/react` for graph composition plus a dedicated post-production editor workspace. It integrates with multiple AI providers (`@google/generative-ai`, `openai`, `@huggingface/inference`) to build chained, multi-modal workflows across text, image, audio, and video.

## Current State
Check `docs/TASK_LIST.md` for current progress and remaining tasks.
Check `docs/notes/` for a chronological log of changes, technical decisions, and architecture details.

## Latest Flow audit

The main Flow workspace has an executable contract for all 63 node types, exact typed connection enforcement/presentation, an independent contract-versus-runtime evidence registry for every input handle and dynamic variant, model-aware text/image/video/audio controls, generated 182-model API documentation, terminal-free Vertex ADC import/detection, saved-flow migration fixtures, and `npm run verify:flow-production`. Start with `docs/notes/903-flow-contract-runtime-parity-audit.md`, then use the generated matrices in `docs/audits/flow-node-audit-2026-07-15.md` and `docs/audits/provider-model-audit-2026-07-14.md`.

## How to Continue
1. Read the `docs/TASK_LIST.md` to see what is checked off.
2. Read the latest file in `docs/notes/` to understand the most recent context.
3. Review `package.json` and the source files in `src/` to understand the code structure.
4. Execute `npm run dev` to start the local Vite server and preview the app.

## Agent Instructions
- **Claude:** Read `CLAUDE.md` for specific formatting and behavioral instructions.
- **Other Agents:** Read `AGENTS.md` for general system instructions.
