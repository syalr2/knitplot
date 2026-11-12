import { z } from "zod";
import { shapingSchedule } from "./yoke-shaping";
import { finishedYokeSizes } from "./yoke-measurement-mode";
import { gaugeMeasurementSchema } from "./gauge-schema";

const length = z.number().finite().positive().max(400);
export const yokeMeasurementsSchema = z.object({
  unit: z.enum(["cm", "in"]),
  measurementMode: z.enum(["body", "finished"]).default("body"),
  gaugeStitches: gaugeMeasurementSchema,
  gaugeRows: gaugeMeasurementSchema,
  gaugeMeasure: gaugeMeasurementSchema,
  neck: length,
  chest: length,
  bodyEase: z.number().finite().min(-20).max(60),
  upperArm: length,
  sleeveEase: z.number().finite().min(-10).max(30),
  underarm: length,
  depth: length,
  backRise: z.number().finite().min(0).max(15),
  repeats: z.number().int().min(2).max(40),
  shoulderCircumference: length.optional(),
  shoulderLength: length.optional(),
});
export type YokeMeasurements = z.infer<typeof yokeMeasurementsSchema>;
export const defaultYokeMeasurements: YokeMeasurements = {
  unit: "cm",
  measurementMode: "body",
  gaugeStitches: 20,
  gaugeRows: 28,
  gaugeMeasure: 10,
  neck: 44,
  chest: 96,
  bodyEase: 10,
  upperArm: 32,
  sleeveEase: 4,
  underarm: 4,
  depth: 22,
  backRise: 2,
  repeats: 12,
};
export const increaseEventSchema = z.object({
  round: z.number().int().min(2).max(150),
  count: z.number().int().min(1).max(1200),
  placements: z.array(z.number().int().min(0).max(199)).max(200).optional(),
  stitch: z.enum(["m1l", "m1r"]).optional(),
  directions: z
    .array(z.enum(["m1l", "m1r"]))
    .max(200)
    .optional(),
});
export type IncreaseEvent = z.infer<typeof increaseEventSchema>;
export type YokePlan = ReturnType<typeof calculateYokeTargets>;

/** Finished body includes TWO underarms; each finished sleeve includes ONE. */
export function calculateYokeTargets(value: YokeMeasurements) {
  const input = yokeMeasurementsSchema.parse(value);
  const stitchesPerUnit = input.gaugeStitches / input.gaugeMeasure;
  const rowsPerUnit = input.gaugeRows / input.gaugeMeasure;
  const sizes = finishedYokeSizes(input);
  const body = Math.round(sizes.body * stitchesPerUnit);
  const sleeve = Math.round(sizes.sleeve * stitchesPerUnit);
  const underarm = Math.round(input.underarm * stitchesPerUnit);
  const requestedNeck = Math.round(input.neck * stitchesPerUnit);
  const requestedEnd = body + 2 * sleeve - 4 * underarm;
  const multiple = (count: number) =>
    Math.round(count / input.repeats) * input.repeats;
  const neck = multiple(requestedNeck);
  const end = multiple(requestedEnd);
  const rounds = Math.round(input.depth * rowsPerUnit);
  const shortRowPairs = Math.round((input.backRise * rowsPerUnit) / 2);
  const actualBody = end - 2 * (sleeve - underarm) + 2 * underarm;
  if (body <= 2 * underarm || sleeve <= underarm || underarm < 1)
    throw new Error(
      "The underarm allowance must leave stitches for the body and both sleeves.",
    );
  if (neck < input.repeats * 2 || end <= neck)
    throw new Error(
      "Choose a lower neck count, a larger lower yoke, or fewer repeats.",
    );
  if (actualBody <= 2 * underarm)
    throw new Error(
      "Repeat rounding leaves no body stitches at the sleeve split. Use fewer repeats or reduce the underarm width.",
    );
  if (end > 1200 || end / input.repeats > 200 || rounds < 5 || rounds > 150)
    throw new Error(
      "This first version supports 5–150 full rounds, up to 1,200 total stitches and 200 stitches per repeat.",
    );
  if (Math.ceil(Math.log2(end / neck)) > rounds - 1)
    throw new Error(
      "There are too few rounds for that amount of increase. Increase the yoke length or revise the target counts.",
    );
  const hasShoulder = input.shoulderCircumference !== undefined;
  if (hasShoulder !== (input.shoulderLength !== undefined))
    throw new Error(
      "Enter both shoulder checkpoint measurements, or leave both blank.",
    );
  const shoulder = hasShoulder
    ? {
        count: multiple(
          Math.round(input.shoulderCircumference! * stitchesPerUnit),
        ),
        round: 1 + Math.round(input.shoulderLength! * rowsPerUnit),
      }
    : undefined;
  if (
    shoulder &&
    (shoulder.count <= neck ||
      shoulder.count >= end ||
      shoulder.round < 2 ||
      shoulder.round >= rounds ||
      Math.ceil(Math.log2(shoulder.count / neck)) > shoulder.round - 1 ||
      Math.ceil(Math.log2(end / shoulder.count)) > rounds - shoulder.round)
  )
    throw new Error(
      "The shoulder checkpoint must fall between the neck and lower-yoke counts and lengths, with enough rounds for the growth.",
    );
  return {
    shoulder,
    neck,
    end,
    rounds,
    body: actualBody,
    sleeve,
    underarm,
    bodyFromYoke: actualBody - 2 * underarm,
    sleeveFromYoke: sleeve - underarm,
    actualNeck: neck / stitchesPerUnit,
    actualBody: actualBody / stitchesPerUnit,
    actualSleeve: sleeve / stitchesPerUnit,
    actualDepth: rounds / rowsPerUnit,
    neckAdjustment: neck - requestedNeck,
    bodyAdjustment: actualBody - body,
    shortRowPairs,
    actualBackRise: (shortRowPairs * 2) / rowsPerUnit,
  };
}

