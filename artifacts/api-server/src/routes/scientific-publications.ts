import { getAiFailure } from "../lib/ai-errors";
import {
  PreparePublicationChecklistBody,
  PreparePublicationChecklistResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  IdeaAnalysisError,
  preparePublicationChecklist,
} from "../lib/idea-analysis";
import { getRequestLanguage } from "../lib/request-language";

const router: IRouter = Router();


router.post("/scientific/publications/prepare", async (req, res): Promise<void> => {
  const language = getRequestLanguage(req);
  const parsedRequest = PreparePublicationChecklistBody.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      error: "Укажите название работы, научное направление и текст требований длиной от 20 символов.",
    });
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({
      error: "ИИ-анализ требований не настроен на сервере. Обратитесь к администратору.",
    });
    return;
  }
  try {
    const result = await preparePublicationChecklist(parsedRequest.data, language);
    const validated = PreparePublicationChecklistResponse.safeParse(result);
    if (!validated.success) {
      req.log.error(
        {
          stage: "publication_requirements",
          validationPaths: validated.error.issues.map((issue) => issue.path.join(".")),
        },
        "Publication requirement analysis failed response validation",
      );
      res.status(502).json({
        error: "Не удалось проверить формат списка требований. Попробуйте позже.",
      });
      return;
    }
    res.json(validated.data);
  } catch (error) {
    if (error instanceof IdeaAnalysisError) {
      req.log.error(
        {
          service: "OpenAI",
          stage: "publication_requirements",
          kind: error.kind,
          statusCode: error.statusCode,
          diagnosticCode: error.diagnosticCode,
          diagnosticType: error.diagnosticType,
          transportError: error.transportError,
          validationPaths: error.validationPaths,
        },
        "Publication requirement analysis failed",
      );
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }
    req.log.error(
      { stage: "publication_requirements", error },
      "Unexpected publication requirement analysis failure",
    );
    res.status(502).json({
      error: "Не удалось проанализировать требования журнала. Попробуйте позже.",
    });
  }
});

export default router;
