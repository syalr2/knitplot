import { ImageResponse } from "next/og";
import { CLUB_SHARE_IMAGE_SIZE } from "./club-share-link";

type Artwork = { png: Buffer; width: number; height: number };

export function renderClubShareCard(
  title: string,
  handle: string,
  artwork?: Artwork,
) {
  const letters = Array.from(title);
  const shortTitle =
    letters.length > 65 ? `${letters.slice(0, 64).join("")}…` : title;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        padding: "42px 64px",
        background: "#f8f6ef",
        color: "#272a24",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          height: 438,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {artwork ? (
          // Satori needs a plain image to place the pre-rendered PNG.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/png;base64,${artwork.png.toString("base64")}`}
            width={artwork.width}
            height={artwork.height}
            alt=""
          />
        ) : (
          <div style={{ fontSize: 40, color: "#526357" }}>Chart Club</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 36, fontWeight: 700, lineClamp: 1 }}>
          {shortTitle}
        </div>
        <div style={{ fontSize: 24, color: "#526357" }}>
          {`By @${handle} · KnitPlot Chart Club`}
        </div>
      </div>
    </div>,
    { ...CLUB_SHARE_IMAGE_SIZE, headers: { "Cache-Control": "no-store" } },
  );
}
