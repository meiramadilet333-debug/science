import { getSourceFailure } from "../lib/source-errors";
import { getAiFailure } from "../lib/ai-errors";
import {
  RecommendScientificTopicsBody,
  RecommendScientificTopicsResponse,
  type ScientificWork,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  IdeaAnalysisError,
  recommendScientificTopics,
} from "../lib/idea-analysis";
import { ScientificSourceError } from "../lib/scientific-sources/openalex";
import { openAlexSource } from "../lib/scientific-sources";
import { getRequestLanguage } from "../lib/request-language";

const router: IRouter = Router();

router.post("/scientific/topics/recommend", async (req, res): Promise<void> => {
  const language = getRequestLanguage(req);
  const parsedRequest = RecommendScientificTopicsBody.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      error: "Проверьте обязательные поля выбранного режима поиска темы.",
    });
    return;
  }

  const request = parsedRequest.data;
  const missingModeFields =
    request.mode === "beginner"
      ? !request.interests?.trim() ||
        !request.preparation ||
        !request.workType ||
        !request.preferredDirection?.trim()
      : !request.scienceArea?.trim() || !request.problems?.trim();
  if (missingModeFields) {
    res.status(400).json({
      error:
        request.mode === "beginner"
          ? "Заполните интересы, уровень подготовки, тип работы и предпочтительное направление."
          : "Укажите научную область и интересующие проблемы.",
    });
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    req.log.error(
      "Scientific topic recommendations are unavailable: missing API configuration",
    );
    res.status(503).json({
      error:
        "Подбор научных тем не настроен. Администратору необходимо задать OPENAI_API_KEY на сервере.",
    });
    return;
  }

  let works: ScientificWork[] = [];
  if (request.mode === "advanced") {
    try {
      const result = await openAlexSource.searchWorks(
        `${request.scienceArea} ${request.problems}`,
        { limit: 12 },
      );
      works = result.works;
    } catch (error) {
      req.log.error(
        error instanceof ScientificSourceError
          ? {
              source: "OpenAlex",
              stage: "topic_recommendations",
              kind: error.kind,
              statusCode: error.statusCode,
            }
          : {
              source: "OpenAlex",
              stage: "topic_recommendations",
              kind: "unexpected_error",
              errorName: error instanceof Error ? error.name : "UnknownError",
            },
        "Scientific topic literature lookup failed",
      );
      res.status(getSourceFailure(error).status).json({
        error:
          "Не удалось получить публикации OpenAlex для анализа направления. Попробуйте позже.",
      });
      return;
    }
  }

  try {
    const result = await recommendScientificTopics(request, works, language);
    res.json(RecommendScientificTopicsResponse.parse(result));
  } catch (error) {
    if (error instanceof IdeaAnalysisError) {
      req.log.error(
        {
          service: "OpenAI",
          stage: "topic_recommendations",
          kind: error.kind,
          statusCode: error.statusCode,
          diagnosticCode: error.diagnosticCode,
          diagnosticType: error.diagnosticType,
          transportError: error.transportError,
          validationPaths: error.validationPaths,
        },
        "Scientific topic recommendations failed",
      );
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }

    req.log.error(
      {
        service: "OpenAI",
        stage: "topic_recommendations",
        kind: "unexpected_error",
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "Scientific topic recommendations failed",
    );
    res.status(502).json({
      error: "Не удалось подготовить рекомендации научных тем.",
    });
  }
});

export default router;
