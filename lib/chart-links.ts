export const sharedChartPath = "/shared-chart";

export function isChartLinkToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function isDraftChartLinkToken(value: unknown): value is string {
  return (
    isShortChartLinkToken(value) ||
    (typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value))
  );
}

export function isShortChartLinkToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9]{6}$/.test(value);
}

export function isChartLinkSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,48}$/.test(value);
}

export function isShareLinkToken(value: unknown): value is string {
  return isChartLinkToken(value) || isDraftChartLinkToken(value);
}

export function chartLinkSlug(title: string) {
  return (
    title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "chart"
  );
}

export function chartLinkUrl(origin: string, token: string, title?: string) {
  const url = new URL(sharedChartPath, origin);
  // The snapshot name and key stay in the browser fragment. Renaming the
  // original chart does not change the snapshot URL.
  url.hash = title === undefined ? token : `${chartLinkSlug(title)}~${token}`;
  return url.href;
}

export function chartLinkFromHash(hash: string) {
  if (hash.length > 82) return null;
  const [first, second, extra] = hash.replace(/^#/, "").split("~");
  if (extra !== undefined || (second !== undefined && !isChartLinkSlug(first)))
    return null;
  const token = second ?? first;
  if (!isShareLinkToken(token)) return null;
  return isShortChartLinkToken(token)
    ? second === undefined
      ? null
      : { token, slug: first }
    : { token };
}
