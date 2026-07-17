import { FileText, Plus, RotateCcw, X } from 'lucide-react';
import { requestClosePaperDocument } from '../../../lib/paperLossPrevention';
import {
  listFreshPaperBatonHandoffItems,
  openPaperBatonHandoffItem,
} from '../../../lib/batonHandoffSnapshot';
import { usePaperStore } from '../../../store/paperStore';
import { useSourceBinStore } from '../../../store/sourceBinStore';

export function PaperDocumentTabs() {
  const documents = usePaperStore((state) => state.documents);
  const activeDocumentId = usePaperStore((state) => state.activeDocumentId);
  const activeDocument = usePaperStore((state) => state.document);
  const createNewDocument = usePaperStore((state) => state.createNewDocument);
  const setActiveDocument = usePaperStore((state) => state.setActiveDocument);
  const isDocumentDirty = usePaperStore((state) => state.isDocumentDirty);
  const discardedDocumentRecoveries = usePaperStore((state) => state.discardedDocumentRecoveries);
  const restoreDiscardedDocument = usePaperStore((state) => state.restoreDiscardedDocument);
  const sourceBins = useSourceBinStore((state) => state.bins);
  const sourceItems = sourceBins.flatMap((bin) => bin.items);
  const latestRecovery = discardedDocumentRecoveries.at(-1);
  const latestPaperHandoff = listFreshPaperBatonHandoffItems(sourceItems)[0];

  return (
    <div
      aria-label="Open Paper documents"
      className="theme-surface flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-cyan-300/10 bg-[#11131a]"
      data-paper-document-tabs="true"
      role="tablist"
    >
      <button
        aria-label="New Paper document"
        className="flex w-10 shrink-0 items-center justify-center border-r border-cyan-300/10 text-cyan-100/45 transition-colors hover:bg-cyan-300/5 hover:text-cyan-100"
        onClick={() => createNewDocument()}
        title="New Paper document"
        type="button"
      >
        <Plus size={14} />
      </button>
      {latestRecovery ? (
        <button
          aria-label={`Restore discarded Paper document ${latestRecovery.snapshot.document.title}`}
          className="flex w-10 shrink-0 items-center justify-center border-r border-cyan-300/10 text-amber-200/60 transition-colors hover:bg-amber-300/5 hover:text-amber-100"
          onClick={() => restoreDiscardedDocument(latestRecovery.id)}
          title={`Restore discarded “${latestRecovery.snapshot.document.title}”`}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={13} />
        </button>
      ) : null}
      {latestPaperHandoff ? (
        <button
          aria-label={`Continue handed-off Paper document ${latestPaperHandoff.label}`}
          className="flex w-10 shrink-0 items-center justify-center border-r border-cyan-300/10 text-violet-200/60 transition-colors hover:bg-violet-300/5 hover:text-violet-100"
          onClick={() => void openPaperBatonHandoffItem(latestPaperHandoff)}
          title={latestPaperHandoff.label}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={13} />
        </button>
      ) : null}
      {documents.map((workspaceDocument) => {
        const isActive = workspaceDocument.id === activeDocumentId;
        const document = isActive ? activeDocument : workspaceDocument.document;
        const isDirty = isDocumentDirty(workspaceDocument.id);
        return (
          <div
            aria-selected={isActive}
            className={`group flex h-full min-w-40 max-w-64 shrink-0 items-center gap-2 border-r px-3 text-left text-xs transition-colors ${
              isActive
                ? 'border-cyan-300/20 bg-[#1b202a] text-cyan-50 shadow-[inset_0_-2px_0_#22d3ee]'
                : 'border-cyan-300/10 text-cyan-100/50 hover:bg-cyan-300/5 hover:text-cyan-100/80'
            }`}
            key={workspaceDocument.id}
            onClick={() => setActiveDocument(workspaceDocument.id)}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              event.stopPropagation();
              void requestClosePaperDocument(workspaceDocument.id);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              setActiveDocument(workspaceDocument.id);
            }}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            title={`${isDirty ? 'Unsaved changes · ' : ''}${document.title} · ${document.pages.length} page${document.pages.length === 1 ? '' : 's'}`}
          >
            <FileText aria-hidden="true" className="shrink-0 opacity-60" size={13} />
            <span className="min-w-0 flex-1 truncate">{document.title}</span>
            {isDirty ? <span aria-label="Unsaved changes" className="text-amber-300" title="Unsaved changes">●</span> : null}
            <span className="shrink-0 font-mono text-[9px] text-cyan-100/35">{document.pages.length}P</span>
            <button
              aria-label={`Close ${document.title}`}
              className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-cyan-100/30 transition-colors hover:bg-white/10 hover:text-white"
              onClick={(event) => {
                event.stopPropagation();
                void requestClosePaperDocument(workspaceDocument.id);
              }}
              title={`Close ${document.title}`}
              type="button"
            >
              <X aria-hidden="true" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
