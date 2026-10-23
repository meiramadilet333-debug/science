import { type Dispatch, type SetStateAction, useCallback, useEffect, useSyncExternalStore } from 'react';
import type { createCollectionStore } from '../lib/persistence';

export function usePersistedCollection<T>(store: ReturnType<typeof createCollectionStore<T>>, onError?: (message: string) => void): [T[], Dispatch<SetStateAction<T[]>>] {
  const items = useSyncExternalStore(store.subscribe, store.get, store.get);
  useEffect(() => {
    const unsubscribe = store.onError(error => onError?.(error instanceof Error ? error.message : 'Не удалось сохранить изменения в браузере.'));
    // Route changes and unmounts flush the latest memory snapshot synchronously.
    return () => { store.safeFlush(); unsubscribe(); };
  }, [store, onError]);
  const update = useCallback<Dispatch<SetStateAction<T[]>>>(next => {
    try {
      store.set(typeof next === 'function' ? next(store.get()) : next, 350);
      onError?.('');
    } catch (error) { onError?.(error instanceof Error ? error.message : 'Не удалось сохранить изменения в браузере.'); }
  }, [store, onError]);
  return [items, update];
}
