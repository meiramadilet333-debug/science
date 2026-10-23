import { usePersistedCollection } from '@/hooks/use-persisted-collection';
import { useDocumentRequest, sameRevision } from '@/hooks/use-document-request';
import { articleStore } from '@/features/research/shared';
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
import { ARTICLE_DRAFTS_KEY, SavedSource, ArticleDraft, getSavedSources, getArticleDrafts, useDrafts } from '@/features/research/shared';

export default function ScientificWorksPage() {
  const { locale } = useLocale();
  const { drafts } = useDrafts();
  const [library] = useState<SavedSource[]>(() => getSavedSources());
  const [activeId, setActiveId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [busySectionId, setBusySectionId] = useState('');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [articleDrafts, setArticleDrafts] = usePersistedCollection(articleStore, setStorageError);

  useEffect(() => {
    const stored = getArticleDrafts();
    const initial = stored.length > 0 ? stored : [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      format: 'article' as const,
      idea: '',
      researchId: '',
      sourceIds: [],
      plan: null,
      structureApproved: false,
      sectionGuidance: {},
      savedAt: Date.now(),
    }];
    setArticleDrafts(initial);
    setActiveId(initial[0].id);
    setLoaded(true);
  }, []);

  const article = articleDrafts.find((item) => item.id === activeId) ?? null;
  const request = useDocumentRequest(activeId, article?.revision ?? 0);
  useEffect(() => { setIsPreparing(false); setBusySectionId(''); }, [activeId, article?.revision]);
  const savedResearches = drafts.filter((draft) => draft.research);
  const updateArticle = (update: Partial<ArticleDraft>) => {
    if (!activeId) return;
    request.cancel();
    setArticleDrafts((current) => current.map((item) =>
      item.id === activeId ? { ...item, ...update, revision: (item.revision ?? 0) + 1, savedAt: Date.now() } : item,
    ));
  };
  const createArticle = () => {
    const created: ArticleDraft = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      format: 'article',
      idea: '',
      researchId: '',
      sourceIds: [],
      plan: null,
      structureApproved: false,
      sectionGuidance: {},
      savedAt: Date.now(),
    };
    setArticleDrafts((current) => [created, ...current]);
    setActiveId(created.id);
    setError('');
  };
  const errorMessage = (requestError: unknown, fallback: string) => {
    const data = requestError && typeof requestError === 'object' && 'data' in requestError
      ? requestError.data
      : null;
    return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : fallback;
  };
  const preparePlan = async () => {
    if (!article || article.idea.trim().length < 2) {
      setError('Введите новую тему или выберите сохранённую исследовательскую идею.');
      return;
    }
    if (article.idea.trim().length > 5000) {
      setError('Тема не должна превышать 5000 символов.');
      return;
    }
    const attempt = request.begin();
    setIsPreparing(true);
    setError('');
    try {
      const plan = await prepareScientificArticle({
        idea: article.idea.trim(),
        sourceIds: article.sourceIds.slice(0, 8),
      }, { signal: attempt.signal });
      if (!attempt.isCurrent()) return;
      setArticleDrafts(current => current.map(item => sameRevision(item, attempt.expected) ? { ...item, plan, structureApproved: false, sectionGuidance: {}, savedAt: Date.now(), revision: (item.revision ?? 0) + 1 } : item));
    } catch (requestError) {
      if (!attempt.isCurrent()) return;
      setError(errorMessage(requestError, 'Не удалось получить план статьи. Проверьте соединение и попробуйте ещё раз.'));
    } finally {
      if (attempt.isCurrent()) setIsPreparing(false);
    }
  };
  const updateSection = (sectionId: string, patch: Partial<ArticleSection>) => {
    if (!article?.plan) return;
    const updatedPlan = {
      ...article.plan,
      sections: article.plan.sections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      ),
    };
    updateArticle({ plan: updatedPlan, sectionGuidance: {} });
  };
  const toggleOutlineApproval = () => {
    if (!article?.plan) return;
    if (!article.structureApproved) {
      const hasIncompleteSection = article.plan.sections.some((section) =>
        !section.title.trim() ||
        !section.purpose.trim() ||
        !section.guidingQuestions.some((question) => question.trim()),
      );
      if (hasIncompleteSection) {
        setError('Перед утверждением заполните название, назначение и хотя бы один вопрос для каждого раздела.');
        return;
      }
    }
    setError('');
    updateArticle({ structureApproved: !article.structureApproved });
  };
  const requestSectionHelp = async (section: ArticleSection) => {
    if (!article?.plan) return;
    const attempt = request.begin();
    setBusySectionId(section.id);
    setError('');
    try {
      const guidance = await assistScientificArticleSection({
        idea: article.idea.trim(),
        workingTitle: article.plan.workingTitle,
        section,
        otherSections: article.plan.sections
          .filter((candidate) => candidate.id !== section.id)
          .map((candidate) => `${candidate.title}: ${candidate.purpose}`),
        sourceIds: article.sourceIds.slice(0, 8),
      }, { signal: attempt.signal });
      if (!attempt.isCurrent()) return;
      setArticleDrafts(current => current.map(item => sameRevision(item, attempt.expected) ? { ...item, sectionGuidance: { ...item.sectionGuidance, [section.id]: guidance }, savedAt: Date.now(), revision: (item.revision ?? 0) + 1 } : item));
    } catch (requestError) {
      if (!attempt.isCurrent()) return;
      setError(errorMessage(requestError, 'Не удалось получить помощь для раздела. Попробуйте ещё раз.'));
    } finally {
      if (attempt.isCurrent()) setBusySectionId('');
    }
  };
  const toggleSource = (id: string) => {
    if (!article) return;
    const isSelected = article.sourceIds.includes(id);
    if (!isSelected && article.sourceIds.length >= 8) {
      setError('Для одного плана можно выбрать не более 8 публикаций.');
      return;
    }
    setError('');
    updateArticle({
      sourceIds: isSelected
        ? article.sourceIds.filter((sourceId) => sourceId !== id)
        : [...article.sourceIds, id],
      plan: null,
      structureApproved: false,
      sectionGuidance: {},
    });
  };
  const selectResearch = (researchId: string) => {
    const selected = savedResearches.find((draft) => draft.id === researchId);
    if (!selected?.research || !article) {
      updateArticle({ researchId });
      return;
    }
    const idea = selected.research.confirmedTopic || selected.research.originalIdea;
    updateArticle({
      researchId,
      idea,
      plan: null,
      structureApproved: false,
      sectionGuidance: {},
    });
    setError('');
  };
  const setIdea = (idea: string) => {
    if (!article) return;
    const changed = idea !== article.idea;
    updateArticle({
      idea,
      researchId: changed ? '' : article.researchId,
      ...(changed ? { plan: null, structureApproved: false, sectionGuidance: {} } : {}),
    });
  };

  if (!loaded || !article) {
    return <main className="content-wrap"><div className="page-card p-8 text-center text-[13px] text-[#6e7976]">{t("Загружаем локальные черновики статей…")}</div></main>;
  }

  const selectedSources = library.filter((entry) => article.sourceIds.includes(entry.work.id));
  const sourceContextDescription = selectedSources.length === 0
    ? 'ИИ не получит библиографический контекст; план будет предварительным и потребует самостоятельной проверки.'
    : 'ИИ использует только проверенные метаданные OpenAlex и доступные аннотации выбранных публикаций.';

  return <main className="content-wrap">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow mb-2">{t("Подготовка рукописи")}</p><h1 className="serif m-0 text-[32px] text-[#26394a] sm:text-[39px]">{t("Научные работы")}</h1><p className="mb-0 mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6e7976]">{t("Сформируйте и утвердите рабочую структуру научной статьи, затем прорабатывайте каждый раздел отдельно. Итоговый текст и научные решения остаются за исследователем.")}</p></div>
      <button className="soft-button" type="button" onClick={createArticle} data-testid="button-new-article"><FileText size={14} />{t("Новая статья")}</button>
    </div>

    <section className="page-card mb-5 p-5 sm:p-7" aria-labelledby="article-setup-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="article-setup-title" className="serif m-0 text-[21px] text-[#293a49]">{t("Рабочий черновик")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="article-format" className="text-[11px] font-semibold text-[#52625f]">{t("Формат")}</label>
          <select id="article-format" className="rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[12px] text-[#354754]" value="article" disabled>
            <option value="article">{t("Научная статья")}</option>
            <option disabled>{t("Эссе — в будущем")}</option>
            <option disabled>{t("Тезисы — в будущем")}</option>
            <option disabled>{t("Диссертация — в будущем")}</option>
            <option disabled>{t("Научный отчёт — в будущем")}</option>
          </select>
          <span className="status-pill"><span className="status-dot" />{t("Сохранено ")}{new Date(article.savedAt).toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      </div>
      {articleDrafts.length > 1 && <label className="mb-4 block text-[11px] font-semibold text-[#52625f]">{t("Открыть черновик ")}<select className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[12px] font-normal text-[#354754]" value={activeId} onChange={(event) => { setActiveId(event.target.value); setError(''); }} data-testid="select-article-draft">
          {articleDrafts.map((saved) => <option key={saved.id} value={saved.id}>{saved.plan?.workingTitle || saved.idea || t("Новая научная статья")} · {new Date(saved.savedAt).toLocaleDateString(locale === 'kk' ? 'kk-KZ' : 'ru-RU')}</option>)}
        </select>
      </label>}
      <label className="mb-4 block text-[11px] font-semibold text-[#52625f]">{t("Взять ранее сохранённую исследовательскую идею ")}<select className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[12px] font-normal text-[#354754]" value={article.researchId} onChange={(event) => selectResearch(event.target.value)} data-testid="select-saved-research">
          <option value="">{t("Новая тема или своя формулировка")}</option>
          {savedResearches.map((draft) => <option key={draft.id} value={draft.id}>{draft.research?.confirmedTopic || draft.research?.originalIdea || draft.text}</option>)}
        </select>
      </label>
      <label htmlFor="article-idea" className="mb-2 block text-[11px] font-semibold text-[#52625f]">{t("Тема или исследовательская идея")}</label>
      <textarea id="article-idea" className="prompt-input min-h-[100px]" value={article.idea} onChange={(event) => setIdea(event.target.value)} maxLength={5000} placeholder={t("Опишите тему или исследовательский вопрос статьи…")} data-testid="input-article-idea" />
    </section>

    <section className="page-card mb-5 p-5 sm:p-7" aria-labelledby="article-sources-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="article-sources-title" className="serif m-0 text-[20px] text-[#293a49]">{t("Источники из личной библиотеки")}</h2><span className="text-[11px] text-[#6e7976]">{t("Выбрано: ")}{article.sourceIds.length} / 8</span></div>
      <p className="mb-4 text-[11px] leading-relaxed text-[#6e7976]">{sourceContextDescription} {t(" ИИ не получает полный текст, если доступна только аннотация.")}</p>
      {library.length === 0
        ? <div className="rounded-md border border-dashed border-[#dce2da] bg-[#fafaf7] p-4 text-[12px] leading-relaxed text-[#6e7976]">{t("Личная библиотека пока пуста. Публикации можно найти и сохранить в разделе ")}<Link className="text-[#426957] underline" href="/sources">{t("«Научные источники»")}</Link>.</div>
        : <div className="max-h-72 space-y-2 overflow-y-auto">{library.map(({ work }) => <label key={work.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-[#e8e7df] bg-[#fbfbf8] p-3 text-[12px] leading-relaxed text-[#52625f]">
          <input type="checkbox" className="mt-1 accent-[#63836e]" checked={article.sourceIds.includes(work.id)} onChange={() => toggleSource(work.id)} />
          <span><span className="block font-medium text-[#354754]">{work.title}</span><span className="text-[10px] text-[#7a837f]">{work.authors.length ? work.authors.join(', ') : t("Авторы не указаны")}{work.year ? ` · ${work.year}` : ''}{work.sourceName ? ` · ${work.sourceName}` : ''}</span></span>
        </label>)}</div>}
    </section>

    {error && <div className="mb-5 rounded-md border border-[#ead4d0] bg-[#fbf2f0] p-4 text-[12px] leading-relaxed text-[#8b4b45]" role="alert" data-testid="article-error">{t(error)}</div>}
    {storageError && <div className="mb-5 rounded-md border border-[#ead4d0] bg-[#fbf2f0] p-4 text-[12px] leading-relaxed text-[#8b4b45]" role="alert">{storageError} {t(" Скопируйте важные изменения в отдельное место.")}</div>}
    {!article.plan && <section className="page-card p-5 sm:p-7">
      <div className="rounded-md border border-[#e9e1cf] bg-[#f7f3e9] p-4 text-[12px] leading-relaxed text-[#756f61]"><strong>{t("Предварительный план, а не готовая статья.")}</strong> {t(" ИИ предложит рабочие элементы структуры, но не сформирует рукопись целиком и не подтвердит научную новизну.")}</div>
      <button className="primary-button mt-4" type="button" onClick={preparePlan} disabled={isPreparing || article.idea.trim().length < 2} data-testid="button-prepare-article">{isPreparing ? t("ИИ формирует план…") : t("Подготовить план статьи")} <ArrowRight size={15} /></button>
    </section>}

    {article.plan && <section className="page-card p-5 sm:p-7" aria-labelledby="article-plan-title" data-testid="article-plan">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow mb-2">{t("Предложение ИИ · проверьте и отредактируйте")}</p><h2 id="article-plan-title" className="serif m-0 text-[22px] text-[#293a49]">{t("Рабочий план статьи")}</h2></div>
        <span className="status-pill">{article.structureApproved ? t("Структура утверждена вами") : t("Ожидает утверждения")}</span>
      </div>
      <label className="mb-4 block text-[11px] font-semibold text-[#52625f]">{t("Рабочее название ")}<input className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[14px] font-medium text-[#354754]" value={article.plan.workingTitle} onChange={(event) => updateArticle({ plan: { ...article.plan!, workingTitle: event.target.value }, sectionGuidance: {} })} maxLength={300} data-testid="input-article-title" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-[#f7f8f4] p-4"><h3 className="mb-2 mt-0 text-[12px] font-semibold text-[#40505b]">{t("Научная проблема · предложение ИИ")}</h3><p className="mb-0 text-[12px] leading-relaxed text-[#5f6b6a]">{article.plan.problem}</p></div>
        <div className="rounded-md bg-[#f7f8f4] p-4"><h3 className="mb-2 mt-0 text-[12px] font-semibold text-[#40505b]">{t("Цель · предложение ИИ")}</h3><p className="mb-0 text-[12px] leading-relaxed text-[#5f6b6a]">{article.plan.goal}</p></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[#eeeae2] p-4"><h3 className="mb-2 mt-0 text-[12px] font-semibold text-[#40505b]">{t("Возможные задачи")}</h3><ol className="mb-0 space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{article.plan.tasks.map((task, index) => <li key={`${index}-${task}`}>{task}</li>)}</ol></div>
        <div className="rounded-md border border-[#eeeae2] p-4"><h3 className="mb-2 mt-0 text-[12px] font-semibold text-[#40505b]">{t("Возможные методологические подходы")}</h3><ul className="mb-0 space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{article.plan.methodology.map((method, index) => <li key={`${index}-${method}`}>{method}</li>)}</ul></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="serif mb-0 mt-0 text-[20px] text-[#293a49]">{t("Структура статьи")}</h3>
        <button className={article.structureApproved ? 'soft-button' : 'primary-button'} type="button" onClick={toggleOutlineApproval} data-testid="button-approve-article-outline">
          {article.structureApproved ? t("Изменить структуру") : t("Утвердить структуру")} <Check size={14} />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#6e7976]">{article.structureApproved ? t("После проверки можно получать отдельные рабочие рекомендации для каждого раздела.") : t("Пока структура не утверждена, отредактируйте разделы. Утверждение остаётся за вами.")}</p>
      <div className="mt-4 space-y-3">{article.plan.sections.map((section, index) => {
        const guidance = article.sectionGuidance[section.id];
        const busy = busySectionId === section.id;
        return <article key={section.id} className="rounded-md border border-[#e8e7df] bg-[#fcfcf9] p-4" data-testid={`article-section-${section.id}`}>
          <div className="mb-3 flex items-center justify-between gap-2"><span className="status-pill">{t("Раздел ")}{index + 1}</span>{article.structureApproved && <button className="soft-button" type="button" disabled={busy || !!busySectionId} onClick={() => requestSectionHelp(section)} data-testid={`button-section-help-${section.id}`}>{busy ? t("ИИ готовит рекомендации…") : t("Помощь ИИ по разделу")} <Lightbulb size={14} /></button>}</div>
          {!article.structureApproved
            ? <div className="space-y-3">
              <label className="block text-[11px] font-semibold text-[#52625f]">{t("Название раздела")}<input className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[13px] text-[#354754]" value={section.title} maxLength={200} onChange={(event) => updateSection(section.id, { title: event.target.value })} /></label>
              <label className="block text-[11px] font-semibold text-[#52625f]">{t("Назначение раздела")}<textarea className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#354754]" value={section.purpose} maxLength={1200} rows={2} onChange={(event) => updateSection(section.id, { purpose: event.target.value })} /></label>
              <label className="block text-[11px] font-semibold text-[#52625f]">{t("Вопросы для автора · по одному на строку")}<textarea className="mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#354754]" value={section.guidingQuestions.join('\n')} rows={2} onChange={(event) => updateSection(section.id, { guidingQuestions: event.target.value.split('\n').slice(0, 5).map((question) => question.slice(0, 300)) })} /></label>
            </div>
            : <><h4 className="serif mb-2 mt-0 text-[17px] text-[#354754]">{section.title}</h4><p className="text-[12px] leading-relaxed text-[#5f6b6a]">{section.purpose}</p><ul className="mb-0 list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-[#6e7976]">{section.guidingQuestions.map((question, questionIndex) => <li key={`${questionIndex}-${question}`}>{question}</li>)}</ul></>}
          {guidance && <div className="mt-4 space-y-3 border-t border-[#e8e7df] pt-4" data-testid={`article-guidance-${section.id}`}>
            <p className="mb-0 rounded-md bg-[#eef3ed] p-3 text-[11px] leading-relaxed text-[#45604d]"><strong>{t("Что подтверждают доступные материалы:")}</strong> {guidance.evidenceSummary}</p>
            <div><h5 className="mb-2 mt-0 text-[11px] font-semibold text-[#40505b]">{t("Рабочие заметки ИИ · требуют проверки")}</h5><ul className="mb-0 space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{guidance.researchNotes.map((note, noteIndex) => <li key={`${noteIndex}-${note}`}>{note}</li>)}</ul></div>
            <div><h5 className="mb-2 mt-0 text-[11px] font-semibold text-[#40505b]">{t("Вопросы исследователю")}</h5><ul className="mb-0 space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{guidance.questionsForResearcher.map((question, questionIndex) => <li key={`${questionIndex}-${question}`}>{question}</li>)}</ul></div>
            <p className="mb-0 rounded-md border border-[#e9e1cf] bg-[#f7f3e9] p-3 text-[11px] leading-relaxed text-[#756f61]"><strong>{t("Ограничения:")}</strong> {guidance.limitations} {t(" Полный текст публикаций не анализировался, если в OpenAlex доступна только аннотация.")}</p>
          </div>}
        </article>;
      })}</div>
      <p className="mb-0 mt-5 rounded-md border border-[#e9e1cf] bg-[#f7f3e9] p-4 text-[11px] leading-relaxed text-[#756f61]"><strong>{t("Контекст и ограничения.")}</strong> {article.plan.evidenceNote} {t(" Источники проверяются по OpenAlex при каждом запросе; ИИ не создаёт доказательства, результаты, цитаты или фиктивные публикации.")}</p>
    </section>}
    <p className="mb-0 mt-4 text-[10px] leading-relaxed text-[#7a837f]">{t("Черновики статей хранятся локально в этом браузере отдельно от старых черновиков исследования. Очистка данных сайта может удалить локальные черновики.")}</p>
  </main>;
}
