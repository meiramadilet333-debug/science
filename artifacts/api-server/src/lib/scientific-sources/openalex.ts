import { BoundedAsyncCache, CacheCapacityError } from "../bounded-async-cache";
import { operationSignal } from "../operation-context";
import type { ScientificWork } from "@workspace/api-zod";
import type {
  ScientificSource,
  ScientificSourceSearchResult,
  ScientificSourceOptions,
} from "./types";

const OPENALEX_WORKS_URL = "https://api.openalex.org/works";
const RESULTS_PER_SEARCH = 12;
const MAX_RESULTS_PER_SEARCH = 20;
const SELECT_FIELDS = [
  "id",
  "doi",
  "title",
  "publication_year",
  "cited_by_count",
  "authorships",
  "primary_location",
  "topics",
  "primary_topic",
].join(",");
const SELECT_FIELDS_WITH_ABSTRACT = `${SELECT_FIELDS},abstract_inverted_index`;

export class ScientificSourceError extends Error {
  constructor(
    readonly kind: "network" | "http" | "invalid_response" | "not_found" | "timeout" | "aborted" | "input",
    readonly statusCode?: number,
  ) {
    super("Scientific source request failed.");
    this.name = "ScientificSourceError";
  }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function getAuthors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((authorship) => {
    const author = asRecord(asRecord(authorship)?.author);
    const name = stringValue(author?.display_name);
    return name ? [name] : [];
  });
}

function getTopics(work: UnknownRecord): string[] {
  const topicNames = Array.isArray(work.topics)
    ? work.topics.flatMap((topic) => {
        const name = stringValue(asRecord(topic)?.display_name);
        return name ? [name] : [];
      })
    : [];
  const primaryTopic = stringValue(
    asRecord(work.primary_topic)?.display_name,
  );

  return [...new Set(primaryTopic ? [primaryTopic, ...topicNames] : topicNames)];
}

function reconstructAbstract(value: unknown): string | null {
  const index = asRecord(value);
  if (!index) return null;
  const tokens: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (
        typeof position === "number" &&
        Number.isInteger(position) &&
        position >= 0 &&
        position <= 20_000
      ) {
        // Later entries win for duplicate positions, as in the stable-sort version.
        tokens[position] = word;
      }
    }
  }
  return tokens.filter(Boolean).join(" ").slice(0, 8_000) || null;
}

function normalizeWork(value: unknown): ScientificWork | null {
  const work = asRecord(value);
  const id = stringValue(work?.id);
  const title = stringValue(work?.title);
  if (!work || !id || !title) return null;

  const primaryLocation = asRecord(work.primary_location);
  const source = asRecord(primaryLocation?.source);
  const doi = stringValue(work.doi);
  const landingPage = stringValue(primaryLocation?.landing_page_url);

  return {
    id,
    title,
    authors: getAuthors(work.authorships),
    year: integerValue(work.publication_year),
    sourceName:
      stringValue(source?.display_name) ??
      stringValue(primaryLocation?.raw_source_name),
    citationCount: integerValue(work.cited_by_count),
    doi,
    url: doi ?? landingPage ?? id,
    topics: getTopics(work),
    abstract: reconstructAbstract(work.abstract_inverted_index),
  };
}

function parseOpenAlexResponse(
  payload: unknown,
): ScientificSourceSearchResult {
  const response = asRecord(payload);
  const meta = asRecord(response?.meta);
  if (
    !response ||
    !meta ||
    typeof meta.count !== "number" ||
    !Number.isInteger(meta.count) ||
    meta.count < 0 ||
    !Array.isArray(response.results)
  ) {
    throw new Error("OpenAlex returned an unexpected response format");
  }

  return {
    totalCount: meta.count,
    works: response.results.flatMap((item) => {
      const normalized = normalizeWork(item);
      return normalized ? [normalized] : [];
    }),
  };
}

