import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchScientificRadar, getSearchScientificRadarQueryKey } from '@workspace/api-client-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ArrowDownWideNarrow, ArrowUpRight, BookOpen, LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import type { ScientificWork } from '@workspace/api-client-react';
import { t, useLocale } from '@/lib/i18n';

const formSchema = z.object({
  query: z.string().trim().min(2, 'Введите не менее двух символов.').max(300, 'Запрос не должен превышать 300 символов.'),
});
type FormValues = z.infer<typeof formSchema>;
type SortMode = 'relevance' | 'newest' | 'citations';
type ViewMode = 'list' | 'cards';

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data;
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
      return t(data.error);
    }
  }
  if (error && typeof error === 'object' && 'error' in error && typeof error.error === 'string') {
    return t(error.error);
  }
  return t('Не удалось получить данные из OpenAlex. Попробуйте повторить поиск позже.');
}

function PublicationCard({ work, index, locale }: { work: ScientificWork; index: number; locale: 'ru' | 'kk' }) {
  const authors = Array.isArray(work.authors) ? work.authors : [];
  const topics = Array.isArray(work.topics) ? work.topics : [];

  return <article className="radar-work" data-testid={`card-work-${index}`}>
    <div className="radar-work-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</div>
    <div className="min-w-0">
      <h3 className="radar-work-title">{work.url
        ? <a href={work.url} target="_blank" rel="noreferrer" data-testid={`link-work-${index}`}>{work.title}<ArrowUpRight size={15} aria-hidden="true" /></a>
        : work.title}</h3>
      {authors.length > 0 && <p className="radar-work-authors" data-testid={`text-authors-${index}`}>{authors.join(', ')}</p>}
      <div className="radar-work-meta">
        {work.year !== null && <span data-testid={`text-year-${index}`}>{work.year}</span>}
        {work.sourceName && <span data-testid={`text-source-${index}`}>{work.sourceName}</span>}
        {work.citationCount !== null && <span data-testid={`text-citations-${index}`}>{t('Цитирований:')} {work.citationCount.toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU')}</span>}
        {work.doi && <a href={`https://doi.org/${work.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}`} target="_blank" rel="noreferrer" data-testid={`link-doi-${index}`}>DOI <ArrowUpRight size={12} aria-hidden="true" /></a>}
      </div>
      {topics.length > 0 && <div className="radar-topics" aria-label={t('Темы публикации')} data-testid={`list-work-topics-${index}`}>
        {topics.map((topic) => <span className="radar-topic" key={topic}>{topic}</span>)}
      </div>}
    </div>
  </article>;
}

export default function RadarPage() {
  const { locale } = useLocale();
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { query: '' },
    mode: 'onSubmit',
  });
  const params = { query: submittedQuery };
  const search = useSearchScientificRadar(params, {
    query: {
      enabled: submittedQuery.length > 0,
      queryKey: getSearchScientificRadarQueryKey(params),
      staleTime: 30_000,
      gcTime: 120_000,
    },
  });
  const works = useMemo(() => {
    const records = Array.isArray(search.data?.works) ? search.data.works : [];
    if (sortMode === 'relevance') return records;
    return [...records].sort((a, b) => {
      if (sortMode === 'newest') return (b.year ?? -Infinity) - (a.year ?? -Infinity);
      return (b.citationCount ?? -Infinity) - (a.citationCount ?? -Infinity);
    });
  }, [search.data?.works, sortMode]);

  const loadedYears = useMemo(() => works
    .flatMap((work) => work.year === null ? [] : [work.year]), [works]);
  const yearRange = loadedYears.length
    ? `${Math.min(...loadedYears)}–${Math.max(...loadedYears)}`
    : null;
  const yearDistribution = useMemo(() => {
    const counts = new Map<number, number>();
    loadedYears.forEach((year) => counts.set(year, (counts.get(year) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [loadedYears]);
  const maxYearCount = Math.max(1, ...yearDistribution.map(([, count]) => count));
  const loadedTopics = useMemo(() => {
    const counts = new Map<string, number>();
    works.forEach((work) => {
      if (Array.isArray(work.topics)) {
        work.topics.forEach((topic) => counts.set(topic, (counts.get(topic) ?? 0) + 1));
      }
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic]) => topic);
  }, [works]);

  const submit = form.handleSubmit(({ query }) => {
    setSortMode('relevance');
    setSubmittedQuery(query.trim());
  });

  return <main className="content-wrap radar-page">
    <header className="radar-heading">
      <div>
        <p className="eyebrow mb-2">{t('Поиск по научной литературе · OpenAlex')}</p>
        <h1 className="serif m-0 text-[32px] leading-tight text-[#26394a] sm:text-[39px]" data-testid="heading-radar">{t('Научный радар')}</h1>
        <p className="radar-intro">{t('Посмотрите, что сейчас происходит в вашей научной области')}</p>
      </div>
      <div className="radar-source-mark" aria-label={t('Источник данных — OpenAlex')}>
        <BookOpen size={17} strokeWidth={1.7} /><span>{t('Источник')}<br /><strong>OpenAlex</strong></span>
      </div>
    </header>

    <section className="radar-search-panel" aria-labelledby="radar-search-title">
      <div className="radar-search-topline">
        <span className="radar-step">01</span>
        <div><p className="eyebrow mb-1">{t('Сформулируйте запрос')}</p><h2 id="radar-search-title" className="serif m-0 text-[21px] text-[#293a49]">{t('Что вы хотите найти?')}</h2></div>
      </div>
      <Form {...form}>
        <form onSubmit={submit} className="radar-form" noValidate data-testid="form-radar-search">
          <FormField control={form.control} name="query" render={({ field }) => <FormItem className="radar-query-field">
            <FormLabel className="sr-only">{t('Научная тема, направление или ключевые слова')}</FormLabel>
              <FormControl><div className="radar-input-wrap"><Search size={18} aria-hidden="true" /><Textarea {...field} value={field.value ?? ''} id="radar-query" placeholder={t('Введите научную тему, направление или ключевые слова')} maxLength={300} rows={2} className="radar-query-textarea" data-testid="input-radar-query" autoComplete="off" /><span className="radar-char-count" aria-hidden="true">{(field.value ?? '').length}/300</span></div></FormControl>
            <FormMessage data-testid="status-query-validation" />
          </FormItem>} />
          <button className="primary-button radar-submit" type="submit" disabled={search.isFetching} data-testid="button-radar-search"><Search size={15} />{t('Запустить радар')}</button>
        </form>
      </Form>
      <p className="radar-search-note"><span aria-hidden="true">i</span> {t('Поиск выполняется только после отправки запроса. Результаты предоставлены OpenAlex; каталог не оценивает качество или достоверность выводов.')}</p>
    </section>

    {!submittedQuery && <section className="radar-before-search" data-testid="status-radar-ready">
      <span className="radar-step">02</span>
      <div><p className="eyebrow mb-1">{t('Начало поиска')}</p><h2 className="serif m-0 text-[21px] text-[#293a49]">{t('Сначала — вопрос')}</h2><p>{t('Введите тему выше, чтобы запросить реальные библиографические записи из OpenAlex. До отправки здесь нет результатов и статистики.')}</p></div>
      <span className="radar-contour" aria-hidden="true" />
    </section>}

    {submittedQuery && search.isFetching && <section className="radar-loading" aria-live="polite" data-testid="status-radar-loading">
      <div className="radar-loading-header"><span className="radar-step">02</span><div><p className="eyebrow mb-1">{t('Поиск в OpenAlex')}</p><h2 className="serif m-0 text-[21px] text-[#293a49]">{t('Ищем публикации')}</h2></div></div>
      {[1, 2, 3].map((item) => <div className="radar-skeleton" key={item}><span /><div><i /><i /><i /></div></div>)}
    </section>}

    {submittedQuery && search.isError && !search.isFetching && <section className="radar-state radar-error" role="alert" data-testid="status-radar-error">
      <span className="radar-state-mark"><X size={18} /></span><div><p className="eyebrow mb-1">{t('Ответ источника недоступен')}</p><h2 className="serif m-0 text-[21px]">{t('Не удалось выполнить поиск')}</h2><p>{errorMessage(search.error)}</p><button className="soft-button" type="button" onClick={() => search.refetch()} data-testid="button-radar-retry">{t('Повторить запрос')}</button></div>
    </section>}

    {submittedQuery && search.data && !search.isFetching && works.length === 0 && <section className="radar-state" role="status" data-testid="status-radar-empty">
      <span className="radar-state-mark"><Search size={18} /></span><div><p className="eyebrow mb-1">{t('Поиск завершён')}</p><h2 className="serif m-0 text-[21px]">{t('Записей не найдено')}</h2><p>{t('OpenAlex не вернул публикаций для запроса «')}{search.data.query}{t('». Попробуйте более короткую формулировку или другие ключевые слова.')}</p><div className="radar-empty-count">{t('Совпадений в каталоге:')} <strong>{search.data.totalCount.toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU')}</strong></div></div>
    </section>}

    {submittedQuery && search.data && !search.isFetching && works.length > 0 && <>
      <section className="radar-results-overview" aria-label={t("Сводка загруженных записей")} data-testid="status-radar-results">
        <div className="radar-result-count"><span className="eyebrow">{t('Совпадения OpenAlex')}</span><strong data-testid="text-total-matches">{search.data.totalCount.toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU')}</strong><span>{t('всего по запросу')}</span></div>
        <div className="radar-result-count loaded"><span className="eyebrow">{t('Записи на этой странице')}</span><strong data-testid="text-loaded-records">{works.length.toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU')}</strong><span>{t('получено от источника')}</span></div>
        <div className="radar-result-context">
          <span>{t('Текущий запрос')}</span><strong data-testid="text-submitted-query">{search.data.query}</strong>
          {yearRange && <small data-testid="text-loaded-year-range">{t('Годы в загруженных записях:')} {yearRange}</small>}
          {loadedTopics.length > 0 && <div className="radar-summary-topics" data-testid="list-loaded-topics"><span>{t('Темы в загруженных записях')}</span>{loadedTopics.map((topic) => <span className="radar-topic" key={topic}>{topic}</span>)}</div>}
        </div>
      </section>
      {yearDistribution.length > 0 && <section className="radar-year-distribution" aria-labelledby="radar-years-title" data-testid="chart-publications-by-year">
        <div className="radar-year-heading">
          <div><p className="eyebrow mb-1">{t('Только полученные записи')}</p><h2 id="radar-years-title" className="serif m-0 text-[19px] text-[#293a49]">{t('Распределение по годам')}</h2></div>
          <span>{loadedYears.length} {t('публикаций с указанным годом')}</span>
        </div>
        <div className="radar-year-list">
          {yearDistribution.map(([year, count]) => <div className="radar-year-row" key={year} data-testid={`row-year-${year}`} aria-label={`${year}: ${count} публикаций`}>
            <span>{year}</span><div className="radar-year-track" aria-hidden="true"><div className="radar-year-bar" style={{ width: `${(count / maxYearCount) * 100}%` }} /></div><strong>{count.toLocaleString(locale === 'kk' ? 'kk-KZ' : 'ru-RU')}</strong>
          </div>)}
        </div>
      </section>}
      <div className="radar-results-toolbar">
        <div><p className="eyebrow mb-1">{t('Первоисточники')}</p><h2 className="serif m-0 text-[22px] text-[#293a49]">{t('Публикации')}</h2></div>
        <div className="radar-toolbar-controls">
          <label className="radar-sort"><SlidersHorizontal size={15} /><span>{t('Порядок')}</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} data-testid="select-radar-sort" aria-label={t('Сортировка записей')}>
            <option value="relevance">{t('По релевантности')}</option><option value="newest">{t('Сначала новые')}</option><option value="citations">{t('По цитированиям')}</option>
          </select><ArrowDownWideNarrow size={14} aria-hidden="true" /></label>
          <div className="radar-display-toggle" role="group" aria-label={t('Режим отображения публикаций')}>
            <button type="button" className={viewMode === 'list' ? 'is-active' : ''} aria-pressed={viewMode === 'list'} aria-label={t('Список')} onClick={() => setViewMode('list')} data-testid="button-radar-view-list"><List size={15} aria-hidden="true" /></button>
            <button type="button" className={viewMode === 'cards' ? 'is-active' : ''} aria-pressed={viewMode === 'cards'} aria-label={t('Карточки')} onClick={() => setViewMode('cards')} data-testid="button-radar-view-cards"><LayoutGrid size={15} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <div className={`radar-work-list radar-work-list-${viewMode}`} data-testid="list-radar-works">{works.map((work, index) => <PublicationCard key={work.id} work={work} index={index} locale={locale} />)}</div>
      <p className="radar-provenance" data-testid="status-radar-provenance">{t('Всего совпадений — оценка каталога OpenAlex; список выше содержит только полученные записи. Сортировка меняет порядок загруженных записей и не отправляет новый запрос.')}</p>
    </>}
  </main>;
}