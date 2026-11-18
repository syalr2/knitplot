import { track } from "@vercel/analytics";

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

export function recordUsage(context: UsageContext, format?: DownloadFormat) {
  if (
    process.env.NODE_ENV !== "production" ||
    typeof window === "undefined" ||
    !["knitplot.art", "www.knitplot.art"].includes(window.location.hostname) ||
    navigator.doNotTrack === "1"
  )
    return;
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
