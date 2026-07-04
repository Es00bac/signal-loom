import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/Recovery/ErrorBoundary.tsx'
import { AndroidLanServerBanner } from './components/AndroidLanServerBanner.tsx'
import { RemoteHostBanner } from './components/RemoteHostBanner.tsx'
import { installResizeObserverLoopErrorFilter } from './lib/resizeObserverLoopErrorFilter.ts'
import { initializeRemoteHostSession } from './lib/remoteHostClient.ts'
import { initializeEditLockSync } from './lib/editLockSync.ts'
import { initializeBatonHandoffSnapshots } from './lib/batonHandoffSnapshot.ts'

installResizeObserverLoopErrorFilter()

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary className="min-h-screen" level="root" title="Signal Loom">
        <App />
        <AndroidLanServerBanner />
        <RemoteHostBanner />
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Resolve "am I a desktop browser served from a phone?" before first render so the storage layers
// branch correctly from the start (no-ops instantly for desktop/native; one fast probe on the web).
// Register the cross-device edit baton once the probe has settled (so its served-session branch is
// accurate): unlike the per-workspace channels it gates every workspace, so it can't wait for one to
// mount. Idempotent + side-effect-light on a non-served desktop (memory: cross-device-sync-baton-model).
void initializeRemoteHostSession()
  .finally(() => {
    initializeEditLockSync()
    // Snapshot open Image documents into the shared library the moment this device loses the
    // baton, so the gaining device can continue the same work (layered .slimg handoff).
    initializeBatonHandoffSnapshots()
  })
  .finally(renderApp)
