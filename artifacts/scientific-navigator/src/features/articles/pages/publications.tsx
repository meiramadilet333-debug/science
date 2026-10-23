import { usePersistedCollection } from '@/hooks/use-persisted-collection';
import { useDocumentRequest, sameRevision } from '@/hooks/use-document-request';
import { publicationStore } from '@/features/research/shared';
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
import { PUBLICATION_PREP_KEY, PublicationPrepDraft, getPublicationPrepDrafts, useDrafts } from '@/features/research/shared';

const publicationCriterionLabels: Record<PublicationChecklist['criteria'][number]['category'], string> = {
  scope: 'Тематика журнала',
  language: 'Язык публикации',
  structure: 'Структура рукописи',
  abstract: 'Требования к аннотации',
  keywords: 'Ключевые слова',
  formatting: 'Оформление',
  other: 'Другие условия',
};

export default function PublicationsPage() {
  const { locale } = useLocale();
  const { drafts } = useDrafts();
  const savedResearches = drafts.filter((draft) => draft.research);
  const [activeId, setActiveId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [publicationDrafts, setPublicationDrafts] = usePersistedCollection(publicationStore, setStorageError);

  useEffect(() => {
    const stored = getPublicationPrepDrafts();
    const initial = stored.length > 0 ? stored : [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workTitle: '',
      scienceArea: '',
      researchId: '',
      journalName: '',
      journalMode: 'search' as const,
      requirementsText: '',
      result: null,
      checkedItemIds: [],
      savedAt: Date.now(),
    }];
    setPublicationDrafts(initial);
    setActiveId(initial[0].id);
    setLoaded(true);
  }, []);

  const active = publicationDrafts.find((item) => item.id === activeId) ?? null;
  const request = useDocumentRequest(activeId, active?.revision ?? 0);
  useEffect(() => { setIsAnalyzing(false); }, [activeId, active?.revision]);
  const updateActive = (patch: Partial<PublicationPrepDraft>, invalidateResult = false) => {
    if (!activeId) return;
    request.cancel();
    setPublicationDrafts((current) => current.map((item) =>
      item.id === activeId
        ? {
          ...item,
          ...patch,
          ...(invalidateResult ? { result: null, checkedItemIds: [] } : {}),
          savedAt: Date.now(),
          revision: (item.revision ?? 0) + 1,
        }
        : item,
    ));
  };
  const createPrep = () => {
    const created: PublicationPrepDraft = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workTitle: '',
      scienceArea: '',
      researchId: '',
      journalName: '',
      journalMode: 'search',
      requirementsText: '',
      result: null,
      checkedItemIds: [],
      savedAt: Date.now(),
    };
    setPublicationDrafts((current) => [created, ...current]);
    setActiveId(created.id);
    setError('');
  };
  const requestErrorMessage = (requestError: unknown): string => {
    if (!requestError || typeof requestError !== 'object') {
      return 'Не удалось проверить требования. Проверьте соединение и повторите попытку.';
    }
    if ('data' in requestError) {
      const responseData = requestError.data;
      if (
        responseData &&
        typeof responseData === 'object' &&
        'error' in responseData &&
        typeof responseData.error === 'string'
      ) return responseData.error;
    }
    if ('message' in requestError && typeof requestError.message === 'string') {
      return requestError.message;
    }
    return 'Не удалось проверить требования. Проверьте соединение и повторите попытку.';
  };
  const analyzeRequirements = async () => {
    if (!active) return;
    if (active.workTitle.trim().length < 2 || active.scienceArea.trim().length < 2) {
      setError('Укажите название научной работы и её направление (не менее 2 символов).');
      return;
    }
    if (active.requirementsText.trim().length < 20) {
      setError('Добавьте текст требований журнала длиной не менее 20 символов.');
      return;
    }
    const attempt = request.begin();
    setIsAnalyzing(true);
    setError('');
    try {
      const result = await preparePublicationChecklist({
        workTitle: active.workTitle.trim(),
        scienceArea: active.scienceArea.trim(),
        journalName: active.journalMode === 'known' ? active.journalName.trim() : '',
        requirementsText: active.requirementsText.trim(),
      }, { signal: attempt.signal });
      if (!attempt.isCurrent()) return;
      setPublicationDrafts(current => current.map(item => sameRevision(item, attempt.expected) ? { ...item, result, checkedItemIds: [], savedAt: Date.now(), revision: (item.revision ?? 0) + 1 } : item));
    } catch (requestError) {
      if (!attempt.isCurrent()) return;
      setError(requestErrorMessage(requestError));
    } finally {
      if (attempt.isCurrent()) setIsAnalyzing(false);
    }
  };
  const selectResearch = (researchId: string) => {
    const selected = savedResearches.find((draft) => draft.id === researchId);
    updateActive({
      researchId,
      workTitle: selected?.research?.confirmedTopic || selected?.research?.originalIdea || '',
    }, true);
    setError('');
  };
  const toggleChecklistItem = (itemId: string) => {
    if (!active) return;
    const checked = active.checkedItemIds.includes(itemId);
    updateActive({
      checkedItemIds: checked
        ? active.checkedItemIds.filter((id) => id !== itemId)
        : [...active.checkedItemIds, itemId],
    });
  };
  if (!loaded || !active) {
    return <main className="content-wrap"><div className="page-card p-8 text-center text-[13px] text-[#6e7976]">{t("Загружаем локальные проверки публикации…")}</div></main>;
  }
  const listedRequirements = active.result?.checklist ?? [];
  const markedCount = listedRequirements.filter((item) => active.checkedItemIds.includes(item.id)).length;

  return <main className="content-wrap">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow mb-2">{t("Подготовка к отправке")}</p><h1 className="serif m-0 text-[32px] text-[#26394a] sm:text-[39px]">{t("Публикации")}</h1><p className="mb-0 mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6e7976]">{t("Разберите правила выбранного журнала и отметьте выполненные пункты перед отправкой рукописи.")}</p></div>
      <button className="soft-button" type="button" onClick={createPrep} data-testid="button-new-publication-check"><FileText size={14} />{t("Новая проверка")}</button>
    </div>
    <section className="page-card mb-5 p-5 sm:p-7" aria-labelledby="publication-work-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="publication-work-title" className="serif m-0 text-[21px] text-[#293a49]">{t("Рукопись и издание")}</h2>
        <span className="status-pill"><span className="status-dot" />{t("Сохранено ")}{new Date(active.savedAt).toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      {publicationDrafts.length > 1 && <label className="mb-4 block text-[11px] font-semibold text-[#52625f]">{t("Открыть сохранённую проверку ")}<select className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[12px] font-normal text-[#354754]" value={activeId} onChange={(event) => { setActiveId(event.target.value); setError(''); }} data-testid="select-publication-check">
          {publicationDrafts.map((item) => <option key={item.id} value={item.id}>{item.workTitle || t("Новая рукопись")}{item.journalName ? ` · ${item.journalName}` : ''}</option>)}
        </select>
      </label>}
      <label className="mb-4 block text-[11px] font-semibold text-[#52625f]">{t("Взять научную работу из сохранённых исследований ")}<select className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[12px] font-normal text-[#354754]" value={active.researchId} onChange={(event) => selectResearch(event.target.value)} data-testid="select-publication-research">
          <option value="">{t("Ввести название вручную")}</option>
          {savedResearches.map((draft) => <option key={draft.id} value={draft.id}>{draft.research?.confirmedTopic || draft.research?.originalIdea || draft.text}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-[#52625f]">{t("Название научной работы ")}<input className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[13px] font-normal text-[#354754]" value={active.workTitle} onChange={(event) => updateActive({ workTitle: event.target.value, researchId: '' }, true)} maxLength={500} placeholder={t("Название рукописи или исследования")} data-testid="input-publication-work-title" />
        </label>
        <label className="block text-[11px] font-semibold text-[#52625f]">{t("Научное направление ")}<input className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[13px] font-normal text-[#354754]" value={active.scienceArea} onChange={(event) => updateActive({ scienceArea: event.target.value }, true)} maxLength={1000} placeholder={t("Например, педагогика, биомедицина, экономика")} data-testid="input-publication-science-area" />
        </label>
      </div>
      <fieldset className="mt-5 border-0 p-0">
        <legend className="mb-2 text-[11px] font-semibold text-[#52625f]">{t("Работа с журналом")}</legend>
        <div className="flex flex-wrap gap-3">
          <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${active.journalMode === 'search' ? 'border-[#78927b] bg-[#eff3ec] text-[#426957]' : 'border-[#e4e5dd] bg-white text-[#5f6b6a]'}`}>
            <input type="radio" name="publication-journal-mode" value="search" checked={active.journalMode === 'search'} onChange={() => updateActive({ journalMode: 'search', journalName: '' }, true)} />
            {t("Помогите определить критерии выбора ")}</label>
          <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${active.journalMode === 'known' ? 'border-[#78927b] bg-[#eff3ec] text-[#426957]' : 'border-[#e4e5dd] bg-white text-[#5f6b6a]'}`}>
            <input type="radio" name="publication-journal-mode" value="known" checked={active.journalMode === 'known'} onChange={() => updateActive({ journalMode: 'known' }, true)} />
            {t("У меня есть предполагаемый журнал ")}</label>
        </div>
      </fieldset>
      {active.journalMode === 'known' && <label className="mt-4 block text-[11px] font-semibold text-[#52625f]">{t("Название предполагаемого журнала ")}<input className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[13px] font-normal text-[#354754]" value={active.journalName} onChange={(event) => updateActive({ journalName: event.target.value }, true)} maxLength={300} placeholder={t("Введите точное название журнала, если оно известно")} data-testid="input-publication-journal" />
      </label>}
      <div className="mt-5 rounded-md border border-[#e9e1cf] bg-[#f7f3e9] p-4 text-[11px] leading-relaxed text-[#756f61]">
        <strong>{t("Важно:")}</strong> {t(" актуальные каталоги и правила редакций не подключены. Автоматического подбора журнала нет; мы не подтверждаем индексацию в КОКНВО, Scopus или Web of Science. Проверяйте тематику, язык, структуру, аннотацию, ключевые слова и оформление только по официальным инструкциям выбранного издания. ")}</div>
      {active.journalMode === 'search' && <div className="mt-4 rounded-md border border-[#e4e8df] bg-[#f8faf6] p-4" data-testid="publication-selection-criteria">
        <h3 className="mb-2 mt-0 text-[12px] font-semibold text-[#40505b]">{t("Критерии для самостоятельного выбора")}</h3>
        <ul className="mb-0 grid gap-2 pl-5 text-[11px] leading-relaxed text-[#5f6b6a] sm:grid-cols-2">
          <li>{t("Совпадает ли научная тематика журнала с предметом рукописи?")}</li>
          <li>{t("Принимает ли журнал статьи на нужном языке?")}</li>
          <li>{t("Подходит ли предписанная структура статьи?")}</li>
          <li>{t("Каковы требования к объёму и составу аннотации?")}</li>
          <li>{t("Сколько и как оформлять ключевые слова?")}</li>
          <li>{t("Какие правила оформления текста и списка литературы указаны?")}</li>
        </ul>
      </div>}
    </section>
    <section className="page-card mb-5 p-5 sm:p-7" aria-labelledby="publication-requirements-title">
      <h2 id="publication-requirements-title" className="serif mb-2 mt-0 text-[21px] text-[#293a49]">{t("Требования журнала")}</h2>
      <p className="text-[12px] leading-relaxed text-[#6e7976]">{t("Скопируйте актуальный фрагмент инструкции для авторов или загрузите/вставьте основные правила. ИИ составит чек-лист только по явно указанным требованиям и покажет подтверждающую цитату.")}</p>
      <textarea className="prompt-input min-h-[160px]" value={active.requirementsText} onChange={(event) => updateActive({ requirementsText: event.target.value }, true)} maxLength={12000} placeholder={t("Вставьте требования редакции: тематика, язык, структура, аннотация, ключевые слова, оформление…")} data-testid="input-journal-requirements" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] text-[#7a837f]">{active.requirementsText.length} {t(" / 12000 символов · локальный черновик")}</span>
        <button className="primary-button" type="button" onClick={analyzeRequirements} disabled={isAnalyzing || active.requirementsText.trim().length < 20 || active.workTitle.trim().length < 2 || active.scienceArea.trim().length < 2} data-testid="button-analyze-publication-requirements">
          {isAnalyzing ? t("ИИ разбирает требования…") : t("Составить чек-лист")} <ArrowRight size={15} />
        </button>
      </div>
    </section>
    {error && <div className="mb-5 rounded-md border border-[#ead4d0] bg-[#fbf2f0] p-4 text-[12px] leading-relaxed text-[#8b4b45]" role="alert" data-testid="publication-error">{t(error)}</div>}
    {storageError && <div className="mb-5 rounded-md border border-[#ead4d0] bg-[#fbf2f0] p-4 text-[12px] leading-relaxed text-[#8b4b45]" role="alert">{storageError} {t(" Скопируйте важные данные отдельно.")}</div>}
    {!active.result && !error && <div className="page-card p-5 text-[12px] leading-relaxed text-[#6e7976]" data-testid="publication-empty-state">{t("Добавьте требования журнала, чтобы получить проверяемый список подготовки рукописи. Пока требования не предоставлены, система не предполагает правила конкретного издания.")}</div>}
    {active.result && <section className="page-card p-5 sm:p-7" aria-labelledby="publication-results-title" data-testid="publication-results">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow mb-2">{t("Разбор переданного текста · предложение ИИ")}</p><h2 id="publication-results-title" className="serif m-0 text-[22px] text-[#293a49]">{t("Критерии и чек-лист")}</h2></div>
        <span className="status-pill">{markedCount} / {listedRequirements.length} {t(" выполнено")}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {active.result.criteria.map((criterion) => <article key={criterion.category} className="rounded-md border border-[#e8e7df] bg-[#fcfcf9] p-3" data-testid={`publication-criterion-${criterion.category}`}>
          <div className="mb-1 flex items-center justify-between gap-2"><h3 className="m-0 text-[11px] font-semibold text-[#40505b]">{publicationCriterionLabels[criterion.category]}</h3><span className="text-[9px] font-semibold text-[#6e7976]">{criterion.status === 'specified' ? t("Указано в тексте") : t("Не найдено в тексте")}</span></div>
          <p className="mb-1 text-[11px] leading-relaxed text-[#5f6b6a]">{criterion.requirement}</p>
          {criterion.evidenceQuote && <blockquote className="mb-0 border-l-2 border-[#9bad93] pl-2 text-[10px] leading-relaxed text-[#748078]">«{criterion.evidenceQuote}»</blockquote>}
        </article>)}
      </div>
      <div className="mt-6">
        <h3 className="serif mb-3 mt-0 text-[19px] text-[#293a49]">{t("Проверка рукописи")}</h3>
        {listedRequirements.length === 0
          ? <div className="rounded-md border border-dashed border-[#dce2da] bg-[#fafaf7] p-4 text-[12px] leading-relaxed text-[#6e7976]" data-testid="publication-empty-checklist">{t("В переданном тексте не удалось выделить конкретные требования с дословным подтверждением. Проверьте, что вставлены актуальные инструкции журнала, или уточните их у редакции.")}</div>
          : <ul className="m-0 list-none space-y-3 p-0">{listedRequirements.map((item) => <li key={item.id} className="rounded-md border border-[#e8e7df] bg-[#fcfcf9] p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 accent-[#63836e]" checked={active.checkedItemIds.includes(item.id)} onChange={() => toggleChecklistItem(item.id)} data-testid={`checkbox-publication-${item.id}`} />
              <span><span className="block text-[12px] font-semibold text-[#354754]">{item.title}</span><span className="mt-1 block text-[11px] leading-relaxed text-[#5f6b6a]">{item.details}</span><span className="mt-2 block rounded bg-[#f1f3ed] px-2 py-1 text-[10px] leading-relaxed text-[#66736b]">{t("Основание в требованиях: «")}{item.evidenceQuote}»</span></span>
            </label>
          </li>)}</ul>}
      </div>
      <p className="mb-0 mt-5 rounded-md border border-[#e9e1cf] bg-[#f7f3e9] p-4 text-[11px] leading-relaxed text-[#756f61]"><strong>{t("Ограничения анализа.")}</strong> {active.result.limitations} {t(" Чек-лист построен только по предоставленному вами тексту. Сверяйте вывод с актуальной официальной страницей журнала.")}</p>
    </section>}
    <p className="mb-0 mt-4 text-[10px] leading-relaxed text-[#7a837f]">{t("Проверки и отмеченные пункты хранятся только в локальном хранилище этого браузера. При очистке данных сайта они могут быть удалены.")}</p>
  </main>;
}

