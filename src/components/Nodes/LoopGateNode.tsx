import { memo } from 'react';
import { Position } from '@xyflow/react';
import { RefreshCw } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { TypedHandle as Handle } from './TypedHandle';
import { useFlowStore } from '../../store/flowStore';
import type { AppNodeProps } from '../../types/flow';

function LoopGateNodeComponent({ id, data }: AppNodeProps) {
  const patchNodeData = useFlowStore((state) => state.patchNodeData);
  const maxIterations = Number.isInteger(data.maxIterations) ? Math.max(1, Number(data.maxIterations)) : 5;

  const handleMaxIterationsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMax = parseInt(event.target.value, 10);
    if (!isNaN(nextMax)) {
      patchNodeData(id, { maxIterations: Math.max(1, nextMax) });
    }
  };

  const customHandles = (
    <>
      <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-around pointer-events-none pl-1">
        <span className="text-[9px] font-bold text-gray-500 ml-2">INPUT</span>
        <span className="text-[9px] font-bold text-gray-500 ml-2">IF (?)</span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!rounded-none"
        style={{ top: '32%', background: '#374151', width: '10px', height: '10px' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="condition"
        className="!rounded-none"
        style={{ top: '68%', background: '#fbbf24', width: '10px', height: '10px' }}
      />
    </>
  );

  return (
    <BaseNode
      nodeId={id}
      nodeType="loopGateNode"
      icon={RefreshCw}
      title="While Loop / Gate"
      hasInput={false}
      hasOutput={true}
      customHandles={customHandles}
      error={data.error}
      statusMessage={data.statusMessage}
      retryState={data.retryState}
    >
      <div className="flex flex-col gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-gray-200">Max Iterations:</span>
          <input
            type="number"
            min="1"
            max="100"
            value={maxIterations}
            onChange={handleMaxIterationsChange}
            className="w-16 rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-center font-bold text-gray-100 focus:border-purple-400 focus:outline-none"
          />
        </div>
        <div className="mt-1 leading-5 text-gray-400">
          Repeats or gates downstream execution in a loop while the connected <span className="text-amber-400">IF (?)</span> condition is <span className="text-emerald-400 font-bold">"true"</span>, up to a maximum of <span className="text-purple-400 font-bold">{maxIterations}</span> times.
        </div>
      </div>
    </BaseNode>
  );
}

export const LoopGateNode = memo(LoopGateNodeComponent);
