import { track, type BeforeSendEvent } from "@vercel/analytics";
import { sharedChartPath } from "./chart-links";

type UsageContext = {
  account: "guest" | "signed_in";
  chart_type: "regular" | "yoke";
};
export type DownloadFormat =
  | "knitplot"
  | "chart_grid"
  | "chart_no_grid"
  | "stitch_bitmap"
  | "knitted_preview";

const edited = new Set<string>();
const analyticsHosts = new Set(["knitplot.art", "www.knitplot.art"]);
const SHARED_VISIT_KEY = "knitplot-shared-visit-v1";
let sharedVisitRecorded = false;

function canTrack() {
  return !(
    process.env.NODE_ENV !== "production" ||
    typeof window === "undefined" ||
    !analyticsHosts.has(window.location.hostname) ||
    navigator.doNotTrack === "1"
  );
}

export function recordUsage(context: UsageContext, format?: DownloadFormat) {
  if (!canTrack()) return;
  const key = `${context.account}:${context.chart_type}`;
  if (!format && edited.has(key)) return;
  try {
    track(format ? "File downloaded" : "Chart edited", {
      account: context.account,
      chart_type: context.chart_type,
      ...(format ? { format } : {}),
    });
    if (!format) edited.add(key);
  } catch {
    // Analytics must never prevent drawing or downloading a user's work.
  }
}

export type ChartClubEntry = "shared_link" | "chart_club";
export type SharePreviewView =
  "swatch" | "whole" | "front" | "back" | "repeat" | "sweater";

type ShareEvent =
  | {
      name: "Chart link copied";
      placement: "post" | "after_publish" | "editor";
    }
  | { name: "Shared chart visited" }
  | {
      name: "Chart Club copy opened" | "Chart Club copy edited";
      entry: ChartClubEntry;
    }
  | { name: "Share image downloaded"; view: SharePreviewView; credit: boolean };

export function recordShareEvent({ name, ...details }: ShareEvent) {
  if (!canTrack()) return;
  try {
    track(name, details);
  } catch {
    // Analytics must not get in the way of copying, editing, or downloading.
  }
}

export function recordSharedChartVisit(referrer: string) {
  if (!canTrack() || sharedVisitRecorded) return;
  if (referrer) {
    try {
      if (analyticsHosts.has(new URL(referrer).hostname)) return;
    } catch {
      return;
    }
  }
  // Store only a flag, so refreshing the same tab doesn't count as another
  // arrival. If storage is blocked, still count once per document.
  sharedVisitRecorded = true;
  try {
    if (window.sessionStorage.getItem(SHARED_VISIT_KEY)) return;
    window.sessionStorage.setItem(SHARED_VISIT_KEY, "1");
  } catch {
    // Analytics must not depend on browser storage being available.
  }
  recordShareEvent({ name: "Shared chart visited" });
}

export function sanitizeAnalyticsEvent(event: BeforeSendEvent, origin: string) {
  const url = new URL(event.url, origin);
  if (url.pathname.startsWith("/chart-links/")) return null;
  if (url.pathname.replace(/\/$/, "") === sharedChartPath) {
    // Skip automatic pageviews (including broken links). Custom events only
    // carry the canonical path, never the fragment or the query string.
    if (event.type !== "event") return null;
    return { ...event, url: new URL(sharedChartPath, origin).href };
  }
  url.hash = "";
  return { ...event, url: url.href };
}

const COPY_ACTIVITY_KEY = "knitplot-club-copy-activity-v1";
const COPY_ACTIVITY_TTL = 30 * 60 * 1000;

export function recordClubCopyOpened(tabId: string, entry: ChartClubEntry) {
  if (!canTrack()) return;
  recordShareEvent({ name: "Chart Club copy opened", entry });
  try {
    window.sessionStorage.setItem(
      COPY_ACTIVITY_KEY,
      JSON.stringify({ tabId, entry, until: Date.now() + COPY_ACTIVITY_TTL }),
    );
  } catch {
    // The editable copy still works if session storage is unavailable.
  }
}

export function recordClubCopyEdited(tabId: string) {
  if (!canTrack()) return;
  try {
    const raw = window.sessionStorage.getItem(COPY_ACTIVITY_KEY);
    if (!raw) return;
    const marker = JSON.parse(raw);
    if (Date.now() >= marker.until) {
      window.sessionStorage.removeItem(COPY_ACTIVITY_KEY);
      return;
    }
    if (marker.tabId !== tabId) return;
    window.sessionStorage.removeItem(COPY_ACTIVITY_KEY);
    if (marker.entry === "shared_link" || marker.entry === "chart_club")
      recordShareEvent({ name: "Chart Club copy edited", entry: marker.entry });
  } catch {
    // An unreadable marker must not interfere with a chart edit.
  }
}
