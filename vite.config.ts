import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { createLogger } from 'vite'
import { fileURLToPath, URL } from 'node:url'

const resizeObserverLoopLogSnippets = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]

export function isResizeObserverLoopLogMessage(message: unknown): boolean {
  const text = typeof message === 'string'
    ? message
    : message instanceof Error
      ? message.message
      : ''

  return resizeObserverLoopLogSnippets.some((snippet) => text.includes(snippet))
}

const logger = createLogger()
const loggerError = logger.error.bind(logger)
logger.error = (message, options) => {
  if (isResizeObserverLoopLogMessage(message)) {
    return
  }
  loggerError(message, options)
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  customLogger: logger,
  plugins: [react()],
  resolve: {
    alias: {
      util: fileURLToPath(new URL('./src/lib/nodeUtilBrowserShim.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  test: {
    exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.claude/**'],
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('@xyflow/react')) {
              return 'vendor-xyflow';
            }
            if (id.includes('@google/genai') || id.includes('@google/generative-ai')) {
              return 'vendor-google';
            }
            if (id.includes('openai')) {
              return 'vendor-openai';
            }
            if (id.includes('@huggingface')) {
              return 'vendor-huggingface';
            }
            if (id.includes('@ffmpeg')) {
              return 'vendor-ffmpeg';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('zustand')) {
              return 'vendor-react';
            }
          }
          return undefined;
        },
      },
    },
  },
})
