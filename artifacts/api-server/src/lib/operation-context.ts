import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";

const operations = new AsyncLocalStorage<{ signal: AbortSignal }>();
const activeControllers = new Set<AbortController>();

export function integerSetting(name: string, fallback: number, max = 300_000): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback;
}

export function operationSignal(signal?: AbortSignal, timeoutMs?: number): AbortSignal {
  const signals = [operations.getStore()?.signal, signal,
    timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined].filter(
    (value): value is AbortSignal => value !== undefined,
  );
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

export function runWithOperationSignal<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  return operations.run({ signal }, operation);
}

export function abortActiveOperations(): void {
  for (const controller of activeControllers) controller.abort();
}

export const operationContext: RequestHandler = (req, res, next) => {
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(integerSetting("REQUEST_DEADLINE_MS", 120_000)),
  ]);
  activeControllers.add(controller);
  const onAborted = () => controller.abort();
  const onClose = () => {
    if (!res.writableFinished) controller.abort();
    cleanup();
  };
  const cleanup = () => {
    activeControllers.delete(controller);
    req.off("aborted", onAborted);
    res.off("close", onClose);
    res.off("finish", cleanup);
  };
  // IncomingMessage.close also fires after a normally consumed request body.
  req.once("aborted", onAborted);
  res.once("close", onClose);
  res.once("finish", cleanup);
  operations.run({ signal }, next);
};

/** Ordered, bounded parallel work. Workers stop scheduling after cancellation/failure. */
export async function mapConcurrent<T, R>(
  values: readonly T[], concurrency: number, map: (value: T) => Promise<R>,
  signal = operationSignal(),
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(values.length, Math.max(1, Math.floor(concurrency))) }, async () => {
    while (!failed && cursor < values.length) {
      signal.throwIfAborted();
      const index = cursor++;
      try { results[index] = await map(values[index]); }
      catch (error) { failed = true; throw error; }
    }
  }));
  return results;
}
