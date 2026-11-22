"use client";

import { Analytics } from "@vercel/analytics/next";
import { sharedChartPath } from "@/lib/chart-links";

export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = new URL(event.url, window.location.origin);
        // An unlisted link is a credential, not an analytics dimension.
        if (
          url.pathname.replace(/\/$/, "") === sharedChartPath ||
          url.pathname.startsWith("/chart-links/")
        )
          return null;
        url.hash = "";
        return { ...event, url: url.href };
      }}
    />
  );
}
