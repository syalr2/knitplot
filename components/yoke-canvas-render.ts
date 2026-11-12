import {
  contrastTextColor,
  chartCellDisplayColor,
  type CellSelection,
  type StitchAction,
  stitchActionSymbol,
} from "@/lib/chart";
import type { YokeProject } from "@/lib/yoke-project";
import { yokeChart } from "@/lib/yoke-chart";
import { yokeGeometry, type YokeView } from "@/lib/yoke-layout";
import { planYokeShortRows } from "@/lib/yoke-short-rows";
import { shortRowViewCells } from "@/lib/yoke-short-row-layout";
import { drawYokeProgramCanvas } from "./yoke-program-canvas-render";
import { drawYokeLabel } from "./yoke-canvas-label";

export function drawYokeCanvas(
  context: CanvasRenderingContext2D,
  project: YokeProject,
  view: YokeView,
  repeat: number,
  scale: number,
  selection: CellSelection | null,
  highlight: boolean,
  marks?: Record<string, StitchAction>,
  labelRotation = 0,
) {
  if (project.program) {
    drawYokeProgramCanvas(
      context,
      project,
      view,
      repeat,
      scale,
      selection,
      highlight,
      marks,
      labelRotation,
    );
    return;
  }
  const g = yokeGeometry(
    project.cells.map((row) => row.length),
    project.measurements.repeats,
    view,
    project.measurements.gaugeRows / project.measurements.gaugeStitches,
  );
  const chart = yokeChart(project);
  const bounds = selection && {
    r0: Math.min(selection.startRow, selection.endRow),
    r1: Math.max(selection.startRow, selection.endRow),
    c0: Math.min(selection.startColumn, selection.endColumn),
    c1: Math.max(selection.startColumn, selection.endColumn),
  };
  function point(row: number, column: number, radial: number) {
    const count = g.shownCounts[row];
    const a = g.startAngle + ((column + 0.5) / count) * g.arc;
    const radius = g.inner + (row + radial) * g.radialHeight;
    return { x: g.cx + Math.cos(a) * radius, y: g.cy + Math.sin(a) * radius };
  }
  if (view === "whole" || view === "front" || view === "back") {
    try {
      for (const cell of shortRowViewCells(
        planYokeShortRows(project.measurements, project.shortRows),
        g.inner,
        g.radialHeight,
        view,
      )) {
        context.beginPath();
        context.arc(g.cx, g.cy, cell.inner, cell.start, cell.end);
        context.arc(g.cx, g.cy, cell.outer, cell.end, cell.start, true);
        context.closePath();
        context.fillStyle = project.palette[0];
        context.fill();
        context.strokeStyle = "rgba(190,119,85,.6)";
        context.lineWidth = 0.6 / scale;
        context.stroke();
      }
    } catch {
      /* Optional short-row plans do not prevent full-round drawing. */
    }
  }
  project.cells.forEach((row, r) => {
    const count = g.shownCounts[r];
    const perRepeat = row.length / project.measurements.repeats;
    const offset = view === "repeat" ? repeat * perRepeat : g.columnOffsets[r];
    for (let c = 0; c < count; c++) {
      const absolute = (c + offset) % row.length;
      const action =
        marks?.[`${r}:${absolute}`] ??
        chart.document.stitchActions![project.cells.length - 1 - r][
          chart.maps[r][absolute % perRepeat]
        ];
      const background = chartCellDisplayColor(
        chart.document,
        project.cells.length - 1 - r,
        chart.maps[r][absolute % perRepeat],
        project.palette[row[absolute]],
      );
      const a = g.startAngle + (c / count) * g.arc,
        b = g.startAngle + ((c + 1) / count) * g.arc;
      const inner = g.inner + r * g.radialHeight,
        outer = inner + g.radialHeight;
      context.beginPath();
      context.arc(g.cx, g.cy, inner, a, b);
      context.arc(g.cx, g.cy, outer, b, a, true);
      context.closePath();
      context.fillStyle = background;
      context.fill();
      context.strokeStyle = "rgba(45,52,45,.45)";
      context.lineWidth = 1 / scale;
      context.stroke();
      const selected = bounds
        ? {
            row: project.cells.length - 1 - r,
            column:
              chart.maps[r][absolute % perRepeat] +
              (view === "repeat"
                ? 0
                : Math.floor(absolute / perRepeat) * chart.document.width),
          }
        : null;
      if (
        bounds &&
        selected &&
        selected.row >= bounds.r0 &&
        selected.row <= bounds.r1 &&
        selected.column >= bounds.c0 &&
        selected.column <= bounds.c1
      ) {
        context.fillStyle = "rgba(76,126,168,.25)";
        context.fill();
        context.strokeStyle = "#346ca0";
        context.lineWidth = 1.5 / scale;
        context.stroke();
      }
      if (action !== "knit") {
        context.strokeStyle = "#b55b27";
        context.lineWidth = 2 / scale;
        context.stroke();
        const p = point(r, c, 0.55);
        context.fillStyle = contrastTextColor(background);
        context.font = `bold ${Math.min(g.radialHeight * 0.55, 10 / scale)}px sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        drawYokeLabel(
          context,
          stitchActionSymbol(action),
          p.x,
          p.y,
          labelRotation,
        );
        if (action === "m1l" || action === "m1r") {
          const source = point(r, c + (action === "m1l" ? 0.3 : -0.3), 0);
          context.beginPath();
          context.moveTo(source.x, source.y);
          context.lineTo(p.x, p.y);
          context.strokeStyle = "#b55b27";
          context.lineWidth = 1.5 / scale;
          context.stroke();
        }
      }
      // Existing columns cross an increase round according to stitch ancestry,
      // not simply the same fraction of the circle on both rows.
      if (
        r > 0 &&
        project.cells[r - 1].length !== row.length &&
        action === "knit"
      ) {
        const parent = chart.maps[r - 1].indexOf(
          chart.maps[r][absolute % perRepeat],
        );
        const oldPerRepeat =
          project.cells[r - 1].length / project.measurements.repeats;
        const oldAbsolute =
          Math.floor(absolute / perRepeat) * oldPerRepeat + parent;
        const oldOffset =
          view === "repeat" ? repeat * oldPerRepeat : g.columnOffsets[r - 1];
        const oldColumn =
          (oldAbsolute - oldOffset + project.cells[r - 1].length) %
          project.cells[r - 1].length;
        if (parent >= 0 && oldColumn < g.shownCounts[r - 1]) {
          const from = point(r - 1, oldColumn, 0.78),
            to = point(r, c, 0.22);
          context.beginPath();
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.strokeStyle = "rgba(65,82,69,.5)";
          context.lineWidth = 1 / scale;
          context.stroke();
        }
      }
    }
    if (highlight && view !== "repeat") {
      for (let c = 0; c < count; c++) {
        const absolute = (c + offset) % row.length;
        if (Math.floor(absolute / perRepeat) !== repeat) continue;
        const a = g.startAngle + (c / count) * g.arc,
          b = g.startAngle + ((c + 1) / count) * g.arc;
        context.beginPath();
        context.arc(g.cx, g.cy, g.inner + r * g.radialHeight, a, b);
        context.arc(g.cx, g.cy, g.inner + (r + 1) * g.radialHeight, b, a, true);
        context.closePath();
        context.strokeStyle = "rgba(51,108,160,.55)";
        context.lineWidth = 1 / scale;
        context.stroke();
      }
    }
  });
}
