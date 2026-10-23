const REQUEST_TIMEOUT_MS = 15_000;

export async function fetchOfficialText(url: string, sourceName: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml", "User-Agent": "ScientificNavigator/1.0" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`${sourceName}: не удалось подключиться к ${new URL(url).hostname}.`);
  }
  if (!response.ok) throw new Error(`${sourceName} вернул HTTP ${response.status}.`);
  if (!/text\/html|application\/xhtml\+xml|application\/rss\+xml|application\/xml|text\/xml/i.test(response.headers.get("content-type") ?? "")) {
    throw new Error(`${sourceName} вернул неподдерживаемый формат данных.`);
  }
  return response.text();
}

export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Concurrency must be a positive integer.");
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

type SourceResult = {
  source: { state: "connected" | "limited" | "error"; checkedAt: string | null; openCount: number; message: string };
  opportunities: unknown[];
};

/** A failed refresh retains evidence of the last success, but never serves its opportunities as current. */
export class GrantSourceCache<T extends SourceResult> {
  private readonly entries = new Map<string, { loadedAt: number; value: T }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 8) {}

  async load(id: string, loader: () => Promise<T>, options: { nowMs: number; ttlMs: number; force?: boolean }): Promise<T> {
    const previous = this.entries.get(id);
    if (previous && !options.force && options.nowMs >= previous.loadedAt && options.nowMs - previous.loadedAt < options.ttlMs) return previous.value;
    const pending = this.inFlight.get(id);
    if (pending) return pending;
    const request = (async () => {
      const result = await loader();
      if (result.source.state !== "error") {
        this.entries.delete(id);
        this.entries.set(id, { loadedAt: options.nowMs, value: result });
        while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
        return result;
      }
      if (!previous) return result;
      return {
        ...result,
        source: {
          ...result.source,
          checkedAt: previous.value.source.checkedAt,
          message: `${result.source.message} Последняя успешная проверка: ${previous.value.source.checkedAt ?? "неизвестно"}; прежние объявления (${previous.value.opportunities.length}) не показаны, их актуальность не подтверждена.`,
        },
        opportunities: [],
      };
    })();
    this.inFlight.set(id, request);
    try { return await request; } finally { this.inFlight.delete(id); }
  }
}
