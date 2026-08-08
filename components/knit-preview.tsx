"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { ChartDocument } from "@/lib/chart";

type Props = {
  document: ChartDocument;
  repeatX: number;
  repeatY: number;
  repeatStyle: "normal" | "mirrored";
  canvasRef?: RefObject<HTMLCanvasElement | null>;
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
  const normalized = value.length === 3
    ? value.split("").map((character) => character + character).join("")
    : value;

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function makeReliefSource(image: HTMLImageElement): ReliefSource {
  const sheet = window.document.createElement("canvas");
  const tileWidth = RELIEF_CELL_WIDTH * RELIEF_CELLS_PER_SIDE;
  const tileHeight = RELIEF_CELL_HEIGHT * RELIEF_CELLS_PER_SIDE;
  sheet.width = Math.round(tileWidth * 3);
  sheet.height = Math.round(tileHeight * 3);
  const context = sheet.getContext("2d");

  if (!context) throw new Error("Canvas is unavailable");

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      context.drawImage(image, column * tileWidth, row * tileHeight, tileWidth, tileHeight);
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
) {
  const key = `${width}|${height}|${margin}`;
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

  context.beginPath();
  context.moveTo(width * 0.05, -height * 0.06);
  context.quadraticCurveTo(width * 0.24, height * 0.66, width * 0.5, height * 0.92);
  context.stroke();

  context.beginPath();
  context.moveTo(width * 0.95, -height * 0.06);
  context.quadraticCurveTo(width * 0.76, height * 0.66, width * 0.5, height * 0.92);
  context.stroke();

  cache.set(key, canvas);
  return canvas;
}

function makeStitchSprite(
  source: ReliefSource,
  hex: string,
  tileColumn: number,
  tileRow: number,
  width: number,
  height: number,
  spriteCache: Map<string, StitchSprite>,
  maskCache: Map<string, HTMLCanvasElement>,
) {
  const roundedHeight = Math.max(1, Math.round(height));
  const key = `${hex}|${tileColumn}|${tileRow}|${width}|${roundedHeight}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const margin = Math.round(width * 0.3);
  const canvasWidth = Math.round(width + margin * 2);
  const canvasHeight = Math.round(roundedHeight + margin * 2);
  const sourceMarginX = margin * (source.cellWidth / width);
  const sourceMarginY = margin * (source.cellHeight / roundedHeight);
  const canvas = window.document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");

  context.drawImage(
    source.sheet,
    source.cellWidth * source.cellsPerSide + tileColumn * source.cellWidth - sourceMarginX,
    source.cellHeight * source.cellsPerSide + tileRow * source.cellHeight - sourceMarginY,
    source.cellWidth + sourceMarginX * 2,
    source.cellHeight + sourceMarginY * 2,
    0,
    0,
    canvasWidth,
    canvasHeight,
  );

  const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
  const pixels = imageData.data;
  const [red, green, blue] = hexToRgb(hex);

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const relief = pixels[offset] / 128;
    const shade = Math.pow(relief, TEXTURE_DEPTH);
    const sheen = Math.max(0, relief - 0.97) * 400;
    pixels[offset] = red * shade + sheen;
    pixels[offset + 1] = green * shade + sheen;
    pixels[offset + 2] = blue * shade + sheen;
    pixels[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(makeStitchMask(width, roundedHeight, margin, maskCache), 0, 0);

  const sprite = { canvas, margin, width: canvasWidth, height: canvasHeight };
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
) {
  const totalColumns = document.width * repeatX;
  const totalRows = document.height * repeatY;
  const stitchWidth = Math.max(12, Math.min(30, Math.floor(1100 / totalColumns)));
  const stitchHeight = stitchWidth * (document.gaugeStitches / document.gaugeRows);
  const bleed = Math.ceil(stitchWidth * 0.45);
  const logicalWidth = Math.ceil(totalColumns * stitchWidth + bleed * 2);
  const logicalHeight = Math.ceil(totalRows * stitchHeight + bleed * 2);
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

  const palette = new Map(document.palette.map((color) => [color.id, color.hex]));

  // Upper rows are drawn last so their stitch heads overlap the row below.
  for (let row = totalRows - 1; row >= 0; row -= 1) {
    const repeatRow = Math.floor(row / document.height);
    const rowWithinRepeat = row % document.height;
    const chartRow = repeatStyle === "mirrored" && repeatRow % 2 === 1
      ? document.height - 1 - rowWithinRepeat
      : rowWithinRepeat;
    for (let column = 0; column < totalColumns; column += 1) {
      const repeatColumn = Math.floor(column / document.width);
      const columnWithinRepeat = column % document.width;
      const chartColumn = repeatStyle === "mirrored" && repeatColumn % 2 === 1
        ? document.width - 1 - columnWithinRepeat
        : columnWithinRepeat;
      const colorId = document.cells[chartRow]?.[chartColumn];
      const hex = palette.get(colorId) ?? document.palette[0]?.hex ?? "#ffffff";
      const sprite = makeStitchSprite(
        source,
        hex,
        (column + row * 2) % source.cellsPerSide,
        row % source.cellsPerSide,
        stitchWidth,
        stitchHeight,
        spriteCache,
        maskCache,
      );

      context.drawImage(
        sprite.canvas,
        bleed + column * stitchWidth - sprite.margin,
        bleed + row * stitchHeight - sprite.margin,
        sprite.width,
        sprite.height,
      );
    }
  }
}

export function KnitPreview({ document, repeatX, repeatY, repeatStyle, canvasRef: providedCanvasRef }: Props) {
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

    if (spriteCacheRef.current.size > 512) spriteCacheRef.current.clear();
    let frame = window.requestAnimationFrame(() => {
      drawPreview(
        canvas,
        source,
        document,
        repeatX,
        repeatY,
        repeatStyle,
        spriteCacheRef.current,
        maskCacheRef.current,
      );
    });

    return () => window.cancelAnimationFrame(frame);
  }, [document, repeatX, repeatY, repeatStyle, sourceReady]);

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
