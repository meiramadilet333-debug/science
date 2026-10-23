const fs = require('node:fs');
const p = 'artifacts/scientific-navigator/src/';
const src = fs.readFileSync(p + 'App.tsx', 'utf8').replace(/\r\n/g, '\n');
const between = (a,b) => src.slice(src.indexOf(a), src.indexOf(b));
const apiImport = src.split('\n')[2];
const icons = between('import {\n  ArrowRight', "} from 'lucide-react';") + "} from 'lucide-react';\n";
let shared = between('const DRAFTS_KEY', 'function RoutedErrorBoundary');
shared = shared.replace(/type NavItem[^\n]+\n/, '').replace(/const navItems:[\s\S]*?\n\];\n/, '');
const exportedNames = [...shared.matchAll(/^(?:const|function|type) (\w+)/gm)].map(m=>m[1]);
shared = shared.replace(/^(const|function|type) /gm, 'export $1 ');
fs.mkdirSync(p+'features/research',{recursive:true});
fs.writeFileSync(p+'features/research/shared.ts', "import { useEffect, useState } from 'react';\n" + apiImport+'\n'+shared);
const commonImports = "import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';\n"+apiImport+"\nimport { HeroSection, ResearchCard, ResearchToolCard, type AILiveState, type ResearchTool } from '@/components/academic-ui';\nimport { t, useLocale } from '@/lib/i18n';\nimport { Link, useLocation } from 'wouter';\n" + icons;
const pages=[['home','const cards:', 'function TopicSearchPage()', 'HomePage'],['topic-search','function TopicSearchPage()', 'type ModuleConfig', 'TopicSearchPage'],['sources','function ScientificSourcesPage()', 'function ScientificWorksPage()', 'ScientificSourcesPage'],['works','function ScientificWorksPage()', 'const publicationCriterionLabels', 'ScientificWorksPage'],['publications','const publicationCriterionLabels', 'function ModulePage', 'PublicationsPage'],['idea-check','function IdeaCheckPage()', 'function MyResearchPage()', 'IdeaCheckPage'],['my-research','function MyResearchPage()', 'function SettingsPage()', 'MyResearchPage'],['settings','function SettingsPage()', 'function Router()', 'SettingsPage']];
for(const [name,start,end,component] of pages){
  let body=between(start,end).replace('function '+component+'(', 'export default function '+component+'(');
  const used=exportedNames.filter(e=>new RegExp('\\b'+e+'\\b').test(body));
  fs.writeFileSync(p+'pages/'+name+'.tsx',commonImports+`import { ${used.join(', ')} } from '@/features/research/shared';\n\n`+body);
}
fs.mkdirSync('output/legacy-grants',{recursive:true});
fs.writeFileSync('output/legacy-grants/App-grants.original.tsx.txt',between('type ModuleConfig','function ScientificSourcesPage()'));
const shell=between('function RoutedErrorBoundary','const cards:');
const nav=between('const navItems:', 'function getDrafts');
const appImports="import { lazy, Suspense, type ReactNode } from 'react';\nimport { QueryClient, QueryClientProvider } from '@tanstack/react-query';\nimport { ErrorBoundary } from '@/components/error-boundary';\nimport { Toaster } from '@/components/ui/toaster';\nimport { TooltipProvider } from '@/components/ui/tooltip';\nimport { FloatingAIAssistant } from '@/components/floating-ai-assistant';\nimport { LocaleProvider, t, useLocale } from '@/lib/i18n';\nimport { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';\nimport { BookOpen, BriefcaseBusiness, Compass, FileText, FolderOpen, GraduationCap, Search, Settings, ShieldCheck, TrendingUp, UserRound } from 'lucide-react';\n";
const lazyPages=[...pages.map(([name,,,c])=>[c,name]),['RadarPage','radar'],['GrantsCatalogPage','grants'],['NotFound','not-found']].map(([c,n])=>`const ${c} = lazy(() => import('@/pages/${n}'));`).join('\n');
const ending=src.slice(src.indexOf('function Router()')).replace('<Shell><Switch>','<Shell><Suspense fallback={<main className="content-wrap" role="status" aria-live="polite">{t(\'Загружаем…\')}</main>}><Switch>').replace('</Switch></Shell>', '</Switch></Suspense></Shell>');
fs.writeFileSync(p+'App.tsx',appImports+'\nconst queryClient = new QueryClient();\n'+lazyPages+'\ntype NavItem = { label: string; path: string; icon: typeof Compass };\n'+nav+'\n'+shell+ending);

