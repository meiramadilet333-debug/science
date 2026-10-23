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
import { ClarificationRound, SavedIdeaCheck, similarityLabel, getDrafts, useDrafts } from '@/features/research/shared';

const cards: ResearchTool[] = [
  { title: 'Научный радар', description: 'Ищите реальные научные публикации по вопросу в каталоге OpenAlex.', path: '/radar', icon: TrendingUp, tag: 'Поиск OpenAlex' },
  { title: 'Проверка идеи', description: 'Сопоставьте вопрос с найденными записями OpenAlex и проверьте границы доступных данных.', path: '/idea-check', icon: ShieldCheck, tag: 'OpenAI + OpenAlex' },
  { title: 'Поиск темы', description: 'Исследуйте актуальные направления и подберите выполнимую тему с помощью ИИ.', path: '/topic-search', icon: Search, tag: 'ИИ + OpenAlex' },
  { title: 'Мои исследования', description: 'Возвращайтесь к черновикам и сохранённым результатам из этого браузера.', path: '/my-research', icon: FolderOpen, tag: 'Локальный архив' },
  { title: 'Научные источники', description: 'Ищите публикации и формируйте персональную локальную библиотеку.', path: '/sources', icon: BookOpen, tag: 'OpenAlex' },
  { title: 'Научные работы', description: 'Подготовьте план статьи и прорабатывайте разделы с ИИ-помощником.', path: '/works', icon: FileText, tag: 'Рабочий план' },
  { title: 'Публикации', description: 'Проверьте требования журнала перед подготовкой рукописи к отправке.', path: '/publications', icon: GraduationCap, tag: 'ИИ-чек-лист' },
  { title: 'Научные гранты', description: 'Проверяйте официальные объявления с подтверждённым открытым приёмом.', path: '/grants', icon: BriefcaseBusiness, tag: 'Официальные источники' },
  { title: 'Настройки', description: 'Управляйте профилем исследователя и предпочтениями ответов ИИ.', path: '/settings', icon: Settings, tag: 'Ваш профиль' },
];

