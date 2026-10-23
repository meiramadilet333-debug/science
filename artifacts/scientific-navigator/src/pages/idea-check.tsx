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
import { similarityLabel, publicationsCountLabel, normalizeIdeaCheckResponse, useDrafts } from '@/features/research/shared';

export default function IdeaCheckPage() {
  const { locale } = useLocale();
  const { saveIdeaCheck } = useDrafts();
  const [, setLocation] = useLocation();
  const [idea, setIdea] = useState('');
  const [result, setResult] = useState<CheckScientificIdeaResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRefinement, setShowRefinement] = useState(false);
  const [refinementText, setRefinementText] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedIdea = idea.trim();
    if (normalizedIdea.length < 2) {
      setError('Введите идею или исследовательский вопрос длиной не менее двух символов.');
      return;
    }
    if (normalizedIdea.length > 5000) {
      setError('Идея не должна превышать 5000 символов.');
      return;
    }
    setIsChecking(true);
    setError('');
    setNotice('');
    setResult(null);
    setSelectedIds(new Set());
    setShowRefinement(false);
    try {
      const response = await checkScientificIdea({ idea: normalizedIdea });
      const normalizedResponse = normalizeIdeaCheckResponse(response);
      if (!normalizedResponse) {
        setError('Сервер вернул неполный результат проверки. Повторите запрос позже.');
        return;
      }
      setResult(normalizedResponse);
      setRefinementText(normalizedIdea);
    } catch (requestError) {
      const data = requestError && typeof requestError === 'object' && 'data' in requestError
        ? requestError.data
        : null;
      const apiMessage = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null;
      setError(apiMessage ?? 'Не удалось проверить идею. Проверьте подключение и попробуйте позже.');
    } finally {
      setIsChecking(false);
    }
  };

  const persistSelected = () => {
    if (!result) return;
    const selectedMatches = result.matches.filter(({ publication }) =>
      selectedIds.has(publication.id),
    );
    return saveIdeaCheck(idea.trim(), selectedMatches);
  };

  const saveSelected = () => {
    try {
      const draft = persistSelected();
      if (!draft) return;
      const count = draft.ideaCheck?.selectedMatches.length ?? 0;
      setNotice(
        count > 0
          ? locale === 'kk'
            ? `Идея және ${publicationsCountLabel(count, locale)} осы құрылғыдағы «Менің зерттеулерім» бөліміне сақталды.`
            : `Идея и ${publicationsCountLabel(count, locale)} сохранены в «Мои исследования» на этом устройстве.`
          : locale === 'kk'
            ? 'Идея осы құрылғыдағы «Менің зерттеулерім» бөліміне жарияланымдар таңдалмай сақталды.'
            : 'Идея сохранена в «Мои исследования» на этом устройстве без выбранных публикаций.',
      );
      setError('');
    } catch {
      setError('Не удалось сохранить данные в браузере. Проверьте настройки локального хранилища.');
      setNotice('');
    }
  };

  const continueToAnalysis = () => {
    const refinedIdea = refinementText.trim();
    if (refinedIdea.length < 2 || refinedIdea.length > 5000) {
      setError('Формулировка должна содержать от 2 до 5000 символов.');
      return;
    }
    try {
      const draft = persistSelected();
      if (!draft) return;
      setLocation(
        `/?draft=${encodeURIComponent(draft.id)}&idea=${encodeURIComponent(refinedIdea)}`,
      );
    } catch {
      setError('Не удалось сохранить выбранные публикации в браузере. Переход к анализу не выполнен.');
    }
  };

  return <main className="content-wrap">
    <div className="mb-7">
      <p className="eyebrow mb-2">{t("Проверка по каталогу публикаций")}</p>
      <h1 className="serif m-0 text-[32px] text-[#26394a] sm:text-[39px]">{t("Проверка исследовательской идеи")}</h1>
      <p className="mb-0 mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6e7976]">{t("Сопоставьте идею с реальными записями OpenAlex. Похожие публикации не доказывают, что идея уже исследована, а отсутствие совпадений не доказывает новизну.")}</p>
    </div>

    <section className="page-card mb-6 p-5 sm:p-7">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg border border-[#d5e0d5] bg-[#f1f4ee] text-[#416855]"><Search size={18} /></span>
        <div><p className="eyebrow mb-1">{t("Шаг 1 · Опишите идею")}</p><h2 className="serif m-0 text-[21px] text-[#293a49]">{t("Что вы хотите проверить?")}</h2></div>
      </div>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="idea-check-input">{t("Исследовательская идея или вопрос")}</label>
        <textarea id="idea-check-input" className="prompt-input min-h-[120px]" value={idea} onChange={(event) => { setIdea(event.target.value); setResult(null); setSelectedIds(new Set()); setNotice(''); setError(''); }} maxLength={5000} placeholder={t("Например: как цифровые сервисы влияют на доступность медицинской помощи в сельских районах?")} disabled={isChecking} data-testid="input-idea-check" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-xl text-[11px] leading-relaxed text-[#6d7975]">{t("ИИ выделит понятия и англоязычные эквиваленты, затем сервер найдёт записи OpenAlex и объяснит совпадения. Секретный ключ остаётся на сервере; введённая идея не сохраняется на сервере.")}</p>
          <button className="primary-button" type="submit" disabled={isChecking} data-testid="button-check-idea"><Search size={15} />{isChecking ? t("Ищем и анализируем…") : t("Проверить идею")}</button>
        </div>
        <p className="mb-0 mt-2 text-right text-[10px] text-[#7a837f]">{idea.length}/5000</p>
        {error && <p role="alert" className="mt-3 text-[12px] text-[#a0443f]" data-testid="status-idea-check-error">{t(error)}</p>}
        {notice && <p role="status" className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-[#315f50]" data-testid="status-idea-check-notice"><Check size={15} className="mt-0.5 shrink-0" />{t(notice)}</p>}
      </form>
    </section>

    {isChecking && <section className="page-card flex items-center gap-3 p-6 text-[13px] text-[#53645e]" role="status" data-testid="status-idea-check-loading"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d8e1d8] border-t-[#4d795f]" />{t("ИИ формирует запрос, OpenAlex ищет публикации, выполняется анализ совпадений…")}</section>}

    {result && !isChecking && <section aria-labelledby="idea-check-results-title" data-testid="section-idea-check-results">
      <div className="page-card mb-5 p-5 sm:p-7">
        <p className="eyebrow mb-2">{t("Шаг 2 · Результат проверки · OpenAlex")}</p>
        <h2 id="idea-check-results-title" className="serif mb-3 mt-0 text-[23px] text-[#293a49]">{result.matches.length > 0 ? t("Найдены похожие публикации") : result.searches.every((search) => search.totalCount === 0) ? t("По запросам совпадений не найдено") : t("Подходящие записи не удалось отобразить")}</h2>
        <p className="text-[13px] leading-[1.75] text-[#45565e]" data-testid="text-idea-check-summary">{result.summary}</p>
        <div className="mt-4 grid gap-4 border-t border-[#eeeae2] pt-4 sm:grid-cols-2">
          <div><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64746e]">{t("Ключевые понятия запроса")}</h3><div className="flex flex-wrap gap-2">{result.keywords.map((word) => <span key={word} className="rounded-full border border-[#dfe6dd] bg-[#f4f6f0] px-2.5 py-1 text-[11px] text-[#456453]">{word}</span>)}</div></div>
          <div><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64746e]">{t("Английские эквиваленты")}</h3><div className="flex flex-wrap gap-2">{result.englishSynonyms.length > 0 ? result.englishSynonyms.map((word) => <span key={word} className="rounded-full border border-[#e4e6e0] bg-[#f8f8f5] px-2.5 py-1 text-[11px] text-[#586762]">{word}</span>) : <span className="text-[11px] text-[#7a837f]">{t("Не добавлены")}</span>}</div></div>
        </div>
        <div className="mt-4 border-t border-[#eeeae2] pt-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64746e]">{t("Поисковые запросы OpenAlex")}</h3>
          <ul className="mb-0 space-y-2 pl-4 text-[11px] leading-relaxed text-[#596862]">
            {result.searches.map((search, index) => <li key={`${index}-${search.query}`}>
              <span className="font-medium text-[#40564e]">{search.query}</span>
              <span className="ml-2 text-[#74807b]">{t("Найдено записей: ")}{search.totalCount}</span>
            </li>)}
          </ul>
          <p className="mb-0 mt-3 text-[11px] text-[#74807b]">{t("Уникальных публикаций получено: ")}{result.totalCount}</p>
        </div>
      </div>

      {result.matches.length === 0 ? <div className="page-card mb-5 p-5 sm:p-7" data-testid="empty-idea-check-results">
        <p className="mb-0 text-[13px] leading-relaxed text-[#65716e]">{result.searches.every((search) => search.totalCount === 0) ? t("Поиск зависит от выбранных терминов, доступных метаданных и полноты каталога. Попробуйте переформулировать идею, используя более конкретные понятия.") : t("В выдаче OpenAlex есть совпадения, но записи не содержат данных, достаточных для показа. Это не позволяет сделать вывод о похожести исследований.")}</p>
      </div> : <div className="mb-5 space-y-5">
        {(['high', 'partial', 'adjacent', 'insufficient'] as const).map((similarity) => {
          const groupedMatches = result.matches.filter((match) => match.similarity === similarity);
          if (groupedMatches.length === 0) return null;
          return <section key={similarity} aria-labelledby={`similarity-group-${similarity}`} data-testid={`group-similarity-${similarity}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id={`similarity-group-${similarity}`} className="m-0 text-[13px] font-semibold text-[#304252]">{similarityLabel(similarity)}</h3>
              <span className="text-[11px] text-[#78827d]">{publicationsCountLabel(groupedMatches.length, locale)}</span>
            </div>
            <div className="space-y-3">{groupedMatches.map(({ publication, matchReason, evidenceLevel }, index) => <article key={publication.id} className="page-card p-5 sm:p-6" data-testid={`card-idea-match-${index}`}>
              <div className="flex gap-3">
                <label className="mt-1 flex shrink-0 items-start" title={t("Выбрать публикацию для сохранения")}>
                  <input type="checkbox" checked={selectedIds.has(publication.id)} onChange={(event) => setSelectedIds((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(publication.id); else next.delete(publication.id);
                    return next;
                  })} aria-label={`Сохранить публикацию: ${publication.title}`} data-testid={`checkbox-save-publication-${index}`} />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-[#688071]">{t("Факт · запись OpenAlex")}</span><a href={publication.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-[#52745d] hover:underline" data-testid={`link-openalex-publication-${index}`}>{t("Оригинальная запись ")}<ArrowUpRight size={12} /></a></div>
                  <h4 className="serif mb-2 mt-0 text-[18px] leading-snug text-[#2c3e4c]">{publication.title}</h4>
                  <p className="mb-2 text-[11px] leading-relaxed text-[#68746f]">{publication.authors.length ? publication.authors.join(', ') : t("Авторы не указаны")}{publication.year !== null ? ` · ${publication.year}` : ''}{publication.sourceName ? ` · ${publication.sourceName}` : ''}</p>
                  {publication.abstract ? <p className="mb-3 text-[12px] leading-[1.7] text-[#54625e]"><span className="font-semibold">{t("Аннотация OpenAlex: ")}</span>{publication.abstract}</p> : <p className="mb-3 text-[11px] text-[#7a837f]">{t("Аннотация в OpenAlex недоступна; оценка основана только на доступных метаданных.")}</p>}
                  {publication.doi && <p className="mb-3 text-[11px] text-[#68746f]">DOI: <a className="text-[#52745d] hover:underline" href={publication.url} target="_blank" rel="noreferrer">{publication.doi}</a></p>}
                  {publication.topics.length > 0 && <p className="mb-3 text-[11px] leading-relaxed text-[#68746f]"><span className="font-semibold">{t("Темы OpenAlex: ")}</span>{publication.topics.join(' · ')}</p>}
                  <div className="rounded-md border border-[#e5eadf] bg-[#f7f8f4] p-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#6a796f]">{t("Интерпретация ИИ · ")}{evidenceLevel === 'adequate' ? t("по доступным метаданным") : evidenceLevel === 'limited' ? t("данных ограниченно") : t("данных недостаточно")}</p><p className="mb-0 text-[12px] leading-[1.7] text-[#465951]">{matchReason}</p></div>
                </div>
              </div>
            </article>)}</div>
          </section>;
        })}
      </div>}

      <div className="page-card mb-5 p-5 sm:p-7">
        <p className="eyebrow mb-2">{t("Возможные направления уточнения")}</p>
        <h2 className="serif mb-3 mt-0 text-[20px] text-[#293a49]">{t("Что можно конкретизировать")}</h2>
        <ul className="mb-4 space-y-2 pl-5 text-[12px] leading-relaxed text-[#56645e]">{result.refinementDirections.map((direction, index) => <li key={`${index}-${direction}`}>{direction}</li>)}</ul>
        <p className="mb-0 text-[11px] leading-relaxed text-[#7a837f]">{result.evidenceNote}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[11px] text-[#77817c]">{t("Выберите публикации, чтобы сохранить их рядом с идеей в разделе «Мои исследования».")}</p>
        <button className="soft-button" type="button" onClick={saveSelected} data-testid="button-save-idea-check"><BookOpen size={14} />{t("Сохранить идею и ")}{publicationsCountLabel(selectedIds.size, locale)}</button>
      </div>
      <div className="mt-5 rounded-lg border border-[#e6e8df] bg-[#f8f8f4] p-5">
        <p className="eyebrow mb-2">{t("Следующий шаг")}</p>
        <h3 className="serif mb-2 mt-0 text-[19px] text-[#293a49]">{t("Уточните научную идею")}</h3>
        {!showRefinement ? <button className="soft-button" type="button" onClick={() => { setRefinementText(idea); setShowRefinement(true); }} data-testid="button-open-idea-refinement">{t("Уточнить научную идею")}</button> : <>
          <label htmlFor="idea-refinement-text" className="mb-2 block text-[11px] text-[#697570]">{t("Скорректируйте формулировку с учётом найденных публикаций. Выбранные источники сохранятся рядом с исследованием.")}</label>
          <textarea id="idea-refinement-text" className="prompt-input min-h-[90px]" value={refinementText} onChange={(event) => setRefinementText(event.target.value)} maxLength={5000} data-testid="input-idea-refinement" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="primary-button" type="button" onClick={continueToAnalysis} data-testid="button-continue-to-analysis"><ArrowRight size={15} />{t("Перейти к анализу научной идеи")}</button>
            <button className="soft-button" type="button" onClick={() => setShowRefinement(false)}>{t("Отмена")}</button>
          </div>
        </>}
      </div>
    </section>}
  </main>;
}

