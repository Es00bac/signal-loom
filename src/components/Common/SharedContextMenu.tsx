import { useMemo } from 'react';
import {
  clampContextMenuPosition,
  normalizeContextMenuItems,
  type SharedContextMenuItem,
} from '../../lib/sharedContextMenu';

interface SharedContextMenuProps {
  ariaLabel?: string;
  title?: string;
  x: number;
  y: number;
  items: SharedContextMenuItem[];
  onClose?: () => void;
}

const MENU_WIDTH = 256;
const MENU_ITEM_HEIGHT = 36;
const MENU_HEADER_HEIGHT = 34;

export function SharedContextMenu({
  ariaLabel = 'Context menu',
  title = 'Actions',
  x,
  y,
  items,
  onClose,
}: SharedContextMenuProps) {
  const visibleItems = useMemo(() => normalizeContextMenuItems(items), [items]);
  const position = useMemo(() => {
    const viewport = {
      width: typeof window === 'undefined' ? 1024 : window.innerWidth,
      height: typeof window === 'undefined' ? 768 : window.innerHeight,
    };
    const menuSize = {
      width: MENU_WIDTH,
      height: MENU_HEADER_HEIGHT + visibleItems.length * MENU_ITEM_HEIGHT + 16,
    };

    return clampContextMenuPosition({ x, y }, viewport, menuSize);
  }, [visibleItems.length, x, y]);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={ariaLabel}
      className="fixed z-[80] min-w-64 overflow-hidden rounded-xl border border-gray-700/80 bg-[#10151f]/98 shadow-2xl backdrop-blur"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
      style={{ left: position.x, top: position.y, width: MENU_WIDTH }}
    >
      <div className="border-b border-gray-700/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
        {title}
      </div>
      <div className="p-2">
        {visibleItems.map((item) => (
          <button
            aria-disabled={item.disabled}
            className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              item.disabled
                ? 'cursor-not-allowed text-gray-500'
                : item.tone === 'danger'
                  ? 'text-red-100 hover:bg-red-500/15'
                  : 'text-gray-100 hover:bg-blue-500/10'
            }`}
            disabled={item.disabled}
            key={item.id}
            onClick={() => {
              item.action?.();
              onClose?.();
            }}
            role="menuitem"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
