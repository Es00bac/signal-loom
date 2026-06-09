import type { ImageDocument, ImageLayer } from '../../types/imageEditor';

export function SourceLinkedLayerControls({
  disabled,
  layer,
  sourceItems,
  sourceExists,
  onRelink,
  onReveal,
  onUpdate,
}: {
  disabled?: boolean;
  layer: ImageLayer;
  sourceItems: Array<{ id: string; label: string }>;
  sourceExists: boolean;
  onRelink: (sourceId: string) => void;
  onReveal: () => void;
  onUpdate: () => void;
}) {
  const sourceId = layer.metadata?.smartLinkedSourceId ?? '';
  const sourceLink = layer.metadata?.sourceLink;
  return (
    <div className="mt-2 border-t border-cyan-300/10 pt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-cyan-100/40">Source Link</label>
        <span className={`text-[10px] uppercase tracking-wide ${sourceExists ? 'text-emerald-100/50' : 'text-red-200/55'}`}>
          {sourceExists ? 'Found' : 'Missing'}
        </span>
      </div>
      <div className="mb-2 truncate rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1 text-[10px] text-cyan-100/45" title={sourceId}>
        {layer.metadata?.sourceLabel || sourceId}
        {sourceLink?.width && sourceLink?.height ? ` · ${sourceLink.width}×${sourceLink.height}` : ''}
      </div>
      <select
        className="mb-2 w-full rounded border border-cyan-300/10 bg-[#252630] px-1.5 py-1 text-[11px] text-cyan-100/70 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={disabled}
        onChange={(event) => onRelink(event.target.value)}
        value={sourceId}
      >
        {sourceItems.map((item) => (
          <option key={item.id} value={item.id}>{item.label}</option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-1">
        <button
          className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] font-semibold text-cyan-100/60 hover:border-cyan-300/35 hover:text-white"
          onClick={onReveal}
          type="button"
        >
          Reveal Source
        </button>
        <button
          className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] font-semibold text-cyan-100/60 hover:border-emerald-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled || !sourceExists}
          onClick={onUpdate}
          type="button"
        >
          Update Layer
        </button>
        <button
          className="rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-[11px] font-semibold text-cyan-100/60 hover:border-emerald-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          disabled={disabled || sourceExists}
          onClick={() => onRelink(sourceItems[0]?.id ?? '')}
          type="button"
        >
          Repair
        </button>
      </div>
      {sourceLink?.relinkHistory?.length ? (
        <p className="mt-1 text-[10px] text-cyan-100/30">Relinked {sourceLink.relinkHistory.length} time(s).</p>
      ) : null}
    </div>
  );
}

export function LayerSourceFormatBadges({ layer }: { layer: ImageLayer }) {
  const warnings = layer.metadata?.sourceWarnings ?? [];
  return (
    <div className="mt-2 rounded border border-cyan-300/10 bg-[#10131b] px-2 py-1.5 text-[10px] text-cyan-100/50">
      <div className="flex flex-wrap items-center gap-1.5">
        {layer.metadata?.sourceFormat ? (
          <span className="rounded-full border border-cyan-300/15 bg-cyan-400/10 px-2 py-0.5 uppercase tracking-wide text-cyan-100/60">
            {layer.metadata.sourceFormat}
          </span>
        ) : null}
        {layer.metadata?.sourceMimeType ? (
          <span className="truncate text-cyan-100/35">{layer.metadata.sourceMimeType}</span>
        ) : null}
        {layer.metadata?.originalSvgSource ? (
          <span className="rounded-full border border-emerald-300/15 bg-emerald-400/10 px-2 py-0.5 uppercase tracking-wide text-emerald-100/60">
            SVG source retained
          </span>
        ) : null}
      </div>
      {warnings.map((warning) => (
        <div className="mt-1 text-amber-100/65" key={warning}>{warning}</div>
      ))}
    </div>
  );
}

export function SnapshotsControls({
  doc,
  onDelete,
  onNew,
  onRestore,
}: {
  doc: ImageDocument;
  onDelete: (snapshotId: string) => void;
  onNew: () => void;
  onRestore: (snapshotId: string) => void;
}) {
  const snapshots = doc.snapshots ?? [];
  return (
    <div className="mt-2 border-t border-cyan-300/10 pt-2">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-cyan-100/40">Snapshots</label>
        <button className="rounded border border-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100/55 hover:text-white" onClick={onNew} type="button">New Snapshot</button>
      </div>
      <div className="space-y-1">
        {snapshots.map((snapshot) => (
          <div className="flex items-center gap-1 rounded border border-cyan-300/10 bg-[#10131b] px-1.5 py-1 text-[10px] text-cyan-100/55" key={snapshot.id}>
            <span className="min-w-0 flex-1 truncate">{snapshot.name}</span>
            <button className="text-cyan-100/45 hover:text-white" onClick={() => onRestore(snapshot.id)} type="button">Restore</button>
            <button className="text-red-100/45 hover:text-red-100" onClick={() => onDelete(snapshot.id)} type="button">Delete</button>
          </div>
        ))}
        {snapshots.length === 0 ? <p className="text-[11px] text-cyan-100/30">Snapshots store layer state references without extra flattened bitmap copies.</p> : null}
      </div>
    </div>
  );
}
