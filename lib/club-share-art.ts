import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { ChartDocument } from "./chart";
import type { ClubCoverSettings } from "./club-cover";
import { expandPreviewDocument } from "./connected-preview";
import { fitImage } from "./image-fit";
import { layoutPreviewRows } from "./knit-preview-layout";
import { yokeFabric } from "./yoke-fabric-preview";
import { fitsSweaterPhoto, renderSweaterPhoto } from "./yoke-photo-preview";

const maxWidth = 1072;
const maxHeight = 438;
const fabricBackground = "#f8f6ef";
const maxChartCoverCells = 120_000;

type Stitch = {
  x: number;
  y: number;
  width: number;
  height: number;
  hex: string;
  angle?: number;
};
type Fabric = { width: number; height: number; stitches: Iterable<Stitch> };

function chartCover(
  document: ChartDocument,
  cover: Extract<ClubCoverSettings, { kind: "chart" }>,
): Fabric {
  const mirror = cover.style === "mirrored";
  const cells = document.width * document.height;
  // Keep the entire design. Drop duplicate tiles rather than crop a large
  // chart or build hundreds of thousands of SVG elements for a small image.
  const across = Math.min(
    cover.across,
    Math.max(1, Math.floor(maxChartCoverCells / cells)),
  );
  const down = Math.min(
    cover.down,
    Math.max(1, Math.floor(maxChartCoverCells / (cells * across))),
  );
  const expanded = expandPreviewDocument(document, across, mirror);
  const rows = layoutPreviewRows(expanded);
  const width = Math.max(1, ...rows.map((row) => row.width));
  const pitch = document.gaugeStitches / document.gaugeRows;
  const tileHeight = rows.length * pitch;
  const palette = new Map(document.palette.map(({ id, hex }) => [id, hex]));

  function* stitches(): Generator<Stitch> {
    for (let tile = 0; tile < down; tile++) {
      for (const [index, row] of rows.entries()) {
        const displayRow = mirror && tile % 2 ? rows.length - 1 - index : index;
        for (const loop of row.loops) {
          yield {
            x: loop.x + (width - row.width) / 2 + 0.5,
            y: (displayRow + 0.5) * pitch + tile * tileHeight,
            width: 1,
            height: pitch,
            hex:
              palette.get(expanded.cells[index][loop.column]) ??
              document.palette[0].hex,
          };
        }
      }
    }
  }

  return { width, height: down * tileHeight, stitches: stitches() };
}

function yokeCover(
  document: ChartDocument,
  view: "whole" | "front" | "back" | "repeat",
  repeat: number,
): Fabric {
  const count =
    document.yoke?.cells.reduce((total, row) => total + row.length, 0) ?? 0;
  const fabric = yokeFabric(document, view, repeat, count <= 14_000);
  const pitch = document.gaugeStitches / document.gaugeRows;
  function* stitches(): Generator<Stitch> {
    for (const row of fabric.rows) {
      for (const loop of row) {
        if (!loop.yarn) continue;
        yield {
          // Same rotation as the browser preview: neckline at the top.
          x: fabric.width - (loop.x - fabric.minX),
          y: fabric.height - (loop.y - fabric.minY),
          width: loop.span,
          height: pitch * (loop.heightScale ?? 1),
          hex: loop.yarn,
          angle: (loop.angle * 180) / Math.PI + 180,
        };
      }
    }
  }
  return { width: fabric.width, height: fabric.height, stitches: stitches() };
}

async function rasterizeFabric({ width, height, stitches }: Fabric) {
  const frame = fitImage(width, height, maxWidth, maxHeight);
  // Transform once into pixel space so even an extreme aspect ratio fills only
  // its fitted box. The SVG contains numeric geometry and schema-checked hexes.
  const sx = frame.width / width;
  const sy = frame.height / height;
  const detail = Math.min(sx, sy) >= 2;
  const rounded = (n: number) => Math.round(n * 100) / 100;
  const artwork: string[] = [];
  for (const { x, y, width: w, height: h, hex, angle = 0 } of stitches) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) continue;
    artwork.push(
      `<use href="#${detail ? "knit" : "plain"}" transform="translate(${rounded(x)} ${rounded(y)}) rotate(${rounded(angle)}) scale(${rounded(w)} ${rounded(h)})" fill="${hex}"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">
    <defs>
      <rect id="plain" x="-.55" y="-.58" width="1.1" height="1.16"/>
      <g id="knit">
        <rect x="-.54" y="-.55" width="1.08" height="1.1" rx=".12"/>
        <path d="M-.47-.49 L.46-.49 .43.5 -.43.5Z" fill="#000" opacity=".12"/>
        <path d="M-.43-.6 Q-.35-.19 0 .57 Q.34-.24 .41-.6" fill="none" stroke="#fff" stroke-width=".23" opacity=".26"/>
        <path d="M-.35-.61 Q-.24-.22 0 .46 Q.26-.22 .33-.61" fill="none" stroke="#fff" stroke-width=".075" opacity=".24"/>
      </g>
    </defs>
    <g transform="scale(${sx} ${sy})">${artwork.join("")}</g>
  </svg>`;
  const png = await sharp(Buffer.from(svg))
    .flatten({ background: fabricBackground })
    .png()
    .toBuffer();
  return { png, ...frame };
}

async function sweaterCover(document: ChartDocument) {
  const [asset, texture] = await Promise.all([
    readFile(
      join(process.cwd(), "public/images/yoke/photo-sweater-front.webp"),
    ),
    readFile(join(process.cwd(), "public/textures/merino-relief.png")),
  ]);
  const sweater = sharp(asset).resize({ height: maxHeight }).ensureAlpha();
  const [photo, lighting, relief] = await Promise.all([
    sweater.clone().raw().toBuffer({ resolveWithObject: true }),
    sweater.clone().blur(4).raw().toBuffer(),
    sharp(texture).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const data = new Uint8ClampedArray(photo.data);
  renderSweaterPhoto(
    { data, width: photo.info.width, height: photo.info.height },
    new Uint8ClampedArray(lighting),
    {
      data: new Uint8ClampedArray(relief.data),
      width: relief.info.width,
      height: relief.info.height,
    },
    document,
  );
  const png = await sharp(Buffer.from(data.buffer), {
    raw: { width: photo.info.width, height: photo.info.height, channels: 4 },
  })
    .flatten({ background: fabricBackground })
    .png()
    .toBuffer();
  return { png, width: photo.info.width, height: photo.info.height };
}

/** Only rasterize the public snapshot. No upload, browser JS, or remote URL. */
export async function renderClubShareArt(
  document: ChartDocument,
  cover: ClubCoverSettings,
) {
  if (cover.kind === "chart")
    return rasterizeFabric(chartCover(document, cover));
  if (cover.view === "sweater" && fitsSweaterPhoto(document))
    return sweaterCover(document);
  return rasterizeFabric(
    yokeCover(
      document,
      cover.view === "sweater" ? "whole" : cover.view,
      cover.repeat,
    ),
  );
}
