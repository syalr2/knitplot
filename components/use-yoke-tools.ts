"use client";
import { useMemo, useState } from "react";
import { type CellSelection, type Tool } from "@/lib/chart";
import {
  canRotateSelection,
  type SelectionEdit,
  type SelectionBlock,
} from "@/lib/chart-selection";
import {
  yokeDrawing,
  copyYokeSelection,
  editYokeSelection,
  fillYoke,
  copyYokeRepeat,
} from "@/lib/yoke-editing";
import {
  paintYoke,
  yokeProjectSchema,
  type YokeProject,
} from "@/lib/yoke-project";
import type { YokeView } from "@/lib/yoke-layout";
import { yokeCellRepeat } from "@/lib/yoke-program-state";
import { mirrorYoke } from "@/lib/yoke-mirror";
import { mirrorYokeRepeat } from "@/lib/yoke-repeat-mirror";
import type { YokeRepeatScope } from "@/lib/yoke-repeat-scope";
import { yokeRepeatNumber } from "@/lib/yoke-repeat-labels";

export type YokeTool = Tool | "row-fill";
export function useYokeTools(
  project: YokeProject,
  view: YokeView,
  change: (next: YokeProject, remember?: boolean) => void,
  hasPendingShaping: boolean,
) {
  const [tool, setTool] = useState<YokeTool>("pencil");
  const [editScope, setEditScope] = useState<YokeRepeatScope>(true);
  const [repeat, setRepeat] = useState(0);
  const activeRepeat = Math.min(repeat, project.measurements.repeats - 1);
  const allRepeats = editScope === true;
  const group =
    typeof editScope === "boolean"
      ? []
      : editScope.filter((s) => s < project.measurements.repeats);
  const scope: YokeRepeatScope = allRepeats || (group.length ? group : false);
  const single = view === "chart" || view === "repeat";
  const drawing = useMemo(
    () => yokeDrawing(project, single ? activeRepeat : null),
    [project, single, activeRepeat],
  );
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [clipboard, setClipboard] = useState<SelectionBlock | null>(null);
  const [error, setError] = useState("");
  function edit(action: SelectionEdit) {
    try {
      const next = editYokeSelection(
        project,
        drawing,
        selection,
        action,
        scope,
      );
      if (next.project !== project) change(next.project);
      setSelection(next.selection);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not edit selection.",
      );
    }
  }
  function copy() {
    setClipboard(copyYokeSelection(drawing.document, selection));
  }
  function transform(transform: "horizontal" | "vertical" | "rotate") {
    try {
      if (!selection) {
        if (transform !== "horizontal") return;
        if (hasPendingShaping)
          throw new Error(
            "Apply or discard pending shaping edits before mirroring the yoke.",
          );
        change(
          yokeProjectSchema.parse(
            allRepeats
              ? mirrorYoke(project)
              : mirrorYokeRepeat(project, group.length ? group : activeRepeat),
          ),
        );
        setError("");
        return;
      }
      const next = editYokeSelection(
        project,
        drawing,
        selection,
        { type: "transform", transform },
        scope,
      );
      if (next.project !== project) change(next.project);
      setSelection(next.selection);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not transform design.",
      );
    }
  }
  return {
    copyRepeatTo: (targets: readonly number[]) => {
      const next = copyYokeRepeat(project, activeRepeat, targets);
      if (next !== project) change(next);
    },
    group,
    scope,
    setScope: (next: YokeRepeatScope) => {
      setEditScope(next);
      if (
        typeof next !== "boolean" &&
        next.length &&
        !next.includes(activeRepeat)
      )
        setRepeat(next[0]);
      setSelection(null);
    },
    tool,
    setTool,
    allRepeats,
    repeat: activeRepeat,
    repeatNumber: yokeRepeatNumber(activeRepeat, project.measurements.repeats),
    setRepeat: (value: number) => {
      setRepeat(value);
      setSelection(null);
    },
    drawing,
    selection,
    setSelection,
    error,
    clipboard,
    edit,
    copy,
    transform,
    cut: () => {
      copy();
      edit({ type: "cut" });
    },
    paste: () => {
      if (clipboard) edit({ type: "paste", block: clipboard });
    },
    canRotate: !!selection && canRotateSelection(drawing.document, selection),
    clear: () => edit({ type: "fill-yarn", color: "yarn-0" }),
    clearAll: () => {
      const next = editYokeSelection(
        project,
        drawing,
        {
          startRow: 0,
          startColumn: 0,
          endRow: drawing.document.height - 1,
          endColumn: drawing.document.width - 1,
        },
        { type: "fill-yarn", color: "yarn-0" },
        scope,
      );
      if (next.project !== project) change(next.project);
      setSelection(null);
    },
    paint: (row: number, column: number, color: number) => {
      const value = tool === "eraser" ? 0 : color;
      if (!single) {
        const cell = yokeCellRepeat(project, row, column);
        if (
          cell &&
          (!group.length || allRepeats || group.includes(cell.section))
        )
          setRepeat(cell.section);
      }
      const next =
        tool === "fill" || tool === "row-fill"
          ? fillYoke(
              project,
              drawing,
              row,
              column,
              value,
              scope,
              tool === "row-fill",
            )
          : paintYoke(project, row, column, value, scope);
      if (next !== project) change(next, false);
    },
  };
}
export type YokeTools = ReturnType<typeof useYokeTools>;
