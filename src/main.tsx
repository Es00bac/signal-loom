import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/Recovery/ErrorBoundary.tsx'
import { AndroidLanServerBanner } from './components/AndroidLanServerBanner.tsx'
import { installResizeObserverLoopErrorFilter } from './lib/resizeObserverLoopErrorFilter.ts'

installResizeObserverLoopErrorFilter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary className="min-h-screen" level="root" title="Signal Loom">
      <App />
      <AndroidLanServerBanner />
    </ErrorBoundary>
  </StrictMode>,
)
