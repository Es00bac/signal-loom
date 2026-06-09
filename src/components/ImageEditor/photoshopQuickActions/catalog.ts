import type { BlendMode } from '../../../types/imageEditor';
import type { GeneratedQuickActionDefinition, PhotoshopQuickAction } from './types';
import { pascalCase, titleCase, titleLabel } from './utils';

export const BASE_PHOTOSHOP_QUICK_ACTIONS: PhotoshopQuickAction[] = [
  { id: 'selectLayerBounds', label: 'Select Layer Bounds', group: 'Selection' },
  { id: 'selectLayerOpaquePixels', label: 'Select Opaque Pixels', group: 'Selection' },
  { id: 'growSelection', label: 'Grow Selection', group: 'Selection' },
  { id: 'shrinkSelection', label: 'Shrink Selection', group: 'Selection' },
  { id: 'featherSelection', label: 'Feather Selection', group: 'Selection' },
  { id: 'borderSelection', label: 'Border Selection', group: 'Selection' },
  { id: 'smoothSelection', label: 'Smooth Selection', group: 'Selection' },
  { id: 'clearOutsideSelection', label: 'Clear Outside Selection', group: 'Pixels' },
  { id: 'layerViaCopy', label: 'Layer via Copy', group: 'Layer' },
  { id: 'layerViaCut', label: 'Layer via Cut', group: 'Layer' },
  { id: 'cropLayerToSelection', label: 'Crop Layer to Selection', group: 'Layer' },
  { id: 'trimTransparentLayer', label: 'Trim Transparent Pixels', group: 'Layer' },
  { id: 'flipLayerHorizontal', label: 'Flip Layer Horizontal', group: 'Transform' },
  { id: 'flipLayerVertical', label: 'Flip Layer Vertical', group: 'Transform' },
  { id: 'rotateLayer90Clockwise', label: 'Rotate Layer 90 CW', group: 'Transform' },
  { id: 'rotateLayer90CounterClockwise', label: 'Rotate Layer 90 CCW', group: 'Transform' },
  { id: 'centerLayer', label: 'Center Layer', group: 'Transform' },
  { id: 'fitLayerToCanvas', label: 'Fit Layer to Canvas', group: 'Transform' },
  { id: 'resetLayerPosition', label: 'Reset Layer Position', group: 'Transform' },
  { id: 'trimCanvasToVisible', label: 'Trim Canvas to Visible Pixels', group: 'Canvas' },
  { id: 'selectCanvas', label: 'Select Canvas', group: 'Selection' },
  { id: 'selectLayerTransparentPixels', label: 'Select Transparent Pixels', group: 'Selection' },
  { id: 'selectSelectionBoundingBox', label: 'Select Selection Bounds', group: 'Selection' },
  { id: 'growSelectionLarge', label: 'Grow Selection 4 px', group: 'Selection' },
  { id: 'shrinkSelectionLarge', label: 'Shrink Selection 4 px', group: 'Selection' },
  { id: 'featherSelectionLarge', label: 'Feather Selection 4 px', group: 'Selection' },
  { id: 'borderSelectionLarge', label: 'Border Selection 4 px', group: 'Selection' },
  { id: 'clearSelectedPixels', label: 'Clear Selected Pixels', group: 'Pixels' },
  { id: 'duplicateLayer', label: 'Duplicate Layer', group: 'Layer' },
  { id: 'moveLayerToFront', label: 'Move Layer to Front', group: 'Layer' },
  { id: 'moveLayerToBack', label: 'Move Layer to Back', group: 'Layer' },
  { id: 'nudgeLayerLeft', label: 'Nudge Layer Left 1 px', group: 'Transform' },
  { id: 'nudgeLayerRight', label: 'Nudge Layer Right 1 px', group: 'Transform' },
  { id: 'nudgeLayerUp', label: 'Nudge Layer Up 1 px', group: 'Transform' },
  { id: 'nudgeLayerDown', label: 'Nudge Layer Down 1 px', group: 'Transform' },
  { id: 'nudgeLayerLeftLarge', label: 'Nudge Layer Left 10 px', group: 'Transform' },
  { id: 'nudgeLayerRightLarge', label: 'Nudge Layer Right 10 px', group: 'Transform' },
  { id: 'nudgeLayerUpLarge', label: 'Nudge Layer Up 10 px', group: 'Transform' },
  { id: 'nudgeLayerDownLarge', label: 'Nudge Layer Down 10 px', group: 'Transform' },
  { id: 'alignLayerLeft', label: 'Align Layer Left', group: 'Transform' },
  { id: 'alignLayerRight', label: 'Align Layer Right', group: 'Transform' },
  { id: 'alignLayerTop', label: 'Align Layer Top', group: 'Transform' },
  { id: 'alignLayerBottom', label: 'Align Layer Bottom', group: 'Transform' },
  { id: 'centerLayerHorizontal', label: 'Center Layer Horizontal', group: 'Transform' },
  { id: 'centerLayerVertical', label: 'Center Layer Vertical', group: 'Transform' },
  { id: 'fitLayerWidthToCanvas', label: 'Fit Layer Width to Canvas', group: 'Transform' },
  { id: 'fitLayerHeightToCanvas', label: 'Fit Layer Height to Canvas', group: 'Transform' },
  { id: 'invertLayerColors', label: 'Invert Layer Colors', group: 'Pixels' },
  { id: 'desaturateLayer', label: 'Desaturate Layer', group: 'Pixels' },
  { id: 'resetLayerOpacity', label: 'Reset Layer Opacity', group: 'Layer' },
  { id: 'selectTopHalf', label: 'Select Top Half', group: 'Selection' },
  { id: 'selectBottomHalf', label: 'Select Bottom Half', group: 'Selection' },
  { id: 'selectLeftHalf', label: 'Select Left Half', group: 'Selection' },
  { id: 'selectRightHalf', label: 'Select Right Half', group: 'Selection' },
  { id: 'selectCenterSquare', label: 'Select Center Square', group: 'Selection' },
  { id: 'selectHorizontalCenterBand', label: 'Select Horizontal Center Band', group: 'Selection' },
  { id: 'selectVerticalCenterBand', label: 'Select Vertical Center Band', group: 'Selection' },
  { id: 'setLayerOpacity25', label: 'Layer Opacity 25%', group: 'Layer' },
  { id: 'setLayerOpacity50', label: 'Layer Opacity 50%', group: 'Layer' },
  { id: 'setLayerOpacity75', label: 'Layer Opacity 75%', group: 'Layer' },
  { id: 'setLayerBlendNormal', label: 'Blend Mode Normal', group: 'Layer' },
  { id: 'setLayerBlendMultiply', label: 'Blend Mode Multiply', group: 'Layer' },
  { id: 'setLayerBlendScreen', label: 'Blend Mode Screen', group: 'Layer' },
  { id: 'setLayerBlendOverlay', label: 'Blend Mode Overlay', group: 'Layer' },
  { id: 'rotateLayer180', label: 'Rotate Layer 180', group: 'Transform' },
  { id: 'raiseLayerOneStep', label: 'Raise Layer One Step', group: 'Layer' },
  { id: 'lowerLayerOneStep', label: 'Lower Layer One Step', group: 'Layer' },
  { id: 'fitLayerInsideCanvas', label: 'Fit Layer Inside Canvas', group: 'Transform' },
  { id: 'fillLayerToCanvas', label: 'Fill Layer to Canvas', group: 'Transform' },
  { id: 'rasterizeLayerToCanvas', label: 'Rasterize Layer to Canvas', group: 'Layer' },
] as const;

