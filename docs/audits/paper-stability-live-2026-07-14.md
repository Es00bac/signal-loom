# Paper Stability Live Smoke - 2026-07-14

## Scope

This is a credential-free record of the authorized Paper Stability smoke attempted through the live UI. It does not assert provider certification or a successful paid call.

## Environment And Preconditions

- Time window: 2026-07-14 20:52:23 to 21:01:02 America/Denver (2026-07-15T02:52:23Z to 03:01:02Z).
- App: Vite development server at `http://127.0.0.1:5175`.
- Local gates already passed: `npm run build` and `npx vitest run src/lib/paperStabilityUpscale.test.ts src/lib/paperImageUpscale.test.ts src/lib/paperProductionGolden.test.ts`.
- Settings UI was opened. The Stability key field was not read, copied, printed, or inspected outside the visible readiness state.

## Fixture And Placement

- File: `public/signal-loom-splash.png`.
- File SHA-256: `c1230f5f6b86faffa65c56796b21df4ca2c8946bbff403eb03882420453eeb9d`.
- MIME: `image/png`.
- Source pixels: `1254 x 1254` (1.57 MP).
- Paper target: `2550 x 2550` (6.50 MP), 2.03x, at 300 PPI.
- Asset path: disk file dropped into an image frame and registered in the `Page 1 imports` Source Library envelope. No Base64 or `data:` asset was introduced.

## Fast

- Mode: Stability Fast.
- UI estimate: $0.02.
- Expected output category: provider-reported pixels.
- Result: `external-pending`.
- Visible blocking condition: `Stability AI API key is not configured.`
- Submission control: disabled before any paid request.
- Endpoint, HTTP status, output MIME/dimensions/hash, achieved placed PPI, and replacement asset reference: not applicable because no request was sent.

## Conservative

- Mode: Stability Conservative.
- UI estimate: $0.40.
- Prompt: the non-empty default preservation prompt supplied by Paper.
- Creativity: `0.35`.
- Expected output category: provider-reported pixels.
- Result: `external-pending`.
- Visible blocking condition: `Stability AI API key is not configured.`
- Submission control: disabled before any paid request.
- Endpoint, HTTP status, output MIME/dimensions/hash, achieved placed PPI, and replacement asset reference: not applicable because no request was sent.

## Conclusion

The user-owned BYOK gate prevents unconfigured paid Stability calls as intended. Unit and integration tests verify the request and PPI contracts locally. A follow-up live run requires the user to configure a valid Stability key and account credits; it must capture only credential-free provider result metadata and keep strict export blocked whenever achieved PPI is below the target.
