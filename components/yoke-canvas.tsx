"use client";
import { useEffect, useRef, type PointerEvent } from "react";
import type { YokeProject } from "@/lib/yoke-project";
import {
  YOKE_CANVAS,
  yokeGeometry,
  yokeCellAt,
  type YokeView,
} from "@/lib/yoke-layout";

type Props = {
  project: YokeProject;
  view: YokeView;
  zoom: number;
  onPaint: (row: number, column: number) => void;
  onStrokeStart: () => void;
};
export function YokeCanvas({
  project,
  view,
  zoom,
  onPaint,
  onStrokeStart,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const counts = project.cells.map((row) => row.length);
  const aspect =
    project.measurements.gaugeRows / project.measurements.gaugeStitches;
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const g = yokeGeometry(
      project.cells.map((row) => row.length),
      project.measurements.repeats,
      view,
      aspect,
    );
    const increaseRows = new Set(
      project.events.map((event) => event.round - 1),
    );
    project.cells.forEach((row, r) => {
      const count = g.shownCounts[r];
      const bottom = YOKE_CANVAS.height - 40 - r * g.rowHeight;
      for (let c = 0; c < count; c++) {
        context.fillStyle = project.palette[row[c]];
        context.beginPath();
        if (view === "chart") {
          context.rect(
            (canvas.width - count * g.cellWidth) / 2 + c * g.cellWidth,
            bottom - g.rowHeight,
            g.cellWidth,
            g.rowHeight,
          );
        } else {
          const a = g.startAngle + (c / count) * g.arc;
          const b = g.startAngle + ((c + 1) / count) * g.arc;
          const inner = g.inner + r * g.radialHeight;
          const outer = inner + g.radialHeight;
          context.arc(g.cx, g.cy, inner, a, b);
          context.arc(g.cx, g.cy, outer, b, a, true);
          context.closePath();
        }
        context.fill();
        context.strokeStyle = "rgba(45,52,45,.22)";
        context.lineWidth = 0.5;
        context.stroke();
      }
      if (increaseRows.has(r)) {
        context.beginPath();
        if (view === "chart") {
          context.moveTo((canvas.width - count * g.cellWidth) / 2, bottom);
          context.lineTo((canvas.width + count * g.cellWidth) / 2, bottom);
        } else {
          context.arc(
            g.cx,
            g.cy,
            g.inner + r * g.radialHeight,
            g.startAngle,
            g.startAngle + g.arc,
          );
        }
        context.strokeStyle = "#be7755";
        context.lineWidth = 1.5;
        context.stroke();
      }
    });
    context.fillStyle = "#334c44";
    context.font = "15px sans-serif";
    context.textAlign = "center";
    context.fillText(
      view === "whole"
        ? "Back · start of round"
        : view === "repeat"
          ? "Neck edge · round 1"
          : "Neck edge · round 1 at bottom",
      500,
      view === "chart" ? 790 : 15,
    );
    if (view === "whole") context.fillText("Front", 500, 790);
  }, [project, view, aspect]);

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const cell = yokeCellAt(
      counts,
      project.measurements.repeats,
      view,
      aspect,
      ((event.clientX - box.left) / box.width) * YOKE_CANVAS.width,
      ((event.clientY - box.top) / box.height) * YOKE_CANVAS.height,
    );
    if (cell) onPaint(cell.row, cell.column);
  }
  return (
    <div className="yoke-canvas-scroll">
      <canvas
        role="img"
        ref={ref}
        width={YOKE_CANVAS.width}
        height={YOKE_CANVAS.height}
        style={{ width: `${zoom}%` }}
        aria-label={`${view === "whole" ? "Whole yoke" : view === "repeat" ? "One repeat" : "Standard chart"} drawing canvas`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          onStrokeStart();
          drawing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          paint(event);
        }}
        onPointerMove={(event) => {
          if (drawing.current) paint(event);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
        onLostPointerCapture={() => {
          drawing.current = false;
        }}
      />
    </div>
  );
}
