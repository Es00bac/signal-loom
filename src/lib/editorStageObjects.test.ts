import { describe, expect, it } from 'vitest';
import {
  createEditorStageObject,
  getEditorStageObjects,
  normalizeStageObjectBlendMode,
} from './editorStageObjects';
import type { NodeData } from '../types/flow';

describe('getEditorStageObjects', () => {
  it('normalizes text and rectangle stage objects from saved composition data', () => {
    const objects = getEditorStageObjects({
      editorStageObjects: [
        {
          id: 'text-1',
          kind: 'text',
          x: 120,
          y: 80,
          width: 420,
          height: 120,
          rotationDeg: 15,
          opacityPercent: 65,
          blendMode: 'screen',
          text: 'Title',
          fontFamily: 'Georgia',
          fontSizePx: 72,
          color: '#f8fafc',
        },
        {
          id: 'shape-1',
          kind: 'rectangle',
          x: 40,
          y: 50,
          width: 300,
          height: 180,
          rotationDeg: -8,
          opacityPercent: 50,
          fillColor: '#0ea5e9',
          borderColor: '#ffffff',
          borderWidth: 6,
          cornerRadius: 24,
        },
      ],
    } as Partial<NodeData> as NodeData);

    expect(objects).toMatchObject([
      {
        id: 'text-1',
        kind: 'text',
        x: 120,
        blendMode: 'screen',
        text: 'Title',
      },
      {
        id: 'shape-1',
        kind: 'rectangle',
        borderWidth: 6,
        cornerRadius: 24,
      },
    ]);
  });
});

describe('createEditorStageObject', () => {
  it('creates centered text and rectangle objects using the current canvas size', () => {
    const textObject = createEditorStageObject('text', { width: 1280, height: 720 });
    const rectangleObject = createEditorStageObject('rectangle', { width: 1280, height: 720 });

    expect(textObject).toMatchObject({
      kind: 'text',
      x: 384,
      y: 300,
      width: 512,
      height: 120,
      text: 'Text',
    });
    expect(rectangleObject).toMatchObject({
      kind: 'rectangle',
      x: 448,
      y: 260,
      width: 384,
      height: 200,
      cornerRadius: 18,
    });
  });
});

describe('normalizeStageObjectBlendMode', () => {
  it('keeps supported stage object blend modes and falls back to normal', () => {
    expect(normalizeStageObjectBlendMode('color-dodge')).toBe('color-dodge');
    expect(normalizeStageObjectBlendMode('unknown')).toBe('normal');
  });
});
