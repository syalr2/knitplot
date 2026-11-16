"use client";

import dynamic from "next/dynamic";
import type { ChartDocument } from "@/lib/chart";
import type { ClubCoverSettings } from "@/lib/club-cover";
import {
  fitsSweaterPhoto,
  SWEATER_PREVIEW_TOO_DEEP,
} from "@/lib/yoke-photo-preview";

const ConnectedPreview = dynamic(
  () => import("./connected-knit-preview").then((m) => m.ConnectedKnitPreview),
  { ssr: false },
);
const Sweater = dynamic(
  () => import("./yoke-photo-sample").then((m) => m.YokePhotoSample),
  { ssr: false },
);

export function ClubCoverFabric({
  document,
  cover,
}: {
  document: ChartDocument;
  cover: ClubCoverSettings;
}) {
  if (cover.kind === "yoke" && cover.view === "sweater") {
    return fitsSweaterPhoto(document) ? (
      <Sweater document={document} />
    ) : (
      <p role="status">{SWEATER_PREVIEW_TOO_DEEP}</p>
    );
  }
  return (
    <ConnectedPreview
      document={document}
      showDiagnostics={false}
      repeatX={cover.kind === "chart" ? cover.across : 1}
      repeatY={cover.kind === "chart" ? cover.down : 1}
      repeatStyle={cover.kind === "chart" ? cover.style : undefined}
      yokeView={
        cover.kind === "yoke" && cover.view !== "sweater"
          ? cover.view
          : undefined
      }
      yokeRepeat={
        cover.kind === "yoke" && cover.view === "repeat"
          ? cover.repeat
          : undefined
      }
    />
  );
}
