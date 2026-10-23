import { ScientificSourceError } from "./scientific-sources/openalex";

export function getSourceFailure(error: unknown): { status: number; message: string } {
  if (error instanceof ScientificSourceError) {
    if (error.kind === "input") return { status: 400, message: "Проверьте поисковый запрос или идентификатор публикации." };
    if (error.kind === "timeout" || error.statusCode === 504) return { status: 504, message: "OpenAlex не ответил вовремя. Попробуйте позже." };
    if (error.kind === "aborted") return { status: 503, message: "Операция отменена. Повторите запрос при необходимости." };
    if (error.statusCode === 429) return { status: 429, message: "Достигнут лимит запросов к публикациям. Подождите и попробуйте ещё раз." };
  }
  return { status: 502, message: "Не удалось получить подтверждённые данные из OpenAlex. Попробуйте позже." };
}
