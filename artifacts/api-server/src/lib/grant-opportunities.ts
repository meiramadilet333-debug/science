import { dateIso, getKazakhstanDateAndTime, getOpportunityStatus, isApplicationOpen, parseApplicationPeriod, type OpportunityStatus } from "./grant-dates";
import { deduplicateGrants } from "./grant-identity";
import { fetchOfficialText, GrantSourceCache, mapWithConcurrency } from "./grant-provider";

const NCSTE_ANNOUNCEMENTS_URL = "https://www.ncste.kz/ru/announcements";
const NCSTE_BASE_URL = "https://www.ncste.kz/";
const GOV_SCIENCE_NEWS_URL = "https://www.gov.kz/org/science/press/news?lang=ru";
const GOV_SCIENCE_BASE_URL = "https://www.gov.kz";
const GOV_PUBLIC_TICKET_URL = "https://www.gov.kz/api/v1/public/_/c/k6";
const GOV_PUBLIC_NEWS_URL = "https://www.gov.kz/api/v1/public/content-manager/news";
const SCIENCE_FUND_FEED_URL = "https://science-fund.kz/feed/";
const ERC_GRANTS_URL = "https://erc.europa.eu/apply-grant";
const MSCA_FUNDING_URL = "https://marie-sklodowska-curie-actions.ec.europa.eu/funding";
const HORIZON_CALLS_URL = "https://funding-tenders.ec.europa.eu/portal/screen/opportunities/topic-search";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ANNOUNCEMENTS = 40;
const MAX_LISTING_ITEMS = 200;
const MAX_GOV_NEWS = 100;
const DETAIL_CONCURRENCY = 4;
const LIMITED_SOURCE_CACHE_TTL_MS = 15 * 60_000;
const CATALOG_CACHE_TTL_MS = 90_000;
const CATALOG_MIN_REFRESH_INTERVAL_MS = 30_000;



export type GrantOpportunitySearchInput = {
  direction: string;
  country: string;
  region: string;
  organizationType: string;
  projectStage: string;
  requestedFunding: string;
};

export type GrantOpportunitySearchResult = {
  id: string;
  title: string;
  organizer: string;
  description: string;
  direction: string;
  country: string;
  region: string;
  deadline: string;
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  applicationEndTime: string | null;
  eligibility: string;
  fundingAmount: string;
  fundingType: string;
  fundingForm: string;
  status: OpportunityStatus;
  statusLabel: string;
  sourceUrl: string;
  documentsUrl: string | null;
  checkedAt: string;
  verificationNote: string;
  criteria: {
    direction: "matched" | "not_found" | "not_requested";
    region: "matched" | "not_found" | "not_requested";
    organizationType: "mentioned" | "not_found" | "not_requested";
    projectStage: "mentioned" | "not_found" | "not_requested";
    fundingAmount: "matched" | "not_specified" | "not_requested";
  };
};

export type GrantOpportunitySearchResponse = {
  checkedAt: string;
  sourceName: string;
  sourceUrl: string;
  sourceAvailable: boolean;
  message: string;
  opportunities: GrantOpportunitySearchResult[];
};

type Announcement = {
  title: string;
  description: string;
  href: string;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#039;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    );
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function getClassContent(html: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<([a-z][a-z0-9]*)\\b[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    ),
  );
  return match?.[2] ?? "";
}

function parseAnnouncements(html: string): Announcement[] {
  const starts = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bnews-item\b[^"']*["'][^>]*>/gi)]
    .map((match) => match.index)
    .filter((index): index is number => typeof index === "number");
  const announcements: Announcement[] = [];

  for (let index = 0; index < Math.min(starts.length, MAX_LISTING_ITEMS); index += 1) {
    const block = html.slice(starts[index], starts[index + 1] ?? html.length);
    const titleHtml = getClassContent(block, "news-title");
    const title = stripHtml(titleHtml);
    const href = titleHtml.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1];
    if (!title || !href) continue;

    let url: URL;
    try { url = new URL(href, NCSTE_BASE_URL); } catch { continue; }
    if (url.protocol !== "https:" || (url.hostname !== "ncste.kz" && !url.hostname.endsWith(".ncste.kz"))) continue;
    if (!/конкурс|грантов|финансирован|жас ғалым|жас галым/iu.test(title)) continue;

    announcements.push({
      title,
      description: stripHtml(getClassContent(block, "news-description")),
      href: url.toString(),
    });
    if (announcements.length >= MAX_ANNOUNCEMENTS) break;
  }

  return announcements;
}

function getParagraphs(html: string): string[] {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((paragraph) => paragraph.length > 20);
}

