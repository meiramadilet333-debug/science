import { getAiFailure } from "../lib/ai-errors";
import { Router, type IRouter } from "express";
import {
  IdeaAnalysisError,
  respondToResearchAssistant,
  type ResearchAssistantMessage,
} from "../lib/idea-analysis";

const router: IRouter = Router();
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_CONTEXT_LENGTH = 4_000;

function isAssistantMessage(value: unknown): value is ResearchAssistantMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH;
}

router.post("/scientific/assistant", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown> | null;
  const messages = body?.messages;
  const context = body?.context;
  const language = body?.language === "kk" || body?.language === "ru"
    ? body.language
    : req.header("accept-language")?.split(",")[0]?.trim().toLowerCase() === "kk"
      ? "kk"
      : "ru";
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    !messages.every(isAssistantMessage) ||
    messages[messages.length - 1]?.role !== "user" ||
    (context !== undefined &&
      (typeof context !== "string" || context.length > MAX_CONTEXT_LENGTH))
  ) {
    res.status(400).json({ error: "Проверьте сообщение и попробуйте ещё раз." });
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    req.log.error("Scientific assistant is unavailable: missing API configuration");
    res.status(503).json({
      error: "ИИ-помощник не настроен. Проверьте конфигурацию сервера.",
    });
    return;
  }

  try {
    const reply = await respondToResearchAssistant(
      messages,
      typeof context === "string" ? context.trim() : "",
      language,
    );
    res.json({ reply });
  } catch (error) {
    if (error instanceof IdeaAnalysisError) {
      req.log.error(
        {
          service: "OpenAI",
          stage: "research_assistant",
          kind: error.kind,
          statusCode: error.statusCode,
          diagnosticCode: error.diagnosticCode,
          diagnosticType: error.diagnosticType,
          transportError: error.transportError,
        },
        "Scientific assistant request failed",
      );
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }

    req.log.error(
      {
        stage: "research_assistant",
        kind: "unexpected_error",
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "Scientific assistant request failed",
    );
    res.status(502).json({
      error: "Не удалось получить ответ от ИИ-помощника. Попробуйте позже.",
    });
  }
});

export default router;
