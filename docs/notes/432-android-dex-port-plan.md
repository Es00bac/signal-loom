# Android & Samsung Dex Porting Plan

## Overview
This document outlines the plan to port the Signal Loom / Generative AI Flow Builder application to Android, specifically optimizing for a Samsung Dex environment paired with a 1080p Wacom display via a Galaxy S26 Ultra. Since the application is already a React + Vite web application bundled for Electron, porting it to a native Android app via **Capacitor** is the most robust and maintainable path.

## Current Status (Implemented)
- Added `@capacitor/core`, `@capacitor/android`, and `@capacitor/filesystem`.
- Initialized Android platform using `npx cap init` and `npx cap add android`.
- Replaced Electron native filesystem calls with `@capacitor/filesystem` equivalents in `src/lib/fileSystemWorkspace.ts`.
- Disabled pull-to-refresh and other native touch actions via `touch-action: none;` in `src/index.css`.
- App is successfully building and launching on the Samsung Dex emulator.

## Syncing desktop to Android
- Created a `scripts/update-from-desktop.sh` bash script in the `flowdroid` repository. 
- You can execute this script whenever you update `flow` on your desktop in order to push those changes down to the Dex emulator.
