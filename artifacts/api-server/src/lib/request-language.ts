import type { Request } from "express";

export type ResponseLanguage = "ru" | "kk";

export function getRequestLanguage(req: Request): ResponseLanguage {
  const header = req.header("accept-language")?.split(",")[0]?.trim().toLowerCase();
  return header === "kk" || header?.startsWith("kk-") ? "kk" : "ru";
}
