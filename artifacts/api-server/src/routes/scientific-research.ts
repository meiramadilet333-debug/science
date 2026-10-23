import { getSourceFailure } from "../lib/source-errors";
import { integerSetting, mapConcurrent, operationSignal, runWithOperationSignal } from "../lib/operation-context";
import { getAiFailure } from "../lib/ai-errors";
import {
  AnalyzeScientificIdeaBody,
  AnalyzeScientificIdeaResponse,
  CheckScientificIdeaBody,
  CheckScientificIdeaResponse,
  PrepareScientificIdeaBody,
  PrepareScientificIdeaResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  analyzeScientificIdea,
  explainIdeaCheckMatches,
  IdeaAnalysisError,
  prepareIdeaCheckQuery,
  prepareScientificIdea,
} from "../lib/idea-analysis";
import { ScientificSourceError } from "../lib/scientific-sources/openalex";
import { openAlexSource } from "../lib/scientific-sources";
import { getRequestLanguage } from "../lib/request-language";

const router: IRouter = Router();

router.post("/scientific/research/prepare", async (req, res): Promise<void> => {
  const language = getRequestLanguage(req);
  const parsedRequest = PrepareScientificIdeaBody.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      error:
        "Введите идею длиной от 2 до 5000 символов и от 2 до 3 непустых ответов.",
    });
    return;
  }

  if (parsedRequest.data.idea.trim().length < 2) {
    res.status(400).json({ error: "Введите идею длиной от 2 до 5000 символов." });
    return;
  }

  if (
    parsedRequest.data.answers?.some((answer) => answer.trim().length === 0)
  ) {
    res.status(400).json({ error: "Ответы на уточняющие вопросы не должны быть пустыми." });
    return;
  }

  if (
    (parsedRequest.data.answers === undefined) !==
      (parsedRequest.data.questions === undefined) ||
    (parsedRequest.data.answers !== undefined &&
      parsedRequest.data.answers.length !== parsedRequest.data.questions?.length)
  ) {
    res.status(400).json({
      error: "Передайте каждый уточняющий вопрос вместе с соответствующим ответом.",
    });
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    req.log.error(
      "Scientific idea preparation is unavailable: missing API configuration",
    );
    res.status(503).json({
      error:
        "ИИ-уточнение темы не настроено. Администратору необходимо задать OPENAI_API_KEY на сервере.",
    });
    return;
  }

  try {
    const result = await prepareScientificIdea({
      ...parsedRequest.data,
      idea: parsedRequest.data.idea.trim(),
    }, language);
    res.json(PrepareScientificIdeaResponse.parse(result));
  } catch (error) {
    if (error instanceof IdeaAnalysisError) {
      req.log.error(
        {
          service: "OpenAI",
          stage: "idea_preparation",
          kind: error.kind,
          statusCode: error.statusCode,
          diagnosticCode: error.diagnosticCode,
          diagnosticType: error.diagnosticType,
          transportError: error.transportError,
          validationPaths: error.validationPaths,
        },
        "Scientific idea preparation failed",
      );
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }

    req.log.error(
      {
        service: "OpenAI",
        stage: "idea_preparation",
        kind: "unexpected_error",
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "Scientific idea preparation failed",
    );
    res.status(getSourceFailure(error).status).json({
      error: "Не удалось уточнить исследовательскую тему с помощью ИИ.",
    });
  }
});