export class OpenAlexSource implements ScientificSource {
  private readonly searches: BoundedAsyncCache<ScientificSourceSearchResult>;
  private readonly metadata: BoundedAsyncCache<ScientificWork | null>;
  private readonly fetcher: typeof fetch;
  constructor(options: { fetcher?: typeof fetch; now?: () => number; ttlMs?: number;
    maxEntries?: number; maxInFlight?: number } = {}) {
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    const shared = { ttlMs: options.ttlMs ?? 300_000, now: options.now,
      maxInFlight: options.maxInFlight ?? 8 };
    this.searches = new BoundedAsyncCache({ ...shared, maxEntries: options.maxEntries ?? 64 });
    this.metadata = new BoundedAsyncCache({ ...shared, maxEntries: options.maxEntries ?? 256 });
  }

  private async cached<T>(cache: BoundedAsyncCache<T>, key: string,
    signal: AbortSignal, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
    try { return await cache.get(key, signal, load); }
    catch (error) {
      if (signal.aborted) throw new ScientificSourceError(signal.reason?.name === "TimeoutError" ? "timeout" : "aborted");
      if (error instanceof CacheCapacityError) throw new ScientificSourceError("http", 429);
      throw error;
    }
  }

  private async request(url: URL, callerSignal: AbortSignal): Promise<unknown> {
    const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(20_000)]);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Accept: "application/json", "User-Agent": "ScientificNavigator/1.0" }, signal,
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new ScientificSourceError("http", response.status);
      try { return await response.json(); }
      catch (error) {
        if (signal.aborted) throw error;
        throw new ScientificSourceError("invalid_response");
      }
    } catch (error) {
      if (signal.aborted) throw new ScientificSourceError(signal.reason?.name === "TimeoutError" ? "timeout" : "aborted");
      if (error instanceof ScientificSourceError) throw error;
      throw new ScientificSourceError("network");
    }
  }

  async searchWorks(query: string, options: ScientificSourceOptions = {}): Promise<ScientificSourceSearchResult> {
    const normalizedQuery = query.trim().replace(/\s+/g, " ");
    if (!normalizedQuery) throw new ScientificSourceError("input");
    const limit = Number.isFinite(options.limit)
      ? Math.max(1, Math.min(MAX_RESULTS_PER_SEARCH, Math.floor(options.limit!))) : RESULTS_PER_SEARCH;
    const url = new URL(OPENALEX_WORKS_URL);
    url.searchParams.set("search", normalizedQuery);
    url.searchParams.set("per-page", String(limit));
    url.searchParams.set("sort", "relevance_score:desc");
    url.searchParams.set("select", options.includeAbstract ? SELECT_FIELDS_WITH_ABSTRACT : SELECT_FIELDS);
    const signal = operationSignal(options.signal);
    const key = JSON.stringify([normalizedQuery.toLowerCase(), limit, Boolean(options.includeAbstract)]);
    return this.cached(this.searches, key, signal, async sharedSignal => {
      const payload = await this.request(url, sharedSignal);
      try {
        const result = parseOpenAlexResponse(payload);
        return { ...result, works: result.works.slice(0, limit) };
      } catch { throw new ScientificSourceError("invalid_response"); }
    });
  }

  async getWorkById(id: string, options: { signal?: AbortSignal } = {}): Promise<ScientificWork | null> {
    const normalizedId = id.trim().match(/^(?:https:\/\/openalex\.org\/)?(W\d+)$/i)?.[1]?.toUpperCase();
    if (!normalizedId) throw new ScientificSourceError("input");
    const signal = operationSignal(options.signal);
    return this.cached(this.metadata, normalizedId, signal, async sharedSignal => {
      const url = new URL(OPENALEX_WORKS_URL + "/" + encodeURIComponent(normalizedId));
      url.searchParams.set("select", SELECT_FIELDS_WITH_ABSTRACT);
      const payload = await this.request(url, sharedSignal);
      if (payload === null) return null;
      const work = normalizeWork(payload);
      if (!work) throw new ScientificSourceError("invalid_response");
      return work;
    });
  }
}

export const openAlexSource: ScientificSource = new OpenAlexSource();