function getOfficialDocumentsUrl(html: string): string | null {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const label = stripHtml(match[2]);
    let url: URL;
    try {
      url = new URL(href, NCSTE_BASE_URL);
    } catch {
      continue;
    }
    const officialHost =
      url.hostname === "gov.kz" ||
      url.hostname.endsWith(".gov.kz") ||
      url.hostname === "ncste.kz" ||
      url.hostname.endsWith(".ncste.kz") ||
      url.hostname === "is.ncste.kz";
    if (
      url.protocol === "https:" &&
      officialHost &&
      (/конкурсн|документац|заявк|application|reglament|\.pdf\b|\.docx?\b/i.test(label) ||
        /\.(pdf|docx?)(?:$|\?)/i.test(url.pathname))
    ) {
      return url.toString();
    }
  }
  return null;
}

function dateLabel(date: Date | null): string {
  return date
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "UTC" }).format(date)
    : "Дедлайн не подтверждён в объявлении";
}

function extractBudget(text: string): string {
  const match = text.match(
    /(?:до\s+)?\d[\d\s]*(?:[,.]\d+)?\s*(?:млрд|миллиард\w*|млн|миллион\w*|тыс\.?|тысяч\w*)\s*(?:тенге|₸|KZT)/iu,
  );
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? "Не указано в публикации";
}

