import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { t, useLocale } from '@/lib/i18n';

import { getGrantCatalog, type GrantCatalogItem as GrantOpportunity, type GrantCatalogSource, type GrantCatalog as GrantCatalogResponse } from '@workspace/api-client-react';
import { GetGrantCatalogResponse } from '@workspace/api-zod';

type RegionFilter = 'all' | 'kazakhstan' | 'international';

function formatDate(value: string, locale: 'ru' | 'kk'): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', {
      dateStyle: locale === 'kk' ? 'short' : 'long',
      timeZone: 'UTC',
    }).format(date);
}

function formatCheckedAt(value: string, locale: 'ru' | 'kk'): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU', {
      dateStyle: locale === 'kk' ? 'short' : 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Almaty',
    }).format(date);
}

function daysLabel(days: number, locale: 'ru' | 'kk'): string {
  if (days === 0) return t('Последний день подачи');
  const count = new Intl.NumberFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU').format(days);
  if (locale === 'kk') return `${count} ${t('күн қалды')}`;
  const category = new Intl.PluralRules('ru-RU').select(days);
  const noun = category === 'one' ? 'день' : category === 'few' ? 'дня' : 'дней';
  return `Осталось ${count} ${noun}`;
}

function grantValue(value: string): string {
  return value === 'Не указано' || value === 'Не указано в публикации' ? t(value) : value;
}

function formatCount(value: number, locale: 'ru' | 'kk'): string {
  return new Intl.NumberFormat(locale === 'kk' ? 'kk-KZ' : 'ru-RU').format(value);
}

function sourceMessage(source: GrantCatalogSource, locale: 'ru' | 'kk'): string {
  if (source.state === 'connected') {
    const verified = `${t('Официальные объявления проверены. Подтверждённых открытых конкурсов:')} ${formatCount(source.openCount, locale)}.`;
    return source.unconfirmedCount
      ? `${verified} ${t('Объявлений с неподтверждённым статусом скрыто:')} ${formatCount(source.unconfirmedCount, locale)}.`
      : `${verified} ${t('Завершённые и неполные объявления не включены.')}`;
  }
  if (source.state === 'limited') {
    return t('Официальный сайт доступен, но автоматическое подтверждение открытых конкурсов не настроено; неподтверждённые конкурсы не включены.');
  }
  return `${t('Официальный источник временно недоступен; его конкурсы не показываются как действующие.')} ${source.message ? `${t('Техническая информация источника:')} ${source.message}` : ''}`.trim();
}

function catalogMessage(catalog: GrantCatalogResponse, locale: 'ru' | 'kk'): string {
  if (catalog.opportunities.length > 0) {
    return `${t('Подтверждённых открытых конкурсов в каталоге:')} ${formatCount(catalog.opportunities.length, locale)}.`;
  }
  return catalog.sourceAvailable
    ? t('В доступных официальных источниках не найдено конкурсов с подтверждённым открытым приёмом заявок.')
    : t('Официальные источники не удалось проверить. Актуальные конкурсы не показываются.');
}

