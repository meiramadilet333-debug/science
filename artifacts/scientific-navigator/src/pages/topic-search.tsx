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
import {  } from '@/features/research/shared';

export default function TopicSearchPage() {
  useLocale();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<'beginner' | 'advanced'>('beginner');
  const [interests, setInterests] = useState('');
  const [preparation, setPreparation] = useState<'beginner' | 'intermediate' | 'advanced' | 'unsure'>('unsure');
  const [workType, setWorkType] = useState<'coursework' | 'bachelor' | 'master' | 'dissertation' | 'article' | 'undecided'>('undecided');
  const [preferredDirection, setPreferredDirection] = useState('');
  const [scienceArea, setScienceArea] = useState('');
  const [problems, setProblems] = useState('');
  const [result, setResult] = useState<TopicRecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    let request: TopicRecommendationRequest;
    if (mode === 'beginner') {
      request = {
        mode,
        interests: interests.trim(),
        preparation,
        workType,
        preferredDirection: preferredDirection.trim(),
      };
    } else {
      request = {
        mode,
        scienceArea: scienceArea.trim(),
        problems: problems.trim(),
      };
    }
    try {
      setResult(await recommendScientificTopics(request));
    } catch (requestError) {
      const data = requestError && typeof requestError === 'object' && 'data' in requestError
        ? requestError.data
        : null;
      const apiMessage = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : null;
      setError(apiMessage ?? 'Не удалось подобрать темы. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const selectTopic = (title: string) => {
    setLocation(`/?idea=${encodeURIComponent(title)}`);
  };

  return <main className="content-wrap">
    <div className="mb-7">
      <p className="eyebrow mb-2">{t("От интереса к исследовательскому вопросу")}</p>
      <h1 className="serif m-0 text-[32px] text-[#26394a] sm:text-[39px]">{t("Поиск научной темы")}</h1>
      <p className="mb-0 mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6e7976]">{t("Выберите подходящий режим. ИИ предложит темы, которые можно перенести в анализ научной идеи.")}</p>
    </div>
    <section className="mb-5 grid gap-3 sm:grid-cols-2" aria-label={t("Режим поиска темы")}>
      <button type="button" onClick={() => { setMode('beginner'); setResult(null); setError(''); }} className="page-card topic-mode-card p-5 text-left" aria-pressed={mode === 'beginner'} data-testid="button-topic-mode-beginner">
        <span className="topic-mode-heading"><span className="eyebrow">{t("Для начинающего исследователя")}</span>{mode === 'beginner' && <span className="topic-mode-selected"><Check size={13} />{t("Выбрано")}</span>}</span>
        <span className="mt-2 block font-serif text-[20px] text-[#293a49]">{t("Помогите выбрать тему")}</span>
        <span className="mt-2 block text-[12px] leading-relaxed text-[#6e7976]">{t("Расскажите о своих интересах и работе — ИИ предложит выполнимые варианты.")}</span>
      </button>
      <button type="button" onClick={() => { setMode('advanced'); setResult(null); setError(''); }} className="page-card topic-mode-card p-5 text-left" aria-pressed={mode === 'advanced'} data-testid="button-topic-mode-advanced">
        <span className="topic-mode-heading"><span className="eyebrow">{t("Для опытного исследователя")}</span>{mode === 'advanced' && <span className="topic-mode-selected"><Check size={13} />{t("Выбрано")}</span>}</span>
        <span className="mt-2 block font-serif text-[20px] text-[#293a49]">{t("Найти перспективное направление")}</span>
        <span className="mt-2 block text-[12px] leading-relaxed text-[#6e7976]">{t("Сопоставьте интересующие вопросы с реальными публикациями OpenAlex.")}</span>
      </button>
    </section>
    <section className="page-card p-5 sm:p-7">
      <form onSubmit={submit} className="space-y-4">
        {mode === 'beginner' ? <>
          <div>
            <label htmlFor="topic-interests" className="mb-2 block text-[12px] font-semibold text-[#40505b]">{t("1. Какие области или вопросы вам интересны?")}</label>
            <textarea id="topic-interests" className="prompt-input min-h-[84px]" value={interests} onChange={(event) => setInterests(event.target.value)} minLength={2} maxLength={2000} required placeholder={t("Например: психология подростков, обучение, влияние соцсетей…")} disabled={loading} data-testid="input-topic-interests" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="topic-preparation" className="mb-2 block text-[12px] font-semibold text-[#40505b]">{t("2. Как вы оцениваете свою подготовку?")}</label>
              <select id="topic-preparation" className="prompt-input" value={preparation} onChange={(event) => setPreparation(event.target.value as typeof preparation)} disabled={loading} data-testid="select-topic-preparation">
                <option value="unsure">{t("Пока не уверен(а)")}</option><option value="beginner">{t("Начинающий уровень")}</option><option value="intermediate">{t("Есть опыт в области")}</option><option value="advanced">{t("Продвинутый уровень")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="topic-work-type" className="mb-2 block text-[12px] font-semibold text-[#40505b]">{t("3. Для какой работы выбираете тему?")}</label>
              <select id="topic-work-type" className="prompt-input" value={workType} onChange={(event) => setWorkType(event.target.value as typeof workType)} disabled={loading} data-testid="select-topic-work-type">
                <option value="undecided">{t("Пока не определился(ась)")}</option><option value="coursework">{t("Курсовая работа")}</option><option value="bachelor">{t("Бакалаврская работа")}</option><option value="master">{t("Магистерская диссертация")}</option><option value="dissertation">{t("Диссертационное исследование")}</option><option value="article">{t("Научная статья")}</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="topic-preferred-direction" className="mb-2 block text-[12px] font-semibold text-[#40505b]">{t("4. Какое направление вам ближе?")}</label>
            <textarea id="topic-preferred-direction" className="prompt-input min-h-[72px]" value={preferredDirection} onChange={(event) => setPreferredDirection(event.target.value)} minLength={2} maxLength={1000} required placeholder={t("Например: практическое исследование, сравнение групп, анализ причин…")} disabled={loading} data-testid="input-topic-preferred-direction" />
          </div>
        </> : <>
          <div>
            <label htmlFor="topic-science-area" className="mb-2 block text-[12px] font-semibold text-[#40505b]">{t("Научная область")}</label>
            <input id="topic-science-area" className="prompt-input" value={scienceArea} onChange={(event) => setScienceArea(event.target.value)} minLength={2} maxLength={300} required placeholder={t("Например: прикладная лингвистика, кибербезопасность…")} disabled={loading} data-testid="input-topic-science-area" />
          </div>
          <div>
            <label htmlFor="topic-problems" className="mb-2 block text-[12px] font-semibold text-[#40505b]">{t("Какие проблемы или исследовательские вопросы вас интересуют?")}</label>
            <textarea id="topic-problems" className="prompt-input min-h-[100px]" value={problems} onChange={(event) => setProblems(event.target.value)} minLength={2} maxLength={2000} required placeholder={t("Укажите, что именно хотите понять или какие проблемы замечаете…")} disabled={loading} data-testid="input-topic-problems" />
          </div>
        </>}
        <p className="m-0 text-[11px] leading-relaxed text-[#6d7975]">{mode === 'beginner' ? t("OpenAI сформирует варианты по вашим ответам. В этом режиме автоматическая проверка публикаций не выполняется.") : t("OpenAlex ищет публикации по вашей области и вопросам; OpenAI анализирует их метаданные. Недостаток источников будет явно отмечен.")}</p>
        <button className="primary-button" type="submit" disabled={loading} data-testid="button-find-topics">{loading ? t("Подбираем темы…") : t("Подобрать 5 тем")} <ArrowRight size={15} /></button>
        {error && <p role="alert" className="text-[12px] text-[#a0443f]" data-testid="status-topic-search-error">{t(error)}</p>}
      </form>
    </section>
    {result && <section className="mt-6" aria-labelledby="topic-results-title" data-testid="section-topic-results">
      <div className="mb-4">
        <p className="eyebrow mb-2">{t("Рекомендации ИИ")}</p>
        <h2 id="topic-results-title" className="serif m-0 text-[24px] text-[#293a49]">{t("Возможные темы исследования")}</h2>
      </div>
      {result.mode === 'advanced' && <div className={`mb-4 rounded-md border p-4 text-[12px] leading-relaxed ${result.literatureSufficient ? 'border-[#dce5dc] bg-[#f1f4ee] text-[#40574a]' : 'border-[#e9e1cf] bg-[#f7f3e9] text-[#756f61]'}`} role="status" data-testid="topic-evidence-note">
        <p className="mb-1 font-semibold">{result.literatureSufficient ? `OpenAlex: найдено публикаций — ${result.sourceCount}` : t("Недостаточно данных OpenAlex для уверенных выводов")}</p>
        <p className="m-0">{result.trendSummary} {result.evidenceNote}</p>
      </div>}
      {result.mode === 'beginner' && <p className="mb-4 rounded-md border border-[#e9e1cf] bg-[#f7f3e9] p-4 text-[12px] leading-relaxed text-[#756f61]" role="note" data-testid="topic-evidence-note">{result.evidenceNote}</p>}
      <div className="space-y-3">{result.topics.map((topic, index) => <article key={`${index}-${topic.title}`} className="page-card p-5 sm:p-6" data-testid={`card-topic-recommendation-${index}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="serif m-0 text-[19px] text-[#293a49]">{topic.title}</h3>
          <span className="status-pill shrink-0">{t("Тема ")}{index + 1}</span>
        </div>
        <p className="text-[12px] leading-relaxed text-[#5f6b6a]">{topic.description}</p>
        <p className="text-[12px] leading-relaxed text-[#5f6b6a]"><span className="font-semibold text-[#40505b]">{t("Возможная проблема: ")}</span>{topic.problem}</p>
        <p className="mb-0 text-[12px] leading-relaxed text-[#5f6b6a]"><span className="font-semibold text-[#40505b]">{t("Почему может быть перспективна: ")}</span>{topic.rationale}</p>
        <button className="primary-button mt-4" type="button" onClick={() => selectTopic(topic.title)} data-testid={`button-start-topic-${index}`}>{t("Начать исследование ")}<ArrowRight size={15} /></button>
      </article>)}</div>
      {result.sources.length > 0 && <section className="page-card mt-4 p-5" aria-labelledby="topic-sources-title" data-testid="section-topic-sources">
        <h3 id="topic-sources-title" className="serif mb-3 mt-0 text-[18px] text-[#293a49]">{t("Реальные публикации OpenAlex, использованные для анализа")}</h3>
        <ul className="m-0 list-disc space-y-2 pl-5 text-[12px] leading-relaxed text-[#5f6b6a]">{result.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer" className="text-[#426957] underline">{source.title}</a>{source.year ? ` (${source.year})` : ''}{source.sourceName ? ` — ${source.sourceName}` : ''}</li>)}</ul>
      </section>}
    </section>}
  </main>;
}

