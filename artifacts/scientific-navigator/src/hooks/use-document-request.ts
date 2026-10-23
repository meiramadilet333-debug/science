import { useCallback, useEffect, useRef } from 'react';

export function sameRevision(current: { id: string; revision?: number }, expected: { id: string; revision?: number }): boolean {
  return current.id === expected.id && (current.revision ?? 0) === (expected.revision ?? 0);
}

/** A result belongs to one document revision and one request attempt. */
export function useDocumentRequest(id: string, revision = 0) {
  const identity = useRef({ id, revision });
  identity.current = { id, revision };
  const active = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { active.current?.abort(); active.current = null; }, []);
  useEffect(() => cancel, [id, revision, cancel]);
  const begin = () => {
    cancel();
    const controller = new AbortController();
    const expected = { ...identity.current };
    active.current = controller;
    return {
      signal: controller.signal,
      expected,
      isCurrent: () => active.current === controller && !controller.signal.aborted && sameRevision(identity.current, expected),
    };
  };
  return { begin, cancel };
}