function buildSelectionMorphologyActions(): GeneratedQuickActionDefinition[] {
  const radii = [2, 3, 5, 6, 8, 10, 12, 16];
  const operations: Array<'grow' | 'shrink' | 'feather' | 'border'> = ['grow', 'shrink', 'feather', 'border'];

  return radii.flatMap((radius) =>
    operations.map((operation) => ({
      id: `${operation}Selection${radius}px`,
      label: `${titleCase(operation)} Selection ${radius} px`,
      group: 'Selection' as const,
      kind: 'selectionMorphology' as const,
      operation,
      radius,
    })),
  );
}

function buildGridSelectionActions(): GeneratedQuickActionDefinition[] {
  return [3, 4, 5].flatMap((size) =>
    Array.from({ length: size * size }, (_, index) => ({
      id: `selectGrid${size}x${size}Cell${index + 1}`,
      label: `Select ${size}x${size} Cell ${index + 1}`,
      group: 'Selection' as const,
      kind: 'selectionGrid' as const,
      columns: size,
      rows: size,
      cell: index + 1,
    })),
  );
}

function buildRegionSelectionActions(): GeneratedQuickActionDefinition[] {
  const edgePercents = [5, 10, 20, 25];
  const edges = ['top', 'bottom', 'left', 'right'] as const;
  const edgeActions = edgePercents.flatMap((percent) =>
    edges.map((edge) => ({
      id: `selectEdge${titleCase(edge)}${percent}Percent`,
      label: `Select ${titleCase(edge)} ${percent}% Edge`,
      group: 'Selection' as const,
      kind: 'selectionEdge' as const,
      edge,
      percent,
    })),
  );

  const insetActions = [10, 20, 30, 40].map((percent) => ({
    id: `selectInset${percent}Percent`,
    label: `Select ${percent}% Inset`,
    group: 'Selection' as const,
    kind: 'selectionInset' as const,
    percent,
  }));

  const borderActions = [5, 10, 20, 30].map((percent) => ({
    id: `selectBorderRing${percent}Percent`,
    label: `Select ${percent}% Border Ring`,
    group: 'Selection' as const,
    kind: 'selectionBorderRing' as const,
    percent,
  }));

  return [...edgeActions, ...insetActions, ...borderActions];
}

