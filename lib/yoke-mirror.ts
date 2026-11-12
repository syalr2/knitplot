import type { StitchAction } from "./chart";
import { calculateYokeTargets, increasePositions } from "./yoke-plan";
import { withYokeProgram } from "./yoke-program-state";
import type { YokeProject } from "./yoke-project";
import type { YokeOperation, YokeStitchProgram } from "./yoke-stitch-program";

const opposite = {
  m1l: "m1r",
  m1r: "m1l",
  ssk: "k2tog",
  k2tog: "ssk",
} as const;

type DirectionalAction = keyof typeof opposite;
const directionalActions: Partial<Record<StitchAction, DirectionalAction>> =
  opposite;

export function mirrorStitchAction<T extends StitchAction>(action: T) {
  return directionalActions[action] ?? action;
}

const reverseOperations = (ops: YokeOperation[]) =>
  [...ops]
    .reverse()
    .map((op) => ({ ...op, action: mirrorStitchAction(op.action) }));

export function isMirroredYokeSection(
  program: YokeStitchProgram,
  section: number,
) {
  return Boolean(
    program.mirrored || program.mirroredSections?.includes(section),
  );
}

const projectionCache = new WeakMap<YokeStitchProgram, YokeStitchProgram>();
export function yokeProjectionProgram(program: YokeStitchProgram) {
  if (!program.mirrored && !program.mirroredSections?.length) return program;
  const cached = projectionCache.get(program);
  if (cached) return cached;
  const projection = {
    revision: program.revision,
    startingCounts: program.startingCounts,
    rounds: program.rounds.map((round) =>
      round.map((ops, section) =>
        isMirroredYokeSection(program, section) ? reverseOperations(ops) : ops,
      ),
    ),
  };
  projectionCache.set(program, projection);
  return projection;
}

export function reflectYokeSections(
  program: YokeStitchProgram,
  sections: readonly number[],
  reverseOrder = true,
) {
  const mirroredSections = new Set<number>();
  const sourceBySection = program.startingCounts.map((_, section) => section);
  const targets = new Set(sections);
  if (reverseOrder)
    sections.forEach((section, i) => {
      sourceBySection[section] = sections[sections.length - 1 - i];
    });
  sourceBySection.forEach((source, target) => {
    if (isMirroredYokeSection(program, source) !== targets.has(target))
      mirroredSections.add(target);
  });
  return {
    revision: program.revision,
    ...(mirroredSections.size
      ? { mirroredSections: [...mirroredSections] }
      : {}),
    startingCounts: sourceBySection.map(
      (source) => program.startingCounts[source],
    ),
    rounds: program.rounds.map((round) =>
      sourceBySection.map((source, target) =>
        targets.has(target) ? reverseOperations(round[source]) : round[source],
      ),
    ),
  };
}

const reflections = new WeakMap<YokeStitchProgram, YokeStitchProgram>();
export function mirrorYokeProgram(program: YokeStitchProgram) {
  const cached = reflections.get(program);
  if (cached) return cached;
  const reflected = reflectYokeSections(
    program,
    program.startingCounts.map((_, section) => section),
  );
  reflections.set(program, reflected);
  reflections.set(reflected, program);
  return reflected;
}

/** Reflect around centre back, preserving round order and the back-neck turns. */
export function mirrorYoke(project: YokeProject): YokeProject {
  const repeats = project.measurements.repeats;
  let before = calculateYokeTargets(project.measurements).neck / repeats;
  const events = project.events.map((event) => {
    const after = event.count / repeats;
    const placements = increasePositions(event, before, repeats)
      .map((position) => after - 1 - position)
      .reverse();
    before = after;
    const defaultStitch = event.stitch ?? "m1l";
    return {
      ...event,
      placements,
      stitch: opposite[defaultStitch],
      ...(event.directions
        ? {
            directions: event.directions
              .map((action) => opposite[action])
              .reverse(),
          }
        : {}),
    };
  });
  const next = {
    ...project,
    events,
    ...(project.stitchPalette
      ? { stitchPalette: project.stitchPalette.map(mirrorStitchAction) }
      : {}),
    ...(project.stitchColors
      ? {
          stitchColors: Object.fromEntries(
            Object.entries(project.stitchColors).map(([action, color]) => [
              mirrorStitchAction(action as StitchAction),
              color,
            ]),
          ),
        }
      : {}),
  };
  const program = project.program;
  if (!program)
    return { ...next, cells: project.cells.map((row) => [...row].reverse()) };
  return withYokeProgram(next, mirrorYokeProgram(program));
}
