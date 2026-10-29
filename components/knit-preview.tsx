"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { ChartDocument, StitchAction, stitchActionAt } from "@/lib/chart";
import { fabricSurface, layoutFabric } from "@/lib/knit-preview-layout";
import { paintPhotographicPurl } from "@/components/photographic-purl";

type Props = {
  document: ChartDocument;
  repeatX: number;
  repeatY: number;
  repeatStyle: "normal" | "mirrored";
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  /** Internal comparison harness only; not an editor preference. */
  initialPose?: "automatic" | "straight";
};

type ReliefSource = {
  sheet: HTMLCanvasElement;
  cellWidth: number;
  cellHeight: number;
  cellsPerSide: number;
};

type StitchSprite = {
  canvas: HTMLCanvasElement;
  margin: number;
  width: number;
  height: number;
};

const RELIEF_CELL_WIDTH = 92;
const RELIEF_CELL_HEIGHT = 73.5;
const RELIEF_CELLS_PER_SIDE = 4;
const TEXTURE_DEPTH = 1.45;
const MAX_BACKING_SIZE = 3600;

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export function makeReliefSource(image: HTMLImageElement): ReliefSource {
  const sheet = window.document.createElement("canvas");
  const tileWidth = RELIEF_CELL_WIDTH * RELIEF_CELLS_PER_SIDE;
  const tileHeight = RELIEF_CELL_HEIGHT * RELIEF_CELLS_PER_SIDE;
  sheet.width = Math.round(tileWidth * 3);
  sheet.height = Math.round(tileHeight * 3);
  const context = sheet.getContext("2d");

  if (!context) throw new Error("Canvas is unavailable");

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      context.drawImage(
        image,
        column * tileWidth,
        row * tileHeight,
        tileWidth,
        tileHeight,
      );
    }
  }

  return {
    sheet,
    cellWidth: RELIEF_CELL_WIDTH,
    cellHeight: RELIEF_CELL_HEIGHT,
    cellsPerSide: RELIEF_CELLS_PER_SIDE,
  };
}

