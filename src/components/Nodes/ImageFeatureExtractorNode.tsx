import { memo } from 'react';
import { Eye } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { AppNodeProps } from '../../types/flow';

function ImageFeatureExtractorNodeComponent({ id, data }: AppNodeProps) {
  return (
    <BaseNode
      nodeId={id}
      nodeType="imageFeatureExtractorNode"
      icon={Eye}
      title="Image Feature Extractor"
      hasInput={true}
      hasOutput={true}
      error={data.error}
      statusMessage={data.statusMessage}
      retryState={data.retryState}
    >
      <div className="flex flex-col gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs">
        <div className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-purple-300 font-mono text-center">
          Dominant Color: #1e293b
        </div>
        <div className="mt-1 leading-5 text-gray-400">
          Scans generated panels to extract metadata variables (dimensions, colors, lighting directions) for feedback loops.
        </div>
      </div>
    </BaseNode>
  );
}

export const ImageFeatureExtractorNode = memo(ImageFeatureExtractorNodeComponent);
