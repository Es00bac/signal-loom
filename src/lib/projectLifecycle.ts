/**
 * One renderer-owned sequence for every whole-project transition. External opens, File > Open,
 * File > New, and browser project imports all enter here so a slow completion cannot publish an
 * older project after a newer transition has already replaced the live stores.
 */
let projectLifecycleTail: Promise<void> = Promise.resolve();

export function runProjectLifecycleTransition<T>(operation: () => Promise<T> | T): Promise<T> {
  const result = projectLifecycleTail.then(operation, operation);
  projectLifecycleTail = result.then(() => undefined, () => undefined);
  return result;
}

/** Test-only reset; production never rewinds the lifecycle sequence. */
export function resetProjectLifecycleForTests(): void {
  if (import.meta.env.MODE !== 'test') return;
  projectLifecycleTail = Promise.resolve();
}
