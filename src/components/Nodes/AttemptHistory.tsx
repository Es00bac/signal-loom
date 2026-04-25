import { Music, Type } from 'lucide-react';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import type { NodeResultAttempt } from '../../types/flow';

interface AttemptHistoryProps {
  attempts?: NodeResultAttempt[];
  selectedAttemptId?: string;
  onSelectAttempt?: (attemptId: string) => void;
}

export function AttemptHistory({
  attempts = [],
  selectedAttemptId,
  onSelectAttempt,
}: AttemptHistoryProps) {
  if (attempts.length < 2 || !onSelectAttempt) {
    return null;
  }

  const useGridLayout = attempts.length > 6;

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Runs</div>
      <div className={useGridLayout ? 'grid grid-cols-4 gap-1.5' : 'flex gap-1.5 overflow-x-auto pb-1'}>
        {attempts.map((attempt, index) => {
          const isActive = attempt.id === selectedAttemptId;

          return (
            <button
              key={attempt.id}
              className={withFlowNodeInteractionClasses(`overflow-hidden rounded-lg border transition-colors ${
                isActive
                  ? 'border-blue-400 bg-blue-500/10'
                  : 'border-gray-700/60 bg-[#111217]/35 hover:border-gray-500'
              } ${useGridLayout ? 'aspect-square min-w-0' : 'aspect-square w-12 shrink-0'}`)}
              onClick={() => onSelectAttempt(attempt.id)}
              title={`Run ${index + 1} · ${new Date(attempt.createdAt).toLocaleString()}`}
              type="button"
            >
              {renderAttemptPreview(attempt, index)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function renderAttemptPreview(attempt: NodeResultAttempt, index: number) {
  if (attempt.resultType === 'image') {
    return <img alt={`Run ${index + 1}`} className="h-full w-full object-cover" src={attempt.result} />;
  }

  if (attempt.resultType === 'video') {
    return (
      <video
        className="h-full w-full object-cover"
        muted
        playsInline
        preload="metadata"
        src={attempt.result}
      />
    );
  }

  const Icon = attempt.resultType === 'audio' ? Music : Type;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-200">
      {attempt.resultType === 'audio' ? <Icon size={14} /> : <Icon size={13} />}
      <span className="text-[10px] font-semibold">R{index + 1}</span>
    </div>
  );
}
