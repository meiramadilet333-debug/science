import type { RequestHandler } from "express";
import { integerSetting } from "../lib/operation-context";

type Client = { windowStart: number; count: number; active: number };

/** Process-local IP admission control. No proxy headers are trusted by default. */
export function createExpensiveOperationLimiter(options: {
  globalConcurrency?: number; clientConcurrency?: number; perMinute?: number;
  maxClients?: number; now?: () => number;
} = {}): RequestHandler {
  const globalLimit = options.globalConcurrency ?? integerSetting("AI_MAX_CONCURRENCY", 8, 128);
  const clientLimit = options.clientConcurrency ?? integerSetting("AI_CLIENT_CONCURRENCY", 2, 32);
  const perMinute = options.perMinute ?? integerSetting("AI_REQUESTS_PER_MINUTE", 12, 10_000);
  const maxClients = options.maxClients ?? 2_000;
  const now = options.now ?? Date.now;
  const clients = new Map<string, Client>();
  let active = 0;
  return (req, res, next) => {
    if (req.method !== "POST" || !/^\/(?:scientific|grants)\//.test(req.path)) {
      next(); return;
    }
    const timestamp = now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    let client = clients.get(key);
    if (!client) {
      if (clients.size >= maxClients) {
        for (const [candidateKey, candidate] of clients) {
          if (!candidate.active && timestamp - candidate.windowStart >= 60_000) clients.delete(candidateKey);
        }
      }
      if (clients.size >= maxClients) {
        res.setHeader("Retry-After", "60");
        res.status(429).json({ error: "Сервис занят. Повторите запрос позже." }); return;
      }
      client = { windowStart: timestamp, count: 0, active: 0 };
      clients.set(key, client);
    }
    if (timestamp - client.windowStart >= 60_000) {
      client.windowStart = timestamp; client.count = 0;
    }
    if (active >= globalLimit || client.active >= clientLimit || client.count >= perMinute) {
      res.setHeader("Retry-After", String(client.count >= perMinute
        ? Math.max(1, Math.ceil((60_000 - timestamp + client.windowStart) / 1_000)) : 5));
      res.status(429).json({ error: "Слишком много запросов. Подождите и попробуйте ещё раз." }); return;
    }
    active++; client.active++; client.count++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active--; client.active--;
      res.off("finish", release); res.off("close", release);
    };
    res.once("finish", release); res.once("close", release);
    next();
  };
}
