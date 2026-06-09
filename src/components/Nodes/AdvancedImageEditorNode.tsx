import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image as ImageIcon } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { AppNodeProps } from '../../types/flow';
import { createEmptyImageDocument, useImageEditorStore } from '../../store/imageEditorStore';
import { useEditorStore } from '../../store/editorStore';

function AdvancedImageEditorNode({ data, id }: AppNodeProps) {
  const setWorkspaceView = useEditorStore((s) => s.setWorkspaceView);
  const openDocument = useImageEditorStore((s) => s.openDocument);

  const handleOpenInEditor = useCallback(() => {
    openDocument(
      createEmptyImageDocument({
        id: `doc-from-node-${id}`,
        title: data.result ? 'Edited Image' : 'New Edit',
        width: 800,
        height: 600,
      }),
    );
    setWorkspaceView('image');
  }, [id, data.result, openDocument, setWorkspaceView]);

  return (
    <BaseNode
      nodeId={id}
      nodeType="advancedImageEditor"
      icon={ImageIcon}
      title="Image Editor"
      customHandles={
        <>
          <Handle type="target" position={Position.Left} id="sourceImage" style={{ top: '30%' }} />
          <Handle type="target" position={Position.Left} id="mask" style={{ top: '50%' }} />
          <Handle type="target" position={Position.Left} id="reference" style={{ top: '70%' }} />
          <Handle type="source" position={Position.Right} id="editedImage" style={{ top: '35%' }} />
          <Handle type="source" position={Position.Right} id="maskOutput" style={{ top: '65%' }} />
        </>
      }
    >
      <div className="my-2 flex min-h-[60px] items-center justify-center rounded bg-[#14151d] text-xs text-cyan-100/40">
        {data.result ? 'Preview' : 'No image'}
      </div>

      <button
        className="w-full rounded border border-cyan-300/10 bg-[#252630] px-2 py-1 text-xs text-cyan-400 hover:bg-[#2a2b33]"
        onClick={handleOpenInEditor}
        type="button"
      >
        Open in Image Editor
      </button>
    </BaseNode>
  );
}

export const AdvancedImageEditorNodeComponent = memo(AdvancedImageEditorNode);