function parseTengeAmount(value: string): number | null {
  const match = value.toLocaleLowerCase("ru-RU").match(
    /(\d[\d\s]*(?:[,.]\d+)?)\s*(млрд|миллиард[а-яё]*|млн|миллион[а-яё]*|тыс\.?|тысяч[а-яё]*|тенге|₸|kzt)/iu,
  );
  if (!match) return null;
  const amount = Number(match[1].replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const unit = match[2];
  const multiplier = /млрд|миллиард/iu.test(unit)
    ? 1_000_000_000
    : /млн|миллион/iu.test(unit)
      ? 1_000_000
      : /тыс|тысяч/iu.test(unit)
        ? 1_000
        : 1;
  return amount * multiplier;
}

function extractOrganizer(text: string): string {
  const match = text.match(
    /((?:Комитет науки|Министерство науки и высшего образования|Министерство образования и науки)[^.;\n]{0,180}?)\s+(?:объявляет|сообщает|проводит)/iu,
  );
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "Организатор не выделен в объявлении";
}

function extractDirection(text: string): string {
  const section = text.match(
    /(?:по\s+следующим\s+приоритетным\s+направлениям|приоритетн[а-яё]*\s+направлени[а-яё]*)[^:\n]{0,100}:\s*([\s\S]{0,1800}?)(?=\n(?:Call center|Контакт|Начало приема заявок|Окончательный срок)|$)/iu,
  );
  if (!section) return "Направление не указано в кратком объявлении";
  const directions = section[1]
    .split(/\n|[;•]/)
    .map((item) => item.replace(/^[\s–—-]+|[\s–—-]+$/g, "").trim())
    .filter((item) => item.length >= 8 && item.length <= 240)
    .slice(0, 8);
  return directions.length > 0 ? directions.join("; ") : "Направление не указано в кратком объявлении";
}

function matchesInput(value: string, text: string): boolean {
  const terms = value.toLocaleLowerCase("ru-RU").split(/[\s,;]+/u).filter((term) => term.length > 2);
  const normalizedText = text.toLocaleLowerCase("ru-RU");
  return terms.length > 0 && terms.every((term) => normalizedText.includes(term));
}

function getCriteria(input: GrantOpportunitySearchInput, text: string, amount: string) {
  const isRequestedAmount = Boolean(input.requestedFunding.trim());
  const sourceAmount = parseTengeAmount(amount);
  const requestedAmount = parseTengeAmount(input.requestedFunding);
  const amountMatches =
    sourceAmount !== null &&
    requestedAmount !== null &&
    (/до|менее|не более/iu.test(input.requestedFunding)
      ? sourceAmount <= requestedAmount
      : sourceAmount === requestedAmount);
  return {
    direction: input.direction.trim()
      ? matchesInput(input.direction, text) ? "matched" as const : "not_found" as const
      : "not_requested" as const,
    region: input.region.trim()
      ? matchesInput(input.region, text) ? "matched" as const : "not_found" as const
      : "not_requested" as const,
    organizationType: input.organizationType.trim()
      ? matchesInput(input.organizationType, text) ? "mentioned" as const : "not_found" as const
      : "not_requested" as const,
    projectStage: input.projectStage.trim()
      ? matchesInput(input.projectStage, text) ? "mentioned" as const : "not_found" as const
      : "not_requested" as const,
    fundingAmount: !isRequestedAmount
      ? "not_requested" as const
      : sourceAmount === null
        ? "not_specified" as const
        : amountMatches ? "matched" as const : "not_specified" as const,
  };
}

function getStatusLabel(status: OpportunityStatus): string {
  switch (status) {
    case "open": return "Приём открыт";
    case "upcoming": return "Скоро откроется";
    case "closed": return "Приём завершён";
    case "unconfirmed": return "Статус не подтверждён";
  }
}

function isKazakhstan(value: string): boolean {
  return /^(?:казахстан|республика казахстан|қазақстан|қазақстан республикасы|kazakhstan|kz)$/iu.test(value.trim());
}

export async function searchGrantOpportunities(
  input: GrantOpportunitySearchInput,
  now = new Date(),
): Promise<GrantOpportunitySearchResponse> {
  const checkedAt = now.toISOString();
  if (!isKazakhstan(input.country)) {
    return {
      checkedAt,
      sourceName: "НЦГНТЭ",
      sourceUrl: NCSTE_ANNOUNCEMENTS_URL,
      sourceAvailable: false,
      message: "Автоматический поиск подключён только для конкурсов Казахстана. Для указанной страны официальные источники пока не подключены.",
      opportunities: [],
    };
  }

  const listingHtml = await fetchOfficialText(NCSTE_ANNOUNCEMENTS_URL, "НЦГНТЭ");
  const announcements = parseAnnouncements(listingHtml)
    .filter((item) => /конкурс|грантов|финансирован|жас ғалым|жас галым/iu.test(item.title));

  const opportunities = await mapWithConcurrency(announcements, DETAIL_CONCURRENCY, async (announcement): Promise<GrantOpportunitySearchResult> => {
    let detailHtml: string | null = null;
    let detailError = false;
    try {
      detailHtml = await fetchOfficialText(announcement.href, "НЦГНТЭ");
    } catch {
      detailError = true;
    }

    const paragraphs = detailHtml ? getParagraphs(detailHtml) : [];
    const description = announcement.description || announcement.title;
    const sourceText = [announcement.title, description, ...paragraphs].join("\n");
    const applicationPeriod = parseApplicationPeriod(sourceText);
    const statusInfo = getOpportunityStatus(sourceText, now, applicationPeriod);
    const direction = extractDirection(sourceText);
    const fundingAmount = extractBudget(sourceText);
    const criteria = getCriteria(input, sourceText, fundingAmount);
    const sourceTitle = announcement.title;
    const link = announcement.href;
    const documentsUrl = detailHtml ? getOfficialDocumentsUrl(detailHtml) : null;
    const closedOrOpenedByDeadline = statusInfo.status === "open" || statusInfo.status === "upcoming";
    const status = detailError ? "unconfirmed" : statusInfo.status;
    const participationDetails = paragraphs.find((paragraph) =>
      /конкурсные заявки подаются|требован[а-яё]*\s+к\s+участник|участник[а-яё]*\s+конкурс/iu.test(paragraph),
    );
    const isYoungResearchersCall = /молодых\s+уч[её]ных|молодым\s+уч[её]ным/iu.test(sourceText);

    return {
      id: `ncste:${encodeURIComponent(link)}`,
      title: sourceTitle,
      organizer: extractOrganizer(sourceText),
      description: description || "Краткое описание не указано в карточке объявления.",
      direction,
      country: "Казахстан",
      region: matchesInput(input.region, sourceText) ? input.region.trim() : "Не указано в публикации",
      deadline: dateLabel(statusInfo.deadline),
      applicationStartDate: dateIso(applicationPeriod.startsOn),
      applicationEndDate: dateIso(statusInfo.deadline),
      applicationEndTime: applicationPeriod.endTime,
      eligibility: [
        isYoungResearchersCall
          ? "Конкурс предназначен для исследований молодых учёных (как указано в названии объявления)."
          : "",
        participationDetails ?? "",
        "Полный перечень критериев участия — в конкурсной документации.",
      ].filter(Boolean).join(" "),
      fundingAmount,
      fundingType: /грантов[а-яё]*\s+финансирован/iu.test(sourceText)
        ? "Грантовое финансирование"
        : /программно-целев[а-яё]*\s+финансирован/iu.test(sourceText)
          ? "Программно-целевое финансирование"
          : "Не указано в публикации",
      fundingForm: /грантов[а-яё]*\s+финансирован/iu.test(sourceText)
        ? "Грант"
        : "Форма финансирования не указана в публикации",
      status,
      statusLabel: getStatusLabel(status),
      sourceUrl: link,
      documentsUrl,
      checkedAt,
      verificationNote: detailError
        ? "Страница объявления не загрузилась при проверке. Актуальность и условия конкурса не подтверждены."
        : closedOrOpenedByDeadline
          ? "Статус определён по дедлайну, явно указанному на официальной странице. Повторно проверьте срок перед подачей."
          : "Источник официальный, но дата приёма заявок не найдена или не распознана. Не считайте конкурс открытым без проверки документации.",
      criteria,
    };
  });

  const directionQuery = input.direction.trim();
  const filtered = opportunities
    .filter((item) => {
      const searchable = `${item.title}\n${item.description}\n${item.direction}\n${item.organizer}`;
      return !directionQuery || matchesInput(directionQuery, searchable);
    })
    .sort((left, right) => {
      const statusPriority: Record<OpportunityStatus, number> = {
        open: 0,
        upcoming: 1,
        unconfirmed: 2,
        closed: 3,
      };
      return statusPriority[left.status] - statusPriority[right.status];
    });

  return {
    checkedAt,
    sourceName: "Национальный центр государственной научно-технической экспертизы (НЦГНТЭ)",
    sourceUrl: NCSTE_ANNOUNCEMENTS_URL,
    sourceAvailable: true,
    message: filtered.length > 0
      ? `Проверено официальных объявлений: ${announcements.length} (не более ${MAX_ANNOUNCEMENTS} конкурсов из первых ${MAX_LISTING_ITEMS} записей доступной страницы). Охват не равен всем открытым конкурсам. Направление фильтруется по тексту источника; для региона, организации, стадии и суммы показывается только найденное в объявлении подтверждение.`
      : announcements.length > 0
        ? "Официальные объявления получены, но подходящих по направлению и региону не найдено."
        : "Официальный список объявлений загружен, но конкурсы финансирования в нём не найдены.",
    opportunities: filtered,
  };
}

export type CurrentGrantCatalogItem = {
  id: string;
  title: string;
  organizer: string;
  program: string;
  directions: string;
  fundingAmount: string;
  applicationStartDate: string;
  applicationEndDate: string;
  applicationEndTime: string | null;
  daysRemaining: number;
  eligibility: string;
  researcherCategory: string;
  country: string;
  region: string;
  sourceName: string;
  officialUrl: string;
  lastCheckedAt: string;
};

export type GrantCatalogSourceStatus = {
  id: string;
  name: string;
  url: string;
  state: "connected" | "limited" | "error";
  checkedAt: string | null;
  openCount: number;
  unconfirmedCount: number;
  message: string;
};

export type CurrentGrantCatalogResponse = {
  checkedAt: string;
  sourceName: string;
  sourceUrl: string;
  sourceAvailable: boolean;
  cached: boolean;
  message: string;
  opportunities: CurrentGrantCatalogItem[];
  sources: GrantCatalogSourceStatus[];
};

function isAllowedOfficialUrl(value: string, allowedDomains: string[]): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      allowedDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      ? url
      : null;
  } catch {
    return null;
  }
}

