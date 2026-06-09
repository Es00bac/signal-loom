import {
  Bandage,
  Blend,
  CircleOff,
  Circle,
  Crop,
  Droplet,
  Eraser,
  Focus,
  Hand,
  Lasso,
  MousePointer2,
  Moon,
  Paintbrush,
  PaintBucket,
  Palette,
  Pipette,
  Stamp,
  Square,
  Sun,
  Type,
  Wand2,
} from 'lucide-react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { recordActivityTrailWorkspaceEvent } from '../../store/activityTrailStore';
import type { EditorTool } from '../../types/imageEditor';
import { IMAGE_EDITOR_TOOL_DEFINITIONS } from './imageEditorTools';

export function ImageEditorToolbar() {
  const tool = useImageEditorStore((s) => s.tool);
  const setTool = useImageEditorStore((s) => s.setTool);
  const icons: Record<EditorTool, React.ReactNode> = {
    move: <MousePointer2 size={16} />,
    hand: <Hand size={16} />,
    marquee: <Square size={16} />,
    lasso: <Lasso size={16} />,
    magicWand: <Wand2 size={16} />,
    brush: <Paintbrush size={16} />,
    eraser: <Eraser size={16} />,
    cloneStamp: <Stamp size={16} />,
    spotHeal: <Bandage size={16} />,
    blurBrush: <Droplet size={16} />,
    sharpenBrush: <Focus size={16} />,
    smudgeBrush: <Hand size={16} />,
    dodgeBrush: <Sun size={16} />,
    burnBrush: <Moon size={16} />,
    spongeSaturateBrush: <Palette size={16} />,
    spongeDesaturateBrush: <CircleOff size={16} />,
    paintBucket: <PaintBucket size={16} />,
    gradientTool: <Blend size={16} />,
    rectShape: <Square size={16} />,
    ellipseShape: <Circle size={16} />,
    crop: <Crop size={16} />,
    text: <Type size={16} />,
    eyedropper: <Pipette size={16} />,
  };

  return (
    <div className="flex w-12 flex-col items-center gap-1 border-r border-cyan-300/10 bg-[#1a1b23] py-2">
      {IMAGE_EDITOR_TOOL_DEFINITIONS.map(({ tool: t, label, shortcut }) => (
        <button
          key={t}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            tool === t
              ? 'bg-cyan-400 text-slate-950'
              : 'text-cyan-100/50 hover:bg-cyan-400/10 hover:text-white'
          }`}
          onClick={() => {
            setTool(t);
            recordActivityTrailWorkspaceEvent('image', 'Select Image tool', label, 'toolbar');
          }}
          title={`${label} (${shortcut})`}
          type="button"
        >
          {icons[t]}
        </button>
      ))}
    </div>
  );
}
