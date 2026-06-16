import type { BrushBackend, BrushBackendId } from './backend';
import { createCpuBrushBackend } from './cpuBackend';
import { createWebgl2BrushBackend } from './webgl2Backend';

export type BrushBackendPreference = 'auto' | BrushBackendId;

export interface BrushBackendSelection {
  id: BrushBackendId;
  backend: BrushBackend;
  /** Set when a forced/auto preference downgraded to a lower tier (e.g. GPU unavailable). */
  downgradedFrom?: BrushBackendId;
}

/**
 * Resolves which backend to use for a stroke. Chain: WebGPU (P3, not yet built) -> WebGL2 -> CPU.
 * - `cpu`: always the CPU backend.
 * - `auto`: WebGL2 if available, else CPU.
 * - `webgl2`: WebGL2 if available, else CPU (downgraded).
 * - `webgpu`: WebGL2 if available (WebGPU backend not built yet — downgraded), else CPU (downgraded).
 */
export function detectBrushBackend(preference: BrushBackendPreference): BrushBackendSelection {
  const cpu = createCpuBrushBackend();
  if (preference === 'cpu') {
    return { id: 'cpu', backend: cpu };
  }

  const webgl2 = createWebgl2BrushBackend();
  if (webgl2) {
    return preference === 'webgpu'
      ? { id: 'webgl2', backend: webgl2, downgradedFrom: 'webgpu' }
      : { id: 'webgl2', backend: webgl2 };
  }

  if (preference === 'webgl2' || preference === 'webgpu') {
    return { id: 'cpu', backend: cpu, downgradedFrom: preference };
  }
  return { id: 'cpu', backend: cpu };
}
