import { Bookmark, ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react';
import { collectNodeBookmarks, getNodeTypeLabel } from '../../lib/nodeBookmarks';
import { getNodeTheme } from '../../lib/nodeTheme';
import { useFlowStore } from '../../store/flowStore';

interface FlowBookmarkSidebarProps {
  onCenterNode: (nodeId: string) => void;
}

export function FlowBookmarkSidebar({ onCenterNode }: FlowBookmarkSidebarProps) {
  const nodes = useFlowStore((state) => state.nodes);
  const bookmarks = collectNodeBookmarks(nodes);
  const [isOpen, setOpen] = useBookmarkSidebarState();

  return (
    <aside
      className={`absolute bottom-24 right-4 top-20 z-20 flex overflow-hidden rounded-2xl border border-gray-700/60 bg-[#10151f]/95 shadow-2xl backdrop-blur transition-[width] duration-200 ${
        isOpen ? 'w-[22rem]' : 'w-14'
      }`}
    >
      {isOpen ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-gray-700/60 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-fuchsia-200/80">
                  Node Bookmarks
                </div>
                <div className="mt-1 text-base font-semibold text-white">Reusable Waypoints</div>
              </div>
              <div className="rounded-full border border-gray-700/60 bg-[#111217]/60 px-3 py-1 text-xs text-gray-300">
                {bookmarks.length}
              </div>
            </div>
            <div className="mt-2 text-xs leading-5 text-gray-400">
              Right-click a node title to rename it. Renamed nodes appear here so you can jump back to them.
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {bookmarks.length > 0 ? (
                bookmarks.map((bookmark) => {
                  const theme = getNodeTheme(bookmark.type);

                  return (
                    <button
                      className="w-full rounded-xl border border-gray-700/60 bg-[#111217]/45 p-3 text-left transition-colors hover:border-gray-500 hover:bg-[#171d27]"
                      key={bookmark.id}
                      onClick={() => onCenterNode(bookmark.id)}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10"
                          style={{ backgroundColor: `${theme.accentColor}22`, color: theme.accentColor }}
                        >
                          <LocateFixed size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-100">{bookmark.title}</span>
                          <span className="mt-1 block text-[11px] uppercase tracking-[0.16em] text-gray-500">
                            {getNodeTypeLabel(bookmark.type)}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-gray-700/60 bg-[#111217]/35 p-4 text-sm text-gray-400">
                  No bookmarks yet. Right-click a node title and give it a descriptive name.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <button
        className="flex w-14 shrink-0 flex-col items-center gap-3 border-l border-gray-700/60 bg-[#0d1118] py-4 text-gray-300 transition-colors hover:text-white"
        onClick={() => setOpen(!isOpen)}
        type="button"
      >
        <Bookmark size={18} />
        {isOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </aside>
  );
}

function useBookmarkSidebarState(): [boolean, (nextOpen: boolean) => void] {
  const isOpen = useFlowStore((state) => state.bookmarkSidebarOpen);
  const setOpen = useFlowStore((state) => state.setBookmarkSidebarOpen);

  return [isOpen, setOpen];
}
