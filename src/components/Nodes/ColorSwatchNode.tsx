import { memo } from 'react';
import { Palette, Plus, Trash2 } from 'lucide-react';
import { AdvancedColorPicker } from '../Common/AdvancedColorPicker';
import { BaseNode } from './BaseNode';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import {
  COLOR_SWATCH_USAGE_OPTIONS,
  DEFAULT_COLOR_SWATCH_DRAFT_COLOR,
  formatColorSwatchPrompt,
  normalizeColorSwatchColors,
  normalizeHexColor,
  resolveColorSwatchDraftColor,
  resolveColorSwatchSelectedIndex,
  resolveColorSwatchUsageMode,
} from '../../lib/colorSwatchNode';
import { useFlowStore } from '../../store/flowStore';
import type { AppNodeProps, ColorSwatchUsageMode } from '../../types/flow';

function ColorSwatchNodeComponent({ id, data }: AppNodeProps) {
  const patchNodeData = useFlowStore((state) => state.patchNodeData);
  const colors = normalizeColorSwatchColors(data.colorSwatchColors);
  const selectedIndex = resolveColorSwatchSelectedIndex(data.colorSwatchSelectedIndex, colors.length);
  const draftColor = selectedIndex !== undefined
    ? colors[selectedIndex]
    : resolveColorSwatchDraftColor(data.colorSwatchDraftColor);
  const usageMode = resolveColorSwatchUsageMode(data.colorSwatchUsageMode);
  const promptText = formatColorSwatchPrompt({
    colorSwatchColors: colors,
    colorSwatchUsageMode: usageMode,
  });

  const patchColors = (nextColors: string[], nextSelectedIndex?: number) => {
    patchNodeData(id, {
      colorSwatchColors: nextColors,
      colorSwatchSelectedIndex: nextSelectedIndex ?? -1,
      colorSwatchDraftColor: nextSelectedIndex !== undefined
        ? nextColors[nextSelectedIndex] ?? DEFAULT_COLOR_SWATCH_DRAFT_COLOR
        : draftColor,
    });
  };

  const handleColorChange = (value: string) => {
    const nextColor = normalizeHexColor(value) ?? DEFAULT_COLOR_SWATCH_DRAFT_COLOR;
    if (selectedIndex === undefined) {
      patchNodeData(id, { colorSwatchDraftColor: nextColor });
      return;
    }

    const nextColors = colors.map((color, index) => index === selectedIndex ? nextColor : color);
    patchNodeData(id, {
      colorSwatchColors: nextColors,
      colorSwatchDraftColor: nextColor,
    });
  };

  const addColor = () => {
    const nextColor = normalizeHexColor(draftColor) ?? DEFAULT_COLOR_SWATCH_DRAFT_COLOR;
    const existingIndex = colors.indexOf(nextColor);
    if (existingIndex >= 0) {
      patchNodeData(id, {
        colorSwatchSelectedIndex: existingIndex,
        colorSwatchDraftColor: nextColor,
      });
      return;
    }

    patchColors([...colors, nextColor], colors.length);
  };

  const removeColor = (index: number) => {
    const nextColors = colors.filter((_, colorIndex) => colorIndex !== index);
    const nextSelectedIndex = nextColors.length === 0 ? undefined : Math.min(index, nextColors.length - 1);
    patchColors(nextColors, nextSelectedIndex);
  };

  return (
    <BaseNode
      nodeId={id}
      nodeType="colorSwatchNode"
      icon={Palette}
      title="Color Swatch"
      hasInput={false}
      hasOutput
      error={data.error}
      statusMessage={data.statusMessage}
      retryState={data.retryState}
    >
      <div className="space-y-3 rounded-lg border border-pink-400/20 bg-pink-400/5 p-3 text-xs">
        <label className="block">
          <span className="mb-1.5 block font-semibold text-gray-200">Usage</span>
          <select
            className={withFlowNodeInteractionClasses('w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-gray-100 outline-none focus:border-pink-300')}
            onChange={(event) => patchNodeData(id, {
              colorSwatchUsageMode: event.target.value as ColorSwatchUsageMode,
            })}
            value={usageMode}
          >
            {COLOR_SWATCH_USAGE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block font-semibold text-gray-200">Swatch</span>
          <select
            className={withFlowNodeInteractionClasses('w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-gray-100 outline-none focus:border-pink-300')}
            onChange={(event) => {
              if (event.target.value === 'new') {
                patchNodeData(id, { colorSwatchSelectedIndex: -1 });
                return;
              }
              const nextIndex = Number(event.target.value);
              patchNodeData(id, {
                colorSwatchSelectedIndex: nextIndex,
                colorSwatchDraftColor: colors[nextIndex] ?? DEFAULT_COLOR_SWATCH_DRAFT_COLOR,
              });
            }}
            value={selectedIndex === undefined ? 'new' : String(selectedIndex)}
          >
            <option value="new">New color</option>
            {colors.map((color, index) => (
              <option key={`${color}-${index}`} value={index}>
                {`Color ${index + 1} ${color}`}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <AdvancedColorPicker
            buttonClassName={withFlowNodeInteractionClasses('rounded-md border border-gray-700 bg-gray-950')}
            className="h-9 w-12"
            label="Pick swatch color"
            onChange={handleColorChange}
            value={draftColor}
          />
          <code className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-950 px-2 py-2 font-mono text-[11px] text-gray-100">
            {draftColor}
          </code>
          <button
            className={withFlowNodeInteractionClasses('flex h-9 w-9 items-center justify-center rounded-md border border-pink-400/40 bg-pink-400/10 text-pink-100 transition-colors hover:bg-pink-400/20')}
            onClick={addColor}
            title="Add color"
            type="button"
          >
            <Plus size={15} />
          </button>
          <button
            className={withFlowNodeInteractionClasses('flex h-9 w-9 items-center justify-center rounded-md border border-gray-700 bg-gray-950 text-gray-300 transition-colors hover:border-red-400/50 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40')}
            disabled={selectedIndex === undefined}
            onClick={() => selectedIndex !== undefined && removeColor(selectedIndex)}
            title="Remove selected color"
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="grid grid-cols-6 gap-1.5">
          {colors.length > 0 ? colors.map((color, index) => (
            <button
              aria-label={`Select ${color}`}
              className={withFlowNodeInteractionClasses(`h-8 rounded-md border transition-transform hover:scale-105 ${
                index === selectedIndex ? 'border-white shadow-[0_0_0_1px_rgba(255,255,255,0.65)]' : 'border-black/45'
              }`)}
              key={`${color}-${index}`}
              onClick={() => patchNodeData(id, {
                colorSwatchSelectedIndex: index,
                colorSwatchDraftColor: color,
              })}
              style={{ backgroundColor: color }}
              title={color}
              type="button"
            />
          )) : (
            <div className="col-span-6 rounded-md border border-dashed border-gray-700 bg-gray-950 px-2 py-3 text-center text-[10px] text-gray-500">
              No colors selected
            </div>
          )}
        </div>

        <div className="rounded-md border border-gray-700/70 bg-gray-950 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Output</div>
          <p className="max-h-24 overflow-y-auto text-[10px] leading-4 text-gray-300">
            {promptText || 'Add colors to output palette guidance.'}
          </p>
        </div>
      </div>
    </BaseNode>
  );
}

export const ColorSwatchNode = memo(ColorSwatchNodeComponent);