function researcherCategory(text: string): string {
  if (/молод[а-яё]*\s+уч[её]н/iu.test(text)) return "Молодые учёные";
  if (/докторант|postdoc|постдок/iu.test(text)) return "Докторанты и постдокторанты";
  if (/аспирант|магистрант|студент/iu.test(text)) return "Студенты и магистранты";
  if (/организац|предприяти|юридическ[а-яё]*\s+лиц/iu.test(text)) return "Научные организации / юридические лица";
  if (/исследовательск[а-яё]*\s+групп|проектн[а-яё]*\s+групп|научн[а-яё]*\s+коллектив/iu.test(text)) return "Исследовательские группы";
  return "Не указано";
}

function normalizeOpenGrant(input: {
  id: string;
  title: string;
  organizer: string;
  program: string;
  directions: string;
  fundingAmount: string;
  startDate: string | null;
  endDate: string | null;
  endTime: string | null;
  eligibility: string;
  country: string;
  sourceName: string;
  sourceUrl: string;
  checkedAt: string;
  now: Date;
}): CurrentGrantCatalogItem | null {
  const officialUrl = isAllowedOfficialUrl(input.sourceUrl, [
    "ncste.kz",
    "gov.kz",
    "science-fund.kz",
  ]);
  const { date: today } = getKazakhstanDateAndTime(input.now);
  if (
    !officialUrl ||
    !input.title.trim() ||
    !input.organizer.trim() ||
    !input.startDate ||
    !input.endDate ||
    !isApplicationOpen(input.startDate, input.endDate, input.endTime, input.now)
  ) {
    return null;
  }
  const todayTimestamp = Date.parse(`${today}T00:00:00Z`);
  return {
    id: input.id,
    title: input.title.trim(),
    organizer: input.organizer.trim(),
    program: input.program,
    directions: input.directions || "Не указано",
    fundingAmount: input.fundingAmount || "Не указано",
    applicationStartDate: input.startDate,
    applicationEndDate: input.endDate,
    applicationEndTime: input.endTime,
    daysRemaining: Math.max(
      0,
      Math.floor((Date.parse(`${input.endDate}T00:00:00Z`) - todayTimestamp) / 86_400_000),
    ),
    eligibility: input.eligibility || "Не указано",
    researcherCategory: researcherCategory(`${input.title}\n${input.eligibility}`),
    country: input.country,
    region: "Не указано",
    sourceName: input.sourceName,
    officialUrl: officialUrl.toString(),
    lastCheckedAt: input.checkedAt,
  };
}

