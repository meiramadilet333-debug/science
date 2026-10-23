import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeScientificIdea, analyzeScientificSource, assistScientificArticleSection, checkScientificIdea, preparePublicationChecklist, prepareScientificArticle, prepareScientificIdea, recommendScientificTopics, searchScientificSources, type ArticleSection, type CheckScientificIdeaResult, type PublicationChecklist, type ScientificArticlePlan, type ScientificArticleSectionGuidance, type ScientificIdeaAnalysis, type ScientificSourceAnalysis, type ScientificWork, type TopicRecommendationRequest, type TopicRecommendationResult } from '@workspace/api-client-react';
import { HeroSection, ResearchCard, ResearchToolCard, type AILiveState, type ResearchTool } from '@/components/academic-ui';
import { t, useLocale } from '@/lib/i18n';
import { Link, useLocation } from 'wouter';
import {
  ArrowRight, ArrowUpRight, BookOpen, Bookmark, BriefcaseBusiness, Check, CircleHelp,
  Compass, Download, ExternalLink, FileText, FlaskConical, FolderOpen, GraduationCap, Lightbulb,
  Link2, Plus, Search, Settings, ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Upload, UserRound,
} from 'lucide-react';
import { SavedSource, getSavedSources, saveSources, normalizedDoi, openAlexRecordUrl, bibliography, useDrafts } from '@/features/research/shared';

