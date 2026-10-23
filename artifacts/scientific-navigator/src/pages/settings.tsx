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
import { RESEARCH_PROFILE_KEY, RESEARCH_PROFILE_EXPORT_FORMAT, ResearchProfile, EMPTY_RESEARCH_PROFILE, isResearchProfile } from '@/features/research/shared';

export default function SettingsPage() {
  const { locale, setLocale } = useLocale();
  const [profile, setProfile] = useState<ResearchProfile>(EMPTY_RESEARCH_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [hasSavedProfile, setHasSavedProfile] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProfile((current) => ({ ...current, interfaceLanguage: locale }));
  }, [locale]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RESEARCH_PROFILE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (!isResearchProfile(parsed)) {
          setError('Сохранённый профиль имеет неизвестный формат. Его данные не были загружены.');
        } else {
          setProfile(parsed);
          setHasSavedProfile(true);
        }
      }
    } catch {
      setError('Не удалось прочитать сохранённый профиль. Остальные данные приложения не затронуты.');
    } finally {
      setLoaded(true);
    }
  }, []);

  const updateField = <K extends keyof ResearchProfile>(field: K, value: ResearchProfile[K]) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setNotice('');
    if (error) setError('');
  };
  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      localStorage.setItem(RESEARCH_PROFILE_KEY, JSON.stringify(profile));
      setHasSavedProfile(true);
      setError('');
      setNotice('Настройки сохранены в этом браузере.');
    } catch {
      setError('Не удалось сохранить профиль. Проверьте свободное место в хранилище браузера.');
      setNotice('');
    }
  };
  const exportProfile = () => {
    try {
      const contents = JSON.stringify({
        format: RESEARCH_PROFILE_EXPORT_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        profile,
      }, null, 2);
      const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'nauchny-navigator-profile.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setError('');
      setNotice('Файл настроек экспортирован.');
    } catch {
      setError('Не удалось подготовить файл экспорта. Попробуйте ещё раз.');
      setNotice('');
    }
  };
  const importProfile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    try {
      if (file.size > 1_000_000) {
        throw new Error('Файл слишком большой. Размер JSON не должен превышать 1 МБ.');
      }
      const parsed: unknown = JSON.parse(await file.text());
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('format' in parsed) ||
        parsed.format !== RESEARCH_PROFILE_EXPORT_FORMAT ||
        !('version' in parsed) ||
        parsed.version !== 1 ||
        !('profile' in parsed) ||
        !isResearchProfile(parsed.profile)
      ) {
        throw new Error('Файл не распознан как экспорт профиля «Научного навигатора» или содержит неподдерживаемые данные.');
      }
      localStorage.setItem(RESEARCH_PROFILE_KEY, JSON.stringify(parsed.profile));
      setLocale(parsed.profile.interfaceLanguage);
      setProfile(parsed.profile);
      setHasSavedProfile(true);
      setNotice('Профиль импортирован и сохранён в этом браузере.');
    } catch (importError) {
      setError(importError instanceof Error
        ? importError.message
        : 'Не удалось импортировать настройки. Проверьте выбранный JSON-файл.');
    } finally {
      input.value = '';
    }
  };
  const textInputClass = 'mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[13px] font-normal text-[#354754] outline-none transition focus:border-[#829b83] focus:ring-2 focus:ring-[#dce8d9]';
  const selectClass = 'mt-1 block w-full rounded-md border border-[#dce2da] bg-white px-3 py-2 text-[13px] font-normal text-[#354754] outline-none transition focus:border-[#829b83] focus:ring-2 focus:ring-[#dce8d9]';
  const fieldClass = 'block text-[11px] font-semibold text-[#52625f]';

  if (!loaded) {
    return <main className="content-wrap"><div className="page-card p-8 text-center text-[13px] text-[#6e7976]">{t("Загружаем научный профиль…")}</div></main>;
  }

  return <main className="content-wrap">
    <div className="mb-7"><p className="eyebrow mb-2">{t("Рабочее пространство")}</p><h1 className="serif m-0 text-[32px] text-[#26394a] sm:text-[39px]">{t("Мой научный профиль")}</h1><p className="mb-0 mt-2 max-w-2xl text-[13px] leading-relaxed text-[#6e7976]">{t("Сохраните профессиональные сведения и рабочие предпочтения для удобства. Профиль хранится только в этом браузере и автоматически не отправляется на сервер или в OpenAI.")}</p></div>

    {error && <div className="mb-5 rounded-md border border-[#ead4d0] bg-[#fbf2f0] p-4 text-[12px] leading-relaxed text-[#8b4b45]" role="alert" data-testid="settings-error">{t(error)}</div>}
    {notice && <div className="mb-5 rounded-md border border-[#dce8d9] bg-[#f0f5ee] p-4 text-[12px] leading-relaxed text-[#45604d]" role="status" data-testid="settings-notice">{t(notice)}</div>}

    <form className="space-y-5" onSubmit={saveProfile} data-testid="research-profile-form">
      <section className="page-card p-5 sm:p-7" aria-labelledby="profile-professional-title">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg border border-[#d5e0d5] bg-[#f1f4ed] text-[#567662]"><UserRound size={19} /></span><div><p className="eyebrow mb-1">{t("Профиль")}</p><h2 id="profile-professional-title" className="serif m-0 text-[21px] text-[#293a49]">{t("Личные и профессиональные сведения")}</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldClass}>{t("Ф. И. О. ")}<input className={textInputClass} value={profile.fullName} onChange={(event) => updateField('fullName', event.target.value)} maxLength={500} autoComplete="name" data-testid="input-profile-full-name" />
          </label>
          <label className={fieldClass}>{t("Организация ")}<input className={textInputClass} value={profile.organization} onChange={(event) => updateField('organization', event.target.value)} maxLength={500} autoComplete="organization" data-testid="input-profile-organization" />
          </label>
          <label className={fieldClass}>{t("Должность ")}<input className={textInputClass} value={profile.position} onChange={(event) => updateField('position', event.target.value)} maxLength={500} data-testid="input-profile-position" />
          </label>
          <label className={fieldClass}>{t("Учёная степень ")}<input className={textInputClass} value={profile.academicDegree} onChange={(event) => updateField('academicDegree', event.target.value)} maxLength={500} placeholder={t("Например, кандидат наук")} data-testid="input-profile-degree" />
          </label>
          <label className={fieldClass}>{t("Учёное звание ")}<input className={textInputClass} value={profile.academicTitle} onChange={(event) => updateField('academicTitle', event.target.value)} maxLength={500} placeholder={t("Например, доцент")} data-testid="input-profile-academic-title" />
          </label>
        </div>
      </section>

      <section className="page-card p-5 sm:p-7" aria-labelledby="profile-interests-title">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg border border-[#d5e0d5] bg-[#f1f4ed] text-[#567662]"><FlaskConical size={19} /></span><div><p className="eyebrow mb-1">{t("Исследования")}</p><h2 id="profile-interests-title" className="serif m-0 text-[21px] text-[#293a49]">{t("Научные интересы")}</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldClass}>{t("Научное направление ")}<input className={textInputClass} value={profile.scienceArea} onChange={(event) => updateField('scienceArea', event.target.value)} maxLength={5000} placeholder={t("Например, педагогика")} data-testid="input-profile-science-area" />
          </label>
          <label className={fieldClass}>{t("Специализация ")}<input className={textInputClass} value={profile.specialization} onChange={(event) => updateField('specialization', event.target.value)} maxLength={5000} placeholder={t("Уточните предметную область")} data-testid="input-profile-specialization" />
          </label>
          <label className={`${fieldClass} sm:col-span-2`}>{t("Ключевые темы исследований ")}<textarea className={`${textInputClass} min-h-[100px]`} value={profile.researchTopics} onChange={(event) => updateField('researchTopics', event.target.value)} maxLength={5000} placeholder={t("Перечислите ключевые темы или вопросы исследования")} data-testid="input-profile-research-topics" />
          </label>
        </div>
      </section>

      <section className="page-card p-5 sm:p-7" aria-labelledby="profile-preferences-title">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg border border-[#d5e0d5] bg-[#f1f4ed] text-[#567662]"><Settings size={19} /></span><div><p className="eyebrow mb-1">{t("Рабочая среда")}</p><h2 id="profile-preferences-title" className="serif m-0 text-[21px] text-[#293a49]">{t("Предпочтения")}</h2></div></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={fieldClass}>{t('Язык интерфейса')}
            <span className={`${selectClass} mt-1`} data-testid="text-profile-language">{locale === 'ru' ? t('Русский') : t('Қазақша')}</span>
          </div>
          <label className={fieldClass}>{t("Уровень исследователя ")}<select className={selectClass} value={profile.researcherLevel} onChange={(event) => { const value = event.target.value; if (value === 'beginner' || value === 'experienced' || value === 'masters' || value === 'doctoral') updateField('researcherLevel', value); }} data-testid="select-profile-level">
              <option value="beginner">{t("Начинающий")}</option><option value="experienced">{t("Опытный")}</option><option value="masters">{t("Магистрант")}</option><option value="doctoral">{t("Докторант")}</option>
            </select>
          </label>
          <label className={fieldClass}>{t("Стиль ответов ИИ ")}<select className={selectClass} value={profile.aiResponseStyle} onChange={(event) => { const value = event.target.value; if (value === 'clear' || value === 'academic' || value === 'detailed') updateField('aiResponseStyle', value); }} data-testid="select-profile-ai-style">
              <option value="clear">{t("Понятный")}</option><option value="academic">{t("Академический")}</option><option value="detailed">{t("Подробный")}</option>
            </select>
          </label>
        </div>
        <p className="mb-0 mt-4 text-[11px] leading-relaxed text-[#7a837f]">{t('Выбранный язык применяется ко всему интерфейсу. ИИ использует его как язык ответа по умолчанию; просьба ответить на другом языке имеет приоритет.')}</p>
      </section>

      <section className="page-card p-5 sm:p-7" aria-labelledby="profile-data-title">
        <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg border border-[#d5e0d5] bg-[#f1f4ed] text-[#567662]"><Download size={19} /></span><div><p className="eyebrow mb-1">{t("Локальные данные")}</p><h2 id="profile-data-title" className="serif m-0 text-[21px] text-[#293a49]">{t("Экспорт и импорт профиля")}</h2></div></div>
        <p className="text-[12px] leading-relaxed text-[#6e7976]">{t("Экспортируйте профиль в JSON для резервной копии или переноса на другое устройство. Импорт заменит только профильные настройки; черновики исследований и библиотека источников не меняются.")}</p>
        <input ref={importInput} className="hidden" type="file" accept=".json,application/json" onChange={importProfile} data-testid="input-profile-import-file" />
        <div className="flex flex-wrap gap-2">
          <button className="soft-button" type="button" onClick={exportProfile} data-testid="button-export-profile"><Download size={14} />{t("Экспортировать JSON")}</button>
          <button className="soft-button" type="button" onClick={() => importInput.current?.click()} data-testid="button-import-profile"><Upload size={14} />{t("Импортировать JSON")}</button>
        </div>
      </section>

      <div className="page-card flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <p className="m-0 text-[11px] leading-relaxed text-[#7a837f]">{hasSavedProfile ? t("Профиль сохранён локально; изменения вступят в силу после сохранения.") : t("Профиль пока не сохранён.")} {t(" Персональные сведения остаются в этом браузере.")}</p>
        <button className="primary-button" type="submit" data-testid="button-save-profile"><Check size={15} />{t("Сохранить настройки")}</button>
      </div>
    </form>
  </main>;
}

