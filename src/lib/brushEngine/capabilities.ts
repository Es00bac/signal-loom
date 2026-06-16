import type { BrushBackend, BrushBackendId } from './backend';
import { createCpuBrushBackend } from './cpuBackend';

export type BrushBackendPreference = 'auto' | BrushBackendId;

export interface BrushBackendSelection {
  id: BrushBackendId;
  backend: BrushBackend;
  /** Set when a forced/auto preference downgraded to a lower tier (e.g. GPU unavailable). */
  downgradedFrom?: BrushBackendId;
}

/**
 * Resolves which backend to use for a stroke. P1 only ships the CPU backend; the WebGL2/WebGPU
 * factories are registered in P2/P3 and slot into this chain (WebGPU -> WebGL2 -> CPU). A forced
 * GPU preference that isn't available downgrades to CPU and records `downgradedFrom`.
 */
export function detectBrushBackend(preference: BrushBackendPreference): BrushBackendSelection {
  const cpu = createCpuBrushBackend();
  if (preference === 'webgpu' || preference === 'webgl2') {
    return { id: 'cpu', backend: cpu, downgradedFrom: preference };
  }
  return { id: 'cpu', backend: cpu };
}
