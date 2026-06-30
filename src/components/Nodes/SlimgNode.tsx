import { memo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Handle, Position } from '@xyflow/react';
import { FileImage, ImageOff, Loader2, Save } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { collectUpstreamImageInputForHandles, useFlowStore } from '../../store/flowStore';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import { runSlimgNode } from '../../lib/slimgNodeActions';
import { showUserNotice } from '../../shared/ui/userNotice';
import type { AppNodeProps } from '../../types/flow';

function PreviewBox({ label, url }: { label: string; url: string | undefined }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-gray-700/70 bg-[#0b1018]">
        {url ? (
          <img src={url} alt={`${label} image`} className="h-full w-full object-contain" />
        ) : (
          <ImageOff size={18} className="text-gray-600" />
        )}
      </div>
    </div>
  );
}

// The .slimg node bridges Flow → Image: it captures the connected image into a real, editable .slimg
// document (save-as dialog + opens a tab in Image), then outputs the bound document's flattened image
// — which stays live (re-flattens as you edit it in Image; see useSlimgLiveSync) and falls back to the
// last snapshot if the document is closed.
function SlimgNodeComponent({ id, data }: AppNodeProps) {
  const inputUrl = useFlowStore(
    useShallow((state) =>
      collectUpstreamImageInputForHandles(
        id,
        ['image'],
        new Map(state.nodes.map((node) => [node.id, node])),
        state.edges,
      ),
    ),
  );
  const outputUrl = typeof data.result === 'string' && data.result ? data.result : undefined;
  const boundDocId = typeof data.slimgBoundDocId === 'string' ? data.slimgBoundDocId : undefined;
  const isLive = useImageEditorStore(
    useShallow((state) => Boolean(boundDocId) && state.documents.some((doc) => doc.id === boundDocId)),
  );
  // Live count of committed edits on the BOUND document — rises as you paint the doc this node tracks.
  // If it stays flat while you draw, the strokes are landing on a different document than the node is
  // bound to (the real failure mode after an app restart re-opens the .slimg with a fresh id).
  const boundEditCount = useImageEditorStore((state) =>
    boundDocId ? (state.undoStacks[boundDocId]?.length ?? 0) + (state.redoStacks[boundDocId]?.length ?? 0) : 0,
  );
  const [busy, setBusy] = useState(false);

  const handleRun = async () => {
    if (!inputUrl || busy) return;
    setBusy(true);
    try {
      const title =
        typeof data.customTitle === 'string' && data.customTitle.trim() ? data.customTitle.trim() : undefined;
      const result = await runSlimgNode({ inputImageUrl: inputUrl, title });
      data.onChange?.('slimgBoundDocId', result.docId);
      data.onChange?.('result', result.flattened);
    } catch (error) {
      showUserNotice(error instanceof Error ? error.message : 'Could not save the .slimg file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const status = !boundDocId
    ? 'Run to save a .slimg and open it in Image.'
    : isLive
      ? `Live · ${boundEditCount} edit${boundEditCount === 1 ? '' : 's'} in Image`
      : 'Snapshot — the .slimg was closed in Image. Re-save to re-open + re-bind.';

  return (
    <BaseNode
      nodeId={id}
      nodeType="slimgNode"
      icon={FileImage}
      title=".slimg"
      hasInput={false}
      hasOutput
      error={data.error}
      statusMessage={data.statusMessage}
      retryState={data.retryState}
      customHandles={(
        <Handle
          id="image"
          type="target"
          position={Position.Left}
          className="!h-6 !w-6 !border-[3px] !border-[#1e2027] !-ml-3 !bg-sky-400"
          style={{ top: 96 }}
          title="Image input"
        />
      )}
    >
      <div className="w-[220px] space-y-3 rounded-lg border border-sky-400/20 bg-sky-400/5 p-3 text-xs">
        <button
          type="button"
          onClick={handleRun}
          disabled={!inputUrl || busy}
          className={withFlowNodeInteractionClasses(
            'flex w-full items-center justify-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-2 font-semibold text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50',
          )}
          title={inputUrl ? 'Save as .slimg and open in Image' : 'Connect an image first'}
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {busy ? 'Saving…' : boundDocId ? 'Re-save .slimg' : 'Save .slimg & Open'}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <PreviewBox label="Input" url={inputUrl} />
          <PreviewBox label="Output" url={outputUrl} />
        </div>

        <p className="text-[10px] leading-4 text-gray-400">{status}</p>
      </div>
    </BaseNode>
  );
}

export const SlimgNode = memo(SlimgNodeComponent);