function buildLayerOpacityActions(): GeneratedQuickActionDefinition[] {
  return [0, 5, 10, 15, 20, 30, 35, 40, 45, 55, 60, 65, 70, 80, 85, 90, 95, 100].map((percent) => ({
    id: `setLayerOpacity${percent}`,
    label: `Layer Opacity ${percent}%`,
    group: 'Layer' as const,
    kind: 'layerOpacity' as const,
    opacity: percent / 100,
  }));
}

function buildLayerBlendActions(): GeneratedQuickActionDefinition[] {
  const modes: BlendMode[] = [
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
  ];

  return modes.map((blendMode) => ({
    id: `setLayerBlend${pascalCase(blendMode)}`,
    label: `Blend Mode ${titleLabel(blendMode)}`,
    group: 'Layer' as const,
    kind: 'layerBlend' as const,
    blendMode,
  }));
}

function buildNudgeActions(): GeneratedQuickActionDefinition[] {
  const cardinalDistances = [2, 3, 5, 20, 25, 50, 100];
  const cardinal = [
    { name: 'Left', dx: -1, dy: 0 },
    { name: 'Right', dx: 1, dy: 0 },
    { name: 'Up', dx: 0, dy: -1 },
    { name: 'Down', dx: 0, dy: 1 },
  ];
  const cardinalActions = cardinalDistances.flatMap((distance) =>
    cardinal.map((direction) => ({
      id: `nudgeLayer${direction.name}${distance}`,
      label: `Nudge Layer ${direction.name} ${distance} px`,
      group: 'Transform' as const,
      kind: 'nudge' as const,
      dx: direction.dx * distance,
      dy: direction.dy * distance,
    })),
  );

  const diagonalDistances = [1, 5, 10, 25, 50];
  const diagonal = [
    { name: 'UpLeft', label: 'Up Left', dx: -1, dy: -1 },
    { name: 'UpRight', label: 'Up Right', dx: 1, dy: -1 },
    { name: 'DownLeft', label: 'Down Left', dx: -1, dy: 1 },
    { name: 'DownRight', label: 'Down Right', dx: 1, dy: 1 },
  ];
  const diagonalActions = diagonalDistances.flatMap((distance) =>
    diagonal.map((direction) => ({
      id: `nudgeLayer${direction.name}${distance}`,
      label: `Nudge Layer ${direction.label} ${distance} px`,
      group: 'Transform' as const,
      kind: 'nudge' as const,
      dx: direction.dx * distance,
      dy: direction.dy * distance,
    })),
  );

  return [...cardinalActions, ...diagonalActions];
}

function buildLayerScaleActions(): GeneratedQuickActionDefinition[] {
  return [25, 50, 75, 90, 110, 125, 150, 200].map((percent) => ({
    id: `scaleLayer${percent}Percent`,
    label: `Scale Layer ${percent}%`,
    group: 'Transform' as const,
    kind: 'layerScale' as const,
    percent,
  }));
}

function buildPixelAdjustmentActions(): GeneratedQuickActionDefinition[] {
  const brightnessActions = [-50, -25, -10, 10, 25, 50].map((delta) => ({
    id: `adjustBrightness${delta < 0 ? 'Minus' : 'Plus'}${Math.abs(delta)}`,
    label: `Brightness ${delta > 0 ? '+' : ''}${delta}`,
    group: 'Pixels' as const,
    kind: 'brightness' as const,
    delta,
  }));
  const alphaActions = [50, 75].map((percent) => ({
    id: `setPixelAlpha${percent}`,
    label: `Set Pixel Alpha ${percent}%`,
    group: 'Pixels' as const,
    kind: 'pixelAlpha' as const,
    percent,
  }));

  return [...brightnessActions, ...alphaActions];
}

export const GENERATED_PHOTOSHOP_QUICK_ACTIONS: GeneratedQuickActionDefinition[] = [
  ...buildSelectionMorphologyActions(),
  ...buildGridSelectionActions(),
  ...buildRegionSelectionActions(),
  ...buildLayerOpacityActions(),
  ...buildLayerBlendActions(),
  ...buildNudgeActions(),
  ...buildLayerScaleActions(),
  ...buildPixelAdjustmentActions(),
];

export const generatedQuickActionById = new Map(
  GENERATED_PHOTOSHOP_QUICK_ACTIONS.map((action) => [action.id, action]),
);

export const PHOTOSHOP_QUICK_ACTIONS: PhotoshopQuickAction[] = [
  ...BASE_PHOTOSHOP_QUICK_ACTIONS,
  ...GENERATED_PHOTOSHOP_QUICK_ACTIONS,
];
