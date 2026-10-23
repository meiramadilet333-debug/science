import { Router, type IRouter, type Request, type Response } from "express";
import {
  AssessGrantProjectBody, AssessGrantProjectResponse,
  GetGrantCatalogQueryParams, GetGrantCatalogResponse,
  PrepareGrantAnswerHelpBody, PrepareGrantAnswerHelpResponse,
  PrepareGrantConceptBody, PrepareGrantConceptResponse,
  SearchGrantOpportunitiesBody, SearchGrantOpportunitiesResponse,
} from "@workspace/api-zod";
import { assessGrantProject, IdeaAnalysisError, prepareGrantAnswerHelp, prepareGrantConcept } from "../lib/idea-analysis";
import { getCurrentGrantCatalog, searchGrantOpportunities } from "../lib/grant-opportunities";
import { getAiFailure } from "../lib/ai-errors";
import { getRequestLanguage, type ResponseLanguage } from "../lib/request-language";

const router: IRouter = Router();
type BodySchema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type ResponseSchema<T> = { parse(value: unknown): T };

function normalizeInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key,
    key === "durationMonths" && typeof field === "string" ? Number(field) :
    typeof field === "string" ? field.trim() :
    key === "clarificationAnswers" && Array.isArray(field)
      ? field.map(answer => typeof answer === "string" ? answer.trim() : answer) : field,
  ]));
}

async function grantAi<T, U>(
  req: Request, res: Response, bodySchema: BodySchema<T>, responseSchema: ResponseSchema<U>,
  operation: (input: T, language: ResponseLanguage) => Promise<U>,
): Promise<void> {
  const parsed = bodySchema.safeParse(normalizeInput(req.body));
  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте сведения проекта, длину ответов и срок от 3 до 84 месяцев." });
    return;
  }
  try {
    res.json(responseSchema.parse(await operation(parsed.data, getRequestLanguage(req))));
  } catch (error) {
    if (error instanceof IdeaAnalysisError) {
      req.log.error({ kind: error.kind, statusCode: error.statusCode, diagnosticCode: error.diagnosticCode }, "Grant AI operation failed");
      const failure = getAiFailure(error);
      res.status(failure.status).json({ error: failure.message });
      return;
    }
    req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Grant response failed");
    res.status(502).json({ error: "Не удалось получить корректный результат подготовки проекта." });
  }
}

router.get("/grants/catalog", async (req, res): Promise<void> => {
  const query = GetGrantCatalogQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Некорректный параметр обновления каталога." });
    return;
  }
  try {
    res.json(GetGrantCatalogResponse.parse(await getCurrentGrantCatalog(new Date(), query.data.refresh === "1")));
  } catch (error) {
    req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Grant catalog failed");
    res.status(502).json({ error: "Не удалось проверить официальные источники грантов." });
  }
});

router.post("/grants/opportunities/search", async (req, res): Promise<void> => {
  const input = SearchGrantOpportunitiesBody.safeParse(normalizeInput(req.body));
  if (!input.success) {
    res.status(400).json({ error: "Укажите страну и проверьте, что каждое поле поиска не превышает 300 символов." });
    return;
  }
  try {
    res.json(SearchGrantOpportunitiesResponse.parse(await searchGrantOpportunities(input.data)));
  } catch (error) {
    req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Grant search failed");
    res.status(502).json({ error: "Не удалось проверить официальные объявления грантов." });
  }
});

router.post("/grants/concept/answer-help", (req, res) =>
  grantAi(req, res, PrepareGrantAnswerHelpBody, PrepareGrantAnswerHelpResponse, prepareGrantAnswerHelp));
router.post("/grants/concept/check", (req, res) =>
  grantAi(req, res, AssessGrantProjectBody, AssessGrantProjectResponse, assessGrantProject));
router.post("/grants/concept/create", (req, res) =>
  grantAi(req, res, PrepareGrantConceptBody, PrepareGrantConceptResponse, prepareGrantConcept));

export default router;
