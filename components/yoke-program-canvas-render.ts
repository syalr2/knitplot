import {
  contrastTextColor,
  stitchActionSymbol,
  type CellSelection,
  type StitchAction,
} from "@/lib/chart";
import type { YokeProject } from "@/lib/yoke-project";
import type { YokeView } from "@/lib/yoke-layout";
import {
  yokeProgramSurface,
  yokeProgramGeometry,
} from "@/lib/yoke-program-surface";
import { yokeDrawing } from "@/lib/yoke-editing";
import { planYokeShortRows } from "@/lib/yoke-short-rows";
import { shortRowViewCells } from "@/lib/yoke-short-row-layout";
import { resolvedYokeProgram } from "@/lib/yoke-program-state";
import { drawYokeLabel } from "./yoke-canvas-label";

export function drawYokeProgramCanvas(
  ctx: CanvasRenderingContext2D,
  project: YokeProject,
  view: YokeView,
  repeat: number,
  scale: number,
  selection: CellSelection | null,
  highlight: boolean,
  marks?: Record<string, StitchAction>,
  labelRotation = 0,
) {
  const surface = yokeProgramSurface(project),
    g = yokeProgramGeometry(project, view, repeat);
  const drawing = selection
    ? yokeDrawing(project, view === "repeat" ? repeat : null)
    : null;
  const loops = resolvedYokeProgram(project.program!).map((round) =>
    round.sections.flat(),
  );
  const bounds = selection
    ? {
        r0: Math.min(selection.startRow, selection.endRow),
        r1: Math.max(selection.startRow, selection.endRow),
        c0: Math.min(selection.startColumn, selection.endColumn),
        c1: Math.max(selection.startColumn, selection.endColumn),
      }
    : null;
  if (view === "whole" || view === "front" || view === "back") {
    try {
      for (const cell of shortRowViewCells(
        planYokeShortRows(project.measurements, project.shortRows),
        g.inner,
        g.radialHeight,
        view,
      )) {
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, cell.inner, cell.start, cell.end);
        ctx.arc(g.cx, g.cy, cell.outer, cell.end, cell.start, true);
        ctx.closePath();
        ctx.fillStyle = project.palette[0];
        ctx.fill();
        ctx.strokeStyle = "rgba(190,119,85,.6)";
        ctx.lineWidth = 0.6 / scale;
        ctx.stroke();
      }
    } catch {
      /* Custom short rows can require manual turns. */
    }
  }
  surface.rows.forEach((row, r) => {
    const count = g.shownCounts[r];
    const previousPositions = new Map<string, number>();
    if (r > 0)
      surface.rows[r - 1].forEach((slot, c) => {
        if (!slot.gap) previousPositions.set(loops[r - 1][slot.loop].id, c);
      });
    for (let c = 0; c < count; c++) {
      const slot = row[(c + g.columnOffsets[r]) % row.length];
      const originalOp = slot.operation
        ? project.program!.rounds[r][slot.section].find(
            (op) => op.id === slot.operation,
          )
        : undefined;
      const marked = marks?.[`${r}:${slot.loop}`];
      const op =
        originalOp && marked ? { ...originalOp, action: marked } : originalOp;
      const a = g.rowAngles[r] + (c / count) * g.rowArcs[r],
        b = g.rowAngles[r] + ((c + 1) / count) * g.rowArcs[r];
      const inner = g.inner + r * g.radialHeight,
        outer = inner + g.radialHeight;
      const angle = (a + b) / 2,
        radius = (inner + outer) / 2;
      if (slot.gap) {
        if (op?.action === "bind-off") {
          ctx.beginPath();
          ctx.arc(g.cx, g.cy, inner, a, b);
          ctx.strokeStyle = "#8e6952";
          ctx.lineWidth = 2 / scale;
          ctx.stroke();
          ctx.fillStyle = "#70533f";
          ctx.font = `bold ${8 / scale}px sans-serif`;
          ctx.textAlign = "center";
          drawYokeLabel(
            ctx,
            "BO",
            g.cx + Math.cos(angle) * radius,
            g.cy + Math.sin(angle) * radius,
            labelRotation,
          );
        }
        continue;
      }
      const color = op?.color ?? project.cells[r][slot.loop];
      const fill =
        (op?.displayColor === "yarn"
          ? project.palette[color]
          : op?.displayColor) ??
        (op?.action !== "knit"
          ? project.stitchColors?.[op?.action ?? "purl"]
          : undefined) ??
        project.palette[color];
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, inner, a, b);
      ctx.arc(g.cx, g.cy, outer, b, a, true);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "rgba(45,52,45,.45)";
      ctx.lineWidth = 1 / scale;
      ctx.stroke();
      if (bounds && drawing) {
        const cell = drawing.chartCell(r, slot.loop);
        if (
          cell.row >= bounds.r0 &&
          cell.row <= bounds.r1 &&
          cell.column >= bounds.c0 &&
          cell.column <= bounds.c1
        ) {
          ctx.fillStyle = "rgba(76,126,168,.25)";
          ctx.fill();
          ctx.strokeStyle = "#346ca0";
          ctx.lineWidth = 1.5 / scale;
          ctx.stroke();
        }
      }
      const previous =
        c > 0 ? row[(c - 1 + g.columnOffsets[r]) % row.length] : undefined;
      if (
        op &&
        op.action !== "knit" &&
        previous?.operation !== slot.operation
      ) {
        ctx.strokeStyle = "#b55b27";
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        ctx.fillStyle = contrastTextColor(fill);
        ctx.font = `bold ${Math.min(g.radialHeight * 0.55, 10 / scale)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        drawYokeLabel(
          ctx,
          stitchActionSymbol(op.action),
          g.cx + Math.cos(angle) * radius,
          g.cy + Math.sin(angle) * radius,
          labelRotation,
        );
      }
      if (
        r > 0 &&
        loops[r][slot.loop].parents.length === 1 &&
        surface.widths[r][slot.section] !== surface.widths[r - 1][slot.section]
      ) {
        const parent = previousPositions.get(loops[r][slot.loop].parents[0]);
        if (parent !== undefined) {
          const c0 =
            (parent - g.columnOffsets[r - 1] + surface.rows[r - 1].length) %
            surface.rows[r - 1].length;
          if (c0 < g.shownCounts[r - 1]) {
            const a0 =
              g.rowAngles[r - 1] +
              ((c0 + 0.5) / g.shownCounts[r - 1]) * g.rowArcs[r - 1];
            const r0 = g.inner + (r - 0.22) * g.radialHeight,
              r1 = g.inner + (r + 0.22) * g.radialHeight;
            ctx.beginPath();
            ctx.moveTo(g.cx + Math.cos(a0) * r0, g.cy + Math.sin(a0) * r0);
            ctx.lineTo(
              g.cx + Math.cos(angle) * r1,
              g.cy + Math.sin(angle) * r1,
            );
            ctx.strokeStyle = "rgba(65,82,69,.5)";
            ctx.lineWidth = 1 / scale;
            ctx.stroke();
          }
        }
      }
      if (highlight && slot.section === repeat && view !== "repeat") {
        ctx.strokeStyle = "rgba(51,108,160,.55)";
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }
    }
  });
}
