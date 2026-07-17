import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Save, Trash2, X } from 'lucide-react';
import { useProjectReplacementDialogStore } from '../../store/projectReplacementDialogStore';

export function ProjectReplacementDialog() {
  const { activeRequest, respond } = useProjectReplacementDialogStore();
  const titleId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!activeRequest) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      respond('cancel');
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [activeRequest, respond]);

  if (!activeRequest) return null;
  const dirtyLabels = [
    ...activeRequest.dirtyPaperTitles.map((title) => `Paper: ${title}`),
    ...activeRequest.dirtyImageTitles.map((title) => `Image: ${title}`),
  ];

  return (
    <div aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-[170] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs" role="dialog">
      <div className="theme-popover w-full max-w-lg rounded-xl border border-amber-500/25 bg-[#13161f] p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <AlertTriangle aria-hidden="true" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-100" id={titleId}>Save project changes before replacing it?</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              Save preserves all dirty Paper and Image work in the current project. Discard replaces it permanently; Cancel keeps the current project open.
            </p>
            <ul className="mt-3 max-h-32 overflow-auto text-xs text-amber-100/80">
              {dirtyLabels.map((label) => <li key={label}>{label}</li>)}
            </ul>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-gray-800/60 pt-4">
          <button className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-300" onClick={() => respond('cancel')} ref={cancelButtonRef} type="button">
            <X aria-hidden="true" size={14} /> Cancel
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200" onClick={() => respond('discard')} type="button">
            <Trash2 aria-hidden="true" size={14} /> Discard
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white" onClick={() => respond('save')} type="button">
            <Save aria-hidden="true" size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
