# Image stylus azimuth fidelity

Date: 2026-07-18  
Internal build: `0.9.12g`

## Reported behavior

On the Wacom display, rotating the physical stylus from left to up (a 90-degree azimuth change) rotated an orientation-sensitive brush footprint by only about 45 degrees. Continuing from up to right produced only the remaining half of the expected sweep. The live brush outline and painted brush behavior shared the error.

## Cause

`applyBrushTiltDynamics` multiplied brush-angle steering by `tiltAmount`. That value represents inclination: zero for an upright stylus and one for a stylus laid flat. At an ordinary roughly 45-degree holding altitude, the factor is approximately `0.5`, so it incorrectly compressed every physical azimuth change by half.

Azimuth and altitude describe different parts of the pen's 3D pose:

- Azimuth determines the direction around the tablet surface and therefore the oriented tip's rotation.
- Altitude determines how far the stylus is laid over and therefore the footprint's flattening and side-contact size.

## Correction

Brush-angle steering now depends on the preset's authored `tiltAngle` response only. It is no longer multiplied by altitude-derived `tiltAmount`. Altitude continues to control footprint squash, growth, opacity, flow, and other intentionally inclination-sensitive dynamics.

Both the live outline in `ImageEditorCanvas` and the dab engine in `ImageBrushEngine` consume this shared geometry function, so preview and paint use the same corrected mapping.

## Permanent verification

`brushTiltGeometry.test.ts` now proves:

- The same azimuth produces the same rotation at 45-degree and 10-degree stylus altitudes.
- At a constant 45-degree altitude, left resolves to 180 degrees, up to 270 degrees, and right to 0 degrees.
- Left-to-up and up-to-right are each full 90-degree rotations.

Verification completed:

- Focused geometry, engine, preset, and media-calibration tests: 58/58 passed.
- Targeted ESLint passed.
- TypeScript and Vite production build passed.
- Electron packaging and bundled-font verification passed.
- Installed archive and freshly packaged archive have identical SHA-256 `b7ff06b6d01e555115e930d9c3e6dcbfad53a19d879a567b2acea8f1fb5c8d0a`.
- Installed `app.asar` reports package version `0.9.12-g`.
