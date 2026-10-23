import { getSourceFailure } from "../lib/source-errors";
import { getAiFailure } from "../lib/ai-errors";
import {
  AnalyzeScientificSourceBody,
  AnalyzeScientificSourceResponse,
  SearchScientificSourcesQueryParams,
  SearchScientificSourcesResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  analyzeScientificSource,
  IdeaAnalysisError,
} from "../lib/idea-analysis";
import { openAlexSource } from "../lib/scientific-sources";
import { ScientificSourceError } from "../lib/scientific-sources/openalex";
import { getRequestLanguage } from "../lib/request-language";

const router: IRouter = Router();

router.get("/scientific/sources/search", async (req, res): Promise<void> => {
  const parsedQuery = SearchScientificSourcesQueryParams.safeParse({
    query: typeof req.query.query === "string" ? req.query.query.trim() : "",
  });
  if (!parsedQuery.success) {
    res.status(400).json({ error: "Введите запрос длиной от 2 до 300 символов." });
    return;
  }
  try {
    const result = await openAlexSource.searchWorks(parsedQuery.data.query, {
      includeAbstract: true,
      limit: 20,
    });
    res.json(
      SearchScientificSourcesResponse.parse({
        provider: "OpenAlex",
        query: parsedQuery.data.query,
        totalCount: result.totalCount,
        works: result.works.slice(0, 20),
      }      ),
    );
  } catch (error) {
    req.log.error(
      {
        source: "OpenAlex",
        kind: error instanceof ScientificSourceError ? error.kind : "unexpected_error",
        statusCode: error instanceof ScientificSourceError ? error.statusCode : undefined,
      },
      "Scientific source search failed",
    );
    res.status(getSourceFailure(error).status).json({
      error: "OpenAlex сейчас не отвечает. Попробуйте выполнить поиск ещё раз позже.",
    });
  }
});

router.post("/scientific/sources/analyze", async (req, res): Promise<void> => {
  const language = getRequestLanguage(req);
  const parsedRequest = AnalyzeScientificSourceBody.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({ error: "Укажите корректный идентификатор публикации OpenAlex." });
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({
      error: "ИИ-анализ источника не настроен на сервере.",
    });
    return;
  }
  try {
    const work = await openAlexSource.getWorkById(parsedRequest.data.id);
    if (!work) {
      res.status(404).json({ error: "Публикация не найдена в OpenAlex." });
      return;
    }
    const analysis = await analyzeScientificSource(work, language);
    res.json(AnalyzeScientificSourceResponse.parse(analysis));
  } catch (error) {
    if (error instanceof IdeaAnalysisError) {
      req.log.error(
        {
          service: "OpenAI",
          stage: "source_analysis",
          kind: error.kind,
          statusCode: error.statusCode,
          diagnosticCode: error.diagnosticCode,
          diagnosticType: error.diagnosticType,
          transportError: error.transportError,
          validationPaths: error.validationPaths,
        },
        "Scientific source analysis failed",
      );
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }
    req.log.error(
      {
        source: "OpenAlex",
        stage: "source_analysis",
        kind: error instanceof ScientificSourceError ? error.kind : "unexpected_error",
        statusCode: error instanceof ScientificSourceError ? error.statusCode : undefined,
      },
      "Scientific source lookup failed",
    );
    res.status(getSourceFailure(error).status).json({
      error: "Не удалось получить подтверждённые данные публикации из OpenAlex.",
    });
  }
});

export default router;
