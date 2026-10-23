import { getSourceFailure } from "../lib/source-errors";
import { mapConcurrent } from "../lib/operation-context";
import { getAiFailure } from "../lib/ai-errors";
import {
  AssistScientificArticleSectionBody,
  AssistScientificArticleSectionResponse,
  PrepareScientificArticleBody,
  PrepareScientificArticleResponse,
  type ArticleSection,
} from "@workspace/api-zod";
import { Router, type IRouter, type Request } from "express";
import {
  assistScientificArticleSection,
  IdeaAnalysisError,
  prepareScientificArticle,
} from "../lib/idea-analysis";
import { openAlexSource } from "../lib/scientific-sources";
import { ScientificSourceError } from "../lib/scientific-sources/openalex";
import { getRequestLanguage } from "../lib/request-language";

const router: IRouter = Router();

async function getVerifiedWorks(ids: string[]) {
  const normalizedIds = [...new Set(ids.map(id => id.replace(/^https:\/\/openalex\.org\//i, "").toUpperCase()))];
  const works = await Promise.all(
    normalizedIds.map((id) => openAlexSource.getWorkById(id)),
  );
  if (works.some((work) => work === null)) return null;
  return works.filter((work) => work !== null);
}

function logFailure(req: Request, error: unknown, stage: string) {
  if (error instanceof IdeaAnalysisError) {
    req.log.error(
      {
        service: "OpenAI",
        stage,
        kind: error.kind,
        statusCode: error.statusCode,
        diagnosticCode: error.diagnosticCode,
        diagnosticType: error.diagnosticType,
        transportError: error.transportError,
        validationPaths: error.validationPaths,
      },
      "Scientific article assistance failed",
    );
    return;
  }
  req.log.error(
    {
      source: "OpenAlex",
      stage,
      kind: error instanceof ScientificSourceError ? error.kind : "unexpected_error",
      statusCode: error instanceof ScientificSourceError ? error.statusCode : undefined,
    },
    "Scientific article source lookup failed",
  );
}


router.post("/scientific/works/article/prepare", async (req, res): Promise<void> => {
  const language = getRequestLanguage(req);
  const parsedRequest = PrepareScientificArticleBody.safeParse(req.body);
  if (!parsedRequest.success) {
    res.status(400).json({ error: "Введите тему и выберите не более 8 публикаций." });
    return;
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    res.status(503).json({ error: "Подготовка статьи с ИИ не настроена на сервере." });
    return;
  }
  try {
    const works = await getVerifiedWorks(parsedRequest.data.sourceIds);
    if (!works) {
      res.status(404).json({
        error: "Одна или несколько выбранных публикаций больше недоступны в OpenAlex. Обновите библиотеку источников.",
      });
      return;
    }
    const plan = await prepareScientificArticle(parsedRequest.data.idea, works, language);
    const validatedPlan = PrepareScientificArticleResponse.safeParse(plan);
    if (!validatedPlan.success) {
      req.log.error(
        {
          stage: "article_plan",
          validationPaths: validatedPlan.error.issues.map((issue) => issue.path.join(".")),
        },
        "Scientific article plan failed API response validation",
      );
      res.status(502).json({
        error: "OpenAI вернул план в неподдерживаемом формате. Попробуйте повторить запрос.",
      });
      return;
    }
    res.json(validatedPlan.data);
  } catch (error) {
    logFailure(req, error, "article_plan");
    if (error instanceof IdeaAnalysisError) {
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }
    if (error instanceof ScientificSourceError) {
      res.status(502).json({
        error: "Не удалось подтвердить публикации в OpenAlex. Попробуйте позже.",
      });
      return;
    }
    req.log.error({ stage: "article_plan", error }, "Unexpected article planning failure");
    res.status(502).json({ error: "Не удалось подготовить план статьи. Попробуйте позже." });
  }
});

router.post(
  "/scientific/works/article/section-help",
  async (req, res): Promise<void> => {
    const language = getRequestLanguage(req);
    const parsedRequest = AssistScientificArticleSectionBody.safeParse(req.body);
    if (!parsedRequest.success) {
      res.status(400).json({
        error: "Проверьте тему, утверждённый раздел и список выбранных источников.",
      });
      return;
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      res.status(503).json({ error: "Помощь ИИ для статьи не настроена на сервере." });
      return;
    }
    try {
      const works = await getVerifiedWorks(parsedRequest.data.sourceIds);
      if (!works) {
        res.status(404).json({
          error: "Одна или несколько выбранных публикаций больше недоступны в OpenAlex. Обновите библиотеку источников.",
        });
        return;
      }
      const section: ArticleSection = parsedRequest.data.section;
      const guidance = await assistScientificArticleSection(
        {
          idea: parsedRequest.data.idea,
          workingTitle: parsedRequest.data.workingTitle,
          section,
          otherSections: parsedRequest.data.otherSections,
        },
        works,
        language,
      );
      const validatedGuidance = AssistScientificArticleSectionResponse.safeParse(guidance);
      if (!validatedGuidance.success) {
        req.log.error(
          {
            stage: "article_section_guidance",
            validationPaths: validatedGuidance.error.issues.map((issue) => issue.path.join(".")),
          },
          "Scientific article guidance failed API response validation",
        );
        res.status(502).json({
          error: "OpenAI вернул рекомендации в неподдерживаемом формате. Попробуйте повторить запрос.",
        });
        return;
      }
      res.json(validatedGuidance.data);
    } catch (error) {
      logFailure(req, error, "article_section_guidance");
      if (error instanceof IdeaAnalysisError) {
        const failure = getAiFailure(error);
        res.status(failure.status).json({ error: failure.message });
        return;
      }
      if (error instanceof ScientificSourceError) {
        res.status(502).json({
          error: "Не удалось подтвердить публикации в OpenAlex. Попробуйте позже.",
        });
        return;
      }
      req.log.error(
        { stage: "article_section_guidance", error },
        "Unexpected article section assistance failure",
      );
      res.status(502).json({ error: "Не удалось получить рекомендации для раздела. Попробуйте позже." });
    }
  },
);

export default router;
