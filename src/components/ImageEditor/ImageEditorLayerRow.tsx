import { Eye, EyeOff, Lock, SquareDashed, Unlock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getImageLayerWorkflowBadges } from './ImageLayerWorkflowMetadata';
import type { ImageLayer, LayerType } from '../../types/imageEditor';

const LAYER_TYPE_COLORS: Record<LayerType, string> = {
  image: '#3b82f6',
  mask: '#f59e0b',
  text: '#a855f7',
  adjustment: '#10b981',
  vector: '#ec4899',
};

export function LayerRow({
  active,
  dragging,
  layer,
  onClick,
  onDragOver,
  onDragStart,
  onDrop,
  onOpenMenu,
  onRename,
  onToggleLocked,
  onToggleVisible,
}: {
  active: boolean;
  dragging: boolean;
  layer: ImageLayer;
  onClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onOpenMenu: (event: React.MouseEvent<HTMLElement>, layerId: string) => void;
  onRename: (name: string) => void;
  onToggleLocked: () => void;
  onToggleVisible: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(layer.name);
  const badges = getImageLayerWorkflowBadges(layer);

  return (
    <div
      className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${
        active
          ? 'bg-cyan-400/10 text-cyan-50'
          : 'text-cyan-100/70 hover:bg-cyan-400/5'
      } ${dragging ? 'opacity-40' : ''}`}
      draggable
      onClick={onClick}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
      onContextMenu={(event) => onOpenMenu(event, layer.id)}
    >
      <button
        className="text-cyan-100/40 hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onToggleVisible();
        }}
        title={layer.visible ? 'Hide' : 'Show'}
        type="button"
      >
        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      <button
        className="text-cyan-100/40 hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onToggleLocked();
        }}
        title={layer.locked ? 'Unlock' : 'Lock'}
        type="button"
      >
        {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
      </button>

      <LayerThumbnail layer={layer} />
      {layer.mask && (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-cyan-300/10 bg-[#0d0f15] text-cyan-100/45"
          title="Layer mask"
        >
          <SquareDashed size={12} />
        </span>
      )}

      {editing ? (
        <input
          autoFocus
          className="flex-1 rounded border border-cyan-300/10 bg-[#0d0f15] px-1.5 py-0.5 text-xs text-cyan-100"
          onBlur={() => {
            setEditing(false);
            if (draftName.trim()) onRename(draftName.trim());
            else setDraftName(layer.name);
          }}
          onChange={(e) => setDraftName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setEditing(false);
              if (draftName.trim()) onRename(draftName.trim());
              else setDraftName(layer.name);
            }
            if (e.key === 'Escape') {
              setEditing(false);
              setDraftName(layer.name);
            }
          }}
          value={draftName}
        />
      ) : (
        <span
          className="flex-1 truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraftName(layer.name);
            setEditing(true);
          }}
        >
          {layer.name}
        </span>
      )}

      <span
        className="h-2 w-2 rounded-sm"
        style={{ backgroundColor: LAYER_TYPE_COLORS[layer.type] ?? '#888' }}
      />
      {badges.map((badge) => (
        <span
          className="rounded border border-cyan-300/10 bg-[#0d0f15] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-100/45"
          key={badge.id}
          title={badge.description}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}


export function LayerThumbnail({ layer }: { layer: ImageLayer }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#252630';
    ctx.fillRect(0, 0, w, h);
    if (!layer.bitmap) return;
    const iw = layer.bitmap.width;
    const ih = layer.bitmap.height;
    if (iw === 0 || ih === 0) return;
    const scale = Math.min(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    try {
      ctx.drawImage(layer.bitmap, dx, dy, dw, dh);
    } catch {
      // bitmap can become unusable mid-edit; ignore here.
    }
  }, [layer.bitmap, layer.bitmapVersion]);

  return (
    <canvas
      className="h-6 w-6 shrink-0 rounded-sm border border-cyan-300/10"
      height={24}
      ref={ref}
      width={24}
    />
  );
}
