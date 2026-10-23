import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { operationContext } from "./lib/operation-context";
import { createExpensiveOperationLimiter } from "./middlewares/expensive-operations";

const app: Express = express();
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", operationContext, createExpensiveOperationLimiter(), router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Запрошенный API-маршрут не найден." });
});

const handleError: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const details = error !== null && typeof error === "object"
    ? error as { type?: string; status?: number } : {};
  if (details.type === "entity.parse.failed") {
    res.status(400).json({ error: "Тело запроса должно содержать корректный JSON." }); return;
  }
  if (details.type === "entity.too.large") {
    res.status(413).json({ error: "Объём запроса превышает допустимый предел." }); return;
  }
  if (details.status === 400) {
    res.status(400).json({ error: "Не удалось прочитать запрос." }); return;
  }
  req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Unhandled API request failure");
  res.status(500).json({ error: "Внутренняя ошибка сервера." });
};
app.use(handleError);

export default app;
