import { useEffect } from 'react';

export type AssistantContext = { page: string; title?: string; idea?: string; researchId?: string; sourceTitles?: string[]; details?: string };
let context: AssistantContext | null = null;

/** The assistant reads explicit, bounded page data; no private profile is included. */
export function getAssistantContext(): AssistantContext | null { return context; }

export function useAssistantContext(value: AssistantContext): void {
  const serialized = JSON.stringify(value);
  useEffect(() => {
    const snapshot = JSON.parse(serialized) as AssistantContext;
    context = snapshot;
    return () => { if (context === snapshot) context = null; };
  }, [serialized]);
}
