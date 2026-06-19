import type { PaperFramePatch } from '../types/paper';

// One-click speech/thought-bubble looks — applied as a frame patch (shape, stroke, fill, and a few
// typography defaults) so users get a polished balloon without hand-tuning every value.
export interface PaperBubblePreset {
  id: string;
  name: string;
  description: string;
  patch: PaperFramePatch;
}

export const PAPER_BUBBLE_PRESETS: PaperBubblePreset[] = [
  {
    id: 'speech',
    name: 'Speech',
    description: 'Clean rounded dialogue balloon',
    patch: {
      bubbleShape: 'organic', strokeStyle: 'solid', strokeWidthMm: 0.35, strokeColor: '#111827',
      fillColor: '#ffffff', cornerRadiusMm: 0, typography: { fontWeight: '400', fontStyle: 'normal', align: 'center' },
    },
  },
  {
    id: 'whisper',
    name: 'Whisper',
    description: 'Soft dashed quiet aside',
    patch: {
      bubbleShape: 'organic', strokeStyle: 'dashed', strokeWidthMm: 0.25, strokeColor: '#6b7280',
      fillColor: '#ffffff', typography: { fontWeight: '400', fontStyle: 'italic', align: 'center' },
    },
  },
  {
    id: 'shout',
    name: 'Shout',
    description: 'Heavy bold outline for emphasis',
    patch: {
      bubbleShape: 'organic', strokeStyle: 'solid', strokeWidthMm: 0.7, strokeColor: '#111827',
      fillColor: '#ffffff', typography: { fontWeight: '800', fontStyle: 'normal', align: 'center' },
    },
  },
  {
    id: 'electronic',
    name: 'Electronic',
    description: 'Squared techy readout',
    patch: {
      bubbleShape: 'squircle', strokeStyle: 'solid', strokeWidthMm: 0.3, strokeColor: '#0e7490',
      fillColor: '#ecfeff', typography: { fontFamily: 'monospace', fontWeight: '500', align: 'center' },
    },
  },
  {
    id: 'narration',
    name: 'Narration',
    description: 'Caption-style narration box',
    patch: {
      bubbleShape: 'squircle', strokeStyle: 'solid', strokeWidthMm: 0.3, strokeColor: '#92400e',
      fillColor: '#fef3c7', cornerRadiusMm: 1, typography: { fontWeight: '500', fontStyle: 'normal', align: 'left' },
    },
  },
  {
    id: 'thought',
    name: 'Thought',
    description: 'Cloud bubble with dotted tail',
    patch: {
      bubbleShape: 'cloud', strokeStyle: 'solid', strokeWidthMm: 0.3, strokeColor: '#111827',
      fillColor: '#ffffff', bubbleConnectorStyle: 'thought-dots', typography: { fontStyle: 'italic', align: 'center' },
    },
  },
];
