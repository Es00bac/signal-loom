import type { EditorTool } from '../../types/imageEditor';

export interface ImageEditorToolDefinition {
  tool: EditorTool;
  label: string;
  shortcut: string;
}

export const IMAGE_EDITOR_TOOL_DEFINITIONS: ImageEditorToolDefinition[] = [
  { tool: 'move', label: 'Move', shortcut: 'V' },
  { tool: 'hand', label: 'Hand', shortcut: 'H' },
  { tool: 'marquee', label: 'Marquee', shortcut: 'M' },
  { tool: 'lasso', label: 'Lasso', shortcut: 'L' },
  { tool: 'magicWand', label: 'Magic Wand', shortcut: 'W' },
  { tool: 'brush', label: 'Brush', shortcut: 'B' },
  { tool: 'eraser', label: 'Eraser', shortcut: 'E' },
  { tool: 'cloneStamp', label: 'Clone Stamp', shortcut: 'S' },
  { tool: 'spotHeal', label: 'Spot Heal', shortcut: 'J' },
  { tool: 'blurBrush', label: 'Blur Brush', shortcut: 'R' },
  { tool: 'sharpenBrush', label: 'Sharpen Brush', shortcut: 'Shift+R' },
  { tool: 'smudgeBrush', label: 'Smudge Brush', shortcut: 'U' },
  { tool: 'dodgeBrush', label: 'Dodge Brush', shortcut: 'O' },
  { tool: 'burnBrush', label: 'Burn Brush', shortcut: 'Shift+O' },
  { tool: 'spongeSaturateBrush', label: 'Sponge Saturate', shortcut: 'P' },
  { tool: 'spongeDesaturateBrush', label: 'Sponge Desaturate', shortcut: 'Shift+P' },
  { tool: 'paintBucket', label: 'Paint Bucket', shortcut: 'G' },
  { tool: 'gradientTool', label: 'Gradient', shortcut: 'Shift+G' },
  { tool: 'rectShape', label: 'Rectangle Shape', shortcut: 'X' },
  { tool: 'ellipseShape', label: 'Ellipse Shape', shortcut: 'Shift+X' },
  { tool: 'crop', label: 'Crop', shortcut: 'C' },
  { tool: 'text', label: 'Text', shortcut: 'T' },
  { tool: 'eyedropper', label: 'Eyedropper', shortcut: 'I' },
];