export default function HomePage() {
  useLocale();
  const { add, saveResearch } = useDrafts();
  const [, setLocation] = useLocation();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<ScientificIdeaAnalysis | null>(null);
  const [savedIdeaCheck, setSavedIdeaCheck] = useState<SavedIdeaCheck | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Проверяем конкретность темы…');
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const [clarificationRounds, setClarificationRounds] = useState<ClarificationRound[]>([]);
  const [refinedIdea, setRefinedIdea] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get('draft');
    const selectedIdea = params.get('idea');
    if (draftId) {
      const draft = getDrafts().find((item) => item.id === draftId);
      if (draft) {
        setActiveDraftId(draft.id);
        setText(selectedIdea ?? draft.research?.originalIdea ?? draft.text);
        setSavedIdeaCheck(draft.ideaCheck ?? null);
        if (
          draft.research &&
          (!selectedIdea ||
            selectedIdea.trim() === draft.research.confirmedTopic.trim() ||
            selectedIdea.trim() === draft.research.originalIdea.trim())
        ) {
          setAnalysis(draft.research.analysis);
          setRefinedIdea(draft.research.confirmedTopic);
          setClarificationRounds(draft.research.clarificationRounds);
          setNotice('Сохранённое исследование восстановлено из браузера. Повторный запрос к ИИ не выполнялся.');
        } else if (draft.research) {
          setNotice('Сохранённые публикации восстановлены. Вы изменили тему — запустите анализ, чтобы получить результат для новой формулировки.');
        } else if (draft.ideaCheck) {
          setNotice('Идея и выбранные публикации восстановлены из браузера. Повторный запрос к ИИ не выполнялся.');
        } else {
          setNotice('Черновик открыт. Изменённый текст можно сохранить как отдельный черновик.');
        }
      }
    } else if (selectedIdea) {
      setText(selectedIdea);
      setNotice('Тема перенесена из поиска. Нажмите «Начать исследование», чтобы проверить её и запустить анализ.');
    }
  }, []);
  const setRequestError = (requestError: unknown, fallback: string) => {
    const data = requestError && typeof requestError === 'object' && 'data' in requestError
      ? requestError.data
      : null;
    const apiMessage = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : null;
    setError(apiMessage ?? fallback);
  };
  const runAnalysis = async (idea: string) => {
    setProcessingLabel('Ищем публикации и анализируем…');
    const result = await analyzeScientificIdea({ idea });
    setAnalysis(result);
    setRefinedIdea(idea);
    setClarificationQuestions([]);
    setAwaitingConfirmation(false);
    try {
      const saved = saveResearch(text.trim() || idea, idea, clarificationRounds, result, activeDraftId);
      setActiveDraftId(saved.id);
      setNotice('Анализ выполнен и сохранён в разделе «Мои исследования» на этом устройстве. Проверьте выводы по первоисточникам.');
    } catch {
      setError('Анализ получен, но не удалось сохранить его в браузере. Проверьте свободное место и настройки хранилища, затем повторите анализ.');
      setNotice('');
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const idea = text.trim();
    if (idea.length < 2) { setError('Опишите исследовательскую идею (не менее двух символов).'); return; }
    if (idea.length > 5000) { setError('Идея не должна превышать 5000 символов.'); return; }
    setIsAnalyzing(true);
    setProcessingLabel('Проверяем конкретность темы…');
    setError('');
    setNotice('');
    setAnalysis(null);
    setClarificationQuestions([]);
    setClarificationAnswers([]);
    setClarificationRounds([]);
    setRefinedIdea('');
    setAwaitingConfirmation(false);
    try {
      const preparation = await prepareScientificIdea({ idea });
      if (preparation.needsClarification) {
        setClarificationQuestions(preparation.questions);
        setClarificationAnswers(preparation.questions.map(() => ''));
        setNotice('ИИ считает тему широкой. Ответьте на уточняющие вопросы, чтобы сформулировать конкретное направление.');
      } else {
        await runAnalysis(idea);
      }
    } catch (requestError) {
      setRequestError(requestError, 'Не удалось подготовить исследовательскую идею. Проверьте подключение и настройки ИИ-сервиса.');
    } finally {
      setIsAnalyzing(false);
    }
  };
  const submitClarification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (clarificationAnswers.some((answer) => !answer.trim())) {
      setError('Ответьте на каждый уточняющий вопрос.');
      return;
    }
    setIsAnalyzing(true);
    setProcessingLabel('Формулируем уточнённую тему…');
    setError('');
    setNotice('');
    try {
      const preparation = await prepareScientificIdea({
        idea: text.trim(),
        questions: clarificationQuestions,
        answers: clarificationAnswers.map((answer) => answer.trim()),
      });
      if (preparation.needsClarification) {
        const submittedRound = {
          questions: clarificationQuestions,
          answers: clarificationAnswers.map((answer) => answer.trim()),
        };
        setClarificationRounds((previousRounds) => [...previousRounds, submittedRound]);
        setClarificationAnswers((previousAnswers) => preparation.questions.map((question) => {
          const previousIndex = clarificationQuestions.findIndex(
            (previousQuestion) => previousQuestion.trim().toLocaleLowerCase() === question.trim().toLocaleLowerCase(),
          );
          return previousIndex >= 0 ? previousAnswers[previousIndex] ?? '' : '';
        }));
        setClarificationQuestions(preparation.questions);
        setNotice('ИИ задал дополнительные вопросы. Уточните ответы, чтобы сформулировать тему.');
        return;
      }
      setClarificationRounds((previousRounds) => [
        ...previousRounds,
        {
          questions: clarificationQuestions,
          answers: clarificationAnswers.map((answer) => answer.trim()),
        },
      ]);
      setRefinedIdea(preparation.refinedIdea);
      setAwaitingConfirmation(true);
      setNotice('Проверьте предложенную тему и при необходимости отредактируйте её. Анализ начнётся только после подтверждения.');
    } catch (requestError) {
      setRequestError(requestError, 'Не удалось сформулировать уточнённую тему. Проверьте подключение и попробуйте снова.');
    } finally {
      setIsAnalyzing(false);
    }
  };
  const confirmRefinedIdea = async () => {
    const idea = refinedIdea.trim();
    if (idea.length < 2) { setError('Уточнённая тема должна содержать не менее двух символов.'); return; }
    if (idea.length > 5000) { setError('Уточнённая тема не должна превышать 5000 символов.'); return; }
    setIsAnalyzing(true);
    setError('');
    setNotice('');
    try {
      await runAnalysis(idea);
    } catch (requestError) {
      setRequestError(requestError, 'Не удалось выполнить анализ. Проверьте подключение и настройки ИИ-сервиса, затем попробуйте снова.');
    } finally {
      setIsAnalyzing(false);
    }
  };
  const saveDraft = () => {
    if (!text.trim()) { setError('Введите идею, чтобы сохранить черновик.'); return; }
    try {
      const draft = add(text);
      setActiveDraftId(draft.id);
      setNotice('Черновик сохранён только на этом устройстве.');
      setError('');
    } catch {
      setError('Не удалось сохранить черновик в браузере. Проверьте доступность локального хранилища и попробуйте снова.');
      setNotice('');
    }
  };
  const updateIdea = (value: string) => {
    const keepSourceContext = savedIdeaCheck !== null;
    setText(value);
    if (!keepSourceContext) setActiveDraftId(null);
    setAnalysis(null);
    if (!keepSourceContext) setSavedIdeaCheck(null);
    setClarificationQuestions([]);
    setClarificationAnswers([]);
    setClarificationRounds([]);
    setRefinedIdea('');
    setAwaitingConfirmation(false);
    setError('');
    setNotice('');
  };
  const aiState: AILiveState = isAnalyzing ? 'analyzing' : error ? 'error' : analysis ? 'complete' : text.trim() ? 'typing' : 'idle';
  return <main className="content-wrap home-page">
    <HeroSection state={aiState}>
        <div className="prompt-box">
        <div className="prompt-heading"><span className="prompt-heading-icon"><Lightbulb size={18} aria-hidden="true" /></span><div><p className="eyebrow mb-1">{t("Начните исследование")}</p><h2 id="prompt-title" className="serif m-0 text-[23px]">{t("Что вы хотите исследовать?")}</h2></div></div>
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="research-prompt">{t("Опишите вашу научную идею или вопрос")}</label>
          <textarea id="research-prompt" className="prompt-input" value={text} onChange={(event) => updateIdea(event.target.value)} placeholder={t("Опишите идею, наблюдение или вопрос, который хотите изучить…")} maxLength={5000} disabled={isAnalyzing} data-testid="input-research-prompt" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button className="soft-button" type="button" onClick={saveDraft} disabled={isAnalyzing} data-testid="button-save-draft">{t("Сохранить черновик")}</button>
              <button className="primary-button" type="submit" disabled={isAnalyzing} data-testid="button-start-research">{isAnalyzing ? t(processingLabel) : t("Начать исследование")} <ArrowRight size={15} /></button>
            </div>
          </div>
          <div className="prompt-footnote"><span>{t("OpenAI + публикации OpenAlex")}</span><span>{text.length}/5000</span></div>
          {error && <p role="alert" className="mt-3 text-[12px] text-[#a0443f]" data-testid="status-analysis-error">{t(error)}</p>}
          {notice && <p role="status" className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-[#315f50]" data-testid="status-analysis-notice"><Check size={15} className="mt-0.5 shrink-0" />{t(notice)}</p>}
        </form>
      </div>
    </HeroSection>
    {savedIdeaCheck && <section className="page-card mb-8 p-5 sm:p-7" aria-labelledby="restored-idea-check-title" data-testid="section-restored-idea-check">
      <p className="eyebrow mb-2">{t("Сохранённая проверка · без повторного запроса к ИИ")}</p>
      <h2 id="restored-idea-check-title" className="serif mb-3 mt-0 text-[21px] text-[#293a49]">{t("Публикации, сохранённые с исследованием")}</h2>
      {savedIdeaCheck.selectedMatches.length === 0 ? <p className="mb-0 text-[12px] text-[#6e7976]">{t("Для этой идеи не были выбраны публикации.")}</p> : <ul className="mb-0 space-y-3 pl-5">
        {savedIdeaCheck.selectedMatches.map(({ publication, matchReason, similarity, evidenceLevel }) => <li key={publication.id} className="text-[12px] leading-relaxed text-[#52625f]">
          <a href={publication.url} target="_blank" rel="noreferrer" className="font-semibold text-[#456b58] hover:underline">{publication.title} <ArrowUpRight size={11} className="inline" /></a>
          <span className="block text-[10px] text-[#78827d]">{similarityLabel(similarity)} · {publication.authors.join(', ')}{publication.year !== null ? ` · ${publication.year}` : ''}{evidenceLevel !== 'adequate' ? t(" · ограниченная информация") : ''}</span>
          <span className="block mt-1">{matchReason}</span>
          {publication.abstract && <span className="mt-1 block text-[11px] text-[#707b76]">{t("Аннотация OpenAlex: ")}{publication.abstract}</span>}
          {!publication.abstract && <span className="mt-1 block text-[10px] text-[#818a85]">{t("Аннотация в OpenAlex недоступна.")}</span>}
        </li>)}
      </ul>}
    </section>}
    {clarificationQuestions.length > 0 && <section className="page-card mb-8 p-5 sm:p-7" aria-labelledby="clarification-title" data-testid="section-idea-clarification">
      <div className="mb-5">
        <p className="eyebrow mb-2">{t("Уточнение исследовательской идеи")}</p>
        <h2 id="clarification-title" className="serif m-0 text-[22px] text-[#293a49]">{t("Помогите сузить тему")}</h2>
        <p className="mb-0 mt-2 text-[12px] leading-relaxed text-[#66726e]">{t("Вопросы сформированы ИИ для вашей идеи. Ответы помогут предложить конкретное научное направление.")}</p>
      </div>
      <form onSubmit={submitClarification} className="space-y-4">
        {clarificationQuestions.map((question, index) => <div key={`${index}-${question}`}>
          <label htmlFor={`clarification-answer-${index}`} className="mb-2 block text-[12px] font-semibold text-[#40505b]">{index + 1}. {question}</label>
          <textarea id={`clarification-answer-${index}`} className="prompt-input min-h-[76px]" value={clarificationAnswers[index] ?? ''} onChange={(event) => setClarificationAnswers((current) => current.map((answer, answerIndex) => answerIndex === index ? event.target.value : answer))} maxLength={2000} disabled={isAnalyzing} data-testid={`input-clarification-answer-${index}`} />
        </div>)}
        <button className="primary-button" type="submit" disabled={isAnalyzing} data-testid="button-submit-clarification">{isAnalyzing ? t(processingLabel) : t("Сформулировать тему")} <ArrowRight size={15} /></button>
      </form>
    </section>}
    {awaitingConfirmation && <section className="page-card mb-8 p-5 sm:p-7" aria-labelledby="refined-idea-title" data-testid="section-refined-idea">
      <p className="eyebrow mb-2">{t("Предложение ИИ")}</p>
      <h2 id="refined-idea-title" className="serif mb-3 mt-0 text-[22px] text-[#293a49]">{t("Уточнённая тема исследования")}</h2>
      <label htmlFor="refined-idea" className="sr-only">{t("Отредактируйте уточнённую тему")}</label>
      <textarea id="refined-idea" className="prompt-input min-h-[90px]" value={refinedIdea} onChange={(event) => setRefinedIdea(event.target.value)} maxLength={5000} disabled={isAnalyzing} data-testid="input-refined-idea" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="primary-button" type="button" onClick={confirmRefinedIdea} disabled={isAnalyzing} data-testid="button-confirm-refined-idea">{isAnalyzing ? t(processingLabel) : t("Подтвердить тему и начать анализ")} <ArrowRight size={15} /></button>
        <button className="soft-button" type="button" onClick={() => { setAwaitingConfirmation(false); setError(''); setNotice('При необходимости измените ответы на уточняющие вопросы.'); }} disabled={isAnalyzing} data-testid="button-edit-clarification-answers">{t("Изменить ответы")}</button>
      </div>
    </section>}
    {analysis && <section className="page-card mb-8 p-5 sm:p-7" aria-labelledby="analysis-title" data-testid="section-research-analysis">
      <div className="mb-6 border-b border-[#e7e4dc] pb-4">
        <p className="eyebrow mb-2">{t("Предварительный ИИ-анализ")}</p>
        <h2 id="analysis-title" className="serif m-0 text-[24px] text-[#293a49]">{t("Основа исследования")}</h2>
      </div>
      {refinedIdea && <p className="mb-5 rounded-md border border-[#dce5dc] bg-[#f1f4ee] p-4 text-[13px] leading-relaxed text-[#40574a]"><span className="font-semibold">{t("Подтверждённая тема: ")}</span>{refinedIdea}</p>}
      {clarificationRounds.length > 0 && <details className="mb-5 rounded-md border border-[#e7e4dc] p-4" data-testid="section-saved-clarifications">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#40505b]">{t("Уточняющие вопросы и ваши ответы")}</summary>
        <div className="mt-3 space-y-3">{clarificationRounds.flatMap((round, roundIndex) => round.questions.map((question, index) => <div key={`${roundIndex}-${index}`}>
          <p className="mb-1 text-[12px] font-medium text-[#40505b]">{question}</p>
          <p className="m-0 whitespace-pre-wrap text-[12px] leading-relaxed text-[#6e7976]">{round.answers[index] ?? ''}</p>
        </div>))}</div>
      </details>}
      <div className="grid gap-5 sm:grid-cols-2">
        <article><h3 className="mb-2 mt-0 text-[13px] font-semibold text-[#304252]">{t("Научная проблема")}</h3><p className="m-0 text-[13px] leading-relaxed text-[#5f6b6a]">{analysis.problem}</p></article>
        <article><h3 className="mb-2 mt-0 text-[13px] font-semibold text-[#304252]">{t("Актуальность")}</h3><p className="m-0 text-[13px] leading-relaxed text-[#5f6b6a]">{analysis.relevance}</p></article>
        <article><h3 className="mb-2 mt-0 text-[13px] font-semibold text-[#304252]">{t("Возможная новизна")}</h3><p className="m-0 text-[13px] leading-relaxed text-[#5f6b6a]">{analysis.possibleNovelty}</p></article>
        <article><h3 className="mb-2 mt-0 text-[13px] font-semibold text-[#304252]">{t("Варианты темы")}</h3><ol className="m-0 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-[#5f6b6a]">{analysis.topicOptions.map((topic, index) => <li key={`${index}-${topic}`}>{topic}</li>)}</ol></article>
        <article><h3 className="mb-2 mt-0 text-[13px] font-semibold text-[#304252]">{t("Цель исследования")}</h3><p className="m-0 text-[13px] leading-relaxed text-[#5f6b6a]">{analysis.goal}</p></article>
        <article><h3 className="mb-2 mt-0 text-[13px] font-semibold text-[#304252]">{t("Задачи")}</h3><ol className="m-0 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-[#5f6b6a]">{analysis.tasks.map((task, index) => <li key={`${index}-${task}`}>{task}</li>)}</ol></article>
      </div>
      <div className="mt-7 border-t border-[#e7e4dc] pt-5" data-testid="section-research-guidance">
        <p className="eyebrow mb-2">{t("Следующие шаги")}</p>
        <h3 className="serif mb-5 mt-0 text-[20px] text-[#293a49]">{t("Помощь ИИ в исследовании темы")}</h3>
        <div className="grid gap-5 lg:grid-cols-3">
          <article><h4 className="mb-2 mt-0 text-[12px] font-semibold text-[#304252]">{t("Возможные методы")}</h4><ul className="m-0 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{analysis.recommendedMethods.map((method, index) => <li key={`${index}-${method}`}>{method}</li>)}</ul></article>
          <article><h4 className="mb-2 mt-0 text-[12px] font-semibold text-[#304252]">{t("План работы")}</h4><ol className="m-0 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{analysis.researchPlan.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></article>
          <article><h4 className="mb-2 mt-0 text-[12px] font-semibold text-[#304252]">{t("Запросы для поиска литературы")}</h4><ul className="m-0 list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{analysis.literatureSearchQueries.map((query, index) => <li key={`${index}-${query}`}>{query}</li>)}</ul></article>
        </div>
      </div>
      <div className="mt-6 rounded-md border border-[#e9e1cf] bg-[#f7f3e9] p-4">
        <p className="mb-1 text-[11px] font-semibold text-[#665a3c]">{t("Основание и ограничения")}</p>
        <p className="m-0 text-[12px] leading-relaxed text-[#756f61]">{analysis.evidenceNote}</p>
        {analysis.sources.length > 0 ? <div className="mt-3 border-t border-[#e7dec9] pt-3">
          <p className="mb-2 text-[11px] font-semibold text-[#665a3c]">{t("Публикации OpenAlex для проверки")}</p>
          <ul className="m-0 list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-[#756f61]">{analysis.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer" className="text-[#426957] underline">{source.title}</a>{source.year ? ` (${source.year})` : ''}</li>)}</ul>
        </div> : <p className="mb-0 mt-3 text-[11px] text-[#756f61]">{t("OpenAlex не вернул публикаций для этой идеи; новизна особенно требует самостоятельной проверки.")}</p>}
      </div>
    </section>}
    <section aria-labelledby="tools-title">
      <div className="mb-4 flex items-end justify-between gap-4"><div><p className="eyebrow mb-1">{t("Инструменты навигатора")}</p><h2 className="serif m-0 text-[24px] text-[#293a49]" id="tools-title">{t("Продолжите путь исследования")}</h2></div><span className="hidden text-[11px] text-[#7c8581] sm:inline">{t("Доступны все разделы платформы")}</span></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((tool) => <ResearchToolCard key={tool.path} tool={tool} />)}
      </div>
    </section>
    <section className="mt-9 page-card p-5 sm:p-6" aria-labelledby="journey-title">
      <div className="mb-5 flex items-center justify-between gap-3"><div><p className="eyebrow mb-1">{t("От замысла к результату")}</p><h2 id="journey-title" className="serif m-0 text-[22px] text-[#293a49]">{t("Ваш научный путь")}</h2></div><span className="hidden text-[11px] text-[#77817d] sm:block">{t("Последовательность этапов")}</span></div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3" data-testid="journey-steps">{['Идея', 'Анализ', 'Научный пробел', 'Исследование', 'Научная работа', 'Проверка', 'Публикация'].map((step, index) => <div key={step} className="flex items-center gap-3"><div className="journey-step"><span className="step-dot">{String(index + 1).padStart(2, '0')}</span>{step}</div>{index < 6 && <ArrowRight size={13} className="text-[#aab4ac]" />}</div>)}</div>
      <p className="mb-0 mt-5 border-t border-[#ebe8e0] pt-4 text-[11px] leading-relaxed text-[#7a837f]">{t("Этапы — ориентир, а не показатель выполнения. ИИ-анализ и поиск публикаций доступны из разделов навигатора; выводы требуют самостоятельной проверки.")}</p>
    </section>
     <div className="mt-7 flex items-start gap-3 rounded-md border border-[#e2dfd7] bg-[#f8f6f0] px-4 py-3 text-[11px] leading-relaxed text-[#737c77]" data-testid="status-platform-limits"><CircleHelp size={15} className="mt-0.5 shrink-0 text-[#688071]" />{t("Первичный ИИ-анализ использует OpenAI и публикации OpenAlex; выводы, особенно о новизне, требуют проверки исследователем. Черновики хранятся только в этом браузере.")}</div>
  </main>;
}

