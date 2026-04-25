import type {
  EditorStageBlendMode,
  EditorStageObject,
  EditorStageObjectKind,
  NodeData,
} from '../types/flow';

export interface StageCanvasSize {
  width: number;
  height: number;
}

const STAGE_BLEND_MODES: EditorStageBlendMode[] = [
  'normal',
  'screen',
  'multiply',
  'overlay',
  'lighten',
  'darken',
  'color-dodge',
  'color-burn',
];

export function getEditorStageObjects(nodeData: Partial<NodeData>): EditorStageObject[] {
  const value = nodeData.editorStageObjects;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap<EditorStageObject>((object) => {
    if (!isRecord(object) || typeof object.id !== 'string') {
      return [];
    }

    const base = {
      id: object.id,
      x: normalizeNumber(object.x, 0),
      y: normalizeNumber(object.y, 0),
      width: Math.max(8, normalizeNumber(object.width, 320)),
      height: Math.max(8, normalizeNumber(object.height, 120)),
      rotationDeg: normalizeNumber(object.rotationDeg, 0),
      opacityPercent: normalizePercent(object.opacityPercent, 100),
      blendMode: normalizeStageObjectBlendMode(object.blendMode),
    };

    if (object.kind === 'text') {
      return [{
        ...base,
        kind: 'text',
        text: typeof object.text === 'string' ? object.text : 'Text',
        fontFamily: typeof object.fontFamily === 'string' ? object.fontFamily : 'Inter, system-ui, sans-serif',
        fontSizePx: Math.max(8, normalizeNumber(object.fontSizePx, 64)),
        color: normalizeColor(object.color, '#f8fafc'),
      } satisfies EditorStageObject];
    }

    if (object.kind === 'rectangle') {
      return [{
        ...base,
        kind: 'rectangle',
        fillColor: normalizeColor(object.fillColor, '#0ea5e9'),
        borderColor: normalizeColor(object.borderColor, '#f8fafc'),
        borderWidth: Math.max(0, normalizeNumber(object.borderWidth, 2)),
        cornerRadius: Math.max(0, normalizeNumber(object.cornerRadius, 18)),
      } satisfies EditorStageObject];
    }

    return [];
  });
}

export function createEditorStageObject(
  kind: EditorStageObjectKind,
  canvas: StageCanvasSize,
): EditorStageObject {
  if (kind === 'text') {
    const width = Math.round(canvas.width * 0.4);
    const height = Math.max(80, Math.round(canvas.height * 0.1667));

    return {
      id: createStageObjectId('text'),
      kind: 'text',
      x: Math.round((canvas.width - width) / 2),
      y: Math.round((canvas.height - height) / 2),
      width,
      height,
      rotationDeg: 0,
      opacityPercent: 100,
      blendMode: 'normal',
      text: 'Text',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSizePx: 72,
      color: '#f8fafc',
    };
  }

  const width = Math.round(canvas.width * 0.3);
  const height = Math.round(canvas.height * 0.2778);

  return {
    id: createStageObjectId('shape'),
    kind: 'rectangle',
    x: Math.round((canvas.width - width) / 2),
    y: Math.round((canvas.height - height) / 2),
    width,
    height,
    rotationDeg: 0,
    opacityPercent: 80,
    blendMode: 'normal',
    fillColor: '#0ea5e9',
    borderColor: '#f8fafc',
    borderWidth: 2,
    cornerRadius: 18,
  };
}

export function normalizeStageObjectBlendMode(value: unknown): EditorStageBlendMode {
  return STAGE_BLEND_MODES.includes(value as EditorStageBlendMode)
    ? value as EditorStageBlendMode
    : 'normal';
}

export function getStageObjectBlendModes(): EditorStageBlendMode[] {
  return [...STAGE_BLEND_MODES];
}

function createStageObjectId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function normalizePercent(value: unknown, fallback: number): number {
  return Math.max(0, Math.min(100, normalizeNumber(value, fallback)));
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
