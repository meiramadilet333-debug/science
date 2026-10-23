import { AlertCircle } from 'lucide-react';
import { Link } from 'wouter';
import { t, useLocale } from '@/lib/i18n';

export default function NotFound() {
  useLocale();
  return (
    <main className="content-wrap">
      <section
        className="page-card max-w-2xl p-7 sm:p-10"
        data-testid="page-not-found"
      >
        <div className="mb-4 flex items-center gap-3 text-[#557a69]">
          <AlertCircle aria-hidden="true" size={26} />
          <span className="eyebrow">{t('Ошибка 404')}</span>
        </div>
        <h1 className="serif m-0 text-[28px] text-[#26394a]">
          {t('Такой страницы нет')}
        </h1>
        <p className="mb-6 mt-3 text-[14px] leading-relaxed text-[#66726e]">
          {t('Проверьте адрес или вернитесь на главную страницу навигатора.')}
        </p>
        <Link
          href="/"
          className="primary-button no-underline"
          data-testid="link-not-found-home"
        >
          {t('Вернуться на главную')}
        </Link>
      </section>
    </main>
  );
}