import { stitchActionMath, type StitchAction } from "./chart";
import {
  resolveYokeProgram,
  resolveYokeRound,
  yokeSeedLoops,
  type YokeStitchProgram,
  type YokeOperation,
  type YokeLoop,
  type ResolvedYokeOperation,
} from "./yoke-stitch-program";

export type YokeStitchEdit = {
  round: number;
  section: number;
  operation: string;
  action: StitchAction;
};
const plain = (action: StitchAction) => action === "knit" || action === "purl";

/** Replay untouched instructions by their original input loops, not by column
 * number. New loops get normal stitches; removed loops lose their descendants.
 * A later shaping instruction that loses an input is refused, never guessed.
 */
function rebaseSection(
  before: YokeLoop[],
  source: ResolvedYokeOperation[],
  make: (action: StitchAction, color: number) => YokeOperation,
) {
  const positions = new Map(before.map((loop, index) => [loop.id, index]));
  const result: YokeOperation[] = [];
  let cursor = 0;
  function carryUntil(end: number) {
    if (end < cursor)
      throw new Error("Shaping would change the order of existing stitches.");
    while (cursor < end) {
      result.push(make("knit", before[cursor].color));
      cursor++;
    }
  }
  for (const op of source) {
    if (op.inputs.length) {
      const indices = op.inputs.map((id) => positions.get(id));
      if (indices.every((index) => index === undefined)) {
        if (plain(op.action) || op.action === "bind-off") continue;
        throw new Error(
          `An existing ${op.action} no longer has its input stitches. Revise that shaping first.`,
        );
      }
      if (
        indices.some((index) => index === undefined) ||
        indices.some((index, i) => index !== indices[0]! + i)
      )
        throw new Error(
          `An existing ${op.action} would consume different stitches. Revise that shaping first.`,
        );
      carryUntil(indices[0]!);
      result.push({
        id: op.id,
        action: op.action,
        color: op.color,
        ...(op.displayColor ? { displayColor: op.displayColor } : {}),
      });
      cursor += op.inputs.length;
    } else {
      const right = op.right ? positions.get(op.right) : undefined;
      const left = op.left ? positions.get(op.left) : undefined;
      if (right !== undefined) carryUntil(right);
      else if (left !== undefined) carryUntil(left + 1);
      else if (op.action === "m1l" || op.action === "m1r")
        throw new Error(
          "An existing M1 has lost both sides of its bar. Revise that increase first.",
        );
      result.push({
        id: op.id,
        action: op.action,
        color: op.color,
        ...(op.displayColor ? { displayColor: op.displayColor } : {}),
      });
    }
  }
  carryUntil(before.length);
  return result;
}

function replaceOperation(
  ops: YokeOperation[],
  target: string,
  action: StitchAction,
  make: (action: StitchAction, color: number) => YokeOperation,
) {
  const index = ops.findIndex((op) => op.id === target);
  if (index < 0)
    throw new Error(
      "That stitch no longer exists after the preceding shaping change.",
    );
  const old = ops[index],
    oldMath = stitchActionMath(old.action),
    nextMath = stitchActionMath(action);
  if (old.action === action) return ops;
  const next = ops.map((op) => ({ ...op }));
  // M1/CO add a stitch between existing stitches; they do not replace a knit.
  // No-stitch adds a chart placeholder, not a bind-off or a hole in the fabric.
  if (nextMath.consumes === 0 && oldMath.consumes > 0) {
    next.splice(index, 0, make(action, old.color));
    return next;
  }
  // Removing an inserted increase removes that operation, not a live input loop.
  if (oldMath.consumes === 0 && plain(action)) {
    next.splice(index, 1);
    return next;
  }
  const extra = nextMath.consumes - oldMath.consumes;
  if (extra > 0) {
    let remaining = extra;
    const at = index + 1;
    while (remaining > 0) {
      const neighbour = next[at];
      if (!neighbour || !plain(neighbour.action))
        throw new Error(
          "This decrease overlaps another shaping stitch or crosses the repeat edge.",
        );
      next.splice(at, 1);
      remaining--;
    }
  } else if (extra < 0)
    for (let n = 0; n < -extra; n++)
      next.splice(index + 1 + n, 0, make("knit", old.color));
  next[index] = { ...old, action };
  return next;
}

export function reviseYokeStitches(
  program: YokeStitchProgram,
  edits: YokeStitchEdit[],
) {
  const original = resolveYokeProgram(program);
  const next: YokeStitchProgram = {
    ...program,
    revision: program.revision + 1,
    startingCounts: [...program.startingCounts],
    rounds: [],
  };
  const seen = new Set<string>();
  for (const edit of edits) {
    const key = `${edit.round}/${edit.section}/${edit.operation}`;
    if (seen.has(key))
      throw new Error("Choose one action per stitch in a revision.");
    seen.add(key);
    if (
      !original[edit.round]?.operations[edit.section]?.some(
        (op) => op.id === edit.operation,
      )
    )
      throw new Error("Choose an existing yoke stitch.");
  }
  let before = yokeSeedLoops(next.startingCounts);
  let serial = 0;
  for (let round = 0; round < original.length; round++) {
    const sections = before.map((inputs, section) => {
      const make = (action: StitchAction, color: number): YokeOperation => ({
        id: `e${next.revision.toString(36)}.${(serial++).toString(36)}`,
        action,
        color,
      });
      let ops = rebaseSection(
        inputs,
        original[round].operations[section],
        make,
      );
      for (const edit of edits.filter(
        (edit) => edit.round === round && edit.section === section,
      ))
        ops = replaceOperation(ops, edit.operation, edit.action, make);
      return ops;
    });
    const resolved = resolveYokeRound(before, sections, round);
    before = resolved.sections;
    next.rounds.push(sections);
  }
  resolveYokeProgram(next);
  return next;
}
