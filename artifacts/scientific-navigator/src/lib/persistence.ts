/** Keep the v1 JSON payloads readable by existing installations and the assistant. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function safeRead(key: string): string | null {
  try { return browserStorage()?.getItem(key) ?? null; } catch { return null; }
}

export function preserveRecovery(storage: StorageLike, key: string, raw: string): void {
  // A failed backup must prevent replacement of the damaged original.
  const recoveryKey = `${key}:recovery`;
  if (storage.getItem(recoveryKey) !== raw) storage.setItem(recoveryKey, raw);
}

type Decoder<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

export function decodeCollection<T>(raw: string | null, schema: Decoder<T>): { items: T[]; damaged: boolean } {
  if (raw === null) return { items: [], damaged: false };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { items: [], damaged: true }; }
  // Also accept a future versioned wrapper, while writes retain the original v1 array.
  const source = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1 && 'items' in parsed ? parsed.items : null;
  if (!Array.isArray(source)) return { items: [], damaged: true };
  let damaged = false;
  const items = source.flatMap(value => {
    const result = schema.safeParse(value);
    if (!result.success) { damaged = true; return []; }
    if (JSON.stringify(value) !== JSON.stringify(result.data)) damaged = true;
    return [result.data];
  });
  return { items, damaged };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Apply only edits relative to the caller's base, preserving other tabs' unrelated edits. */
export function mergeCollection<T>(base: T[], local: T[], remote: T[], id: (item: T) => string): T[] {
  const baseById = new Map(base.map(item => [id(item), item]));
  const localById = new Map(local.map(item => [id(item), item]));
  const result = new Map(remote.map(item => [id(item), item]));
  for (const [key, old] of baseById) {
    if (!localById.has(key) && same(result.get(key), old)) result.delete(key);
  }
  for (const [key, item] of localById) {
    const old = baseById.get(key);
    if (old && same(old, item)) continue;
    const other = result.get(key);
    if (old && other && typeof item === 'object' && item && typeof old === 'object') {
      const patch = Object.fromEntries(Object.entries(item).filter(([field, value]) => !same(value, (old as Record<string, unknown>)[field])));
      result.set(key, { ...other, ...patch });
    } else result.set(key, item);
  }
  // Preserve the order of local documents, then append remote additions.
  return [...local.map(item => id(item)), ...result.keys()]
    .filter((key, index, keys) => keys.indexOf(key) === index && result.has(key))
    .map(key => result.get(key)!);
}

export function createCollectionStore<T>(key: string, schema: Decoder<T>, id: (item: T) => string, getStorage = browserStorage) {
  let snapshot: T[] | undefined;
  let base: T[] = [];
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const errorListeners = new Set<(error: unknown) => void>();
  const emit = () => listeners.forEach(listener => listener());
  const readDisk = () => {
    const storage = getStorage();
    if (!storage) return [];
    const raw = storage.getItem(key);
    const decoded = decodeCollection(raw, schema);
    if (decoded.damaged && raw !== null) preserveRecovery(storage, key, raw);
    return decoded.items;
  };
  const get = () => {
    if (!snapshot) {
      try { snapshot = readDisk(); } catch (error) { snapshot = []; errorListeners.forEach(listener => listener(error)); }
      base = snapshot;
    }
    return snapshot;
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    const storage = getStorage();
    if (!storage) throw new Error('Локальное хранилище недоступно. Изменения пока остаются в памяти.');
    const remote = readDisk();
    const merged = mergeCollection(base, get(), remote, id);
    // Retain a conflict snapshot when both tabs changed the same document.
    const conflicts = remote.filter(item => {
      const old = base.find(entry => id(entry) === id(item));
      const local = get().find(entry => id(entry) === id(item));
      return old && local && !same(old, item) && !same(old, local) && !same(local, item);
    });
    if (conflicts.length) storage.setItem(`${key}:conflicts`, JSON.stringify({ savedAt: Date.now(), items: conflicts }));
    storage.setItem(key, JSON.stringify(merged));
    storage.setItem(`${key}:schema-version`, '1');
    pending = false;
    base = merged;
    snapshot = merged;
    emit();
  };
  const safeFlush = () => { try { flush(); } catch (error) { errorListeners.forEach(listener => listener(error)); } };
  const set = (items: T[], debounceMs = 0) => {
    get();
    snapshot = items;
    pending = true;
    emit();
    if (timer) clearTimeout(timer);
    if (debounceMs) timer = setTimeout(safeFlush, debounceMs);
    else flush();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
      if (event.key !== key && event.key !== null) return;
      try {
        const remote = readDisk();
        snapshot = pending ? mergeCollection(base, get(), remote, id) : remote;
        base = remote;
        emit();
      } catch (error) { errorListeners.forEach(listener => listener(error)); }
    });
    window.addEventListener('pagehide', safeFlush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') safeFlush(); });
  }
  return { get, set, flush, safeFlush, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, onError: (listener: (error: unknown) => void) => { errorListeners.add(listener); return () => { errorListeners.delete(listener); }; } };
}
