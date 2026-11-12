import {
  stitchActionMath,
  stitchActionOptions,
  type StitchAction,
} from "./chart";
import { yokeRepeatNumber } from "./yoke-repeat-labels";

/** Instructions, not pixels: a kfb has one input and two output loops. */
export type YokeOperation = {
  id: string;
  action: StitchAction;
  color: number;
  displayColor?: string;
};
export type YokeStitchProgram = {
  revision: number;
  /** Reflected column ancestry keeps split stitches mirrored as well as yarn. */
  mirrored?: true;
  mirroredSections?: number[];
  startingCounts: number[];
  rounds: YokeOperation[][][];
};
export type YokeLoop = {
  id: string;
  color: number;
  operation: string;
  action: StitchAction;
  parents: string[];
  gapBefore?: number;
};
export type ResolvedYokeOperation = YokeOperation & {
  inputs: string[];
  outputs: string[];
  left?: string;
  right?: string;
};
export type ResolvedYokeRound = {
  sections: YokeLoop[][];
  operations: ResolvedYokeOperation[][];
};

export function yokeSeedLoops(counts: number[]) {
  return counts.map((count, section) =>
    Array.from({ length: count }, (_, index): YokeLoop => ({
      id: `seed-${section}-${index}`,
      color: 0,
      operation: "seed",
      action: "knit",
      parents: [],
    })),
  );
}

/** Strict count checking. Never infer that an unconsumed stitch vanished. */
export function resolveYokeRound(
  before: YokeLoop[][],
  sections: YokeOperation[][],
  round: number,
): ResolvedYokeRound {
  if (sections.length !== before.length)
    throw new Error("Every round needs the same repeat sections.");
  const operations: ResolvedYokeOperation[][] = [];
  const usedBars = new Map<string, number>();
  const endingGaps: number[] = [];
  const after = sections.map((instructions, section) => {
    const repeat = yokeRepeatNumber(section, sections.length);
    if (instructions.length > 200)
      throw new Error(
        `Round ${round + 1}, repeat ${repeat}: more than 200 instruction cells.`,
      );
    let cursor = 0;
    let pendingGap = 0;
    const closedGaps = new Set<string>();
    const inputs = before[section],
      loops: YokeLoop[] = [],
      resolved: ResolvedYokeOperation[] = [];
    for (const instruction of instructions) {
      const math = stitchActionMath(instruction.action);
      const consumed = inputs.slice(cursor, cursor + math.consumes);
      if (consumed.length !== math.consumes)
        throw new Error(
          `Round ${round + 1}, repeat ${repeat}: ${instruction.action} needs more existing stitches.`,
        );
      const left =
        inputs[cursor - 1] ??
        before[(section + before.length - 1) % before.length].at(-1);
      const right = inputs[cursor] ?? before[(section + 1) % before.length][0];
      if (consumed.slice(1).some((loop) => loop.gapBefore))
        throw new Error(
          `Round ${round + 1}, repeat ${repeat}: a decrease cannot cross a bind-off opening.`,
        );
      if (instruction.action === "m1l" || instruction.action === "m1r") {
        if (pendingGap || right?.gapBefore)
          throw new Error(
            `Round ${round + 1}, repeat ${repeat}: M1 cannot lift a bar across a bind-off opening. Use cast on to bridge it.`,
          );
        if (!left || !right || left.id === right.id)
          throw new Error(
            `Round ${round + 1}, repeat ${repeat}: M1 needs a bar between two existing stitches.`,
          );
        const key = `${left.id}/${right.id}`;
        const previous = usedBars.get(key);
        if (previous !== undefined) {
          const location =
            previous === repeat
              ? `in repeat ${repeat}`
              : `between repeats ${previous} and ${repeat}`;
          throw new Error(
            `Round ${round + 1}: two M1s cannot use the same bar ${location}.`,
          );
        }
        usedBars.set(key, repeat);
      }
      const outputs = Array.from(
        { length: math.produces },
        (_, index) => `${instruction.id}:${index}`,
      );
      resolved.push({
        ...instruction,
        inputs: consumed.map((loop) => loop.id),
        outputs,
        left: left?.id,
        right: right?.id,
      });
      let gap =
        pendingGap +
        (consumed[0] && !closedGaps.has(consumed[0].id)
          ? (consumed[0].gapBefore ?? 0)
          : 0);
      if (instruction.action === "cast-on") {
        gap = Math.max(
          0,
          pendingGap +
            (right && !closedGaps.has(right.id) ? (right.gapBefore ?? 0) : 0) -
            1,
        );
        if (right) closedGaps.add(right.id);
      }
      outputs.forEach((id, index) =>
        loops.push({
          id,
          color: instruction.color,
          operation: instruction.id,
          action: instruction.action,
          parents: consumed.map((loop) => loop.id),
          ...(index === 0 && gap ? { gapBefore: gap } : {}),
        }),
      );
      if (instruction.action === "bind-off") pendingGap = gap + math.consumes;
      else if (outputs.length) pendingGap = 0;
      cursor += math.consumes;
    }
    if (cursor !== inputs.length)
      throw new Error(
        `Round ${round + 1}, repeat ${repeat}: ${inputs.length - cursor} stitches have no instruction.`,
      );
    if (loops.length > 200)
      throw new Error(
        `Round ${round + 1}, repeat ${repeat}: more than 200 live stitches.`,
      );
    operations.push(resolved);
    endingGaps[section] = pendingGap;
    return loops;
  });
  endingGaps.forEach((gap, s) => {
    if (!gap) return;
    for (let step = 1; step <= after.length; step++) {
      const next = after[(s + step) % after.length][0];
      if (next) {
        next.gapBefore = (next.gapBefore ?? 0) + gap;
        break;
      }
    }
  });
  if (after.reduce((sum, section) => sum + section.length, 0) > 1200)
    throw new Error(
      `Round ${round + 1}: more than 1,200 stitches around the yoke.`,
    );
  return { sections: after, operations };
}

export function resolveYokeProgram(program: YokeStitchProgram) {
  if (
    !Number.isSafeInteger(program.revision) ||
    program.revision < 0 ||
    program.revision >= 1_000_000
  )
    throw new Error("Invalid yoke stitch revision.");
  if (
    program.startingCounts.length < 2 ||
    program.startingCounts.length > 40 ||
    program.startingCounts.some(
      (count) => !Number.isInteger(count) || count < 1 || count > 200,
    ) ||
    program.startingCounts.reduce((a, b) => a + b, 0) > 1200
  )
    throw new Error("Invalid starting yoke stitch counts.");
  if (!program.rounds.length || program.rounds.length > 150)
    throw new Error("A yoke needs 1–150 rounds.");
  const ids = new Set<string>();
  let before = yokeSeedLoops(program.startingCounts);
  return program.rounds.map((instructions, round) => {
    for (const section of instructions)
      for (const op of section) {
        if (
          !op.id ||
          op.id.length > 100 ||
          ids.has(op.id) ||
          !Number.isInteger(op.color) ||
          op.color < 0 ||
          op.color > 7 ||
          !stitchActionOptions.some((option) => option.value === op.action)
        )
          throw new Error("Invalid or repeated stitch instruction.");
        ids.add(op.id);
      }
    const resolved = resolveYokeRound(before, instructions, round);
    before = resolved.sections;
    return resolved;
  });
}
