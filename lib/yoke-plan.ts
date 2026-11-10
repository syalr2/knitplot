import { z } from "zod";

const length = z.number().finite().positive().max(400);
export const yokeMeasurementsSchema = z.object({
  unit: z.enum(["cm", "in"]),
  gaugeStitches: length,
  gaugeRows: length,
  gaugeMeasure: length,
  neck: length,
  chest: length,
  bodyEase: z.number().finite().min(-20).max(60),
  upperArm: length,
  sleeveEase: z.number().finite().min(-10).max(30),
  underarm: length,
  depth: length,
  backRise: z.number().finite().min(0).max(15),
  repeats: z.number().int().min(2).max(40),
});
export type YokeMeasurements = z.infer<typeof yokeMeasurementsSchema>;
export const defaultYokeMeasurements: YokeMeasurements = {
  unit: "cm",
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
});
export type IncreaseEvent = z.infer<typeof increaseEventSchema>;
export type YokePlan = ReturnType<typeof calculateYokeTargets>;

/** Finished body includes TWO underarms; each finished sleeve includes ONE. */
export function calculateYokeTargets(value: YokeMeasurements) {
  const input = yokeMeasurementsSchema.parse(value);
  const stitchesPerUnit = input.gaugeStitches / input.gaugeMeasure;
  const rowsPerUnit = input.gaugeRows / input.gaugeMeasure;
  const body = Math.round((input.chest + input.bodyEase) * stitchesPerUnit);
  const sleeve = Math.round(
    (input.upperArm + input.sleeveEase) * stitchesPerUnit,
  );
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
  if (end > 1200 || end / input.repeats > 200 || rounds < 5 || rounds > 150)
    throw new Error(
      "This first version supports 5–150 full rounds, up to 1,200 total stitches and 200 stitches per repeat.",
    );
  if (Math.ceil(Math.log2(end / neck)) > rounds - 1)
    throw new Error(
      "There are too few rounds for that amount of increase. Increase the yoke length or revise the target counts.",
    );
  return {
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

/** An editable scaffold, NOT a validated garment-fitting prescription. */
export function suggestYokeSchedule(
  plan: YokePlan,
  repeats: number,
): IncreaseEvent[] {
  const start = plan.neck / repeats,
    end = plan.end / repeats;
  const stages = Math.min(
    plan.rounds - 1,
    end - start,
    Math.max(4, Math.ceil(Math.log2(end / start))),
  );
  let previousRound = 1,
    previousCount = start;
  return Array.from({ length: stages }, (_, index) => {
    const remaining = stages - index - 1;
    const fraction =
      stages === 4
        ? [0.15, 0.32, 0.5, 0.72][index]
        : (index + 1) / (stages + 1);
    const round = Math.min(
      plan.rounds - remaining,
      Math.max(previousRound + 1, Math.round(1 + (plan.rounds - 1) * fraction)),
    );
    const ideal = Math.round(start * (end / start) ** ((index + 1) / stages));
    const count = Math.min(
      previousCount * 2,
      end - remaining,
      Math.max(previousCount + 1, ideal, Math.ceil(end / 2 ** remaining)),
    );
    previousRound = round;
    previousCount = count;
    return { round, count: count * repeats };
  });
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
  };
}