function makeSourceStatus(
  id: string,
  name: string,
  url: string,
  state: GrantCatalogSourceStatus["state"],
  checkedAt: string | null,
  openCount: number,
  message: string,
  unconfirmedCount = 0,
): GrantCatalogSourceStatus {
  return { id, name, url, state, checkedAt, openCount, unconfirmedCount, message };
}

async function fetchNcsteCatalog(now: Date): Promise<{
  source: GrantCatalogSourceStatus;
  opportunities: CurrentGrantCatalogItem[];
}> {
  try {
    const source = await searchGrantOpportunities(
      {
        direction: "",
        country: "Казахстан",
        region: "",
        organizationType: "",
        projectStage: "",
        requestedFunding: "",
      },
      now,
    );
    const opportunities = source.opportunities.flatMap((item) => {
      if (item.status !== "open") return [];
      const grant = normalizeOpenGrant({
        id: item.id,
        title: item.title,
        organizer: item.organizer,
        program: "Казахстан · НЦГНТЭ",
        directions: item.direction === "Направление не указано в кратком объявлении" ? "" : item.direction,
        fundingAmount: item.fundingAmount === "Не указано в публикации" ? "" : item.fundingAmount,
        startDate: item.applicationStartDate,
        endDate: item.applicationEndDate,
        endTime: item.applicationEndTime,
        eligibility: item.eligibility,
        country: "Казахстан",
        sourceName: "НЦГНТЭ",
        sourceUrl: item.sourceUrl,
        checkedAt: item.checkedAt,
        now,
      });
      return grant ? [grant] : [];
    });
    const unconfirmedCount = source.opportunities
      .filter((item) => item.status === "unconfirmed").length;
    return {
      source: makeSourceStatus(
        "ncste",
        "НЦГНТЭ",
        NCSTE_ANNOUNCEMENTS_URL,
        "connected",
        source.checkedAt,
        opportunities.length,
        `Проверено объявлений: ${source.opportunities.length}. ${unconfirmedCount ? `${unconfirmedCount} объявлений имеют неподтверждённый статус и скрыты.` : "Завершённые и неполные объявления не включены."}`,
        unconfirmedCount,
      ),
      opportunities,
    };
  } catch (error) {
    return {
      source: makeSourceStatus("ncste", "НЦГНТЭ", NCSTE_ANNOUNCEMENTS_URL, "error", null, 0, error instanceof Error ? error.message : "Источник недоступен."),
      opportunities: [],
    };
  }
}

type GovNewsRecord = {
  id: string;
  title: string;
  body: string;
};