function GrantCard({ grant, locale }: { grant: GrantOpportunity; locale: 'ru' | 'kk' }) {
  return <article className="grant-catalog-card" data-testid={`card-grant-${grant.id}`}>
    <div className="grant-catalog-card-top">
      <span className="grant-open-badge"><span aria-hidden="true" />{t('Приём открыт')}</span>
      <span className="grant-region-label">{grant.country === 'Казахстан' ? t(grant.country) : grantValue(grant.country)}{grant.region && grant.region !== 'Не указано' && grant.region !== 'Не указано в публикации' ? ` · ${grantValue(grant.region)}` : ''}</span>
    </div>
    <h2 className="serif grant-card-title">{grant.title}</h2>
    <p className="grant-organizer">{grant.organizer}</p>

    <div className="grant-meta-grid">
      <div className="grant-meta-item grant-meta-wide">
        <span className="grant-meta-label">{t('Организатор · программа')}</span>
        <span>{grant.organizer} · {grant.program}</span>
      </div>
      <div className="grant-meta-item grant-meta-wide">
        <span className="grant-meta-label">{t('Научные направления')}</span>
        <span>{grantValue(grant.directions || 'Не указано')}</span>
      </div>
      <div className="grant-meta-item">
        <span className="grant-meta-label">{t('Финансирование')}</span>
        <span>{grantValue(grant.fundingAmount || 'Не указано')}</span>
      </div>
      <div className="grant-meta-item">
        <span className="grant-meta-label"><CalendarDays size={13} aria-hidden="true" />{t('Приём заявок')}</span>
        <span>{formatDate(grant.applicationStartDate, locale)} — {formatDate(grant.applicationEndDate, locale)}{grant.applicationEndTime ? `, ${t('до')} ${grant.applicationEndTime} (${t('время Астаны')})` : ''}</span>
      </div>
      <div className="grant-meta-item">
        <span className="grant-meta-label">{t('Категория заявителя')}</span>
        <span>{grantValue(grant.researcherCategory)}</span>
      </div>
    </div>

    <div className="grant-deadline-banner">
      <Clock3 size={16} aria-hidden="true" />
      <strong>{daysLabel(grant.daysRemaining, locale)}</strong>
    </div>

    <div className="grant-eligibility">
      <span className="grant-meta-label">{t('Краткие требования к участникам')}</span>
      <p>{grantValue(grant.eligibility)}</p>
    </div>

    <div className="grant-card-footer">
      <span className="grant-checked-at"><ShieldCheck size={13} aria-hidden="true" />{t('Проверено')} {formatCheckedAt(grant.lastCheckedAt, locale)}</span>
      <a className="primary-button grant-open-link" href={grant.officialUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-grant-${grant.id}`}>
        {t('Открыть конкурс')} <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </div>
  </article>;
}

function buildGrantFilters(opportunities: GrantOpportunity[]) {
  const directions = new Set<string>();
  const categories = new Set<string>();
  const organizers = new Set<string>();

  for (const grant of opportunities) {
    for (const value of grant.directions.split(';')) {
      const direction = value.trim();
      if (direction && direction !== 'Не указано') directions.add(direction);
    }
    if (grant.researcherCategory !== 'Не указано') categories.add(grant.researcherCategory);
    if (grant.organizer !== 'Не указано') organizers.add(grant.organizer);
  }

  const compare = (left: string, right: string) => left.localeCompare(right, 'ru');
  return {
    directions: [...directions].sort(compare),
    categories: [...categories].sort(compare),
    organizers: [...organizers].sort(compare),
  };
}

export default function GrantsPage() {
  const { locale } = useLocale();
  const [catalog, setCatalog] = useState<GrantCatalogResponse | null>(null);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [directionFilter, setDirectionFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [organizerFilter, setOrganizerFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshController = useRef<AbortController | null>(null);

  const refresh = useCallback(async (forceRefresh = false) => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setIsLoading(true);
    setError('');
    try {
      const payload = GetGrantCatalogResponse.parse(await getGrantCatalog(
        forceRefresh ? { refresh: '1' } : undefined,
        { cache: 'no-store', signal: controller.signal },
      ));
      if (controller.signal.aborted) return;
      setCatalog(payload);
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(requestError instanceof Error
        ? requestError.message
        : t('Не удалось получить актуальные конкурсы.'));
    } finally {
      if (refreshController.current === controller) {
        refreshController.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      refreshController.current?.abort();
      refreshController.current = null;
    };
  }, [refresh]);

  const { directions, categories, organizers } = useMemo(
    () => buildGrantFilters(catalog?.opportunities ?? []),
    [catalog],
  );

  const visibleGrants = useMemo(() => (catalog?.opportunities ?? []).filter((grant) => {
    const matchesRegion = regionFilter === 'all' ||
      (regionFilter === 'kazakhstan' && grant.country === 'Казахстан') ||
      (regionFilter === 'international' && grant.country !== 'Казахстан');
    const matchesDirection = !directionFilter ||
      (directionFilter === '__unknown__'
        ? !grant.directions || grant.directions === 'Не указано'
        : grant.directions.split(';').some((direction) => direction.trim() === directionFilter));
    return matchesRegion &&
      matchesDirection &&
      (!categoryFilter || grant.researcherCategory === categoryFilter) &&
      (!organizerFilter || grant.organizer === organizerFilter);
  }), [catalog, categoryFilter, directionFilter, organizerFilter, regionFilter]);

  return <main className="content-wrap grant-catalog-page">
    <header className="grant-catalog-heading">
      <div>
        <p className="eyebrow mb-2">{t('Официальные источники · подтверждённый приём')}</p>
        <h1 className="serif m-0" data-testid="heading-grants">{t('Научные гранты')}</h1>
        <p className="grant-catalog-intro">{t('Единый каталог конкурсов научного финансирования с открытым приёмом заявок. В список попадают только объявления с подтверждёнными датами и официальной страницей.')}</p>
      </div>
      <button className="soft-button grant-refresh-button" type="button" onClick={() => void refresh(true)} disabled={isLoading} data-testid="button-refresh-grants">
        <RefreshCw size={15} className={isLoading ? 'grant-refresh-spinning' : ''} aria-hidden="true" />
        {isLoading ? t('Проверяем источники…') : t('Обновить список')}
      </button>
    </header>

    <section className="grant-catalog-controls" aria-label={t('Фильтры каталога')}>
      <div className="grant-region-filters" role="group" aria-label={t('Страна или регион')}>
        {([
          ['all', t('Все')],
          ['kazakhstan', t('Казахстан')],
          ['international', t('Международные')],
        ] as const).map(([value, label]) => <button
          key={value}
          type="button"
          className={`grant-filter-button${regionFilter === value ? ' is-active' : ''}`}
          aria-pressed={regionFilter === value}
          onClick={() => setRegionFilter(value)}
          data-testid={`button-grant-filter-${value}`}
        >{label}</button>)}
      </div>
      <label className="grant-direction-filter">
        <span>{t('Научное направление')}</span>
        <select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)} data-testid="select-grant-direction">
          <option value="">{t('Все направления')}</option><option value="__unknown__">{t('Не указано')}</option>
          {directions.map((direction) => <option key={direction} value={direction}>{direction}</option>)}
        </select>
      </label>
      <label className="grant-direction-filter">
        <span>{t('Категория исследователя')}</span>
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} data-testid="select-grant-category">
          <option value="">{t('Все категории')}</option><option value="Не указано">{t('Не указано')}</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label className="grant-direction-filter">
        <span>{t('Организатор')}</span>
        <select value={organizerFilter} onChange={(event) => setOrganizerFilter(event.target.value)} data-testid="select-grant-organizer">
          <option value="">{t('Все организаторы')}</option>
          {organizers.map((organizer) => <option key={organizer} value={organizer}>{organizer}</option>)}
        </select>
      </label>
    </section>

    <div className="grant-source-status" role="status" data-testid="status-grant-source">
      <ShieldCheck size={15} aria-hidden="true" />
      <span>{catalog
        ? `${t('Официальные источники проверены:')} ${formatCheckedAt(catalog.checkedAt, locale)}.${catalog.cached ? ` ${t('Показан свежий кэш (до 90 секунд).')}` : ''}`
        : t('Источник данных — официальные объявления НЦГНТЭ Казахстана.')}</span>
    </div>

    {catalog && <section className="grant-source-grid" aria-label={t('Статус официальных источников')} data-testid="list-grant-sources">
      {catalog.sources.map((source) => <article className={`grant-source-card grant-source-${source.state}`} key={source.id} data-testid={`status-grant-source-${source.id}`}>
        <div className="grant-source-card-top">
          <a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}<ArrowUpRight size={12} aria-hidden="true" /></a>
          <span>{source.openCount} {t('в каталоге')}{source.unconfirmedCount ? ` · ${source.unconfirmedCount} ${t('не подтверждено')}` : ''}</span>
        </div>
        <p>{sourceMessage(source, locale)}</p>
        <div className="grant-source-card-bottom">
          <span>{t(source.state === 'connected' ? 'Подключён' : source.state === 'limited' ? 'Нет автоматического подтверждения конкурсов' : 'Техническая ошибка')}</span>
          {source.checkedAt && <span>{t('Проверено')} {formatCheckedAt(source.checkedAt, locale)}</span>}
        </div>
      </article>)}
    </section>}

    {error && <section className="grant-catalog-empty grant-catalog-error" role="alert" data-testid="status-grants-error">
      <h2 className="serif">{t('Не удалось обновить каталог')}</h2>
      <p>{t(error)}</p>
      <button className="soft-button" type="button" onClick={() => void refresh(true)} disabled={isLoading}>{t('Повторить проверку')}</button>
    </section>}

    {!error && isLoading && <section className="grant-catalog-empty" aria-live="polite" data-testid="status-grants-loading">
      <span className="grant-loading-mark"><RefreshCw size={18} className="grant-refresh-spinning" aria-hidden="true" /></span>
      <h2 className="serif">{t('Проверяем официальные объявления')}</h2>
      <p>{t('Запрашиваем источник сейчас; данные не обновляются в фоне.')}</p>
    </section>}

    {!error && !isLoading && visibleGrants.length > 0 && <section className="grant-catalog-grid" aria-label={t('Открытые конкурсы')}>
      {visibleGrants.map((grant) => <GrantCard grant={grant} key={grant.id} locale={locale} />)}
    </section>}

    {!error && !isLoading && visibleGrants.length === 0 && <section className="grant-catalog-empty" data-testid="status-grants-empty">
      <span className="grant-empty-mark"><CalendarDays size={19} aria-hidden="true" /></span>
      <h2 className="serif">{catalog?.opportunities.length
        ? t('По выбранным фильтрам открытых конкурсов нет')
        : t('Сейчас открытых конкурсов не найдено')}</h2>
      <p>{catalog?.opportunities.length
        ? t('Измените фильтры или выберите «Все», чтобы увидеть доступные объявления.')
        : t('В подключённом официальном источнике не найдено конкурсов с подтверждённым текущим приёмом заявок. Неподтверждённые и завершённые объявления не показываются.')}</p>
      {catalog && <p className="grant-empty-source">{catalogMessage(catalog, locale)}</p>}
    </section>}

    <footer className="grant-catalog-note">
      <p>{t('Автоматически подключённый источник:')} <a href={catalog?.sourceUrl ?? 'https://www.ncste.kz/ru/announcements'} target="_blank" rel="noopener noreferrer">{t('официальные объявления НЦГНТЭ')}</a>{t('. Международные фонды и другие сайты не включены, пока не настроена их проверяемая интеграция.')}</p>
      <p>{t('Перед подачей сверяйте сроки и условия в официальном объявлении и конкурсной документации.')}</p>
    </footer>
  </main>;
}
