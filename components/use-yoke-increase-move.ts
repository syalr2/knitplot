"use client";

import { useEffect, useState } from "react";
import { yokeChart } from "@/lib/yoke-chart";
import {
  prepareYokeIncreaseMove,
  type ChartPoint,
} from "@/lib/yoke-move-increase";
import type { YokeProject } from "@/lib/yoke-project";
import type { YokeRepeatScope } from "@/lib/yoke-repeat-scope";

const same = (a: ChartPoint | null, b: ChartPoint | null) =>
  a === b || (!!a && !!b && a.row === b.row && a.column === b.column);

export function useYokeIncreaseMove(
  project: YokeProject,
  repeat: number,
  scope: YokeRepeatScope,
  enabled: boolean,
  onCommit: (next: YokeProject) => void,
) {
  const context = `${repeat}/${scope}`;
  const [picked, setPicked] = useState<{
    project: YokeProject;
    context: string;
    point: ChartPoint;
    prepare: ReturnType<typeof prepareYokeIncreaseMove>;
  } | null>(null);
  const [target, setTarget] = useState<ChartPoint | null>(null);
  const [preview, setPreview] = useState<{
    picked: NonNullable<typeof picked>;
    target: ChartPoint;
    project?: YokeProject;
    chart?: ReturnType<typeof yokeChart>["document"];
    error?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const active =
    enabled && picked?.project === project && picked.context === context
      ? picked
      : null;
  const result =
    active && preview?.picked === active && same(preview.target, target)
      ? preview
      : null;

  useEffect(() => {
    if (!active || !target || same(active.point, target)) return;
    const timer = window.setTimeout(() => {
      try {
        const next = active.prepare(target);
        setPreview({
          picked: active,
          target,
          project: next,
          chart: yokeChart(next, repeat).document,
        });
      } catch (cause) {
        setPreview({
          picked: active,
          target,
          error:
            cause instanceof Error
              ? cause.message
              : "Could not move this increase.",
        });
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [active, target, repeat]);

  function cancel() {
    setPicked(null);
    setTarget(null);
    setPreview(null);
    setError("");
  }
  function apply() {
    if (!result?.project) return;
    onCommit(result.project);
    cancel();
  }
  function pointAt(point: ChartPoint | null) {
    if (active)
      setTarget((current) => (same(current, point) ? current : point));
  }
  function click(point: ChartPoint) {
    if (!enabled) return;
    if (active) {
      if (same(active.point, point)) cancel();
      else if (result?.project && same(result.target, point)) apply();
      else if (result?.error && same(result.target, point))
        setError(result.error);
      else pointAt(point);
      return;
    }
    cancel();
    try {
      setPicked({
        project,
        context,
        point,
        prepare: prepareYokeIncreaseMove(project, repeat, scope, point),
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Choose an M1L or M1R.",
      );
    }
  }
  return {
    click,
    pointAt,
    cancel,
    apply,
    source: active?.point,
    target: result?.project ? result.target : undefined,
    chart: result?.chart,
    error: enabled ? error : "",
  };
}