export default function ScientificSourcesPage() {
  const { locale } = useLocale();
  const { drafts } = useDrafts();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [works, setWorks] = useState<ScientificWork[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [library, setLibrary] = useState<SavedSource[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryDraftFilter, setLibraryDraftFilter] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [storageError, setStorageError] = useState('');
  const [analysisById, setAnalysisById] = useState<Record<string, ScientificSourceAnalysis>>({});
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLibrary(getSavedSources());
    setSelectedDraftId(drafts[0]?.id ?? '');
  }, [drafts.length]);

  const visibleLibrary = useMemo(() => {
    const filter = libraryQuery.trim().toLocaleLowerCase();
    return library.filter(({ work, draftIds }) => {
      const matchesText = !filter || [
        work.title,
        ...work.authors,
        work.sourceName ?? '',
        work.doi ?? '',
      ].join(' ').toLocaleLowerCase().includes(filter);
      const matchesDraft = !libraryDraftFilter || draftIds.includes(libraryDraftFilter);
      return matchesText && matchesDraft;
    });
  }, [library, libraryQuery, libraryDraftFilter]);

  const runSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const searchQuery = query.trim();
    if (searchQuery.length < 2 || searchQuery.length > 300) {
      setSearchError('Введите запрос длиной от 2 до 300 символов.');
      return;
    }
    setIsSearching(true);
    setSearchError('');
    setSubmittedQuery(searchQuery);
    setWorks([]);
    setTotalCount(0);
    try {
      const response = await searchScientificSources({ query: searchQuery });
      setWorks(Array.isArray(response.works) ? response.works : []);
      setTotalCount(response.totalCount);
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : null;
      setSearchError(
        data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'Не удалось выполнить поиск в OpenAlex. Проверьте подключение и попробуйте позже.',
      );
    } finally {
      setIsSearching(false);
    }
  };

  const updateLibrary = (next: SavedSource[]) => {
    try {
      saveSources(next);
      setLibrary(next);
      setStorageError('');
      return true;
    } catch {
      setStorageError('Не удалось сохранить библиотеку в браузере. Проверьте настройки локального хранилища.');
      return false;
    }
  };

  const addToLibrary = (work: ScientificWork) => {
    const doi = normalizedDoi(work.doi);
    const existingIndex = library.findIndex((entry) =>
      entry.work.id === work.id ||
      Boolean(doi && normalizedDoi(entry.work.doi) === doi),
    );
    const next = [...library];
    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        work: {
          ...existing.work,
          ...work,
          abstract: existing.work.abstract ?? work.abstract,
          sourceName: existing.work.sourceName ?? work.sourceName,
        },
      };
    } else {
      next.unshift({ work, savedAt: Date.now(), draftIds: [] });
    }
    updateLibrary(next);
  };

  const removeFromLibrary = (work: ScientificWork) => {
    const doi = normalizedDoi(work.doi);
    updateLibrary(library.filter((entry) =>
      entry.work.id !== work.id &&
      !(doi && normalizedDoi(entry.work.doi) === doi),
    ));
  };

  const attachToDraft = (work: ScientificWork) => {
    if (!selectedDraftId) return;
    const doi = normalizedDoi(work.doi);
    updateLibrary(library.map((entry) =>
      entry.work.id === work.id ||
      Boolean(doi && normalizedDoi(entry.work.doi) === doi)
        ? { ...entry, draftIds: [...new Set([...entry.draftIds, selectedDraftId])] }
        : entry,
    ));
  };

  const detachFromDraft = (work: ScientificWork, draftId: string) => {
    updateLibrary(library.map((entry) =>
      entry.work.id === work.id
        ? { ...entry, draftIds: entry.draftIds.filter((id) => id !== draftId) }
        : entry,
    ));
  };

  const analyzeSource = async (work: ScientificWork) => {
    setAnalyzingIds((current) => new Set(current).add(work.id));
    setAnalysisErrors((current) => ({ ...current, [work.id]: '' }));
    try {
      const analysis = await analyzeScientificSource({ id: work.id });
      setAnalysisById((current) => ({ ...current, [work.id]: analysis }));
    } catch (error) {
      const data = error && typeof error === 'object' && 'data' in error ? error.data : null;
      const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Не удалось получить анализ источника. Попробуйте позже.';
      setAnalysisErrors((current) => ({ ...current, [work.id]: message }));
    } finally {
      setAnalyzingIds((current) => {
        const next = new Set(current);
        next.delete(work.id);
        return next;
      });
    }
  };

  const renderWork = (work: ScientificWork, saved: boolean) => {
    const doiUrl = work.doi
      ? `https://doi.org/${work.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')}`
      : null;
    const analysis = analysisById[work.id];
    return <article key={work.id} className="page-card p-5 sm:p-6" data-testid={`card-source-${work.id}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#688071]">{t("Метаданные · OpenAlex")}</span>
        <a href={openAlexRecordUrl(work.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#52745d] hover:underline">{t("Запись OpenAlex ")}<ArrowUpRight size={12} /></a>
      </div>
      <h3 className="serif mb-2 mt-0 text-[19px] leading-snug text-[#293a49]">{work.title}</h3>
      <p className="mb-3 text-[11px] leading-relaxed text-[#68746f]">{work.authors.length > 0 ? work.authors.join(', ') : t("Авторы в OpenAlex не указаны")}{work.year !== null ? ` · ${work.year}` : ''}{work.sourceName ? ` · ${work.sourceName}` : ''}</p>
      {work.doi && <p className="mb-3 text-[11px] text-[#68746f]">DOI: <a href={doiUrl ?? undefined} target="_blank" rel="noreferrer" className="text-[#52745d] hover:underline">{work.doi}</a></p>}
      {work.abstract
        ? <p className="mb-3 text-[12px] leading-[1.7] text-[#54625e]"><span className="font-semibold">{t("Аннотация OpenAlex: ")}</span>{work.abstract}</p>
        : <p className="mb-3 text-[11px] text-[#7a837f]">{t("Аннотация в OpenAlex недоступна.")}</p>}
      <div className="mb-3 rounded-md border border-[#e5eadf] bg-[#f7f8f4] p-3">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#6a796f]">{t("Библиографическая запись по доступным данным")}</p>
        <p className="mb-0 break-words text-[11px] leading-relaxed text-[#465951]">{bibliography(work)}</p>
        {(!work.authors.length || work.year === null || !work.sourceName || !work.doi) && <p className="mb-0 mt-1 text-[10px] text-[#7a837f]">{t("Часть библиографических реквизитов отсутствует в OpenAlex и не добавлена.")}</p>}
      </div>
      {analysis ? <div className="mb-3 rounded-md border border-[#dce7de] bg-[#f4f7f2] p-4" data-testid={`source-analysis-${work.id}`}>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#567662]">{t("Краткий анализ ИИ · только доступные сведения OpenAlex")}</p>
        <p className="text-[12px] leading-relaxed text-[#465951]">{analysis.summary}</p>
        {analysis.keyPoints.length > 0 && <ul className="mb-2 space-y-1 pl-4 text-[11px] leading-relaxed text-[#52645a]">{analysis.keyPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ul>}
        <p className="mb-0 text-[10px] leading-relaxed text-[#7a837f]">{analysis.limitations}</p>
      </div> : <div className="mb-3">
        <button type="button" className="soft-button" onClick={() => analyzeSource(work)} disabled={analyzingIds.has(work.id)} data-testid={`button-analyze-source-${work.id}`}>
          <Lightbulb size={14} />{analyzingIds.has(work.id) ? t("Анализируем…") : t("Краткий ИИ-анализ")}
        </button>
        {analysisErrors[work.id] && <p role="alert" className="mt-2 text-[11px] text-[#a0443f]">{analysisErrors[work.id]}</p>}
      </div>}
      <div className="flex flex-wrap gap-2 border-t border-[#eeeae2] pt-3">
        {saved
          ? <button type="button" className="soft-button text-[#8a4944]" onClick={() => removeFromLibrary(work)}><Trash2 size={14} />{t("Удалить из библиотеки")}</button>
          : <button type="button" className="soft-button" onClick={() => addToLibrary(work)}><BookOpen size={14} />{t("Сохранить в библиотеку")}</button>}
        {drafts.length > 0 && <>
          <select className="rounded-md border border-[#dfe4dc] bg-white px-2 py-1.5 text-[11px] text-[#52625f]" value={selectedDraftId} onChange={(event) => setSelectedDraftId(event.target.value)} aria-label={t("Исследование для привязки источника")}>
            {drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.research?.confirmedTopic || draft.text.slice(0, 60)}</option>)}
          </select>
          {saved && <button type="button" className="soft-button" onClick={() => attachToDraft(work)}><Link2 size={14} />{t("Привязать к исследованию")}</button>}
        </>}
      </div>
    </article>;
  };

  return <main className="content-wrap">
    <header className="mb-7">
      <p className="eyebrow mb-2">{t("Литературная база исследования · OpenAlex")}</p>
      <h1 className="serif m-0 text-[32px] leading-tight text-[#26394a] sm:text-[39px]">{t("Научные источники")}</h1>
      <p className="mb-0 mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6e7976]">{t("Ищите реальные публикации, сохраняйте их в локальную библиотеку и связывайте с исследованиями. Доступ к полным текстам зависит от источника.")}</p>
    </header>

    <section className="page-card mb-6 p-5 sm:p-7">
      <p className="eyebrow mb-2">{t("Поиск публикаций")}</p>
      <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="sources-query">{t("Научная тема или ключевые слова")}</label>
        <input id="sources-query" className="prompt-input min-h-11 flex-1" value={query} maxLength={300} onChange={(event) => setQuery(event.target.value)} placeholder={t("Например: машинное обучение для медицинской диагностики")} data-testid="input-source-search" />
        <button className="primary-button self-start sm:self-auto" type="submit" disabled={isSearching} data-testid="button-source-search"><Search size={15} />{isSearching ? t("Ищем…") : t("Найти источники")}</button>
      </form>
      <p className="mb-0 mt-2 text-[10px] text-[#7a837f]">{t("OpenAlex · поиск выполняется на сервере. Аннотации показываются только если они доступны в каталоге.")}</p>
      {searchError && <p role="alert" className="mt-3 text-[12px] text-[#a0443f]" data-testid="status-source-search-error">{searchError}</p>}
      {storageError && <p role="alert" className="mt-3 text-[12px] text-[#a0443f]">{storageError}</p>}
    </section>

    {isSearching && <section className="page-card mb-5 p-5 text-[13px] text-[#53645e]" role="status">{t("Ищем реальные записи в OpenAlex…")}</section>}
    {!isSearching && submittedQuery && !searchError && <section className="mb-8" aria-live="polite" data-testid="source-search-results">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="serif m-0 text-[22px] text-[#293a49]">{t("Результаты поиска")}</h2><span className="text-[11px] text-[#74807b]">{t("OpenAlex сообщил записей: ")}{totalCount}{t("; показано: ")}{works.length}</span></div>
      {works.length > 0
        ? <div className="space-y-3">{works.map((work) => renderWork(work, library.some((entry) => entry.work.id === work.id || Boolean(normalizedDoi(work.doi) && normalizedDoi(entry.work.doi) === normalizedDoi(work.doi)))))}</div>
        : <div className="page-card p-6 text-[13px] leading-relaxed text-[#65716e]" data-testid="empty-source-search">{t("По этому запросу OpenAlex не вернул публикаций. Попробуйте изменить формулировку.")}</div>}
    </section>}

    <section aria-labelledby="personal-library-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow mb-1">{t("Только на этом устройстве")}</p><h2 id="personal-library-title" className="serif m-0 text-[23px] text-[#293a49]">{t("Моя библиотека · ")}{library.length}</h2></div>
        {library.length > 0 && <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="library-search">{t("Поиск в библиотеке")}</label>
          <input id="library-search" className="prompt-input min-h-9 w-52 text-[11px]" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder={t("Найти в библиотеке…")} data-testid="input-library-search" />
          <label className="sr-only" htmlFor="library-draft-filter">{t("Фильтр по исследованию")}</label>
          <select id="library-draft-filter" className="rounded-md border border-[#dfe4dc] bg-white px-2 text-[11px] text-[#52625f]" value={libraryDraftFilter} onChange={(event) => setLibraryDraftFilter(event.target.value)} data-testid="select-library-draft-filter">
            <option value="">{t("Все исследования")}</option>
            {drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.research?.confirmedTopic || draft.text.slice(0, 60)}</option>)}
          </select>
        </div>}
      </div>
      {library.length === 0
        ? <div className="page-card px-6 py-10 text-center" data-testid="empty-source-library"><BookOpen size={24} className="mx-auto mb-3 text-[#688071]" /><h3 className="serif mb-2 mt-0 text-[20px] text-[#293a49]">{t("Библиотека пока пуста")}</h3><p className="mb-0 text-[12px] leading-relaxed text-[#6e7976]">{t("Найдите публикации и сохраните нужные источники. Они останутся в локальном хранилище браузера.")}</p></div>
        : visibleLibrary.length > 0
          ? <div className="space-y-3">{visibleLibrary.map(({ work }) => renderWork(work, true))}</div>
          : <div className="page-card p-5 text-[12px] text-[#65716e]">{t("По заданным фильтрам публикаций не найдено.")}</div>}
      <p className="mb-0 mt-4 text-[10px] leading-relaxed text-[#7a837f]">{t("Личная библиотека хранится в браузере на этом устройстве. При очистке данных сайта она может быть удалена; серверная синхронизация пока отсутствует.")}</p>
    </section>
  </main>;
}

