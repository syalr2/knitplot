"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { ChartDocument, StitchAction } from "@/lib/chart";
import { requestPreviewLayout } from "@/lib/preview-layout-request";
import type { ConnectedFabric, ConnectedLoop } from "@/lib/connected-preview";
import {
  isYokeSweaterView,
  type YokePreviewView,
} from "@/lib/yoke-preview-view";
import { makeReliefSource, makeStitchSprite } from "./knit-preview";

type Props = {
  document: ChartDocument;
  repeatX?: number;
  repeatY?: number;
  mirrored?: boolean;
  repeatStyle?: "normal" | "mirrored";
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  showDiagnostics?: boolean;
  /** Diagnostic sample scale; editor uses its normal automatic size. */
  stitchSize?: number;
  yokeView?: YokePreviewView;
  yokeRepeat?: number;
};

/** A yarn-coloured backing under each visible loop closes subpixel seams
 * without painting across real openings or outside the garment. */
function paintSweaterBacking(
  ctx: CanvasRenderingContext2D,
  fabric: ConnectedFabric,
  unit: number,
  bleed: number,
  rowHeight: number,
) {
  for (const row of fabric.rows)
    for (const node of row) {
      if (!node.yarn || node.action === "bind-off") continue;
      const w = node.span * unit * 1.09;
      const h = rowHeight * (node.heightScale ?? 1) * 1.12;
      ctx.save();
      ctx.translate(
        bleed + (node.x - fabric.minX) * unit,
        bleed + (node.y - fabric.minY) * unit,
      );
      ctx.rotate(node.angle);
      ctx.fillStyle = node.yarn;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.15);
      ctx.fill();
      ctx.restore();
    }
}

