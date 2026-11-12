"use client";
import { repeatTargets, type YokeRepeatScope } from "@/lib/yoke-repeat-scope";
import { yokeRepeatNumber } from "@/lib/yoke-repeat-labels";
import { useMemo, useRef, useState } from "react";
import {
  floodFill,
  stitchActionOptions,
  type ChartDocument,
  type StitchAction,
  type StitchPaletteAction,
  type CellSelection,
} from "@/lib/chart";
import { readChartDocument } from "@/lib/chart-schema";
import { yokeProgramFromProject } from "@/lib/yoke-program-from-project";
import {
  resolvedYokeProgram,
  withYokeProgram,
  yokeCellRepeat,
} from "@/lib/yoke-program-state";
import {
  reviseYokeStitches,
  type YokeStitchEdit,
} from "@/lib/yoke-stitch-revision";
import { yokeDocument } from "@/lib/yoke-document";
import type { yokeDrawing } from "@/lib/yoke-editing";
export type YokeStitchDraft = {
  edits: YokeStitchEdit[];
  past: YokeStitchEdit[][];
  future: YokeStitchEdit[][];
};
export const emptyStitchDraft: YokeStitchDraft = {
  edits: [],
  past: [],
  future: [],
};

export function useYokeStitches(
  document: ChartDocument,
  drawing: ReturnType<typeof yokeDrawing>,
  scope: YokeRepeatScope,
  onChange: (doc: ChartDocument) => void,
  onRemember: () => void,
  draft: YokeStitchDraft,
  onDraftChange: (next: YokeStitchDraft) => void,
) {
  const project = document.yoke!;
  const program = useMemo(() => yokeProgramFromProject(project), [project]);
  const resolved = useMemo(() => resolvedYokeProgram(program), [program]);
  const [action, setAction] = useState<StitchAction | null>(null),
    [picker, setPicker] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{
    base: ChartDocument;
    document: ChartDocument;
    repeat: number;
  } | null>(null);
  const batch = useRef<Map<string, YokeStitchEdit>>(new Map());
  const failed = useRef(false);
  const palette =
    project.stitchPalette ??
    Array.from(
      new Set(
        program.rounds
          .flat(2)
          .map((op) => op.action)
          .filter((action): action is StitchPaletteAction => action !== "knit"),
      ),
    );
  function updateMetadata(next: typeof project) {
    onRemember();
    onChange(yokeDocument(next, document.name));
  }
  function addTarget(
    target: { round: number; section: number; operation: string } | null,
  ) {
    if (!target || !action) return;
    const index = program.rounds[target.round][target.section].findIndex(
      (op) => op.id === target.operation,
    );
    const sections = repeatTargets(
      scope,
      program.startingCounts.length,
      target.section,
    );
    for (const s of sections) {
      const op = program.rounds[target.round][s][index];
      if (!op)
        throw new Error(
          `Repeat ${yokeRepeatNumber(s, program.startingCounts.length)} has no stitch at that instruction position. Edit it separately.`,
        );
      batch.current.set(`${target.round}/${s}/${op.id}`, {
        round: target.round,
        section: s,
        operation: op.id,
        action,
      });
    }
  }
  function targetAt(row: number, column: number) {
    if (drawing.operationAt) return drawing.operationAt(row, column);
    const cell = drawing.yokeCell(row, column);
    if (!cell) return null;
    const where = yokeCellRepeat(project, cell.row, cell.column);
    if (!where) return null;
    const op =
      resolved[cell.row].sections[where.section][where.within]?.operation;
    return op
      ? { round: cell.row, section: where.section, operation: op }
      : null;
  }
  function collectChart(row: number, column: number, fill = false) {
    if (failed.current) return;
    try {
      if (fill) {
        const source =
          drawing.document.stitchActions ??
          drawing.document.cells.map((line) => line.map(() => "knit"));
        const marked = floodFill(source, row, column, "selected");
        marked.forEach((line, r) =>
          line.forEach((value, c) => {
            if (value === "selected") addTarget(targetAt(r, c));
          }),
        );
      } else addTarget(targetAt(row, column));
    } catch (error) {
      failed.current = true;
      batch.current.clear();
      setError(
        error instanceof Error
          ? error.message
          : "Could not select those stitches.",
      );
    }
  }
  function finish() {
    const edits = [...batch.current.values()];
    batch.current.clear();
    if (failed.current || !edits.length) return;
    try {
      const plain = (a: StitchAction) => a === "knit" || a === "purl";
      const sameShape = edits.every(
        (edit) =>
          plain(edit.action) &&
          plain(
            program.rounds[edit.round][edit.section].find(
              (op) => op.id === edit.operation,
            )!.action,
          ),
      );
      if (sameShape && !draft.edits.length) {
        const next = readChartDocument(
          yokeDocument(
            withYokeProgram(project, reviseYokeStitches(program, edits)),
            document.name,
          ),
        );
        onRemember();
        onChange(next);
      } else {
        const combined = new Map(
          draft.edits.map((edit) => [
            `${edit.round}/${edit.section}/${edit.operation}`,
            edit,
          ]),
        );
        edits.forEach((edit) =>
          combined.set(`${edit.round}/${edit.section}/${edit.operation}`, edit),
        );
        onDraftChange({
          edits: [...combined.values()],
          past: [...draft.past.slice(-39), draft.edits],
          future: [],
        });
      }
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "This shaping could not be applied.",
      );
    }
  }
  function review() {
    if (!draft.edits.length) return;
    try {
      const next = readChartDocument(
        yokeDocument(
          withYokeProgram(project, reviseYokeStitches(program, draft.edits)),
          document.name,
        ),
      );
      setPending({
        base: document,
        document: next,
        repeat: draft.edits[0].section,
      });
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "This shaping could not be applied.",
      );
    }
  }
  const staged = new Map(
    draft.edits.map((edit) => [
      `${edit.round}/${edit.section}/${edit.operation}`,
      edit.action,
    ]),
  );
  const markedDrawing = draft.edits.length
    ? {
        ...drawing,
        document: {
          ...drawing.document,
          stitchActions: drawing.document.cells.map((line, r) =>
            line.map((_, c) => {
              const target = targetAt(r, c);
              return (
                (target &&
                  staged.get(
                    `${target.round}/${target.section}/${target.operation}`,
                  )) ??
                drawing.document.stitchActions?.[r][c] ??
                "knit"
              );
            }),
          ),
        },
      }
    : drawing;
  const marks: Record<string, StitchAction> = {};
  if (draft.edits.length)
    resolved.forEach((round, r) => {
      let column = 0;
      round.sections.forEach((loops, s) =>
        loops.forEach((loop) => {
          const action = staged.get(`${r}/${s}/${loop.operation}`);
          if (action) marks[`${r}:${column}`] = action;
          column++;
        }),
      );
    });
  function changeColor(stitch: StitchPaletteAction, hex?: string) {
    const colors = { ...project.stitchColors };
    if (hex) colors[stitch] = hex;
    else delete colors[stitch];
    let next = { ...project, stitchColors: colors };
    if (project.program) {
      const p = structuredClone(project.program);
      p.rounds.forEach((round) =>
        round.forEach((ops) =>
          ops.forEach((op) => {
            if (op.action === stitch) delete op.displayColor;
          }),
        ),
      );
      next = { ...withYokeProgram(next, p), stitchColors: colors };
    }
    updateMetadata(next);
  }
  return {
    action,
    setAction,
    picker,
    setPicker,
    palette,
    error,
    pending,
    setPending,
    draft,
    markedDrawing,
    marks,
    review,
    discard: () => {
      onDraftChange(emptyStitchDraft);
      setPending(null);
      setError("");
    },
    undoDraft: () => {
      if (!draft.past.length) return;
      onDraftChange({
        edits: draft.past.at(-1)!,
        past: draft.past.slice(0, -1),
        future: [draft.edits, ...draft.future].slice(0, 40),
      });
    },
    redoDraft: () => {
      if (!draft.future.length) return;
      onDraftChange({
        edits: draft.future[0],
        past: [...draft.past, draft.edits].slice(-40),
        future: draft.future.slice(1),
      });
    },
    select: (next: StitchAction) => {
      setAction(next);
      setPicker(false);
    },
    add: (next: StitchPaletteAction) => {
      updateMetadata({
        ...project,
        stitchPalette: palette.includes(next) ? palette : [...palette, next],
      });
      setAction(next);
      setPicker(false);
    },
    remove: (next: StitchPaletteAction) => {
      updateMetadata({
        ...project,
        stitchPalette: palette.filter((op) => op !== next),
      });
      if (action === next) setAction(null);
    },
    changeColor,
    begin: () => {
      batch.current.clear();
      failed.current = false;
    },
    finish,
    collectChart,
    paint: (row: number, column: number, fill = false) => {
      const cell = drawing.chartCell(row, column);
      collectChart(cell.row, cell.column, fill);
    },
    applySelection: (selection: CellSelection | null) => {
      if (!selection) return;
      batch.current.clear();
      failed.current = false;
      for (
        let r = Math.min(selection.startRow, selection.endRow);
        r <= Math.max(selection.startRow, selection.endRow);
        r++
      )
        for (
          let c = Math.min(selection.startColumn, selection.endColumn);
          c <= Math.max(selection.startColumn, selection.endColumn);
          c++
        )
          collectChart(r, c);
      finish();
    },
    label:
      stitchActionOptions.find((option) => option.value === action)
        ?.shortLabel ?? "stitch",
  };
}
