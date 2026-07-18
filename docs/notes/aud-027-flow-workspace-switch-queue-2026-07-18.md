# AUD-027 Flow workspace switch queue correction

## Scope

- Exact base: `b7ff892beea5f0d67751c27a423a0a3b94bfc8e9`
- Production and permanent regression commit: `e8f814c0`
- Finding: selecting C while B's imported assets were still restoring left the selector on C and
  canvas on B because App's in-flight guard dropped the C request and never drained it.
- This lane does not self-approve or integrate the correction.

## Red proof

The permanent A/B/C queue tests were written before production code. Their first focused run failed
against the exact base because the centralized switch queue did not exist; App still used the
single boolean `flowWorkspaceSwitchInFlightRef`, whose `finally` only cleared the boolean. The
audited B-in-flight/C-selected path therefore had no completion-side drain.

The independent asset-ownership regression uses the old code's other unsafe boundary directly: it
starts delayed imported-asset hydration for A, replaces the canvas with B using the same node id,
then resolves A's bytes. Without the generation/workspace guard added in `flowStore.ts`, A's
`sourceAssetId`, name, and data URL patch the reused B node.

## Correction

`flowWorkspaceSwitchQueue.ts` now owns one serialized canvas-plus-assets transition:

- selection remains immediately responsive in `activeWorkspaceId`;
- only one canvas asset restore runs at a time;
- completion or failure drains directly to the newest surviving active workspace;
- intermediate targets are coalesced rather than restored;
- exact B canvas state, including restored asset URLs, is captured back into B before C replaces it;
- targeted cross-window commands wait for the requested workspace's complete transition and are
  canceled if it is closed, superseded, timed out, or the coordinator is disposed;
- restore failures are handled and reported without an unhandled rejection; and
- disposal cancels waiters and prevents the old coordinator from publishing a queued target.

`flowWorkspaceStore.ts` keeps a deleted hydrated workspace id as a short-lived tombstone owner until
the queue consumes the fallback. Project export does not mislabel that deleted canvas as the active
fallback, and deleting the last tab creates a distinct blank replacement that must be consumed.

`flowStore.ts` binds asynchronous imported-asset restoration to both the canvas workspace id and
graph generation. Project replacement or another canvas replacement therefore invalidates stale
asset patches even when node ids are reused.

## Permanent regression coverage

- delayed A → B → C with exact B/C asset ownership;
- newest-wins A → B → C → A coalescing;
- B restore failure followed by successful C drain;
- C close and B reselection while B is restoring;
- closing the in-flight B owner while C is pending;
- coordinator disposal and replacement-coordinator recovery;
- deleting the only workspace without relabeling its old canvas;
- delayed A asset bytes against a reused B node id; and
- a source guard proving App routes UI selection and targeted commands through the queue.

## Verification

- Focused AUD-027 suites: **4 files, 12 tests passed**.
- Project/asset adjacency: `projectDocumentActions.composedDirtyClose`,
  `projectDocumentActions`, `projectMediaReferences`, and `flowStore.bookmarks` — **4 files,
  165 tests passed**.
- Flow UI/window/replacement adjacency: `FlowWorkspaceSwitcher`, `FlowWorkspaceShell`,
  `flowWorkspaceWindowRouting`, `workspaceWindowCommands`, and
  `projectDocumentActions.replacementOrdering` — **5 files, 28 tests passed**.
- Forced App TypeScript: passed.
- Forced Node TypeScript: passed.
- ESLint over all eight changed production/test files: passed.
- `git diff --check`: passed.
- `npm run build`: passed (TypeScript project build and Vite production build).

## Baseline failure outside this change

The broader seven-suite run produced **102 passes and one failure** in the pre-existing
`flowRunOwnership.test.ts` case “removes a Source item when ownership goes stale during Source
persistence.” Running that exact test alone on untouched base `b7ff892b` fails identically: the
Source item count is one instead of zero. No AUD-027 code overlaps that Source-persistence path, and
this lane did not alter or suppress the baseline failure.

## Residuals for independent gate

- Disposal does not abort an IndexedDB read already underway; it prevents queued publication, and
  the graph-generation/workspace guard prevents the completed read from crossing into a replacement
  canvas.
- A targeted cross-window command whose hydration does not settle within the existing 2.5-second
  bound is dropped rather than being applied to the wrong canvas.
