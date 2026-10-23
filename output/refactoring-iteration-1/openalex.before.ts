import type { ScientificWork } from "@workspace/api-zod";
import type {
  ScientificSource,
  ScientificSourceSearchResult,
} from "./types";

const OPENALEX_WORKS_URL = "https://api.openalex.org/works";
const RESULTS_PER_SEARCH = 50;
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
    readonly kind: "network" | "http" | "invalid_response" | "not_found",
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
  const positionedWords: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (
        typeof position === "number" &&
        Number.isInteger(position) &&
        position >= 0 &&
        position <= 20_000
      ) {
        positionedWords.push({ word, position });
      }
    }
  }
  if (positionedWords.length === 0) return null;
  positionedWords.sort((left, right) => left.position - right.position);
  const tokens: string[] = [];
  for (const entry of positionedWords) tokens[entry.position] = entry.word;
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

class OpenAlexSource implements ScientificSource {
  async searchWorks(
    query: string,
    options?: { includeAbstract?: boolean },
  ): Promise<ScientificSourceSearchResult> {
    const url = new URL(OPENALEX_WORKS_URL);
    url.searchParams.set("search", query);
    url.searchParams.set("per-page", String(RESULTS_PER_SEARCH));
    url.searchParams.set("sort", "relevance_score:desc");
    url.searchParams.set(
      "select",
      options?.includeAbstract ? SELECT_FIELDS_WITH_ABSTRACT : SELECT_FIELDS,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ScientificNavigator/1.0",
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ScientificSourceError("network");
    }

    if (!response.ok) {
      throw new ScientificSourceError("http", response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ScientificSourceError("invalid_response");
    }

    try {
      return parseOpenAlexResponse(payload);
    } catch {
      throw new ScientificSourceError("invalid_response");
    }
  }

  async getWorkById(id: string): Promise<ScientificWork | null> {
      const normalizedId = id.match(/^(?:https:\/\/openalex\.org\/)?(W\d+)$/i)?.[1];
      if (!normalizedId) {
        throw new ScientificSourceError("invalid_response");
      }
      const url = new URL(
        `${OPENALEX_WORKS_URL}/${encodeURIComponent(normalizedId.toUpperCase())}`,
      );
      url.searchParams.set("select", SELECT_FIELDS_WITH_ABSTRACT);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "ScientificNavigator/1.0",
          },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new ScientificSourceError("network");
      }
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new ScientificSourceError("http", response.status);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ScientificSourceError("invalid_response");
      }
      const work = normalizeWork(payload);
      if (!work) throw new ScientificSourceError("invalid_response");
      return work;
  }
}

export const openAlexSource: ScientificSource = new OpenAlexSource();