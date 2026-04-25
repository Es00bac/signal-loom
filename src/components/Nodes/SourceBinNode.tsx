import { memo } from 'react';
import { Archive, ExternalLink } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import { useEditorStore } from '../../store/editorStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import type { AppNodeProps } from '../../types/flow';

const actionButtonClassName = withFlowNodeInteractionClasses(
  'inline-flex items-center gap-1 rounded-lg border border-gray-700/60 bg-[#111217]/40 px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white',
);

function SourceBinNodeComponent({ id }: AppNodeProps) {
  const openEditorForSourceBin = useEditorStore((state) => state.openEditorForSourceBin);
  const items = useSourceBinStore((state) => state.items);
  const counts = items.reduce<Record<string, number>>((current, item) => {
    current[item.kind] = (current[item.kind] ?? 0) + 1;
    return current;
  }, {});

  return (
    <BaseNode
      icon={Archive}
      nodeType="sourceBin"
      title="Source Bin"
      hasOutput={false}
      footerActions={
        <button
          className={actionButtonClassName}
          onClick={() => openEditorForSourceBin(id)}
          type="button"
        >
          <ExternalLink size={12} />
          Open Editor
        </button>
      }
    >
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-2 text-[11px] text-blue-100">
        Connect image, video, audio, text, or composition outputs here to feed the shared persistent source library. Multiple source-bin nodes act as parallel entry points into the same saved bin.
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CountCard label="Items" value={items.length} />
        <CountCard label="Video" value={(counts.video ?? 0) + (counts.composition ?? 0)} />
        <CountCard label="Image" value={counts.image ?? 0} />
        <CountCard label="Audio" value={counts.audio ?? 0} />
      </div>

      <div className="rounded-lg border border-gray-700/60 bg-[#111217]/35 p-2">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
          Contents
        </div>
        <div className="space-y-1">
          {items.length > 0 ? (
            items.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-md border border-gray-700/60 bg-[#0d0f15] px-2 py-1.5 text-[11px] text-gray-300">
                <span className="mr-2 uppercase tracking-[0.14em] text-gray-500">{item.kind}</span>
                {item.label}
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-gray-700/60 bg-[#0d0f15] px-2 py-3 text-center text-[11px] text-gray-500">
              Connect or import media into the shared bin
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}

export const SourceBinNode = memo(SourceBinNodeComponent);

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-700/60 bg-[#111217]/35 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-100">{value}</div>
    </div>
  );
}
