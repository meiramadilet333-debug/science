type Flight<T> = { controller: AbortController; promise: Promise<T>; consumers: number };

export class CacheCapacityError extends Error {}

/** Bounded TTL/LRU cache with single-flight loading and independent caller cancellation. */
export class BoundedAsyncCache<T> {
  private readonly values = new Map<string, { value: T; expires: number }>();
  private readonly flights = new Map<string, Flight<T>>();
  constructor(private readonly options: {
    ttlMs: number; maxEntries: number; maxInFlight: number; now?: () => number;
  }) {}

  async get(key: string, signal: AbortSignal, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const now = (this.options.now ?? Date.now)();
    const cached = this.values.get(key);
    if (cached && cached.expires > now) {
      this.values.delete(key); this.values.set(key, cached);
      return structuredClone(cached.value);
    }
    this.values.delete(key);
    let flight = this.flights.get(key);
    if (!flight) {
      if (this.flights.size >= this.options.maxInFlight) throw new CacheCapacityError("Too many pending metadata requests");
      const controller = new AbortController();
      const created: Flight<T> = { controller, consumers: 0, promise: undefined as unknown as Promise<T> };
      created.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }).then((value) => {
        if (!controller.signal.aborted) {
          this.values.set(key, { value, expires: (this.options.now ?? Date.now)() + this.options.ttlMs });
          while (this.values.size > this.options.maxEntries) {
            this.values.delete(this.values.keys().next().value!);
          }
        }
        return value;
      }).finally(() => {
        if (this.flights.get(key) === created) this.flights.delete(key);
      });
      flight = created;
      this.flights.set(key, flight);
    }
    flight.consumers++;
    const current = flight;
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown, value?: T) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        if (--current.consumers === 0) {
          current.controller.abort();
          if (this.flights.get(key) === current) this.flights.delete(key);
        }
        if (error !== undefined) reject(error);
        else resolve(structuredClone(value as T));
      };
      const abort = () => finish(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      current.promise.then(value => finish(undefined, value), error => finish(error));
      if (signal.aborted) abort();
    });
  }
}
