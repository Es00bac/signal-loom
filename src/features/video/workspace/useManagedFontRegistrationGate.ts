import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bundledFontFaceIdentitySignature,
  ensureBundledFontDependenciesReady,
  type ManagedBundledFontDependency,
} from '../../../lib/bundledFontLibrary';

export type ManagedFontRegistrationGateState =
  | { status: 'ready'; error?: undefined; retry: () => void }
  | { status: 'loading'; error?: undefined; retry: () => void }
  | { status: 'error'; error: string; retry: () => void };

export type ManagedFontDependencyRegistrar = (
  dependencies: readonly ManagedBundledFontDependency[],
) => Promise<unknown>;

export function buildManagedFontDependencySignature(
  dependencies: readonly ManagedBundledFontDependency[],
): string {
  return JSON.stringify(dependencies.map((dependency) => (
    dependency.reference
      ? ['exact', bundledFontFaceIdentitySignature(dependency.reference)]
      : ['issue', dependency.issue.reason, dependency.issue.message, dependency.issue.original]
  )).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}

export function useManagedFontRegistrationGate(
  dependencies: readonly ManagedBundledFontDependency[],
  register: ManagedFontDependencyRegistrar = ensureBundledFontDependenciesReady,
): ManagedFontRegistrationGateState {
  const signature = buildManagedFontDependencySignature(dependencies);
  const [retryNonce, setRetryNonce] = useState(0);
  const [settled, setSettled] = useState<{
    signature: string;
    status: 'ready' | 'loading' | 'error';
    error?: string;
  }>(() => ({ signature, status: dependencies.length > 0 ? 'loading' : 'ready' }));
  const generation = useRef({ signature, value: 0 });

  if (generation.current.signature !== signature) {
    generation.current = { signature, value: generation.current.value + 1 };
  }
  const currentGeneration = generation.current.value;

  useEffect(() => {
    const requestGeneration = currentGeneration;
    if (dependencies.length === 0) {
      setSettled({ signature, status: 'ready' });
      return undefined;
    }
    setSettled({ signature, status: 'loading' });
    let active = true;
    void register(dependencies).then(
      () => {
        if (active && generation.current.signature === signature && generation.current.value === requestGeneration) {
          setSettled({ signature, status: 'ready' });
        }
      },
      (error) => {
        if (active && generation.current.signature === signature && generation.current.value === requestGeneration) {
          setSettled({
            signature,
            status: 'error',
            error: error instanceof Error ? error.message : 'A bundled font face is unavailable.',
          });
        }
      },
    );
    return () => { active = false; };
  }, [currentGeneration, dependencies, register, retryNonce, signature]);

  const retry = useCallback(() => {
    setSettled({ signature, status: dependencies.length > 0 ? 'loading' : 'ready' });
    setRetryNonce((value) => value + 1);
  }, [dependencies.length, signature]);

  if (settled.signature !== signature) {
    return dependencies.length > 0 ? { status: 'loading', retry } : { status: 'ready', retry };
  }
  if (settled.status === 'error') return { status: 'error', error: settled.error ?? 'A bundled font face is unavailable.', retry };
  return { status: settled.status, retry };
}
