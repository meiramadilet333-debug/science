/** Keep meaningful query parameters (including contest IDs), discard only presentation/tracking. */
export function canonicalGrantUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    for (const name of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|lang)$/iu.test(name)) url.searchParams.delete(name);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

/** Dates and organizer are not enough to establish identity; all stable identifiers must match. */
export function deduplicateGrants<T extends { id: string; title: string; officialUrl: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const url = canonicalGrantUrl(item.officialUrl);
    const title = item.title.trim().replace(/\s+/gu, " ");
    const identity = url && item.id && title
      ? JSON.stringify([item.id, title, url])
      : null;
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    unique.push(item);
  }
  return unique;
}