router.post("/scientific/research/analyze", async (req, res): Promise<void> => {
  const language = getRequestLanguage(req);
  const parsedRequest = AnalyzeScientificIdeaBody.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      error: "Введите идею длиной от 2 до 5000 символов.",
    });
    return;
  }
  const idea = parsedRequest.data.idea.trim();
  if (idea.length < 2) {
    res.status(400).json({ error: "Введите идею длиной от 2 до 5000 символов." });
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    req.log.error("Scientific idea analysis is unavailable: missing API configuration");
    res.status(503).json({
      error:
        "ИИ-анализ не настроен. Администратору необходимо задать OPENAI_API_KEY на сервере.",
    });
    return;
  }

  try {
    const literature = await openAlexSource.searchWorks(idea, { limit: 12 });
    const analysis = await analyzeScientificIdea(
      idea,
      literature.works,
      language,
    );
    res.json(AnalyzeScientificIdeaResponse.parse(analysis));
  } catch (error) {
    if (error instanceof IdeaAnalysisError) {
      if (error.kind === "not_configured") {
        req.log.error("Scientific idea analysis is unavailable: missing API configuration");
        res.status(503).json({
          error:
            "ИИ-анализ не настроен. Администратору необходимо задать OPENAI_API_KEY на сервере.",
        });
        return;
      }

      req.log.error(
        {
          service: "OpenAI",
          kind: error.kind,
          statusCode: error.statusCode,
          diagnosticCode: error.diagnosticCode,
          diagnosticType: error.diagnosticType,
          transportError: error.transportError,
          validationPaths: error.validationPaths,
        },
        "Scientific idea analysis failed",
      );
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }

    req.log.error(
      error instanceof ScientificSourceError
        ? {
            source: "OpenAlex",
            kind: error.kind,
            statusCode: error.statusCode,
          }
        : {
            source: "OpenAlex",
            kind: "unexpected_error",
            errorName: error instanceof Error ? error.name : "UnknownError",
          },
      "Scientific idea literature lookup failed",
    );
    res.status(getSourceFailure(error).status).json({
      error:
        "Не удалось получить научные публикации из OpenAlex. Анализ не выполнен; попробуйте позже.",
    });
  }
});

