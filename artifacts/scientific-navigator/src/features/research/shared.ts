import { createCollectionStore } from '@/lib/persistence';
import { articleSchema, draftSchema, sourceSchema, publicationSchema, researchProfileSchema } from './schemas';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { analyzeScientificIdea, analyzeScientificSource, assistScientificArticleSection, checkScientificIdea, preparePublicationChecklist, prepareScientificArticle, prepareScientificIdea, recommendScientificTopics, searchScientificSources, type ArticleSection, type CheckScientificIdeaResult, type PublicationChecklist, type ScientificArticlePlan, type ScientificArticleSectionGuidance, type ScientificIdeaAnalysis, type ScientificSourceAnalysis, type ScientificWork, type TopicRecommendationRequest, type TopicRecommendationResult } from '@workspace/api-client-react';
export const DRAFTS_KEY = 'nauchny-navigator-drafts-v1';
export const SOURCE_LIBRARY_KEY = 'nauchny-navigator-source-library-v1';
export const ARTICLE_DRAFTS_KEY = 'nauchny-navigator-article-drafts-v1';
export const PUBLICATION_PREP_KEY = 'nauchny-navigator-publication-prep-v1';
export const RESEARCH_PROFILE_KEY = 'nauchny-navigator-profile-v1';
export const RESEARCH_PROFILE_EXPORT_FORMAT = 'nauchny-navigator-profile';
export type ClarificationRound = { questions: string[]; answers: string[] };
export type SavedResearch = {
  originalIdea: string;
  clarificationRounds: ClarificationRound[];
  confirmedTopic: string;
  analysis: ScientificIdeaAnalysis;
  savedAt: number;
};
export type SavedIdeaCheck = {
  idea: string;
  selectedMatches: CheckScientificIdeaResult['matches'];
  savedAt: number;
};
export type Draft = { id: string; text: string; updatedAt: number; research?: SavedResearch; ideaCheck?: SavedIdeaCheck };
export type SavedSource = { work: ScientificWork; savedAt: number; draftIds: string[] };
export type ArticleDraft = {
  revision?: number;
  id: string;
  format: 'article';
  idea: string;
  researchId: string;
  sourceIds: string[];
  plan: ScientificArticlePlan | null;
  structureApproved: boolean;
  sectionGuidance: Record<string, ScientificArticleSectionGuidance>;
  savedAt: number;
};
export type PublicationPrepDraft = {
  revision?: number;
  id: string;
  workTitle: string;
  scienceArea: string;
  researchId: string;
  journalName: string;
  journalMode: 'known' | 'search';
  requirementsText: string;
  result: PublicationChecklist | null;
  checkedItemIds: string[];
  savedAt: number;
};
export type ResearchProfile = {
  fullName: string;
  organization: string;
  position: string;
  academicDegree: string;
  academicTitle: string;
  scienceArea: string;
  specialization: string;
  researchTopics: string;
  interfaceLanguage: 'ru' | 'kk';
  researcherLevel: 'beginner' | 'experienced' | 'masters' | 'doctoral';
  aiResponseStyle: 'clear' | 'academic' | 'detailed';
};
export const EMPTY_RESEARCH_PROFILE: ResearchProfile = {
  fullName: '',
  organization: '',
  position: '',
  academicDegree: '',
  academicTitle: '',
  scienceArea: '',
  specialization: '',
  researchTopics: '',
  interfaceLanguage: 'ru',
  researcherLevel: 'beginner',
  aiResponseStyle: 'clear',
};
export function isResearchProfile(value: unknown): value is ResearchProfile { return researchProfileSchema.safeParse(value).success; }

export function getSavedSources(): SavedSource[] { return sourceStore.get(); }

export function saveSources(sources: SavedSource[]) { sourceStore.set(sources); }

export function getPublicationPrepDrafts(): PublicationPrepDraft[] { return publicationStore.get(); }

export function normalizedDoi(doi: string | null): string | null {
  return doi?.toLocaleLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').trim() || null;
}

export function openAlexRecordUrl(id: string): string {
  return id.startsWith('https://openalex.org/') ? id : `https://openalex.org/${id}`;
}

