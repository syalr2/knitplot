"use client";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  type PointerEvent,
} from "react";
import type { CellSelection, StitchAction } from "@/lib/chart";
import type { YokeProject } from "@/lib/yoke-project";
import { yokeCellAt, yokeGeometry, type YokeView } from "@/lib/yoke-layout";
import { yokeCanvasViewport, yokeBitmapScale } from "@/lib/yoke-canvas-view";
import { useDevicePixelRatio } from "./use-device-pixel-ratio";
import { yokeDrawing } from "@/lib/yoke-editing";
import { drawYokeCanvas } from "./yoke-canvas-render";
import { useYokeNavigation } from "./use-yoke-navigation";
import {
  presentYokePoint,
  unpresentYokePoint,
} from "@/lib/yoke-view-transform";
import {
  yokeProgramSurface,
  yokeProgramGeometry,
} from "@/lib/yoke-program-surface";

type Props = {
  project: YokeProject;
  view: YokeView;
  zoom: number;
  onPaint: (row: number, column: number) => void;
  onStrokeStart: () => void;
  repeat?: number;
  select?: boolean;
  selection?: CellSelection | null;
  onSelectionChange?: (value: CellSelection | null) => void;
  highlight?: boolean;
  onStrokeEnd?: () => void;
  marks?: Record<string, StitchAction>;
  sideways?: boolean;
  fitRequest?: number;
  onZoomChange?: (zoom: number) => void;
};
export function YokeCanvas({
  project,
  view,
  zoom,
  onPaint,
  onStrokeStart,
  repeat = 0,
  select = false,
  selection = null,
  onSelectionChange,
  highlight = false,
  onStrokeEnd,
  marks,
  sideways: requestedSideways = false,
  fitRequest = 0,
  onZoomChange,
}: Props) {
  const sideways = requestedSideways && view === "repeat";
  const ref = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<{
    start: { row: number; column: number } | null;
    last: string;
    active: boolean;
  }>({ start: null, last: "", active: false });
  const surface = project.program ? yokeProgramSurface(project) : null;
  const counts = surface
    ? surface.rows.map((row) => row.length)
    : project.cells.map((row) => row.length);
  const aspect =
    project.measurements.gaugeRows / project.measurements.gaugeStitches;
  const geometry = surface
    ? yokeProgramGeometry(project, view, repeat)
    : yokeGeometry(counts, project.measurements.repeats, view, aspect);
  const viewport = yokeCanvasViewport(
    counts,
    project.measurements.repeats,
    view,
    aspect,
    geometry,
  );
  const displayScale = (viewport.scale * zoom) / 100;
  const displayWidth = sideways ? viewport.height : viewport.width;
  const displayHeight = sideways ? viewport.width : viewport.height;
  const navigation = useYokeNavigation(ref, {
    enabled: !!onZoomChange,
    width: displayWidth,
    height: displayHeight,
    scale: displayScale,
    baseScale: viewport.scale,
    sideways,
    view,
    fitRequest,
    zoom,
    onZoom: onZoomChange,
  });
  const pixelRatio = useDevicePixelRatio();
  const renderScale = yokeBitmapScale(
    viewport.width,
    viewport.height,
    displayScale,
    pixelRatio,
  );
  const drawing = useMemo(
    () =>
      yokeDrawing(
        project,
        view === "repeat" || view === "chart" ? repeat : null,
      ),
    [project, view, repeat],
  );
  const recenter = useEffectEvent(() => {
    const canvas = ref.current,
      parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    // Start on real stitches rather than the empty corner of a large circle.
    const g = geometry;
    const angle =
      view === "whole"
        ? g.startAngle + ((repeat + 0.5) / project.measurements.repeats) * g.arc
        : g.startAngle + g.arc / 2;
    const radius =
      g.inner + Math.min(4, project.cells.length / 2) * g.radialHeight;
    const v = viewport;
    const scale = (v.scale * zoom) / 100;
    const focus = presentYokePoint(
      {
        x: g.cx + Math.cos(angle) * radius - v.x,
        y: g.cy + Math.sin(angle) * radius - v.y,
      },
      v.width,
      sideways,
    );
    parent.scrollTo({
      left: focus.x * scale - parent.clientWidth / 2,
      top: focus.y * scale - parent.clientHeight / 2,
    });
  });
  // Do not recenter while painting, changing the selected repeat or zooming.
  useEffect(() => {
    recenter();
  }, [view, sideways]);
  const previousScale = useRef({ view, scale: displayScale });
  useEffect(() => {
    const previous = previousScale.current,
      parent = ref.current?.parentElement;
    if (
      !onZoomChange &&
      parent &&
      previous.view === view &&
      previous.scale !== displayScale
    ) {
      const ratio = displayScale / previous.scale;
      parent.scrollTo({
        left:
          (parent.scrollLeft + parent.clientWidth / 2) * ratio -
          parent.clientWidth / 2,
        top:
          (parent.scrollTop + parent.clientHeight / 2) * ratio -
          parent.clientHeight / 2,
      });
    }
    previousScale.current = { view, scale: displayScale };
  }, [view, displayScale, onZoomChange]);
  useEffect(() => {
    const canvas = ref.current,
      context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    if (sideways) context.transform(0, -1, 1, 0, 0, viewport.width);
    context.translate(-viewport.x, -viewport.y);
    drawYokeCanvas(
      context,
      project,
      view,
      repeat,
      displayScale,
      selection,
      highlight,
      marks,
      sideways ? Math.PI / 2 : 0,
    );
  }, [
    project,
    view,
    repeat,
    displayScale,
    renderScale,
    selection,
    highlight,
    marks,
    sideways,
    viewport.x,
    viewport.y,
    viewport.width,
  ]);
  function cell(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const point = unpresentYokePoint(
      {
        x: ((event.clientX - box.left) / box.width) * displayWidth,
        y: ((event.clientY - box.top) / box.height) * displayHeight,
      },
      viewport.width,
      sideways,
    );
    const result = yokeCellAt(
      counts,
      project.measurements.repeats,
      view,
      aspect,
      viewport.x + point.x,
      viewport.y + point.y,
      geometry,
    );
    if (result && surface) {
      const slot = surface.rows[result.row][result.column];
      return slot && !slot.gap ? { row: result.row, column: slot.loop } : null;
    }
    if (result && (view === "repeat" || view === "chart"))
      result.column +=
        (repeat * counts[result.row]) / project.measurements.repeats;
    return result;
  }
  function paint(event: PointerEvent<HTMLCanvasElement>) {
    const found = cell(event);
    if (!found) return;
    const key = `${found.row}:${found.column}`;
    if (pointer.current.last === key) return;
    pointer.current.last = key;
    if (select) {
      const next = drawing.chartCell(found.row, found.column);
      const start = pointer.current.start ?? next;
      pointer.current.start = start;
      onSelectionChange?.({
        startRow: start.row,
        startColumn: start.column,
        endRow: next.row,
        endColumn: next.column,
      });
    } else onPaint(found.row, found.column);
  }
  function stop() {
    if (navigation.stop()) return;
    const finish = pointer.current.active && !select;
    pointer.current.active = false;
    pointer.current.start = null;
    if (finish) onStrokeEnd?.();
  }
  return (
    <div
      className={`yoke-canvas-scroll${onZoomChange ? " yoke-canvas-navigable" : ""}`}
    >
      <canvas
        role="img"
        ref={ref}
        width={Math.ceil(displayWidth * renderScale)}
        height={Math.ceil(displayHeight * renderScale)}
        tabIndex={onZoomChange ? 0 : undefined}
        title={
          onZoomChange
            ? "Hold Space and drag to pan. Ctrl/⌘ + scroll to zoom."
            : undefined
        }
        data-orientation={sideways ? "sideways" : "upright"}
        style={{
          width: displayWidth * displayScale,
          height: displayHeight * displayScale,
          cursor: navigation.cursor,
        }}
        aria-label={`${view === "whole" ? "Whole yoke" : view === "front" ? "Front half" : view === "back" ? "Back half" : view === "repeat" ? "One repeat" : "Standard chart"} drawing canvas`}
        onPointerDown={(event) => {
          if (navigation.start(event)) return;
          if (event.button !== 0 || !cell(event)) return;
          event.preventDefault();
          if (onZoomChange) event.currentTarget.focus({ preventScroll: true });
          if (!select) onStrokeStart();
          pointer.current = { start: null, last: "", active: true };
          event.currentTarget.setPointerCapture(event.pointerId);
          paint(event);
        }}
        onPointerMove={(event) => {
          if (navigation.move(event)) return;
          navigation.track(event);
          if (pointer.current.active) paint(event);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onPointerEnter={navigation.enter}
        onPointerLeave={navigation.leave}
      />
    </div>
  );
}
