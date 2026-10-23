import { getSourceFailure } from "../lib/source-errors";
import {
  SearchScientificRadarQueryParams,
  SearchScientificRadarResponse,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import { openAlexSource } from "../lib/scientific-sources";

const router: IRouter = Router();

router.get("/scientific/radar/search", async (req, res): Promise<void> => {
  const rawQuery = req.query["query"];
  if (typeof rawQuery !== "string") {
    res.status(400).json({ error: "Укажите поисковый запрос." });
    return;
  }

  const parsedQuery = SearchScientificRadarQueryParams.safeParse({
    query: rawQuery.trim(),
  });
  if (!parsedQuery.success) {
    res.status(400).json({
      error: "Введите запрос длиной от 2 до 300 символов.",
    });
    return;
  }

  try {
    const result = await openAlexSource.searchWorks(parsedQuery.data.query, { limit: 20 });
    res.json(
      SearchScientificRadarResponse.parse({
        provider: "OpenAlex",
        query: parsedQuery.data.query,
        totalCount: result.totalCount,
        works: result.works,
      }),
    );
  } catch (error) {
    req.log.error(
      {
        source: "OpenAlex",
        error: error instanceof Error ? error.message : "Unknown source error",
      },
      "Scientific radar search failed",
    );
    res.status(getSourceFailure(error).status).json({
      error:
        "OpenAlex сейчас не отвечает. Попробуйте выполнить поиск ещё раз позже.",
    });
  }
});

export default router;