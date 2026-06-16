export type {
  BrushBackend,
  BrushBackendId,
  BrushDab,
  BrushOp,
  BrushSampleSource,
  Rect,
  StrokeSession,
} from './backend';
export { createCpuBrushBackend } from './cpuBackend';
export { detectBrushBackend } from './capabilities';
export type { BrushBackendPreference, BrushBackendSelection } from './capabilities';
export { BrushStrokeController } from './strokeController';
export type { BrushStrokeOptions } from './strokeController';
