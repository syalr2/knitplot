import {
  isChartLinkSlug,
  isChartLinkToken,
  isDraftChartLinkToken,
  isShortChartLinkToken,
} from "./chart-links";
import { isRecord } from "./http";

const prefix = "knitplot-guest-link-v2:";
const legacyPrefix = "knitplot-draft-link-v1:";

export type GuestLinkReceipt = {
  revokeToken: string;
  title: string;
  token?: string;
  slug?: string;
  tabId?: string;
};

export function readGuestLinkReceipt(value: unknown): GuestLinkReceipt | null {
  if (!isRecord(value) || !isChartLinkToken(value.revokeToken)) return null;
  const { revokeToken, token, slug, title, tabId } = value;
  if (token !== undefined && !isDraftChartLinkToken(token)) return null;
  if (isShortChartLinkToken(token) && !isChartLinkSlug(slug)) return null;
  return {
    revokeToken,
    title:
      typeof title === "string" && title.trim()
        ? title.trim().slice(0, 200)
        : isChartLinkSlug(slug)
          ? slug.replaceAll("-", " ")
          : "Untitled chart",
    ...(token && { token }),
    ...(isChartLinkSlug(slug) && { slug }),
    ...(typeof tabId === "string" && { tabId }),
  };
}

type ReceiptStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "length" | "key"
>;

function legacyEntries(storage: ReceiptStorage) {
  const entries: [string, GuestLinkReceipt][] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(legacyPrefix)) continue;
    try {
      const receipt = readGuestLinkReceipt(
        JSON.parse(storage.getItem(key) ?? "null"),
      );
      if (receipt?.token)
        entries.push([
          key,
          { ...receipt, tabId: key.slice(legacyPrefix.length) },
        ]);
    } catch {
      // Unrelated or corrupted local entries must not hide valid receipts.
    }
  }
  return entries;
}

export function listGuestLinkReceipts(storage: ReceiptStorage) {
  const receipts = new Map(
    legacyEntries(storage).map(([, r]) => [r.revokeToken, r]),
  );
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const receipt = readGuestLinkReceipt(
        JSON.parse(storage.getItem(key) ?? "null"),
      );
      if (receipt) receipts.set(receipt.revokeToken, receipt);
    } catch {
      // The other receipts are still usable.
    }
  }
  return [...receipts.values()];
}

export function saveGuestLinkReceipt(
  storage: ReceiptStorage,
  receipt: GuestLinkReceipt,
) {
  storage.setItem(prefix + receipt.revokeToken, JSON.stringify(receipt));
}

export function removeGuestLinkReceipt(
  storage: ReceiptStorage,
  revokeToken: string,
) {
  for (const [key, receipt] of legacyEntries(storage)) {
    if (receipt.revokeToken === revokeToken) storage.removeItem(key);
  }
  storage.removeItem(prefix + revokeToken);
}

export function newGuestLinkKey() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
