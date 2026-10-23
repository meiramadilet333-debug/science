export function apiErrorMessage(error: unknown, fallback = 'Не удалось выполнить запрос. Попробуйте ещё раз.'): string {
  if (error && typeof error === 'object') {
    if ('data' in error && error.data && typeof error.data === 'object' && 'error' in error.data && typeof error.data.error === 'string') return error.data.error;
    if ('status' in error) {
      if (error.status === 429) return 'Слишком много запросов. Подождите немного и повторите попытку.';
      if (error.status === 504) return 'Сервис не успел ответить. Попробуйте ещё раз.';
      if (error.status === 502) return 'Внешний сервис временно недоступен. Попробуйте позже.';
    }
    if ('message' in error && typeof error.message === 'string' && error.message && !(error instanceof TypeError)) return error.message;
  }
  return fallback;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