export function bibliography(work: ScientificWork): string {
  const authors = work.authors.length > 0 ? `${work.authors.join(', ')}.` : '';
  const year = work.year !== null ? `(${work.year}).` : '';
  const journal = work.sourceName ? `${work.sourceName}.` : '';
  const doi = work.doi ? `https://doi.org/${work.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')}` : '';
  return [authors, year, `${work.title}.`, journal, doi].filter(Boolean).join(' ');
}

export function similarityLabel(value: CheckScientificIdeaResult['matches'][number]['similarity']): string {
  switch (value) {
    case 'high': return 'Высокая тематическая близость';
    case 'partial': return 'Частичное совпадение';
    case 'adjacent': return 'Смежное исследование';
    case 'insufficient': return 'Недостаточно данных для оценки';
  }
}

export function publicationsCountLabel(count: number, locale: 'ru' | 'kk'): string {
  const localizedCount = count.toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU');
  if (locale === 'kk') return `${localizedCount} жарияланым`;
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? 'публикаций'
    : lastDigit === 1
      ? 'публикация'
      : lastDigit >= 2 && lastDigit <= 4
        ? 'публикации'
        : 'публикаций';
  return `${localizedCount} ${noun}`;
}

export function normalizeIdeaCheckResponse(value: unknown): CheckScientificIdeaResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const response = value as Record<string, unknown>;
  const isString = (item: unknown): item is string => typeof item === 'string';
  const isStringArray = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every(isString);
  const isCount = (item: unknown): item is number =>
    typeof item === 'number' && Number.isInteger(item) && item >= 0;
  const isNullableString = (item: unknown): item is string | null =>
    item === null || isString(item);
  const isNullableInteger = (item: unknown): item is number | null =>
    item === null || (typeof item === 'number' && Number.isInteger(item));
  const isSimilarity = (
    item: unknown,
  ): item is CheckScientificIdeaResult['matches'][number]['similarity'] =>
    item === 'high' || item === 'partial' || item === 'adjacent' || item === 'insufficient';
  const isEvidenceLevel = (
    item: unknown,
  ): item is CheckScientificIdeaResult['matches'][number]['evidenceLevel'] =>
    item === 'adequate' || item === 'limited' || item === 'insufficient';
  if (
    !isString(response.query) ||
    !isStringArray(response.keywords) ||
    !isStringArray(response.englishSynonyms) ||
    !isCount(response.totalCount) ||
    !Array.isArray(response.matches) ||
    !isString(response.summary) ||
    !isStringArray(response.refinementDirections) ||
    !isString(response.evidenceNote)
  ) {
    return null;
  }

  const matches: CheckScientificIdeaResult['matches'] = response.matches.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const match = item as Record<string, unknown>;
    const publication = match.publication;
    if (!publication || typeof publication !== 'object' || Array.isArray(publication)) return [];
    const record = publication as Record<string, unknown>;
    if (
      !isString(record.id) ||
      !isString(record.title) ||
      !isStringArray(record.authors) ||
      !isNullableInteger(record.year) ||
      !isNullableString(record.sourceName) ||
      !isNullableInteger(record.citationCount) ||
      !isNullableString(record.doi) ||
      !isString(record.url) ||
      !isStringArray(record.topics) ||
      !isNullableString(record.abstract) ||
      !isString(match.matchReason) ||
      !isSimilarity(match.similarity) ||
      !isEvidenceLevel(match.evidenceLevel)
    ) {
      return [];
    }
    return [{
      publication: {
        id: record.id,
        title: record.title,
        authors: record.authors,
        year: record.year,
        sourceName: record.sourceName,
        citationCount: record.citationCount,
        doi: record.doi,
        url: record.url,
        topics: record.topics,
        abstract: record.abstract,
      },
      matchReason: match.matchReason,
      similarity: match.similarity,
      evidenceLevel: match.evidenceLevel,
    }];
  });

  const hasSearches = Object.prototype.hasOwnProperty.call(response, 'searches');
  const searches = Array.isArray(response.searches)
    ? response.searches.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const search = item as Record<string, unknown>;
        return isString(search.query) && isCount(search.totalCount)
          ? [{ query: search.query, totalCount: search.totalCount }]
          : [];
      })
    : [];
  if (hasSearches && searches.length === 0) return null;
  const isLegacyResponse = !hasSearches;
  const normalizedSearches = isLegacyResponse
    ? [{ query: response.query, totalCount: response.totalCount }]
    : searches;

  return {
    query: response.query,
    keywords: response.keywords,
    englishSynonyms: response.englishSynonyms,
    searches: normalizedSearches,
    totalCount: isLegacyResponse ? matches.length : response.totalCount,
    matches,
    summary: response.summary,
    refinementDirections: response.refinementDirections,
    evidenceNote: response.evidenceNote,
  };
}


