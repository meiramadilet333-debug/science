export type OpportunityStatus = "open" | "upcoming" | "closed" | "unconfirmed";

const MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};
const MONTH_PATTERN = Object.keys(MONTHS).join("|");
const FULL_DATE_PATTERN = `\\d{1,2}[./-]\\d{1,2}[./-]\\d{4}|\\d{1,2}\\s+(?:${MONTH_PATTERN})\\s+\\d{4}`;
const APPLICATION_CONTEXT = /при[её]м[а-яё]*(?:\s+(?:конкурсн[а-яё]*\s+)?заяв[а-яё]*)?|заяв[а-яё]*\s+принима[а-яё]*|срок[а-яё]*|дедлайн/iu;
const END_LABEL = /окончательн[а-яё]*\s+срок[а-яё]*|срок[а-яё]*\s+(?:представлен[а-яё]*|завершени[а-яё]*|окончани[а-яё]*)|окончани[а-яё]*\s+при[её]м[а-яё]*|дедлайн/iu;
const START_LABEL = /начало\s+при[её]м[а-яё]*|при[её]м\s+заяв[а-яё]*\s+(?:начина[а-яё]*|откры[а-яё]*)|заяв[а-яё]*\s+принима[а-яё]*\s+с/iu;

const kazakhstanFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function getKazakhstanDateAndTime(now: Date): { date: string; time: string } {
  const values = Object.fromEntries(kazakhstanFormatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}:${values.second}` };
}

/** A UTC calendar value, not an application deadline instant. No Date normalization is allowed. */
export function strictCalendarDate(day: number, month: number, year: number): Date | null {
  if (![day, month, year].every(Number.isInteger) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day ? value : null;
}

export function dateIso(date: Date | null): string | null {
  return date?.toISOString().slice(0, 10) ?? null;
}

export function isStrictIsoDate(value: string): boolean {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return Boolean(parts && strictCalendarDate(Number(parts[3]), Number(parts[2]), Number(parts[1])));
}

function parseDateToken(value: string): Date | null {
  const numeric = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
  if (numeric) return strictCalendarDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  const named = new RegExp(`^(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4})$`, "iu").exec(value.trim());
  return named ? strictCalendarDate(Number(named[1]), MONTHS[named[2].toLocaleLowerCase("ru-RU")], Number(named[3])) : null;
}

function normalizeTime(value: string): string | null {
  const time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!time || Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3] ?? 0) > 59) return null;
  return `${time[1].padStart(2, "0")}:${time[2]}${time[3] ? `:${time[3]}` : ""}`;
}

function deadlineTime(before: string, after: string): string | null {
  // Only read the clock adjoining the END date; a range may also contain a start clock.
  const adjacentAfter = after.match(/^\s*(?:г(?:ода|\.)?\s*)?(?:(?:до|в)\s*)?(\d{1,2}:\d{2}(?::\d{2})?)/iu);
  const adjacentBefore = before.match(/(?:до|в)\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:час(?:ов|а)?\s*)?$/iu);
  return normalizeTime(adjacentAfter?.[1] ?? adjacentBefore?.[1] ?? "");
}

export type ApplicationPeriod = {
  startsOn: Date | null;
  endsOn: Date | null;
  endTime: string | null;
  evidence: string | null;
  confidence: "explicit" | "unconfirmed";
};

function period(startsOn: Date | null, endsOn: Date | null, endTime: string | null, evidence: string): ApplicationPeriod {
  if (startsOn && endsOn && startsOn > endsOn) return { startsOn: null, endsOn: null, endTime: null, evidence, confidence: "unconfirmed" };
  return { startsOn, endsOn, endTime: endsOn ? endTime : null, evidence, confidence: endsOn ? "explicit" : "unconfirmed" };
}

export function parseApplicationPeriod(text: string): ApplicationPeriod {
  const tokens = [...text.matchAll(new RegExp(`(?<!\\d)(?:${FULL_DATE_PATTERN})(?!\\d)`, "giu"))];
  // Explicit ranges take precedence over a generic "прием заявок" label.
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const start = tokens[index];
    const end = tokens[index + 1];
    const startIndex = start.index!;
    const endIndex = end.index!;
    const before = text.slice(Math.max(0, startIndex - 180), startIndex);
    const between = text.slice(startIndex + start[0].length, endIndex);
    if (!/(?:^|[\s(])с\s*$/iu.test(before) || !APPLICATION_CONTEXT.test(before) || between.length > 100 || !/(?:^|\s)(?:до|по)\s*$/iu.test(between)) continue;
    const evidence = text.slice(Math.max(0, startIndex - 60), endIndex + end[0].length + 30);
    return period(parseDateToken(start[0]), parseDateToken(end[0]), deadlineTime(between, text.slice(endIndex + end[0].length, endIndex + end[0].length + 45)), evidence);
  }

  // Common abbreviated periods: "с 1 по 30 ноября 2026" and "с 1 октября по 30 ноября 2026".
  const namedRange = new RegExp(`(?:^|\\s)с\\s+(\\d{1,2})(?:\\s+(${MONTH_PATTERN}))?(?:\\s+(\\d{4})(?:\\s*г(?:ода|\\.)?)?)?\\s+(?:до|по)\\s+(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(\\d{4})`, "giu");
  for (const match of text.matchAll(namedRange)) {
    if (!APPLICATION_CONTEXT.test(text.slice(Math.max(0, match.index! - 160), match.index!))) continue;
    const endYear = Number(match[6]);
    const start = strictCalendarDate(Number(match[1]), MONTHS[(match[2] ?? match[5]).toLocaleLowerCase("ru-RU")], Number(match[3] ?? endYear));
    const end = strictCalendarDate(Number(match[4]), MONTHS[match[5].toLocaleLowerCase("ru-RU")], endYear);
    return period(start, end, deadlineTime("", text.slice(match.index! + match[0].length, match.index! + match[0].length + 45)), match[0]);
  }
  const numericRange = /(?:^|\s)с\s+(\d{1,2})[./-](\d{1,2})\s+(?:до|по)\s+(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/giu;
  for (const match of text.matchAll(numericRange)) {
    if (!APPLICATION_CONTEXT.test(text.slice(Math.max(0, match.index! - 160), match.index!))) continue;
    return period(strictCalendarDate(Number(match[1]), Number(match[2]), Number(match[5])), strictCalendarDate(Number(match[3]), Number(match[4]), Number(match[5])), deadlineTime("", text.slice(match.index! + match[0].length, match.index! + match[0].length + 45)), match[0]);
  }

  let startsOn: Date | null = null;
  let endsOn: Date | null = null;
  let endTime: string | null = null;
  let evidence: string | null = null;
  for (const token of tokens) {
    const before = text.slice(Math.max(0, token.index! - 160), token.index!);
    const clause = before.split(/[\n;!?]/u).at(-1) ?? before;
    const after = text.slice(token.index! + token[0].length, token.index! + token[0].length + 45);
    if (!startsOn && (START_LABEL.test(clause) || (APPLICATION_CONTEXT.test(clause) && /(?:^|\s)с\s*$/iu.test(clause)))) startsOn = parseDateToken(token[0]);
    const hasEndLabel = END_LABEL.test(clause);
    const hasUntil = /(?:^|\s)(?:до|по)\s*(?:\d{1,2}:\d{2}(?::\d{2})?\s*)?$/iu.test(clause);
    if (!evidence && (hasEndLabel || hasUntil) && !/(?:^|\s)с\s*$/iu.test(clause)) {
      endsOn = parseDateToken(token[0]);
      endTime = deadlineTime(clause, after);
      evidence = `${clause}${token[0]}${after}`.trim();
    }
  }
  return evidence ? period(startsOn, endsOn, endTime, evidence) : { startsOn, endsOn: null, endTime: null, evidence: null, confidence: "unconfirmed" };
}

export function isApplicationOpen(startDate: string | null, endDate: string | null, endTime: string | null, now: Date): boolean {
  if (!endDate || !isStrictIsoDate(endDate) || (startDate !== null && (!isStrictIsoDate(startDate) || startDate > endDate))) return false;
  const { date, time } = getKazakhstanDateAndTime(now);
  const clock = endTime ? normalizeTime(endTime) : null;
  if (endTime && !clock) return false;
  // A clock specified to the minute includes that minute, rather than closing at HH:mm:00.
  const inclusiveEndTime = clock?.length === 5 ? `${clock}:59` : clock;
  return (!startDate || startDate <= date) && endDate >= date && (endDate > date || !inclusiveEndTime || inclusiveEndTime >= time);
}

export function getOpportunityStatus(text: string, now: Date, applicationPeriod = parseApplicationPeriod(text)): { status: OpportunityStatus; deadline: Date | null } {
  const deadline = applicationPeriod.endsOn;
  if (/конкурс[а-яё]*\s+заверш|при[её]м\s+заявок[а-яё]*\s+заверш|результат[а-яё]*\s+конкурс|заявки\s+рассмотрен|рассмотрен[а-яё]*\s+заявк|подведен[а-яё]*\s+итог/iu.test(text)) return { status: "closed", deadline };
  const start = dateIso(applicationPeriod.startsOn);
  const end = dateIso(deadline);
  const { date: today } = getKazakhstanDateAndTime(now);
  if (start && start > today) return { status: "upcoming", deadline };
  if (!end) return { status: "unconfirmed", deadline: null };
  return { status: isApplicationOpen(start, end, applicationPeriod.endTime, now) ? "open" : "closed", deadline };
}
