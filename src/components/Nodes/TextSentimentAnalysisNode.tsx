import { memo } from 'react';
import { Eye } from 'lucide-react';
import { BaseNode } from './BaseNode';
import type { AppNodeProps } from '../../types/flow';

function TextSentimentAnalysisNodeComponent({ id, data }: AppNodeProps) {
  const result = (data.result as string) ?? '0.00 (Neutral)';

  return (
    <BaseNode
      nodeId={id}
      nodeType="textSentimentAnalysisNode"
      icon={Eye}
      title="Text Sentiment Analyzer"
      hasInput={true}
      hasOutput={true}
      error={data.error}
      statusMessage={data.statusMessage}
      retryState={data.retryState}
    >
      <div className="flex flex-col gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs">
        <div className="flex flex-col gap-1.5">
          <label className="font-semibold text-gray-400">Current Score:</label>
          <div className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-purple-300 font-mono text-center">
            {result}
          </div>
        </div>
        <div className="mt-1 leading-5 text-gray-400">
          Analyzes dialogue descriptions for emotional indicators (anger, joy, terror), outputting values to guide visual formatting.
        </div>
      </div>
    </BaseNode>
  );
}

export const TextSentimentAnalysisNode = memo(TextSentimentAnalysisNodeComponent);