let validatedDraftSource: Draft[] | undefined;
let validatedDraftSnapshot: Draft[] = [];

function getValidatedDrafts(): Draft[] {
  const current = draftStore.get();
  if (current === validatedDraftSource) return validatedDraftSnapshot;
  validatedDraftSource = current;
  validatedDraftSnapshot = current.flatMap((value) => {
    const result = draftSchema.safeParse(value);
    return result.success ? [result.data] : [];
  });
  return validatedDraftSnapshot;
}

export function getDrafts(): Draft[] { return getValidatedDrafts(); }

export function saveDrafts(drafts: Draft[]) { draftStore.set(drafts); }

export function getArticleDrafts(): ArticleDraft[] { return articleStore.get(); }

export function useDrafts() {
  const drafts = useSyncExternalStore(draftStore.subscribe, getValidatedDrafts, getValidatedDrafts);
  const setDrafts = (_next: Draft[]) => {};
  const add = (text: string) => {
    const draft: Draft = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: text.trim(), updatedAt: Date.now() };
    const next = [draft, ...getDrafts()];
    saveDrafts(next); setDrafts(next); return draft;
  };
  const saveResearch = (
    originalIdea: string,
    confirmedTopic: string,
    clarificationRounds: ClarificationRound[],
    analysis: ScientificIdeaAnalysis,
    existingId?: string | null,
  ) => {
    const current = getDrafts();
    const now = Date.now();
    const existing = existingId ? current.find((draft) => draft.id === existingId) : undefined;
    const researchDraft: Draft = {
      id: existing?.id ?? `${now}-${Math.random().toString(36).slice(2, 7)}`,
      text: existing?.text ?? originalIdea.trim(),
      updatedAt: now,
      ...(existing?.ideaCheck ? { ideaCheck: existing.ideaCheck } : {}),
      research: {
        originalIdea: originalIdea.trim(),
        confirmedTopic: confirmedTopic.trim(),
        clarificationRounds,
        analysis,
        savedAt: now,
      },
    };
    const next = [researchDraft, ...current.filter((draft) => draft.id !== researchDraft.id)];
    saveDrafts(next);
    setDrafts(next);
    return researchDraft;
  };
  const saveIdeaCheck = (
    idea: string,
    selectedMatches: CheckScientificIdeaResult['matches'],
  ) => {
    const current = getDrafts();
    const normalizedIdea = idea.trim();
    const existing = current.find(
      (draft) =>
        draft.text.trim() === normalizedIdea ||
        draft.research?.originalIdea.trim() === normalizedIdea ||
        draft.research?.confirmedTopic.trim() === normalizedIdea,
    );
    const now = Date.now();
    const savedDraft: Draft = {
      id: existing?.id ?? `${now}-${Math.random().toString(36).slice(2, 7)}`,
      text: existing?.text ?? normalizedIdea,
      updatedAt: now,
      ...(existing?.research ? { research: existing.research } : {}),
      ideaCheck: {
        idea: normalizedIdea,
        selectedMatches,
        savedAt: now,
      },
    };
    const next = [savedDraft, ...current.filter((draft) => draft.id !== savedDraft.id)];
    saveDrafts(next);
    setDrafts(next);
    return savedDraft;
  };
  const remove = (id: string) => {
    const next = getDrafts().filter((draft) => draft.id !== id);
    saveDrafts(next); setDrafts(next);
  };
  return { drafts, add, saveResearch, saveIdeaCheck, remove };
}


export const draftStore = createCollectionStore<Draft>(DRAFTS_KEY, draftSchema, item => item.id);
export const sourceStore = createCollectionStore<SavedSource>(SOURCE_LIBRARY_KEY, sourceSchema, item => item.work.id);
export const articleStore = createCollectionStore<ArticleDraft>(ARTICLE_DRAFTS_KEY, articleSchema, item => item.id);
export const publicationStore = createCollectionStore<PublicationPrepDraft>(PUBLICATION_PREP_KEY, publicationSchema, item => item.id);
