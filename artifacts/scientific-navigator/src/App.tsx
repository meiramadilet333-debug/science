import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary, type ErrorFallbackProps } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FloatingAIAssistant } from '@/components/floating-ai-assistant';
import { LocaleProvider, t, useLocale } from '@/lib/i18n';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { BookOpen, BriefcaseBusiness, Compass, FileText, FolderOpen, GraduationCap, Search, Settings, ShieldCheck, TrendingUp, UserRound } from 'lucide-react';

const queryClient = new QueryClient();
const HomePage = lazy(() => import('@/pages/home'));
const TopicSearchPage = lazy(() => import('@/pages/topic-search'));
const ScientificSourcesPage = lazy(() => import('@/pages/sources'));
const ScientificWorksPage = lazy(() => import('@/features/articles/pages/works'));
const PublicationsPage = lazy(() => import('@/features/articles/pages/publications'));
const IdeaCheckPage = lazy(() => import('@/pages/idea-check'));
const MyResearchPage = lazy(() => import('@/pages/my-research'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const RadarPage = lazy(() => import('@/pages/radar'));
const GrantsCatalogPage = lazy(() => import('@/pages/grants'));
const NotFound = lazy(() => import('@/pages/not-found'));
type NavItem = { label: string; path: string; icon: typeof Compass };
const navItems: NavItem[] = [
  { label: 'Главная', path: '/', icon: Compass },
  { label: 'Научный радар', path: '/radar', icon: TrendingUp },
  { label: 'Проверка идеи', path: '/idea-check', icon: ShieldCheck },
  { label: 'Мои исследования', path: '/my-research', icon: FolderOpen },
  { label: 'Поиск темы', path: '/topic-search', icon: Search },
  { label: 'Научные источники', path: '/sources', icon: BookOpen },
  { label: 'Научные работы', path: '/works', icon: FileText },
  { label: 'Публикации', path: '/publications', icon: GraduationCap },
  { label: 'Научные гранты', path: '/grants', icon: BriefcaseBusiness },
  { label: 'Настройки', path: '/settings', icon: Settings },
];


function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary
    resetKey={location}
    FallbackComponent={({ error }: ErrorFallbackProps) => <main className="content-wrap page-load-error" role="alert">
      <p className="eyebrow">{t('Не удалось открыть раздел')}</p>
      <h1 className="serif">{t('Страница временно недоступна')}</h1>
      <p>{t('Проверьте подключение к интернету и перезагрузите страницу.')}</p>
      {import.meta.env.DEV && <pre>{error.message}</pre>}
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>
        {t('Перезагрузить страницу')}
      </button>
    </main>}
  >{children}</ErrorBoundary>;
}

function PageSkeleton() {
  return <main className="content-wrap page-skeleton" role="status" aria-live="polite" aria-label={t('Загружаем страницу')}>
    <span className="page-skeleton-label">{t('Загружаем…')}</span>
    <div className="page-skeleton-line page-skeleton-eyebrow" />
    <div className="page-skeleton-line page-skeleton-title" />
    <div className="page-skeleton-line page-skeleton-description" />
    <div className="page-skeleton-card">
      <div className="page-skeleton-line page-skeleton-card-title" />
      <div className="page-skeleton-line" />
      <div className="page-skeleton-line page-skeleton-short" />
    </div>
  </main>;
}

function MainNavigation() {
  const [location] = useLocation();
  return <nav className="main-navigation" aria-label={t("Разделы приложения")}>
      {navItems.map(({ label, path, icon: Icon }) => <Link href={path} key={path} className={`nav-link ${location === path ? 'active' : ''}`} aria-label={t(label)} title={t(label)} aria-current={location === path ? 'page' : undefined} data-testid={`nav-${path === '/' ? 'home' : path.slice(1)}`}>
        <Icon size={17} strokeWidth={1.7} /><span className="nav-label">{t(label)}</span>
      </Link>)}
  </nav>;
}

function AppHeader() {
  const [location] = useLocation();
  const { locale, setLocale } = useLocale();
  return <header className="app-header">
    <div className="app-header-top">
      <Link href="/" className="app-brand" aria-label={t('Главная — Научный навигатор')} data-testid="link-brand">
        <span className="app-brand-mark"><img src="/Научный навигатор.png" alt="" /></span>
        <span className="app-brand-copy"><strong>{t("НАУЧНЫЙ НАВИГАТОР")}</strong><small>{t('Академическая ИИ-платформа')}</small></span>
      </Link>
      <div className="app-header-actions">
        <div className="language-switch" role="group" aria-label={t('Язык интерфейса')}>
          <button type="button" className={`language-indicator${locale === 'ru' ? ' is-active' : ''}`} aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>RU</button>
          <button type="button" className={`language-indicator${locale === 'kk' ? ' is-active' : ''}`} aria-pressed={locale === 'kk'} onClick={() => setLocale('kk')}>KZ</button>
        </div>
        <span className="ai-server-indicator" title={t('Запросы ИИ обрабатываются сервером')}><span aria-hidden="true" />{t('ИИ · сервер')}</span>
        <Link href="/settings" className="profile-link" aria-current={location === '/settings' ? 'page' : undefined} data-testid="link-settings-top">
          <UserRound size={16} aria-hidden="true" /><span>{t('Профиль')}</span>
        </Link>
      </div>
    </div>
    <div className="app-header-caption">
      <span>{t(navItems.find((item) => item.path === location)?.label || 'Раздел')}</span>
      <span>{t('От научной идеи — к научному результату')}</span>
    </div>
    <MainNavigation />
  </header>;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="app-frame">
    <AppHeader />
    <div className="main-area">
      {children}
      <footer className="app-footer">{t('Научный навигатор — рабочее пространство для исследователя. Анализ идеи опирается на ИИ и найденные записи OpenAlex; выводы о новизне предварительные и требуют проверки.')}</footer>
    </div>
    <FloatingAIAssistant />
  </div>;
}

function Router() {
  useLocale();
  return <Shell><RoutedErrorBoundary><Suspense fallback={<PageSkeleton />}><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/radar" component={RadarPage} />
    <Route path="/idea-check" component={IdeaCheckPage} />
    <Route path="/my-research" component={MyResearchPage} />
    <Route path="/topic-search" component={TopicSearchPage} />
    <Route path="/sources" component={ScientificSourcesPage} />
    <Route path="/works" component={ScientificWorksPage} />
    <Route path="/publications" component={PublicationsPage} />
    <Route path="/grants" component={GrantsCatalogPage} />
    <Route path="/settings" component={SettingsPage} />
    <Route component={NotFound} />
  </Switch></Suspense></RoutedErrorBoundary></Shell>;
}

function App() {
  return <LocaleProvider><QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider></LocaleProvider>;
}

export default App;