router.post("/scientific/research/check", async (req, res): Promise<void> => {
  const language = getRequestLanguage(req);
  const parsedRequest = CheckScientificIdeaBody.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({
      error: "Введите идею или исследовательский вопрос длиной от 2 до 5000 символов.",
    });
    return;
  }
  const idea = parsedRequest.data.idea.trim();
  if (idea.length < 2) {
    res.status(400).json({
      error: "Введите идею или исследовательский вопрос длиной от 2 до 5000 символов.",
    });
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    req.log.error("Scientific idea check is unavailable: missing API configuration");
    res.status(503).json({
      error:
        "Проверка идеи не настроена. Администратору необходимо задать OPENAI_API_KEY на сервере.",
    });
    return;
  }

  const deadlineSignal = operationSignal(undefined, integerSetting("IDEA_CHECK_DEADLINE_MS", 120_000));
  await runWithOperationSignal(deadlineSignal, async () => {
  try {
    const { query, keywords, englishSynonyms, fallbackQueries } =
      await prepareIdeaCheckQuery(idea, language);
    const firstSearch = await openAlexSource.searchWorks(query, {
      includeAbstract: true,
      limit: 12,
      signal: deadlineSignal,
    });
    const searches = [{ query, totalCount: firstSearch.totalCount }];
    const collectedWorks = new Map<
      string,
      (typeof firstSearch.works)[number]
    >();
    const seenIds = new Set<string>();
    const seenDois = new Set<string>();
    const addWorks = (works: typeof firstSearch.works) => {
      for (const work of works) {
        const doi = work.doi
          ?.toLocaleLowerCase()
          .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
          .trim();
        if (seenIds.has(work.id) || (doi && seenDois.has(doi))) continue;
        seenIds.add(work.id);
        if (doi) seenDois.add(doi);
        collectedWorks.set(work.id, work);
      }
    };
    addWorks(firstSearch.works);

    if (firstSearch.totalCount === 0) {
      const fallbackResults = await mapConcurrent(fallbackQueries.slice(0, 4), 2, async fallbackQuery => ({
        query: fallbackQuery,
        result: await openAlexSource.searchWorks(fallbackQuery, { includeAbstract: true, limit: 12, signal: deadlineSignal }),
      }), deadlineSignal);
      for (const { query: fallbackQuery, result: searchResult } of fallbackResults) {
        searches.push({ query: fallbackQuery, totalCount: searchResult.totalCount });
        addWorks(searchResult.works);
      }
    }

    const allWorks = [...collectedWorks.values()];
    const works = allWorks.slice(0, 8);
    const interpretation = await explainIdeaCheckMatches(idea, works, language);
    const interpretedMatches = new Map(
      interpretation.matches.map((item) => [item.id, item]),
    );
    const matches = works.map((publication) => {
      const interpretation = interpretedMatches.get(publication.id);
      if (!interpretation) {
        throw new IdeaAnalysisError(
          "The AI service omitted a publication classification.",
          "invalid_response",
          undefined,
          undefined,
          undefined,
          undefined,
          ["matches:missing_publication"],
        );
      }
      return {
        publication,
        matchReason: interpretation.matchReason,
        similarity: interpretation.similarity,
        evidenceLevel: interpretation.evidenceLevel,
      };
    });
    const result = {
      query,
      keywords,
      englishSynonyms,
      searches,
      totalCount: allWorks.length,
      matches,
      summary:
        searches.every((search) => search.totalCount === 0)
          ? "По всем поисковым запросам совпадений в OpenAlex не найдено. Это не доказывает отсутствие похожих исследований или научную новизну идеи."
          : works.length === 0
          ? "OpenAlex сообщил о совпадающих записях, но не вернул пригодных библиографических данных для отображения. Это не позволяет сравнить записи с идеей."
          : interpretation.summary,
      refinementDirections: interpretation.refinementDirections,
      evidenceNote:
        works.length === 0
          ? "Источник поиска — OpenAlex. Счётчики по каждому запросу показаны отдельно; отсутствие результатов не подтверждает научную новизну."
          : `Источник публикаций — OpenAlex (${allWorks.length} уникальных записей собрано; показаны ${works.length}). Название, авторы, год, журнал, ссылка, темы и доступная аннотация — метаданные OpenAlex. Категория близости и объяснение — предварительная интерпретация ИИ, а не доказательство тождества или новизны. ${
            works.some((work) => work.abstract)
              ? "Аннотации показаны только там, где OpenAlex предоставил их."
              : "OpenAlex не предоставил аннотаций для показанных записей."
            }`,
    };
    res.json(CheckScientificIdeaResponse.parse(result));
  } catch (error) {
    if (deadlineSignal.aborted && deadlineSignal.reason instanceof Error &&
      deadlineSignal.reason.name === "TimeoutError") {
      req.log.error({ stage: "idea_check", kind: "timeout" }, "Scientific idea check exceeded its deadline");
      res.status(504).json({ error: "Проверка идеи превысила допустимое время. Попробуйте ещё раз позже." });
      return;
    }
    if (error instanceof IdeaAnalysisError) {
      req.log.error(
        {
          service: "OpenAI",
          stage: "idea_check",
          kind: error.kind,
          statusCode: error.statusCode,
          diagnosticCode: error.diagnosticCode,
          diagnosticType: error.diagnosticType,
          transportError: error.transportError,
          validationPaths: error.validationPaths,
        },
        "Scientific idea check AI step failed",
      );
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }
    req.log.error(
      error instanceof ScientificSourceError
        ? {
            source: "OpenAlex",
            stage: "idea_check",
            kind: error.kind,
            statusCode: error.statusCode,
          }
        : {
            stage: "idea_check",
            kind: "unexpected_error",
            errorName: error instanceof Error ? error.name : "UnknownError",
          },
      "Scientific idea check failed",
    );
    res.status(getSourceFailure(error).status).json({
      error:
        error instanceof ScientificSourceError
          ? "Не удалось получить публикации из OpenAlex. Попробуйте позже."
          : "Не удалось выполнить проверку идеи. Попробуйте позже.",
    });
  }
  });
});

export default router;
