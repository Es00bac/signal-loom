# Terra comic duration and browser export evidence

This note records the AUD-024 and AUD-025 repair on branch
`overlap/terra-comic-duration`, based at integration commit `4343d95`.

## Delivered

- `comic` now belongs to the editor's still-duration contract everywhere the affected paths
  resolve it: timeline extent, stage visibility, preview-duration calculation, trim/split, ripple
  trim, and the visual-clip Inspector. Speech, Thought, and Caption comics retain their authored
  four-second duration and can edit that duration through the real Inspector field.
- Browser/legacy FFmpeg and image-sequence command construction now loop the PNG rendered for a
  static comic for its resolved duration. The normal overlay remains `eof_action=pass`, but it now
  receives a four-second input rather than a one-frame input. A four-second 30-fps image sequence
  therefore requests 120 frames.

## Red tests recorded before the repair

```text
npx vitest run src/lib/manualEditorTimeline.test.ts src/lib/editorTimelineTrim.test.ts src/lib/mediaComposition.test.ts

7 failures / 42 passing:
- speech, thought, and caption duration resolution returned 0 instead of 4 seconds.
- comic split retained 4 seconds on each half instead of producing 2-second halves.
- comic trim retained 4 seconds instead of extending to 6 seconds.
- comic FFmpeg input was `-i sequence-comic-1.png`, not
  `-loop 1 -t 4.000 -i sequence-comic-1.png`; the browser and image-sequence command test failed
  on the same missing loop contract.
```

## Verification

```text
npx vitest run src/lib/manualEditorTimeline.test.ts src/lib/editorTimelineTrim.test.ts src/lib/manualEditorState.test.ts src/lib/mediaComposition.test.ts src/lib/mediaComposition.browser.test.ts src/lib/stageFrameExport.test.ts src/components/Editor/ManualEditorWorkspaceUtils.test.ts src/features/video/workspace/VideoWorkspace.test.tsx src/features/video/workspace/VideoWorkspaceInspector.test.tsx
# 9 files / 117 tests passed

npx tsc -b tsconfig.app.json --force
npx tsc -b tsconfig.node.json --force
npx eslint <all 10 changed source/test files>
# 0 errors; 11 existing VideoWorkspace warnings

git diff --check
npm run build
# tsc -b && vite build passed
```

## Capability boundary / residual risk

The native frame-server export remains the per-frame comic path: it samples comic tail/keyframes at
each frame. The browser/legacy FFmpeg and image-sequence fallback deliberately rasterize one static
comic card and now hold that card for the resolved still interval. Consequently, static comics no
longer collapse to one frame, but animated comic tails/keyframes are still frozen in those fallback
routes. This is the existing explicit limitation documented in `stageFrameExport.ts` and is not
claimed as native-frame-server parity here.
