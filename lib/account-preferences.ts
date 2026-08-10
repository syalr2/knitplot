export const ACCOUNT_SYMBOLS = {
  flower: "✿",
  heart: "♥",
  star: "★",
  yarn: "◎",
} as const;

export const ACCOUNT_COLORS = {
  green: "#6e7a6b",
  pink: "#a95e67",
  yellow: "#a77934",
} as const;

export type AccountSymbol = keyof typeof ACCOUNT_SYMBOLS;
export type AccountColor = keyof typeof ACCOUNT_COLORS;
export type AccountAvatar =
  | { kind: "symbol"; value: AccountSymbol; color: AccountColor }
  | { kind: "initials"; value: string; color: AccountColor };

export function defaultAccountAvatar(email: string | null): AccountAvatar {
  const first = email?.trim().charAt(0).toLocaleUpperCase() || "K";
  return { kind: "initials", value: first, color: "green" };
}

export function parseAccountAvatar(metadata: unknown, email: string | null): AccountAvatar {
  if (!metadata || typeof metadata !== "object") return defaultAccountAvatar(email);
  const knitplot = (metadata as Record<string, unknown>).knitplot;
  if (!knitplot || typeof knitplot !== "object") return defaultAccountAvatar(email);
  const avatar = (knitplot as Record<string, unknown>).avatar;
  if (!avatar || typeof avatar !== "object") return defaultAccountAvatar(email);
  const kind = (avatar as Record<string, unknown>).kind;
  const value = (avatar as Record<string, unknown>).value;
  const rawColor = (avatar as Record<string, unknown>).color;
  const color: AccountColor = typeof rawColor === "string" && rawColor in ACCOUNT_COLORS ? rawColor as AccountColor : "green";
  if (kind === "symbol" && typeof value === "string" && value in ACCOUNT_SYMBOLS) {
    return { kind, value: value as AccountSymbol, color };
  }
  if (kind === "initials" && typeof value === "string" && /^[\p{L}\p{N}]{1,2}$/u.test(value)) {
    return { kind, value: value.toLocaleUpperCase(), color };
  }
  return defaultAccountAvatar(email);
}

export function parsePinnedChartIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const knitplot = (metadata as Record<string, unknown>).knitplot;
  if (!knitplot || typeof knitplot !== "object") return [];
  const ids = (knitplot as Record<string, unknown>).pinnedChartIds;
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length <= 100))].slice(0, 100);
}
