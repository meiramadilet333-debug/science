import type { ScientificWork } from "@workspace/api-zod";

export interface ScientificSourceSearchResult {
  totalCount: number;
  works: ScientificWork[];
}

export interface ScientificSourceOptions {
  includeAbstract?: boolean;
  limit?: number;
  signal?: AbortSignal;
}

export interface ScientificSource {
  searchWorks(
    query: string,
    options?: ScientificSourceOptions,
  ): Promise<ScientificSourceSearchResult>;
  getWorkById(id: string, options?: { signal?: AbortSignal }): Promise<ScientificWork | null>;
}