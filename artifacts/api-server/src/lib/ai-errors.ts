import { IdeaAnalysisError } from "./ai-transport";

export function getAiFailure(error: IdeaAnalysisError): { status: number; message: string } {
  if (error.kind === "input_error") return { status: 400, message: "Уточните идею: добавьте поисковые термины или исследовательский вопрос." };
  if (error.kind === "timeout" || error.transportError === "timeout" || error.statusCode === 504) {
    return { status: 504, message: "ИИ-сервис не ответил вовремя. Повторите запрос позже." };
  }
  if (error.kind === "not_configured" || error.statusCode === 401 || error.statusCode === 403 ||
    error.statusCode === 503 ||
    ["invalid_api_key", "permission_denied", "missing_permissions", "model_not_found", "insufficient_quota", "billing_hard_limit_reached"].includes(error.diagnosticCode ?? "") ||
    error.diagnosticType === "authentication_error" || error.diagnosticType === "permission_error") {
    return { status: 503, message: "ИИ-сервис недоступен. Администратору необходимо проверить конфигурацию и квоты сервера." };
  }
  if (error.statusCode === 429 || error.diagnosticCode === "rate_limit_exceeded" || error.diagnosticType === "rate_limit_error") {
    return { status: 429, message: "ИИ-сервис временно ограничил частоту запросов. Подождите и попробуйте ещё раз." };
  }
  if (error.diagnosticCode === "context_length_exceeded") return { status: 413, message: "Запрос слишком большой. Уменьшите объём текста или источников." };
  if (error.transportError === "aborted") return { status: 503, message: "Операция отменена. Повторите запрос при необходимости." };
  return { status: 502, message: "Не удалось получить корректный ответ ИИ-сервиса. Попробуйте позже." };
}