/** Shape first, then quantize to complete repeats; never assume a fixed event count. */
export function suggestYokeSchedule(
  plan: YokePlan,
  repeats: number,
  requestedRounds?: number,
): IncreaseEvent[] {
  if (
    requestedRounds !== undefined &&
    (!Number.isInteger(requestedRounds) ||
      requestedRounds < 1 ||
      requestedRounds > 149)
  )
    throw new Error("Choose a whole number of increase rounds from 1 to 149.");
  let before = plan.neck / repeats;
  return shapingSchedule(plan, repeats, requestedRounds).map(
    ({ round, count }) => {
      const placements = suggestIncreasePositions(before, count / repeats);
      before = count / repeats;
      return {
        round,
        count,
        stitch: "m1l" as const,
        placements,
      };
    },
  );
}

/** New output-stitch slots, one per distinct between-stitch gap in a circular repeat. */
export function suggestIncreasePositions(
  before: number,
  after: number,
): number[] {
  const added = after - before;
  if (
    !Number.isInteger(before) ||
    !Number.isInteger(after) ||
    before < 1 ||
    before > 200 ||
    after > 200 ||
    added < 1 ||
    added > before
  )
    throw new Error(
      "Keep each repeat within 200 stitches and add at most one new stitch per existing stitch.",
    );
  return Array.from(
    { length: added },
    (_, index) => Math.floor(((index + 0.5) * before) / added) + index + 1,
  );
}

export function increasePositions(
  event: IncreaseEvent,
  before: number,
  repeats: number,
) {
  const after = event.count / repeats;
  const added = after - before;
  const positions = event.placements ?? suggestIncreasePositions(before, after);
  const sorted = [...positions].sort((a, b) => a - b);
  if (
    positions.some((slot, index) => slot !== sorted[index]) ||
    (event.directions &&
      (!event.placements || event.directions.length !== positions.length))
  )
    throw new Error(
      "Increase positions must be ascending, with one direction for each new stitch.",
    );
  if (
    positions.length !== added ||
    sorted.some(
      (slot, index) =>
        slot < 0 ||
        slot >= after ||
        (index > 0 && slot - sorted[index - 1] <= 1),
    ) ||
    (sorted[0] === 0 && sorted.at(-1) === after - 1)
  )
    throw new Error(
      `Choose ${added} separated new-stitch positions per repeat, from 1 to ${after}. Leave at least one existing stitch between increases, including across repeat boundaries.`,
    );
  return sorted;
}

export function parseIncreasePositions(
  text: string,
  defaultStitch: "m1l" | "m1r",
) {
  if (!text.trim()) return {};
  const pairs = text
    .split(",")
    .map((value) => {
      const match = /^\s*(\d+)\s*([lr])?\s*$/i.exec(value);
      if (!match)
        throw new Error(
          "Enter positions such as 3, 7 or 3L, 7R for individual increase directions.",
        );
      return {
        position: Number(match[1]) - 1,
        direction: match[2]
          ? match[2].toLowerCase() === "l"
            ? ("m1l" as const)
            : ("m1r" as const)
          : defaultStitch,
      };
    })
    .sort((a, b) => a.position - b.position);
  return {
    placements: pairs.map((pair) => pair.position),
    ...(text.match(/[lr]/i)
      ? { directions: pairs.map((pair) => pair.direction) }
      : {}),
  };
}

export function yokeRoundCounts(
  plan: YokePlan,
  repeats: number,
  events: IncreaseEvent[],
) {
  let count = plan.neck;
  let previousRound = 1;
  for (const candidate of events) {
    const event = increaseEventSchema.parse(candidate);
    if (event.round <= previousRound || event.round > plan.rounds)
      throw new Error(
        "Increase rounds must be in ascending order, within the yoke.",
      );
    if (
      event.count <= count ||
      event.count % repeats !== 0 ||
      event.count > plan.end
    )
      throw new Error(
        "Each count must increase by whole repeats without exceeding the lower-yoke target.",
      );
    if (event.count > 2 * count)
      throw new Error(
        "Split this increase across more rounds: a round cannot more than double its stitch count.",
      );
    increasePositions(event, count / repeats, repeats);
    previousRound = event.round;
    count = event.count;
  }
  if (count !== plan.end)
    throw new Error(`The last increase must reach ${plan.end} stitches.`);
  let eventIndex = 0;
  count = plan.neck;
  return Array.from({ length: plan.rounds }, (_, index) => {
    if (events[eventIndex]?.round === index + 1)
      count = events[eventIndex++].count;
    return count;
  });
}

export function convertYokeUnits(
  input: YokeMeasurements,
  unit: "cm" | "in",
): YokeMeasurements {
  if (unit === input.unit) return input;
  const factor = unit === "in" ? 1 / 2.54 : 2.54;
  return {
    ...input,
    unit,
    ...Object.fromEntries(
      (
        [
          "gaugeMeasure",
          "neck",
          "chest",
          "bodyEase",
          "upperArm",
          "sleeveEase",
          "underarm",
          "depth",
          "backRise",
        ] as const
      ).map((key) => [key, input[key] * factor]),
    ),
    ...(input.shoulderCircumference === undefined
      ? {}
      : {
          shoulderCircumference: input.shoulderCircumference * factor,
        }),
    ...(input.shoulderLength === undefined
      ? {}
      : {
          shoulderLength: input.shoulderLength * factor,
        }),
  };
}
