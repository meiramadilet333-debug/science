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
import { SavedSource, getSavedSources, openAlexRecordUrl, similarityLabel, useDrafts } from '@/features/research/shared';

export default function MyResearchPage() {
  const { locale } = useLocale();
  const { drafts, remove } = useDrafts();
  const [, setLocation] = useLocation();
  const [sourceLibrary, setSourceLibrary] = useState<SavedSource[]>([]);
  useEffect(() => { setSourceLibrary(getSavedSources()); }, []);
  const analyzedCount = drafts.filter((draft) => draft.research).length;
  const checkedCount = drafts.filter((draft) => !draft.research && draft.ideaCheck).length;
  const draftCount = drafts.length - analyzedCount - checkedCount;
  return <main className="content-wrap">
    <div className="mb-7"><p className="eyebrow mb-2">{t("Ваше личное пространство")}</p><h1 className="serif m-0 text-[32px] text-[#26394a] sm:text-[39px]">{t("Мои исследования")}</h1><p className="mb-0 mt-2 max-w-xl text-[13px] leading-relaxed text-[#6e7976]">{t("Черновики и результаты ИИ-анализа хранятся только в этом браузере. Сохранённые исследования можно открыть без повторного запроса к ИИ.")}</p></div>
    {drafts.length === 0 ? <section className="page-card px-6 py-12 text-center sm:px-12" data-testid="empty-research">
      <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-[#dce4dc] bg-[#eff3ec] text-[#567662]"><FlaskConical size={23} strokeWidth={1.5} /></span>
      <p className="eyebrow mb-2">{t("Личный архив")}</p><h2 className="serif mb-3 mt-0 text-[25px] text-[#2b3d4b]">{t("Пока здесь нет исследований или черновиков")}</h2><p className="mx-auto mb-6 max-w-md text-[13px] leading-relaxed text-[#6e7976]">{t("Черновики и завершённые ИИ-анализы остаются в локальном хранилище этого устройства. Чтобы передать идею ИИ, отдельно нажмите «Начать исследование» на главной.")}</p>
      <Link href="/" className="primary-button no-underline" data-testid="button-create-first-draft">{t("Добавить идею ")}<ArrowRight size={15} /></Link>
    </section> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="text-[12px] font-semibold text-[#52625f]" data-testid="text-draft-count">{analyzedCount} {analyzedCount === 1 ? t("исследование с анализом") : t("исследований с анализом")} · {checkedCount} {checkedCount === 1 ? t("проверка идеи") : t("проверок идей")} · {draftCount} {draftCount === 1 ? t("черновик") : t("черновика")}</span><span className="text-[11px] text-[#7b8580]">{t("Хранятся только на этом устройстве")}</span></div>
      <div className="space-y-3">{drafts.map((draft) => {
        const savedResearch = draft.research;
        const savedAt = savedResearch?.savedAt ?? draft.updatedAt;
        const linkedSources = sourceLibrary.filter((source) => source.draftIds.includes(draft.id));
        return <ResearchCard key={draft.id} draftId={draft.id}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><span className="status-pill"><span className="status-dot" />{savedResearch ? t("ИИ-анализ сохранён") : draft.ideaCheck ? t("Проверено по OpenAlex") : t("Черновик · не анализировался")}</span><time className="text-[11px] text-[#818985]" dateTime={new Date(savedResearch?.savedAt ?? draft.ideaCheck?.savedAt ?? savedAt).toISOString()}>{savedResearch || draft.ideaCheck ? t("Сохранено ") : t("Обновлено ")}{new Date(savedResearch?.savedAt ?? draft.ideaCheck?.savedAt ?? savedAt).toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU', { dateStyle: locale === 'kk' ? 'short' : 'medium', timeStyle: 'short' })}</time></div>
        {savedResearch && <p className="mb-2 text-[11px] font-semibold text-[#426957]">{t("Тема: ")}{savedResearch.confirmedTopic}</p>}
        <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.75] text-[#354754]">{savedResearch?.originalIdea ?? draft.text}</p>
        {savedResearch && <p className="mb-0 mt-3 line-clamp-2 text-[12px] leading-relaxed text-[#6e7976]"><span className="font-semibold">{t("Научная проблема: ")}</span>{savedResearch.analysis.problem}</p>}
        {draft.ideaCheck && <div className="mt-3 rounded-md border border-[#e8e9e1] bg-[#fafaf7] p-3">
          <p className="mb-2 text-[11px] font-semibold text-[#52645a]">{t("Выбранные публикации OpenAlex · ")}{draft.ideaCheck.selectedMatches.length}</p>
          {draft.ideaCheck.selectedMatches.length > 0 ? <ul className="mb-0 space-y-2 pl-4">{draft.ideaCheck.selectedMatches.map(({ publication, matchReason, similarity, evidenceLevel }) => <li key={publication.id} className="text-[11px] leading-relaxed text-[#56645e]">
            <a href={publication.url} target="_blank" rel="noreferrer" className="font-medium text-[#456b58] hover:underline">{publication.title} <ArrowUpRight size={11} className="inline" /></a>
            <span className="block text-[#7a837f]">{similarityLabel(similarity)} · {publication.authors.join(', ')}{publication.year !== null ? ` · ${publication.year}` : ''}{evidenceLevel !== 'adequate' ? t(" · ограниченные данные") : ''}</span>
            <span className="block mt-0.5">{matchReason}</span>
            {publication.abstract && <span className="mt-1 block text-[#707b76]">{t("Аннотация OpenAlex: ")}{publication.abstract}</span>}
            {!publication.abstract && <span className="mt-1 block text-[#818a85]">{t("Аннотация в OpenAlex недоступна.")}</span>}
          </li>)}</ul> : <p className="mb-0 text-[11px] text-[#75807a]">{t("Идея сохранена без выбранных публикаций.")}</p>}
        </div>}
        {linkedSources.length > 0 && <div className="mt-3 rounded-md border border-[#e5eadf] bg-[#f7f8f4] p-3" data-testid={`linked-sources-${draft.id}`}>
          <p className="mb-2 text-[11px] font-semibold text-[#52645a]">{t("Источники из личной библиотеки · ")}{linkedSources.length}</p>
          <ul className="mb-0 space-y-2 pl-4">{linkedSources.map(({ work }) => <li key={work.id} className="text-[11px] leading-relaxed text-[#56645e]">
            <a href={openAlexRecordUrl(work.id)} target="_blank" rel="noreferrer" className="font-medium text-[#456b58] hover:underline">{work.title} <ArrowUpRight size={11} className="inline" /></a>
            <span className="block text-[#7a837f]">{work.authors.length > 0 ? work.authors.join(', ') : t("Авторы не указаны")}{work.year !== null ? ` · ${work.year}` : ''}{work.sourceName ? ` · ${work.sourceName}` : ''}</span>
            {work.abstract ? <span className="mt-1 block text-[#707b76]">{t("Аннотация OpenAlex: ")}{work.abstract}</span> : <span className="mt-1 block text-[#818a85]">{t("Аннотация в OpenAlex недоступна.")}</span>}
          </li>)}</ul>
        </div>}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eeeae2] pt-4"><button className="soft-button" onClick={() => setLocation(`/?draft=${encodeURIComponent(draft.id)}`)} data-testid={`button-resume-${draft.id}`}><FileText size={14} />{savedResearch ? t("Открыть исследование") : t("Открыть на главной")}</button><button className="soft-button text-[#8a4944]" onClick={() => remove(draft.id)} data-testid={`button-remove-${draft.id}`}><Trash2 size={14} />{t("Удалить")}</button></div>
      </ResearchCard>;
      })}</div>
    </>}
    <p className="mt-5 flex items-start gap-2 text-[11px] leading-relaxed text-[#7a837f]" data-testid="status-local-storage"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#688071]" />{t("Черновики и результаты анализа хранятся в браузере на этом устройстве. При очистке данных браузера они могут быть удалены.")}</p>
  </main>;
}

