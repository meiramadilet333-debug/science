import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { t, useLocale } from '@/lib/i18n';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type AssistantResponse = { reply: string };

function isAssistantResponse(value: unknown): value is AssistantResponse {
  return value !== null &&
    typeof value === 'object' &&
    'reply' in value &&
    typeof value.reply === 'string' &&
    value.reply.trim().length > 0;
}

function currentResearchContext(location: string): string {
  const fieldIds = [
    'research-prompt',
    'refined-idea',
    'idea-check-input',
    'topic-interests',
    'topic-preferred-direction',
    'article-idea',
    'radar-query',
  ];
  const activeFields = fieldIds.flatMap((id) => {
    const field = document.getElementById(id);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return [];
    const value = field.value.trim();
    if (!value) return [];
    const label = field.labels?.[0]?.textContent?.trim() || t('Тема исследования');
    return [`${label}: ${value.slice(0, 1200)}`];
  });
  const ideaFromUrl = new URLSearchParams(window.location.search).get('idea')?.trim();
  return [
    `Текущий раздел приложения: ${location}`,
    ...activeFields,
    ...(ideaFromUrl && !activeFields.length ? [`Тема исследования: ${ideaFromUrl.slice(0, 1200)}`] : []),
  ].join('\n').slice(0, 4000);
}

export function FloatingAIAssistant() {
  const { locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  const closeAssistant = () => {
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) {
      if (wasOpenRef.current) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAssistant();
    };
    window.addEventListener('keydown', handleKeyDown);
    inputRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, error, isSending]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSending) return;
    const nextMessages = [
      ...messages,
      { role: 'user' as const, content },
    ].slice(-12);
    setMessages(nextMessages);
    setDraft('');
    setError('');
    setIsSending(true);

    try {
      const response = await fetch('/api/scientific/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          context: currentResearchContext(location),
          language: locale,
        }),
      });
      const body = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new Error(t('Сервер вернул некорректный ответ. Попробуйте позже.'));
      }
      if (!response.ok) {
        const message = payload !== null &&
          typeof payload === 'object' &&
          'error' in payload &&
          typeof payload.error === 'string'
          ? payload.error
          : t('Не удалось получить ответ от ИИ-помощника.');
        throw new Error(message);
      }
      if (!isAssistantResponse(payload)) {
        throw new Error(t('Сервер вернул ответ в неподдерживаемом формате.'));
      }
      setMessages((current) => [...current, { role: 'assistant', content: payload.reply }]);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? t(requestError.message)
        : t('Не удалось связаться с ИИ-помощником.'));
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  return <>
    <button
      className="assistant-fab"
      ref={triggerRef}
      type="button"
      onClick={() => setIsOpen(true)}
      aria-label={t('Открыть ИИ-помощника')}
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      data-testid="button-open-ai-assistant"
    >
      <MessageCircle size={21} aria-hidden="true" />
      <span>{t('ИИ-помощник')}</span>
    </button>
    {isOpen && <div className="assistant-layer">
      <button className="assistant-backdrop" type="button" onClick={closeAssistant} aria-label={t('Закрыть ИИ-помощника')} />
      <aside className="assistant-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="assistant-title" data-testid="panel-ai-assistant" onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}>
        <header className="assistant-header">
          <span className="assistant-avatar"><Bot size={20} aria-hidden="true" /></span>
          <div><h2 id="assistant-title">{t('ИИ-помощник')}</h2><p><span className="assistant-online-dot" />{t('Запросы через сервер')}</p></div>
          <button className="assistant-close" type="button" onClick={closeAssistant} aria-label={t('Закрыть панель')}><X size={18} /></button>
        </header>
        <div className="assistant-conversation" ref={conversationRef} aria-live="polite" data-testid="assistant-conversation">
          {messages.length === 0 && <div className="assistant-welcome">
            <span className="assistant-welcome-icon"><Sparkles size={19} aria-hidden="true" /></span>
            <h3>{t('Чем помочь в исследовании?')}</h3>
            <p>{t('Задайте вопрос о научной теме, поиске литературы или работе с инструментами платформы.')}</p>
          </div>}
          {messages.map((message, index) => <div className={`assistant-message assistant-message-${message.role}`} key={`${index}-${message.role}`}>
            <span className="assistant-message-role">{message.role === 'user' ? t('Вы') : t('Помощник')}</span>
            <p>{message.content}</p>
          </div>)}
          {isSending && <div className="assistant-thinking" role="status"><LoaderCircle size={15} className="assistant-spinner" />{t('ИИ формирует ответ…')}</div>}
          {error && <p className="assistant-error" role="alert">{error}</p>}
        </div>
        <form className="assistant-composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="assistant-message">{t('Ваш вопрос')}</label>
          <textarea
            id="assistant-message"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('Напишите сообщение…')}
            maxLength={2000}
            rows={2}
            disabled={isSending}
            data-testid="input-assistant-message"
          />
          <button type="submit" aria-label={t('Отправить сообщение')} disabled={isSending || !draft.trim()} data-testid="button-send-assistant-message">
            {isSending ? <LoaderCircle size={17} className="assistant-spinner" /> : <Send size={17} />}
          </button>
          <p>{t('Тема и сообщения передаются в OpenAI через сервер. Переписка не сохраняется в приложении.')}</p>
        </form>
      </aside>
    </div>}
  </>;
}
