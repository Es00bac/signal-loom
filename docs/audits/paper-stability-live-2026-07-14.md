# Paper Stability Live Smoke - 2026-07-14

## Scope

This is a credential-free record of the authorized Paper Stability Fast and Conservative smokes run through the live UI. It records both the initial fail-closed readiness check and the later successful paid calls without exposing the user-owned key.

## Environment And Preconditions

- Initial unconfigured-key window: 2026-07-14 20:52:23 to 21:01:02 America/Denver (2026-07-15T02:52:23Z to 03:01:02Z).
- Configured live-result window: 2026-07-14 23:26:14 to 23:31:32 America/Denver (2026-07-15T05:26:14Z to 05:31:32Z).
- App: Vite development server at `http://127.0.0.1:5175`.
- Local gates already passed: `npm run build` and `npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperProductionGolden.test.ts`.
- Follow-up evidence gates passed: 4 focused files / 62 tests across the audit, Stability adapter, image-upscale bridge, and preflight; focused ESLint; and `npm run build`.
- The user configured the key between those windows. The key field, local-storage record, request headers, and multipart request body were not read, copied, printed, or logged.

## Fixture And Placement

- File: `public/signal-loom-splash.png`.
- File SHA-256: `c1230f5f6b86faffa65c56796b21df4ca2c8946bbff403eb03882420453eeb9d`.
- MIME: `image/png`.
- Source pixels: `1254 x 1254` (1.57 MP).
- Paper target: `2550 x 2550` (6.50 MP), 2.03x, at 300 PPI.
- Asset path: disk file dropped into an image frame and registered in the `Page 1 imports` Source Library envelope. No Base64 or `data:` asset was introduced.

## Initial Fail-Closed Check

Before the key was configured, both Fast and Conservative displayed `Stability AI API key is not configured.` and disabled submission before any paid request. That verifies the BYOK readiness gate independently from the successful calls below.

## Live Results

| Mode | Provider result | Paper result |
| --- | --- | --- |
| Stability Conservative | `POST /v2beta/stable-image/upscale/conservative` returned HTTP 200 with `finish-reason: SUCCESS`; `image/png`, 3112 x 3112 RGB pixels, 9,375,800 bytes; SHA-256 `3f0edeb0557609245ef93ed46d3fdb50e5c720fbd68fe3e38b650d73b3eb13d4`. The UI used the non-empty preservation prompt and creativity `0.35`; estimated cost was $0.40. | The managed result replaced the frame. Preflight reported `signal-loom-splash.png is 366 effective PPI from Stability conservative` with zero warnings. |
| Stability Fast | `POST /v2beta/stable-image/upscale/fast` returned HTTP 200 with `finish-reason: SUCCESS`; `image/png`, 2552 x 2552 RGB pixels, 5,362,548 bytes; SHA-256 `1981875b0ca0d55997f03e9cfbde3a3170a564d1f4f0ab89640628841f876211`. Estimated cost was $0.02. | The managed result replaced the frame. The UI reported `Stability fast returned 2552 x 2552px`; preflight changed from the original low-resolution warning to info-only and recorded 300 effective PPI. |

The response binaries were captured only to measure their type, dimensions, byte length, and SHA-256. They remain ignored Playwright artifacts and were not added to the repository. The application stored the provider bytes through the content-addressed Paper asset repository; no Base64 or `data:` asset was introduced.

## Conclusion

Both authorized provider modes are live-verified. The user-owned BYOK gate prevents unconfigured paid calls, each configured request returned a valid binary image, Paper retained the provider dimensions without local detail inflation, replacement succeeded, and preflight reported the achieved placed PPI. Strict export still blocks any future result below the document print target.