async function fetchGovNewsRecords(): Promise<GovNewsRecord[]> {
  const ticketResponse = await fetch(GOV_PUBLIC_TICKET_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: GOV_SCIENCE_BASE_URL,
      Referer: GOV_SCIENCE_NEWS_URL,
      "User-Agent": "ScientificNavigator/1.0",
    },
    body: "{}",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!ticketResponse.ok) {
    throw new Error(`gov.kz вернул HTTP ${ticketResponse.status} при получении публичного запроса.`);
  }
  const cookie = ticketResponse.headers.get("set-cookie")?.match(/_gk6=[^;,\s]+/i)?.[0];
  if (!cookie) {
    throw new Error("gov.kz не выдал публичный токен для чтения новостей.");
  }

  const query = new URLSearchParams({
    size: String(MAX_GOV_NEWS),
    "sort-by": "created_date:DESC",
    projects: "science",
  });
  const newsResponse = await fetch(`${GOV_PUBLIC_NEWS_URL}?${query}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "ru",
      Cookie: cookie,
      Referer: GOV_SCIENCE_NEWS_URL,
      "User-Agent": "ScientificNavigator/1.0",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!newsResponse.ok) {
    throw new Error(`Публичный API gov.kz вернул HTTP ${newsResponse.status}.`);
  }
  const contentType = newsResponse.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Публичный API gov.kz вернул неожиданный формат данных.");
  }
  const payload: unknown = await newsResponse.json();
  if (!Array.isArray(payload)) {
    throw new Error("Публичный API gov.kz вернул некорректный список новостей.");
  }
  return payload.slice(0, MAX_GOV_NEWS).flatMap((value): GovNewsRecord[] => {
    const record = asRecord(value);
    if (!record) return [];
    const id = typeof record.id === "number" || typeof record.id === "string"
      ? String(record.id)
      : "";
    const title = typeof record.title === "string" ? stripHtml(record.title) : "";
    const body = typeof record.body === "string" ? stripHtml(record.body) : "";
    return id && title && body ? [{ id, title, body }] : [];
  });
}

async function fetchGovCatalog(now: Date): Promise<{
  source: GrantCatalogSourceStatus;
  opportunities: CurrentGrantCatalogItem[];
}> {
  try {
    const records = (await fetchGovNewsRecords())
      .filter((record) => /грантов|конкурс|финансирован/iu.test(`${record.title}\n${record.body}`))
      .slice(0, MAX_ANNOUNCEMENTS);
    const checkedAt = now.toISOString();
    let unconfirmedCount = 0;
    const opportunities = records.flatMap((record) => {
      const body = `${record.title}\n${record.body}`;
      const applicationPeriod = parseApplicationPeriod(body);
      const deadline = applicationPeriod.endsOn;
      const startDate = applicationPeriod.startsOn;
      if (!deadline || !startDate) {
        unconfirmedCount += 1;
        return [];
      }
      if (/при[её]м\s+заявок[а-яё]*\s+заверш|результат[а-яё]*\s+конкурс|заявки\s+рассмотрен/iu.test(body)) return [];
      const link = `${GOV_SCIENCE_BASE_URL}/org/science/press/news/details/${encodeURIComponent(record.id)}?lang=ru`;
      const grant = normalizeOpenGrant({
        id: `gov:${record.id}`,
        title: record.title,
        organizer: extractOrganizer(body),
        program: "Казахстан · МНВО РК",
        directions: extractDirection(body).replace("Направление не указано в кратком объявлении", ""),
        fundingAmount: extractBudget(body).replace("Не указано в публикации", ""),
        startDate: dateIso(startDate),
        endDate: dateIso(deadline),
        endTime: applicationPeriod.endTime,
        eligibility: body.match(/(?:конкурсные заявки подаются|требован[а-яё]*\s+к\s+участник[а-яё]*)[\s\S]{0,500}?(?=\n(?:Начало приема|Окончательный срок|Конкурсная документация)|$)/iu)?.[0]
          ?.replace(/\s+/g, " ")
          .trim() ?? "",
        country: "Казахстан",
        sourceName: "Министерство науки и высшего образования РК",
        sourceUrl: link,
        checkedAt,
        now,
      });
      return grant ? [grant] : [];
    });
    return {
      source: makeSourceStatus(
        "gov-kz",
        "Министерство науки и высшего образования РК",
        GOV_SCIENCE_NEWS_URL,
        "connected",
        checkedAt,
        opportunities.length,
        `Проверено релевантных публикаций: ${records.length}, из не более ${MAX_GOV_NEWS} свежих новостей; полный архив не обходится. ${unconfirmedCount ? `${unconfirmedCount} конкурсов без подтверждённых дат скрыты.` : "Завершённые и неполные объявления не включены."}`,
        unconfirmedCount,
      ),
      opportunities,
    };
  } catch (error) {
    return {
      source: makeSourceStatus("gov-kz", "Министерство науки и высшего образования РК", GOV_SCIENCE_NEWS_URL, "error", null, 0, error instanceof Error ? error.message : "Источник недоступен."),
      opportunities: [],
    };
  }
}

function getXmlTag(item: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = item.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, "i"))?.[1] ?? "";
  return stripHtml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

async function fetchScienceFundCatalog(now: Date): Promise<{
  source: GrantCatalogSourceStatus;
  opportunities: CurrentGrantCatalogItem[];
}> {
  try {
    const feed = await fetchOfficialText(SCIENCE_FUND_FEED_URL, "Фонд науки Казахстана");
    const items = [...feed.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, MAX_LISTING_ITEMS).map((match) => match[1]);
    const checkedAt = now.toISOString();
    let unconfirmedCount = 0;
    const opportunities = items.flatMap((item) => {
      const title = getXmlTag(item, "title");
      const description = getXmlTag(item, "content:encoded") || getXmlTag(item, "description");
      const link = getXmlTag(item, "link");
      if (!/конкурс|грантов/iu.test(title) || !isAllowedOfficialUrl(link, ["science-fund.kz"])) return [];
      const body = `${title}\n${description}`;
      const applicationPeriod = parseApplicationPeriod(body);
      const deadline = applicationPeriod.endsOn;
      const startDate = applicationPeriod.startsOn;
      if (!deadline || !startDate) {
        unconfirmedCount += 1;
        return [];
      }
      if (/при[её]м\s+заявок[а-яё]*\s+заверш|конкурс[а-яё]*\s+заверш|результат[а-яё]*\s+конкурс/iu.test(body)) return [];
      const grant = normalizeOpenGrant({
        id: `science-fund:${link}`,
        title,
        organizer: "АО «Фонд науки»",
        program: "Казахстан · Фонд науки",
        directions: extractDirection(body).replace("Направление не указано в кратком объявлении", ""),
        fundingAmount: extractBudget(body).replace("Не указано в публикации", ""),
        startDate: dateIso(startDate),
        endDate: dateIso(deadline),
        endTime: applicationPeriod.endTime,
        eligibility: body.match(/(?:Конкурсные заявки принимаются|к участию допускаются|участниками конкурса могут быть)[\s\S]{0,500}?(?=\n(?:Консультацию|Срок завершения|Срок окончания)|$)/iu)?.[0]
          ?.replace(/\s+/g, " ")
          .trim() ?? "",
        country: "Казахстан",
        sourceName: "Фонд науки Казахстана",
        sourceUrl: link,
        checkedAt,
        now,
      });
      return grant ? [grant] : [];
    });
    return {
      source: makeSourceStatus(
        "science-fund",
        "Фонд науки Казахстана",
        SCIENCE_FUND_FEED_URL,
        "connected",
        checkedAt,
        opportunities.length,
        `RSS доступен; проверено объявлений: ${items.length} (не более ${MAX_LISTING_ITEMS} записей ленты); полный архив не обходится. ${unconfirmedCount ? `${unconfirmedCount} конкурсов с неподтверждёнными сроками скрыты.` : "Конкурсы с истёкшим сроком или неподтверждённым статусом скрыты."}`,
        unconfirmedCount,
      ),
      opportunities,
    };
  } catch (error) {
    return {
      source: makeSourceStatus("science-fund", "Фонд науки Казахстана", SCIENCE_FUND_FEED_URL, "error", null, 0, error instanceof Error ? error.message : "Источник недоступен."),
      opportunities: [],
    };
  }
}

async function probeLimitedSource(
  id: string,
  name: string,
  url: string,
  unavailableMessage: string,
  availableMessage: string,
  now: Date,
): Promise<GrantCatalogSourceStatus> {
  try {
    await fetchOfficialText(url, name);
    return makeSourceStatus(id, name, url, "limited", now.toISOString(), 0, availableMessage);
  } catch (error) {
    return makeSourceStatus(
      id,
      name,
      url,
      "error",
      null,
      0,
      error instanceof Error ? error.message : unavailableMessage,
    );
  }
}

let catalogCache: { fetchedAt: number; response: CurrentGrantCatalogResponse } | null = null;
let catalogRefreshInFlight: Promise<CurrentGrantCatalogResponse> | null = null;
let lastCatalogRefreshAt = 0;
type CatalogSourceResult = { source: GrantCatalogSourceStatus; opportunities: CurrentGrantCatalogItem[] };
const sourceCache = new GrantSourceCache<CatalogSourceResult>();

function updateSourceOpenCounts(
  sources: GrantCatalogSourceStatus[],
  opportunities: CurrentGrantCatalogItem[],
): GrantCatalogSourceStatus[] {
  const counts = new Map<string, number>();
  for (const item of opportunities) {
    counts.set(item.sourceName, (counts.get(item.sourceName) ?? 0) + 1);
  }
  return sources.map((source) => ({
    ...source,
    openCount: counts.get(source.name) ?? 0,
  }));
}

async function loadCurrentGrantCatalog(now: Date, forceRefresh: boolean): Promise<CurrentGrantCatalogResponse> {
  const sourceOptions = { nowMs: now.getTime(), ttlMs: CATALOG_CACHE_TTL_MS, force: forceRefresh };
  const loadLimited = (id: string, name: string, url: string, unavailableMessage: string, availableMessage: string) => sourceCache.load(id, async () => ({
    source: await probeLimitedSource(id, name, url, unavailableMessage, availableMessage, now),
    opportunities: [],
  }), { ...sourceOptions, ttlMs: LIMITED_SOURCE_CACHE_TTL_MS });
  const [
    ncste,
    government,
    scienceFund,
    horizon,
    erc,
    msca,
  ] = await Promise.all([
    sourceCache.load("ncste", () => fetchNcsteCatalog(now), sourceOptions),
    sourceCache.load("gov-kz", () => fetchGovCatalog(now), sourceOptions),
    sourceCache.load("science-fund", () => fetchScienceFundCatalog(now), sourceOptions),
    loadLimited(
      "horizon-europe",
      "Horizon Europe · Funding & Tenders",
      HORIZON_CALLS_URL,
      "Официальный hostname funding-tenders.ec.europa.eu не разрешается в DNS из среды запуска.",
      "Портал доступен, но машинное чтение открытых конкурсов не настроено.",
    ),
    loadLimited(
      "erc",
      "European Research Council",
      ERC_GRANTS_URL,
      "Официальная страница ERC временно недоступна.",
      "Страница схем ERC доступна, но она не содержит структурированного списка конкурсов с текущими сроками.",
    ),
    loadLimited(
      "msca",
      "Marie Skłodowska-Curie Actions",
      MSCA_FUNDING_URL,
      "Официальная страница MSCA временно недоступна.",
      "Страница доступна, список конкурсов загружается динамическим компонентом; публичный Drupal JSON:API endpoint вернул 404.",
    ),
  ]);
  const sources = [ncste.source, government.source, scienceFund.source, horizon.source, erc.source, msca.source];
  const rawOpportunities = [...ncste.opportunities, ...government.opportunities, ...scienceFund.opportunities];
  const opportunities = deduplicateGrants(rawOpportunities).sort((left, right) =>
    left.applicationEndDate.localeCompare(right.applicationEndDate) ||
    left.title.localeCompare(right.title, "ru"),
  );
  const uniqueSources = updateSourceOpenCounts(sources, opportunities);
  const successfulSources = uniqueSources.filter((source) => source.state === "connected");
  const checkedAt = successfulSources
    .map((source) => source.checkedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1) ?? now.toISOString();
  const sourceAvailable = successfulSources.length > 0;
  return refreshGrantCatalogForTime({
    checkedAt,
    sourceName: "Официальные источники научного финансирования",
    sourceUrl: NCSTE_ANNOUNCEMENTS_URL,
    sourceAvailable,
    cached: false,
    message: "",
    opportunities,
    sources: uniqueSources,
  }, now);
}

/** Recheck calendar boundaries even while source data is still inside its TTL. */
export function refreshGrantCatalogForTime(response: CurrentGrantCatalogResponse, now: Date): CurrentGrantCatalogResponse {
  const { date: today } = getKazakhstanDateAndTime(now);
  const todayTimestamp = Date.parse(`${today}T00:00:00Z`);
  const opportunities = response.opportunities
    .filter((item) => isApplicationOpen(item.applicationStartDate, item.applicationEndDate, item.applicationEndTime, now))
    .map((item) => ({ ...item, daysRemaining: Math.max(0, Math.floor((Date.parse(`${item.applicationEndDate}T00:00:00Z`) - todayTimestamp) / 86_400_000)) }));
  const sources = updateSourceOpenCounts(response.sources, opportunities);
  const failedCount = sources.filter((source) => source.state === "error").length;
  const message = opportunities.length
    ? `В каталоге ${opportunities.length} конкурсов с подтверждённым открытым приёмом. Последняя успешная проверка источника: ${response.checkedAt}.`
    : response.sourceAvailable
      ? "В проверенной части доступных источников не найдено конкурсов с подтверждённым открытым приёмом."
      : "Ни один из официальных источников не удалось проверить; актуальные конкурсы не показаны.";
  return { ...response, opportunities, sources, message: `${message} Охват ограничен доступными страницами и лентами.${failedCount ? ` Недоступных источников: ${failedCount}; отсутствие конкурсов в них не подтверждено.` : ""}` };
}

export async function getCurrentGrantCatalog(
  now = new Date(),
  forceRefresh = false,
): Promise<CurrentGrantCatalogResponse> {
  const currentTime = now.getTime();
  const cachedCatalog = catalogCache;
  const cacheIsFresh = cachedCatalog !== null &&
    currentTime >= cachedCatalog.fetchedAt &&
    currentTime - cachedCatalog.fetchedAt < CATALOG_CACHE_TTL_MS;
  if (cacheIsFresh && (!forceRefresh || currentTime - lastCatalogRefreshAt < CATALOG_MIN_REFRESH_INTERVAL_MS)) {
    return refreshGrantCatalogForTime({ ...cachedCatalog.response, cached: true }, now);
  }
  if (catalogRefreshInFlight) {
    return refreshGrantCatalogForTime({ ...(await catalogRefreshInFlight), cached: true }, now);
  }
  catalogRefreshInFlight = loadCurrentGrantCatalog(now, forceRefresh);
  lastCatalogRefreshAt = currentTime;
  try {
    const response = await catalogRefreshInFlight;
    catalogCache = { fetchedAt: currentTime, response };
    return response;
  } finally {
    catalogRefreshInFlight = null;
  }
}

export function parseGrantOpportunitySearchInput(
  value: unknown,
): GrantOpportunitySearchInput | null {
  const input = asRecord(value);
  if (!input) return null;
  const fields = ["direction", "country", "region", "organizationType", "projectStage", "requestedFunding"] as const;
  if (fields.some((field) => typeof input[field] !== "string" || input[field].length > 300)) {
    return null;
  }
  return {
    direction: (input.direction as string).trim(),
    country: (input.country as string).trim(),
    region: (input.region as string).trim(),
    organizationType: (input.organizationType as string).trim(),
    projectStage: (input.projectStage as string).trim(),
    requestedFunding: (input.requestedFunding as string).trim(),
  };
}
