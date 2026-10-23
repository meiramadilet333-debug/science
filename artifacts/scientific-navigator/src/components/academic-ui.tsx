import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Link as LinkIcon } from 'lucide-react';
import { DigitalWaves, type AILiveState } from '@/components/digital-waves';
import { t } from '@/lib/i18n';
import { Link } from 'wouter';

export type { AILiveState } from '@/components/digital-waves';

export function HeroSection({ state, children }: { state: AILiveState; children: ReactNode }) {
  return <section className="hero-panel mb-8" aria-labelledby="home-title">
    <div className="hero-content">
      <p className="hero-kicker"><span />{t('Академическая ИИ-платформа')}</p>
      <h1 id="home-title" className="hero-title">{t("НАУЧНЫЙ НАВИГАТОР")}</h1>
      <p className="hero-subtitle">{t('От научной идеи — к научному результату')}</p>
      <DigitalWaves state={state} />
      {children}
    </div>
  </section>;
}

export type ResearchTool = {
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  tag: string;
};

export function ResearchToolCard({ tool }: { tool: ResearchTool }) {
  const Icon = tool.icon;
  return <Link href={tool.path} className="research-tool-card" data-testid={`card-tool-${tool.path.slice(1)}`}>
    <span className="research-tool-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
    <span className="research-tool-tag">{t(tool.tag)}</span>
    <span className="research-tool-title">{t(tool.title)}</span>
    <span className="research-tool-description">{t(tool.description)}</span>
    <span className="research-tool-link">{t('Открыть раздел')} <ArrowRight size={14} aria-hidden="true" /></span>
    <LinkIcon className="research-tool-watermark" size={60} strokeWidth={1} aria-hidden="true" />
  </Link>;
}

export function ResearchCard({ draftId, children }: { draftId: string; children: ReactNode }) {
  return <article className="page-card p-5 sm:p-6 research-card" data-testid={`card-draft-${draftId}`}>
    {children}
  </article>;
}

export function LoadingState({ label }: { label: string }) {
  return <div className="academic-state" role="status" aria-live="polite">
    <span className="academic-state-icon academic-state-loading" aria-hidden="true" />
    <span>{t(label)}</span>
  </div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="academic-state academic-state-empty" role="status">
    <span className="academic-state-icon" aria-hidden="true">i</span>
    <span><strong>{t(title)}</strong><span className="academic-state-description">{t(description)}</span></span>
  </div>;
}

export function ErrorState({ title, description }: { title: string; description: string }) {
  return <div className="academic-state academic-state-error" role="alert">
    <span className="academic-state-icon" aria-hidden="true">!</span>
    <span><strong>{t(title)}</strong><span className="academic-state-description">{t(description)}</span></span>
  </div>;
}
