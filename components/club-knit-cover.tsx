"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChartDocument } from "@/lib/chart";
import { readClubCover } from "@/lib/club-cover";
import { ClubCoverFabric } from "./club-cover-fabric";

export function ClubKnitCover({
  id,
  view,
  cover,
  children,
}: {
  id: string;
  view?: string;
  cover?: unknown;
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<ChartDocument | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void fetch(`/api/chart-club/copy?id=${encodeURIComponent(id)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return;
          const file: unknown = await response.json();
          const { readProject } = await import("@/lib/project-file");
          if (!controller.signal.aborted) setDocument(readProject(file));
        })
        .catch(() => {
          /* Keep the chart thumbnail as a fallback. */
        });
    });
    if (frame.current) observer.observe(frame.current);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [id]);
  return (
    <div className="club-cover" ref={frame}>
      <div className="club-cover-fallback">{children}</div>
      {document && (
        <div className="club-cover-knit">
          <ClubCoverFabric
            document={document}
            cover={readClubCover(document, cover, view)}
          />
        </div>
      )}
    </div>
  );
}
