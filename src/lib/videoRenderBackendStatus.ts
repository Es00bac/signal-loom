import type { RenderBackendPreference } from '../types/flow';

export type VideoRenderBackendTone = 'gpu' | 'native' | 'browser';

export interface VideoRenderBackendSummary {
  tone: VideoRenderBackendTone;
  label: string;
  detail: string;
}

export function summarizeVideoRenderBackend(preference: RenderBackendPreference): VideoRenderBackendSummary {
  if (preference === 'native-amd-vaapi') {
    return {
      tone: 'gpu',
      label: 'AMD VAAPI',
      detail: 'Forced AMD VAAPI GPU encode through the local native render service.',
    };
  }

  if (preference === 'native-cpu') {
    return {
      tone: 'native',
      label: 'Native CPU',
      detail: 'Native FFmpeg CPU rendering through the local render service. GPU acceleration is not used.',
    };
  }

  if (preference === 'browser') {
    return {
      tone: 'browser',
      label: 'Browser FFmpeg',
      detail: 'Browser FFmpeg compatibility rendering. GPU acceleration is not used.',
    };
  }

  return {
    tone: 'gpu',
    label: 'Auto GPU-first',
    detail: 'Auto prefers AMD VAAPI GPU, then native CPU, then browser FFmpeg.',
  };
}
