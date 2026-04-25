import type {
  EditorAsset,
  EditorAssetKind,
  EditorStageObject,
  EditorTextDefaults,
  EditorShapeDefaults,
  EditorVisualClip,
  NodeData,
  TextClipEffect,
} from '../types/flow';
import { createEditorVisualClip } from './manualEditorState';

export interface CreateEditorAssetOptions {
  id?: string;
  label?: string;
  imageSourceId?: string;
  createdAt?: number;
}

export function getEditorAssets(nodeData: Partial<NodeData>): EditorAsset[] {
  const value = nodeData.editorAssets;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((asset) => normalizeEditorAsset(asset));
}

export function createEditorAsset(
  kind: EditorAssetKind,
  options: CreateEditorAssetOptions = {},
): EditorAsset {
  const now = options.createdAt ?? Date.now();
  const id = options.id ?? `asset-${kind}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const base = {
    id,
    kind,
    label: options.label ?? defaultAssetLabel(kind),
    createdAt: now,
    updatedAt: now,
  };

  if (kind === 'text') {
    return {
      ...base,
      textDefaults: createTextDefaults(),
    };
  }

  if (kind === 'shape') {
    return {
      ...base,
      shapeDefaults: createShapeDefaults(),
    };
  }

  return {
    ...base,
    imageSourceId: options.imageSourceId,
  };
}

export function migrateStageObjectsToEditorAssets(
  stageObjects: EditorStageObject[],
  options: { durationSeconds: number; trackIndex: number },
): { assets: EditorAsset[]; clips: EditorVisualClip[] } {
  const assets: EditorAsset[] = [];
  const clips: EditorVisualClip[] = [];

  for (const object of stageObjects) {
    const assetId = `asset-${object.id}`;
    const createdAt = Date.now();

    if (object.kind === 'text') {
      const textDefaults: EditorTextDefaults = {
        text: object.text,
        fontFamily: object.fontFamily,
        fontSizePx: object.fontSizePx,
        color: object.color,
        textEffect: 'shadow',
        textBackgroundOpacityPercent: 0,
      };

      assets.push({
        id: assetId,
        kind: 'text',
        label: object.text || 'Text',
        createdAt,
        updatedAt: createdAt,
        textDefaults,
      });
      clips.push({
        ...createEditorVisualClip(assetId, 'text', {
          trackIndex: options.trackIndex,
          durationSeconds: options.durationSeconds,
          positionX: object.x,
          positionY: object.y,
          rotationDeg: object.rotationDeg,
          opacityPercent: object.opacityPercent,
          textContent: textDefaults.text,
          textFontFamily: textDefaults.fontFamily,
          textSizePx: textDefaults.fontSizePx,
          textColor: textDefaults.color,
          textEffect: textDefaults.textEffect,
          textBackgroundOpacityPercent: textDefaults.textBackgroundOpacityPercent,
        }),
        id: `visual-${object.id}`,
      });
      continue;
    }

    const shapeDefaults: EditorShapeDefaults = {
      shape: 'rectangle',
      fillColor: object.fillColor,
      borderColor: object.borderColor,
      borderWidth: object.borderWidth,
      cornerRadius: object.cornerRadius,
    };

    assets.push({
      id: assetId,
      kind: 'shape',
      label: 'Rectangle',
      createdAt,
      updatedAt: createdAt,
      shapeDefaults,
    });
    clips.push({
      ...createEditorVisualClip(assetId, 'shape', {
        trackIndex: options.trackIndex,
        durationSeconds: options.durationSeconds,
        positionX: object.x,
        positionY: object.y,
        rotationDeg: object.rotationDeg,
        opacityPercent: object.opacityPercent,
        shapeFillColor: shapeDefaults.fillColor,
        shapeBorderColor: shapeDefaults.borderColor,
        shapeBorderWidth: shapeDefaults.borderWidth,
        shapeCornerRadius: shapeDefaults.cornerRadius,
      }),
      id: `visual-${object.id}`,
    });
  }

  return { assets, clips };
}

function normalizeEditorAsset(value: unknown): EditorAsset[] {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return [];
  }

  const createdAt = normalizeNumber(value.createdAt, Date.now());
  const updatedAt = normalizeNumber(value.updatedAt, createdAt);
  const label = typeof value.label === 'string' ? value.label : undefined;

  if (value.kind === 'text') {
    const defaults = isRecord(value.textDefaults) ? value.textDefaults : {};

    return [{
      id: value.id,
      kind: 'text',
      label: label ?? 'Text',
      createdAt,
      updatedAt,
      textDefaults: {
        text: typeof defaults.text === 'string' ? defaults.text : 'Text',
        fontFamily: typeof defaults.fontFamily === 'string'
          ? defaults.fontFamily
          : 'Inter, system-ui, sans-serif',
        fontSizePx: Math.max(8, normalizeNumber(defaults.fontSizePx, 72)),
        color: normalizeColor(defaults.color, '#f8fafc'),
        textEffect: normalizeTextEffect(defaults.textEffect),
        textBackgroundOpacityPercent: normalizePercent(defaults.textBackgroundOpacityPercent, 0),
      },
    }];
  }

  if (value.kind === 'shape') {
    const defaults = isRecord(value.shapeDefaults) ? value.shapeDefaults : {};

    return [{
      id: value.id,
      kind: 'shape',
      label: label ?? 'Rectangle',
      createdAt,
      updatedAt,
      shapeDefaults: {
        shape: 'rectangle',
        fillColor: normalizeColor(defaults.fillColor, '#0ea5e9'),
        borderColor: normalizeColor(defaults.borderColor, '#f8fafc'),
        borderWidth: Math.max(0, normalizeNumber(defaults.borderWidth, 2)),
        cornerRadius: Math.max(0, normalizeNumber(defaults.cornerRadius, 18)),
      },
    }];
  }

  if (value.kind === 'image' && typeof value.imageSourceId === 'string') {
    return [{
      id: value.id,
      kind: 'image',
      label: label ?? 'Image',
      createdAt,
      updatedAt,
      imageSourceId: value.imageSourceId,
    }];
  }

  return [];
}

function createTextDefaults(): EditorTextDefaults {
  return {
    text: 'Text',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSizePx: 72,
    color: '#f8fafc',
    textEffect: 'shadow',
    textBackgroundOpacityPercent: 0,
  };
}

function createShapeDefaults(): EditorShapeDefaults {
  return {
    shape: 'rectangle',
    fillColor: '#0ea5e9',
    borderColor: '#f8fafc',
    borderWidth: 2,
    cornerRadius: 18,
  };
}

function defaultAssetLabel(kind: EditorAssetKind): string {
  return kind === 'text' ? 'Text' : kind === 'shape' ? 'Rectangle' : 'Image';
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function normalizePercent(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

function normalizeTextEffect(value: unknown): TextClipEffect {
  return value === 'none' || value === 'shadow' || value === 'glow' || value === 'outline'
    ? value
    : 'shadow';
}

function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