function makeStitchMask(
  width: number,
  height: number,
  margin: number,
  cache: Map<string, HTMLCanvasElement>,
  action: StitchAction,
  sources: number[],
) {
  const key = `${width}|${height}|${margin}|${action}|${sources.join(",")}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = window.document.createElement("canvas");
  canvas.width = Math.round(width + margin * 2);
  canvas.height = Math.round(height + margin * 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.translate(margin, margin);
  context.filter = "blur(0.7px)";
  context.strokeStyle = "#ffffff";
  context.lineCap = "round";
  context.lineWidth = width * 0.56;

  const lean =
    action === "ssk" || action === "m1l"
      ? -0.24
      : action === "k2tog" || action === "m1r"
        ? 0.24
        : 0;
  // Follow the parent's loop head, not a thin line to its centre. The two
  // legs overlap their neighbours as the fabric widens/narrows.
  const increase = action === "m1l" || action === "m1r";
  const decrease =
    action === "ssk" ||
    action === "k2tog" ||
    action === "cdd" ||
    action === "dec";
  const foot = sources.length === 1 ? sources[0] : 0;
  context.lineWidth = width * 0.35;
  for (const offset of decrease ? sources : []) {
    context.beginPath();
    context.moveTo(width * (0.5 + offset), height * 1.12);
    context.bezierCurveTo(
      width * (0.5 + offset),
      height * 0.8,
      width * (0.5 + lean),
      height * 0.5,
      width * (0.5 + lean),
      height * 0.05,
    );
    context.stroke();
  }
  if ((action === "ssk" || action === "k2tog") && sources.length === 2) {
    const left = Math.min(...sources),
      right = Math.max(...sources);
    const inset = Math.min(0.18, (right - left) * 0.25);
    context.lineWidth = width * 0.42;
    context.beginPath();
    context.moveTo(width * (0.5 + left + inset), height * 1.05);
    context.quadraticCurveTo(
      width * (0.5 + (left + right) / 2),
      height * 1.17,
      width * (0.5 + right - inset),
      height * 1.05,
    );
    context.stroke();
  }
  if (action === "purl") {
    // Full supporting loops reach behind the row above; the horizontal bump
    // sits across them. Purl always means front-facing texture here.
    context.lineWidth = width * 0.56;
    for (const side of [0.05, 0.95]) {
      context.beginPath();
      context.moveTo(width * side, -height * 0.08);
      context.quadraticCurveTo(
        width * side,
        height * 0.55,
        width * (0.5 + foot),
        height * 1.02,
      );
      context.stroke();
    }
    context.lineWidth = width * 0.46;
    context.beginPath();
    context.moveTo(width * 0.08, height * 0.65);
    context.bezierCurveTo(
      width * 0.15,
      height * 0.4,
      width * 0.85,
      height * 0.4,
      width * 0.92,
      height * 0.65,
    );
    context.bezierCurveTo(
      width * 0.85,
      height * 0.88,
      width * 0.15,
      height * 0.88,
      width * 0.08,
      height * 0.65,
    );
    context.stroke();
  } else {
    context.lineWidth = width * (increase ? 0.5 : 0.56);
    for (const side of [0.05, 0.95]) {
      const leg = increase && side > 0.5 ? 0.87 : side;
      context.beginPath();
      context.moveTo(width * leg, -height * 0.06);
      context.bezierCurveTo(
        width * leg,
        height * 0.38,
        width * (0.5 + foot * 0.8),
        height * 0.75,
        width * (0.5 + foot),
        height * 1.02,
      );
      context.stroke();
    }
    if (increase) {
      context.lineWidth = width * 0.32;
      context.beginPath();
      const left = sources.length ? Math.min(...sources) : -0.5;
      const right = sources.length ? Math.max(...sources) : 0.5;
      // The lifted bar meets the inner legs of its neighbours. Extending a
      // thick arch to their centres paints over those loops and creates a
      // broad, tangled-looking colour join.
      const inset = Math.min(0.18, Math.max(0, (right - left) * 0.25));
      context.moveTo(width * (0.5 + left + inset), height * 0.99);
      context.quadraticCurveTo(
        width * (0.5 - lean * 0.6),
        height * 0.75,
        width * (0.5 + right - inset),
        height * 0.99,
      );
      context.stroke();
    }
  }

  if (cache.size >= 512) cache.delete(cache.keys().next().value!);
  cache.set(key, canvas);
  return canvas;
}

export function makeStitchSprite(
  source: ReliefSource,
  hex: string,
  tileColumn: number,
  tileRow: number,
  width: number,
  height: number,
  spriteCache: Map<string, StitchSprite>,
  maskCache: Map<string, HTMLCanvasElement>,
  action: StitchAction,
  sources: number[],
  backingHex?: string,
): StitchSprite {
  const roundedHeight = Math.max(1, Math.round(height));
  const key = `${hex}|${tileColumn}|${tileRow}|${width}|${roundedHeight}|${action}|${sources.join(",")}|${backingHex ?? hex}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  if (action === "m1r" || action === "k2tog") {
    // Mirror the complete M1L sprite, including photo fibres, mask, crossing
    // and shading. Rotating an asymmetric photo in the opposite direction
    // does not produce the matching right-leaning stitch.
    const left = makeStitchSprite(
      source,
      hex,
      tileColumn,
      tileRow,
      width,
      height,
      spriteCache,
      maskCache,
      action === "m1r" ? "m1l" : "ssk",
      sources.map((x) => -x).reverse(),
    );
    const canvas = window.document.createElement("canvas");
    canvas.width = left.width;
    canvas.height = left.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(left.canvas, 0, 0);
    const sprite = { ...left, canvas };
    if (spriteCache.size >= 512)
      spriteCache.delete(spriteCache.keys().next().value!);
    spriteCache.set(key, sprite);
    return sprite;
  }

  const margin = Math.ceil(
    Math.max(
      width * 0.6,
      roundedHeight * 0.5,
      ...sources.map((x) => Math.abs(x) * width),
    ),
  );
  const canvasWidth = Math.round(width + margin * 2);
  const canvasHeight = Math.round(roundedHeight + margin * 2);
  const sourceMarginX = margin * (source.cellWidth / width);
  const sourceMarginY = margin * (source.cellHeight / roundedHeight);
  const canvas = window.document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");

  if (action === "purl") {
    // Keep the recessed loop head where it joins the row above. Its knit V
    // must not remain visible through the foreground purl bump.
    const backing = makeStitchSprite(
      source,
      backingHex ?? hex,
      tileColumn,
      tileRow,
      width,
      height,
      spriteCache,
      maskCache,
      "knit",
      sources,
    );
    context.save();
    context.beginPath();
    context.rect(0, 0, canvasWidth, margin + roundedHeight * 0.45);
    context.rect(0, margin + roundedHeight * 0.88, canvasWidth, canvasHeight);
    context.clip();
    context.drawImage(
      backing.canvas,
      margin - backing.margin,
      margin - backing.margin,
    );
    context.restore();
    paintPhotographicPurl(
      context,
      source,
      hex,
      tileColumn,
      tileRow,
      width,
      roundedHeight,
      margin,
      sources.length === 1 ? sources[0] : 0,
    );
    const sprite = { canvas, margin, width: canvasWidth, height: canvasHeight };
    if (spriteCache.size >= 512)
      spriteCache.delete(spriteCache.keys().next().value!);
    spriteCache.set(key, sprite);
    return sprite;
  }

  const textureRotation = action === "ssk" || action === "m1l" ? -0.22 : 0;
  context.save();
  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate(textureRotation);
  context.drawImage(
    source.sheet,
    source.cellWidth * source.cellsPerSide +
      tileColumn * source.cellWidth -
      sourceMarginX,
    source.cellHeight * source.cellsPerSide +
      tileRow * source.cellHeight -
      sourceMarginY,
    source.cellWidth + sourceMarginX * 2,
    source.cellHeight + sourceMarginY * 2,
    -canvasWidth / 2,
    -canvasHeight / 2,
    canvasWidth,
    canvasHeight,
  );
  context.restore();

  const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
  const pixels = imageData.data;
  const [red, green, blue] = hexToRgb(hex);

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const relief = pixels[offset] / 128;
    // A compressed decrease must not turn its strongest photographed fibre
    // highlight into paper-white: that reads as a hole despite full coverage.
    const shade =
      action === "ssk"
        ? Math.min(1.04, Math.pow(relief, TEXTURE_DEPTH))
        : Math.pow(relief, TEXTURE_DEPTH);
    const sheen =
      action === "ssk"
        ? Math.min(12, Math.max(0, relief - 0.97) * 160)
        : Math.max(0, relief - 0.97) * 400;
    pixels[offset] = red * shade + sheen;
    pixels[offset + 1] = green * shade + sheen;
    pixels[offset + 2] = blue * shade + sheen;
    pixels[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(
    makeStitchMask(width, roundedHeight, margin, maskCache, action, sources),
    0,
    0,
  );

  // A small shadow/highlight pair makes the overlying strand legible without
  // replacing the photographic yarn relief or outlining chart symbols.
  if (["m1l", "m1r", "ssk", "k2tog", "purl"].includes(action)) {
    context.globalCompositeOperation = "source-atop";
    context.translate(margin, margin);
    context.lineCap = "round";
    const leftLean = action === "m1l" || action === "ssk";
    const trace = (shift: number) => {
      context.beginPath();
      {
        const increase = action === "m1l";
        context.moveTo(
          width * (leftLean ? 0.18 : 0.82),
          roundedHeight * (0.08 + shift),
        );
        context.bezierCurveTo(
          width * (leftLean ? 0.22 : 0.78),
          roundedHeight * 0.5,
          width * (leftLean ? 0.62 : 0.38),
          roundedHeight * 0.75,
          width * (increase ? 0.66 : leftLean ? 0.82 : 0.18),
          roundedHeight * ((increase ? 0.94 : 1.02) + shift),
        );
      }
      context.stroke();
    };
    context.strokeStyle = "rgba(35, 22, 12, 0.24)";
    context.lineWidth = width * (action === "m1l" ? 0.08 : 0.12);
    trace(0.05);
    context.strokeStyle = "rgba(255, 248, 230, 0.16)";
    context.lineWidth = width * 0.07;
    trace(-0.04);
  }

  const sprite = { canvas, margin, width: canvasWidth, height: canvasHeight };
  if (spriteCache.size >= 512)
    spriteCache.delete(spriteCache.keys().next().value!);
  spriteCache.set(key, sprite);
  return sprite;
}

function drawPreview(
  canvas: HTMLCanvasElement,
  source: ReliefSource,
  document: ChartDocument,
  repeatX: number,
  repeatY: number,
  repeatStyle: "normal" | "mirrored",
  spriteCache: Map<string, StitchSprite>,
  maskCache: Map<string, HTMLCanvasElement>,
  initialPose: "automatic" | "straight" = "automatic",
) {
  const totalRows = document.height * repeatY;
  const { rows: layoutRows, pitch } = layoutFabric(
    document,
    repeatX,
    repeatStyle === "mirrored",
  );
  const surface = fabricSurface(document, layoutRows, pitch, initialPose);
  const totalColumns = pitch;
  const stitchWidth = Math.max(
    12,
    Math.min(30, Math.floor(1100 / totalColumns)),
  );
  const stitchHeight =
    stitchWidth * (document.gaugeStitches / document.gaugeRows);
  const bleed = Math.ceil(Math.max(stitchWidth, stitchHeight));
  const logicalWidth = Math.ceil(surface.width * stitchWidth + bleed * 2);
  const logicalHeight = Math.ceil(
    surface.height * stitchWidth * repeatY + bleed * 2,
  );
  const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  const renderScale = Math.min(
    deviceScale,
    MAX_BACKING_SIZE / logicalWidth,
    MAX_BACKING_SIZE / logicalHeight,
  );
  const cssWidth = Math.min(logicalWidth, 1400);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${logicalWidth} / ${logicalHeight}`;
  canvas.width = Math.max(1, Math.round(logicalWidth * renderScale));
  canvas.height = Math.max(1, Math.round(logicalHeight * renderScale));

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, logicalWidth, logicalHeight);

  const palette = new Map(
    document.palette.map((color) => [color.id, color.hex]),
  );

  // Upper rows are drawn last so their stitch heads overlap the row below.
  for (let row = totalRows - 1; row >= 0; row -= 1) {
    const repeatRow = Math.floor(row / document.height);
    const rowWithinRepeat = row % document.height;
    const chartRow =
      repeatStyle === "mirrored" && repeatRow % 2 === 1
        ? document.height - 1 - rowWithinRepeat
        : rowWithinRepeat;
    const workedColourColumns = Array.from(
      { length: document.width },
      (_, column) => column,
    ).filter((column) =>
      ["knit", "purl"].includes(stitchActionAt(document, chartRow, column)),
    );
    const layout = layoutRows[chartRow];
    for (const loop of layout.loops) {
      const repeatColumn = Math.floor(loop.column / document.width);
      const mirrorColumn = repeatStyle === "mirrored" && repeatColumn % 2 === 1;
      const center = loop.center;
      const placement = surface.point(
        chartRow,
        surface.curved ? loop.x + 0.5 : center,
      );
      const verticalMirror = repeatStyle === "mirrored" && repeatRow % 2 === 1;
      const angle = verticalMirror ? -placement.angle : placement.angle;
      const localColumn = loop.column % document.width;
      const chartColumn = mirrorColumn
        ? document.width - 1 - localColumn
        : localColumn;
      const action: StitchAction = stitchActionAt(
        document,
        chartRow,
        chartColumn,
      );
      if (action === "no-stitch") continue;
      const nearestColourColumn =
        action === "knit" || action === "purl"
          ? chartColumn
          : workedColourColumns.sort(
              (left, right) =>
                Math.abs(left - chartColumn) - Math.abs(right - chartColumn),
            )[0];
      // Shaping symbols are colour-neutral chart instructions. The fabric preview
      // borrows the closest worked stitch's yarn solely to render the resulting loop.
      const colorId =
        document.cells[chartRow]?.[nearestColourColumn ?? chartColumn];
      const hex = palette.get(colorId) ?? document.palette[0]?.hex ?? "#ffffff";
      const actionScale =
        action === "cast-on" ? 0.86 : action === "bind-off" ? 1.08 : 1;
      const actionHeightScale =
        action === "cast-on" ? 0.72 : action === "bind-off" ? 0.5 : 1;
      const verticalOffset =
        action === "cast-on"
          ? stitchHeight * 0.28
          : action === "bind-off"
            ? stitchHeight * 0.08
            : 0;
      const span = surface.curved ? placement.scale : loop.span;
      const renderedWidth =
        Math.round(stitchWidth * span * actionScale * 4) / 4;
      const renderedHeight = stitchHeight * actionHeightScale;
      const visualAction = mirrorColumn
        ? action === "m1l"
          ? "m1r"
          : action === "m1r"
            ? "m1l"
            : action === "ssk"
              ? "k2tog"
              : action === "k2tog"
                ? "ssk"
                : action
        : action;
      const below = layoutRows[chartRow + 1];
      // Vertical mirrored tiles are a decorative reflection, not another
      // knitted row sequence; omit lineage there rather than reverse it.
      const sources =
        below && !verticalMirror
          ? (surface.curved ? (loop.sources ?? []) : loop.parentCenters)
              .map((parent) => {
                if (surface.curved) {
                  const p = surface.point(chartRow + 1, parent + 0.5);
                  const dx = p.x - placement.x,
                    dy = p.y - placement.y;
                  return (
                    Math.round(
                      ((dx * Math.cos(angle) + dy * Math.sin(angle)) /
                        (span * actionScale)) *
                        8,
                    ) / 8
                  );
                }
                return (
                  Math.round(((parent - center) / (span * actionScale)) * 8) / 8
                );
              })
              .filter(
                (offset) =>
                  Math.abs(offset) <= 2 && (action !== "knit" || offset !== 0),
              )
          : [];
      const sprite = makeStitchSprite(
        source,
        hex,
        (loop.column + repeatColumn * document.width + row * 2) %
          source.cellsPerSide,
        row % source.cellsPerSide,
        renderedWidth,
        renderedHeight,
        spriteCache,
        maskCache,
        visualAction,
        sources,
      );
      const x = bleed + (placement.x - surface.minX) * stitchWidth;
      const localY = placement.y - surface.minY;
      const y =
        bleed +
        (repeatRow * surface.height +
          (verticalMirror ? surface.height - localY : localY)) *
          stitchWidth;
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.drawImage(
        sprite.canvas,
        -renderedWidth / 2 - sprite.margin,
        -stitchHeight / 2 + verticalOffset - sprite.margin,
        sprite.width,
        sprite.height,
      );
      context.restore();
    }
  }
}

export function KnitPreview({
  document,
  repeatX,
  repeatY,
  repeatStyle,
  canvasRef: providedCanvasRef,
  initialPose = "automatic",
}: Props) {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = providedCanvasRef ?? internalCanvasRef;
  const sourceRef = useRef<ReliefSource | null>(null);
  const spriteCacheRef = useRef(new Map<string, StitchSprite>());
  const maskCacheRef = useRef(new Map<string, HTMLCanvasElement>());
  const [sourceReady, setSourceReady] = useState(false);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      sourceRef.current = makeReliefSource(image);
      setSourceReady(true);
    };
    image.src = "/textures/merino-relief.png";
    return () => {
      image.onload = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source || !sourceReady) return;

    // Caches are useful within a render, but retained canvas surfaces from a
    // different chart/pose need not survive into the next render. In
    // particular, switching large comparison charts must rebuild both the
    // relief sprites and their alpha masks together.
    spriteCacheRef.current.clear();
    maskCacheRef.current.clear();
    const frame = window.requestAnimationFrame(() => {
      drawPreview(
        canvas,
        source,
        document,
        repeatX,
        repeatY,
        repeatStyle,
        spriteCacheRef.current,
        maskCacheRef.current,
        initialPose,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    document,
    repeatX,
    repeatY,
    repeatStyle,
    sourceReady,
    initialPose,
    canvasRef,
  ]);

  return (
    <div className="preview-stage">
      <canvas
        ref={canvasRef}
        className="preview-canvas"
        role="img"
        aria-label="Photographic knitted fabric preview"
      />
    </div>
  );
}
