"use client";

import { Analytics } from "@vercel/analytics/next";
import { sanitizeAnalyticsEvent } from "@/lib/usage-analytics";

export function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) =>
        sanitizeAnalyticsEvent(event, window.location.origin)
      }
    />
  );
}
