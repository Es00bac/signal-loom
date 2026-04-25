import type { NodeResultAttempt, ResultType, UsageTelemetry } from '../types/flow';

interface AttemptPayload {
  result: string;
  resultType: ResultType;
  statusMessage: string;
  usage?: UsageTelemetry;
}

export function appendResultAttempt(
  attempts: NodeResultAttempt[],
  payload: AttemptPayload,
): { attempts: NodeResultAttempt[]; selectedAttemptId: string } {
  const nextAttempt: NodeResultAttempt = {
    id: crypto.randomUUID(),
    result: payload.result,
    resultType: payload.resultType,
    statusMessage: payload.statusMessage,
    createdAt: new Date().toISOString(),
    usage: payload.usage,
  };

  return {
    attempts: [...attempts, nextAttempt],
    selectedAttemptId: nextAttempt.id,
  };
}

export function resolveSelectedResultAttempt(
  attempts: NodeResultAttempt[],
  attemptId: string,
): NodeResultAttempt | undefined {
  return attempts.find((attempt) => attempt.id === attemptId);
}