export function ConnectedKnitPreview({
  document,
  repeatX = 1,
  repeatY = 1,
  mirrored = false,
  repeatStyle,
  canvasRef,
  showDiagnostics = true,
  stitchSize,
  yokeView,
  yokeRepeat,
}: Props) {
  const internalRef = useRef<HTMLCanvasElement>(null),
    ref = canvasRef ?? internalRef;
  const [status, setStatus] = useState("Rendering…");
  const [failed, setFailed] = useState(false);
  const yokeFrames = useRef<{
    document: ChartDocument;
    frames: Map<
      string,
      { canvas: HTMLCanvasElement; width: number; height: number }
    >;
  } | null>(null);
  const reflect =
    repeatStyle === undefined ? mirrored : repeatStyle === "mirrored";
  const down = Math.max(1, Math.min(3, Math.round(repeatY) || 1));
  useEffect(() => {
    function display(canvas: HTMLCanvasElement, width: number, height: number) {
      const target = ref.current;
      if (!target) return;
      target.width = canvas.width;
      target.height = canvas.height;
      target.style.width = `${Math.min(width, 1400)}px`;
      target.style.height = "auto";
      target.style.aspectRatio = `${width}/${height}`;
      const context = target.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      // Rotate the actual output pixels so the PNG also has the neckline up.
      if (yokeView && !isYokeSweaterView(yokeView))
        context.setTransform(-1, 0, 0, -1, canvas.width, canvas.height);
      context.drawImage(canvas, 0, 0);
      context.resetTransform();
      target.dataset.previewState = "ready";
    }
    const key = `${yokeView}:${yokeRepeat}:${stitchSize}:${repeatX}:${down}:${reflect}:${window.devicePixelRatio}`;
    if (yokeView && yokeFrames.current?.document !== document)
      yokeFrames.current = { document, frames: new Map() };
    const frames = yokeView ? yokeFrames.current?.frames : undefined;
    const cached = frames?.get(key);
    if (cached && frames) {
      frames.delete(key);
      frames.set(key, cached);
      display(cached.canvas, cached.width, cached.height);
      setStatus("");
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setStatus("Rendering…");
    setFailed(false);
    if (ref.current) ref.current.dataset.previewState = "rendering";
    const image = new Image();
    image.onload = async () => {
      if (cancelled || !ref.current) return;
      try {
        const fabric = await requestPreviewLayout(
          document,
          repeatX,
          reflect,
          controller.signal,
          yokeView,
          yokeRepeat,
        );
        if (cancelled || !ref.current) return;
        const source = makeReliefSource(image);
        const unit =
          stitchSize === undefined
            ? Math.max(
                12,
                Math.min(30, Math.floor(1100 / fabric.document.width)),
              )
            : Math.max(12, Math.min(56, stitchSize));
        const rowHeight = (unit * document.gaugeStitches) / document.gaugeRows,
          bleed = unit;
        // Adjacent plain repeats have the same row pitch as the chart itself.
        // Shaped swatches remain separate laid-out pieces, not fake joins
        // between unrelated necklines/edges.
        const shaped =
          fabric.loops.some(
            (n) => n.action !== "knit" && n.action !== "purl",
          ) || fabric.rows.some((row) => row.length !== fabric.rows[0].length);
        const verticalPitch = shaped
          ? fabric.height
          : (document.height * document.gaugeStitches) / document.gaugeRows;
        const width = Math.ceil(fabric.width * unit + bleed * 2),
          height = Math.ceil(
            (fabric.height + (down - 1) * verticalPitch) * unit + bleed * 2,
          );
        // Keep both full-sweater sides in the same bounded preview cache.
        const renderLimit = isYokeSweaterView(yokeView) ? 2400 : 3600;
        const scale = Math.min(
          2,
          window.devicePixelRatio || 1,
          renderLimit / width,
          renderLimit / height,
        );
        // Paint a staging canvas, then commit atomically. Cancelling a refresh
        // must not leave half a swatch in the visible preview or PNG export.
        const canvas = window.document.createElement("canvas"),
          ctx = canvas.getContext("2d")!;
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        ctx.scale(scale, scale);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, width, height);
        if (isYokeSweaterView(yokeView))
          paintSweaterBacking(ctx, fabric, unit, bleed, rowHeight);
        const palette = new Map(document.palette.map((c) => [c.id, c.hex]));
        const sprites = new Map(),
          masks = new Map();
        const rowDistance = (a: ConnectedLoop, b: ConnectedLoop) =>
          document.yoke ? Math.abs(a.packed - b.packed) : Math.abs(a.x - b.x);
        let lastYield = performance.now();
        for (let tile = down - 1; tile >= 0; tile--)
          for (let r = fabric.rows.length - 1; r >= 0; r--) {
            const verticalMirror = reflect && tile % 2 === 1;
            const row = fabric.rows[r],
              special = row.filter(
                (n) => n.kind === "bar" || n.kind === "merge",
              );
            for (const node of [
              ...row.filter((n) => !special.includes(n)),
              ...special,
            ]) {
              if (performance.now() - lastYield > 10) {
                // Yield between short drawing batches, including on browsers
                // where sprite generation is expensive. A chart switch/refresh
                // can abort here without committing the unfinished canvas.
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                if (cancelled) return;
                lastYield = performance.now();
              }
              const hex =
                node.yarn ??
                palette.get(fabric.document.cells[r]?.[node.column]) ??
                document.palette[0]?.hex ??
                "#f2eadf";
              const nearby = special.reduce<typeof node | undefined>(
                (best, n) =>
                  rowDistance(n, node) < 2.1 &&
                  (!best || rowDistance(n, node) < rowDistance(best, node))
                    ? n
                    : best,
                undefined,
              );
              const mirror =
                nearby?.action === "m1r" || nearby?.action === "k2tog";
              let action: StitchAction = node.action;
              if (mirror)
                action =
                  action === "m1r"
                    ? "m1l"
                    : action === "k2tog"
                      ? "ssk"
                      : action;
              const widthScale =
                node.action === "cast-on"
                  ? 0.86
                  : node.action === "bind-off"
                    ? 1.08
                    : 1;
              const hScale =
                (node.heightScale ?? 1) *
                (node.action === "cast-on"
                  ? 0.72
                  : node.action === "bind-off"
                    ? 0.5
                    : 1);
              const span = Math.round(node.span * widthScale * 16) / 16,
                renderWidth = unit * span;
              const offsets = node.parents
                .map((id) => {
                  const parent = fabric.loops[id];
                  return (
                    Math.round(
                      (((parent.x - node.x) * Math.cos(node.angle) +
                        (parent.y - node.y) * Math.sin(node.angle)) /
                        span) *
                        16,
                    ) / 16
                  );
                })
                .map((offset) =>
                  document.yoke
                    ? Math.max(-2.5, Math.min(2.5, offset))
                    : offset,
                );
              // Reflected vertical tiles are decorative pattern repeats, not
              // another working sequence with reversed stitch ancestry.
              const sources = verticalMirror
                ? []
                : mirror
                  ? offsets.map((x) => -x).reverse()
                  : offsets;
              // Sample the photo in knitting order, using actual loop positions
              // rather than placeholder chart columns. Inserting an unworked
              // chart cell must not introduce a new photographic fibre seam.
              const photoRow = fabric.rows.length - 1 - r;
              const col = node.packed % document.width,
                tileCol = mirror ? document.width - 1 - col : col;
              const sprite = makeStitchSprite(
                source,
                hex,
                (tileCol + photoRow * 2) % source.cellsPerSide,
                photoRow % source.cellsPerSide,
                renderWidth,
                rowHeight * hScale,
                sprites,
                masks,
                action,
                sources,
              );
              const verticalOffset =
                (node.heightScale ?? 1) *
                (node.action === "cast-on"
                  ? rowHeight * 0.28
                  : node.action === "bind-off"
                    ? rowHeight * 0.08
                    : 0);
              const localY = node.y - fabric.minY;
              ctx.save();
              ctx.translate(
                bleed + (node.x - fabric.minX) * unit,
                bleed +
                  (tile * verticalPitch +
                    (verticalMirror ? fabric.height - localY : localY)) *
                    unit,
              );
              ctx.rotate(verticalMirror ? -node.angle : node.angle);
              if (mirror) ctx.scale(-1, 1);
              ctx.drawImage(
                sprite.canvas,
                -renderWidth / 2 - sprite.margin,
                -rowHeight / 2 + verticalOffset - sprite.margin,
              );
              ctx.restore();
            }
          }
        if (cancelled || !ref.current) return;
        display(canvas, width, height);
        if (frames) {
          // Bound backing-store memory even when browsing many repeats.
          frames.set(key, { canvas, width, height });
          let pixels = [...frames.values()].reduce(
            (sum, frame) => sum + frame.canvas.width * frame.canvas.height,
            0,
          );
          for (const [oldKey, frame] of frames) {
            if (frames.size <= 5 && pixels <= 12_000_000) break;
            frames.delete(oldKey);
            pixels -= frame.canvas.width * frame.canvas.height;
          }
        }
        setStatus(
          [
            fabric.unresolvedRows.length
              ? `${fabric.unresolvedRows.length} row transitions have incomplete connections.`
              : "",
            fabric.inferredRows.length
              ? `${fabric.inferredRows.length} rows contain inferred stitch births at newly occupied chart cells (missing increase symbols).`
              : "",
            fabric.inputCountDecreaseRows.length
              ? `${fabric.inputCountDecreaseRows.length} decrease rows use the input-count chart convention; consumed companion cells are combined in this preview only.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      } catch (error) {
        if (cancelled) return;
        if (ref.current) ref.current.dataset.previewState = "error";
        setFailed(true);
        setStatus(
          error instanceof Error
            ? error.message
            : "Could not render the knitted preview.",
        );
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        if (ref.current) ref.current.dataset.previewState = "error";
        setFailed(true);
        setStatus("Could not load the photographic yarn texture.");
      }
    };
    image.src = "/textures/merino-relief.png";
    return () => {
      cancelled = true;
      controller.abort();
      image.onload = null;
      image.onerror = null;
    };
  }, [document, repeatX, down, reflect, stitchSize, ref, yokeView, yokeRepeat]);
  return (
    <div>
      <div
        className="preview-stage"
        style={{
          overflow: "auto",
          maxHeight: showDiagnostics ? 620 : undefined,
          background: "white",
          textAlign: "center",
        }}
      >
        <canvas
          ref={ref}
          className="preview-canvas"
          role="img"
          aria-label={
            showDiagnostics
              ? "Connected photographic garment preview"
              : "Photographic knitted fabric preview"
          }
          style={{
            display: "inline-block",
            maxWidth: "100%",
            height: "auto",
            verticalAlign: "top",
          }}
        />
      </div>
      {status && (showDiagnostics || failed || status === "Rendering…") ? (
        <p role={failed ? "alert" : "status"} style={{ fontSize: 13 }}>
          {status}
        </p>
      ) : null}
    </div>
  );
}
