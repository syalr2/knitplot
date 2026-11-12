import { z } from "zod";
import { calculateYokeTargets, type YokeMeasurements } from "./yoke-plan";

export const yokeShortRowsSchema = z.object({
  distances: z.array(z.number().int().min(2).max(599)).max(200),
});
export type YokeShortRows = z.infer<typeof yokeShortRowsSchema>;

/** German short rows, symmetrically widening or narrowing from centre back.
 * Distances include the last worked stitch, which becomes the DS after turning.
 * The closing full round is chart round 1, not an extra uncounted full round.
 */
export function planYokeShortRows(
  measurements: YokeMeasurements,
  setup?: YokeShortRows,
) {
  const target = calculateYokeTargets(measurements);
  const pairs = target.shortRowPairs;
  // Suggestions follow Wise Owl Knits' published 60% -> 80% coverage recipe.
  // Manual turns may narrow instead; never cross centre front or repeat a turn.
  const maxDistance = Math.floor((target.neck - 1) / 2);
  if (pairs > 200 || (pairs > 0 && maxDistance - 2 * (pairs - 1) < 2))
    throw new Error(
      "There is not enough neck space for this many separated short-row turns. Reduce the extra back-neck height or revise the neck count.",
    );
  const start = Math.round(target.neck * 0.3);
  const end = Math.round(target.neck * 0.4);
  const parsed = setup ? yokeShortRowsSchema.safeParse(setup) : undefined;
  if (parsed && !parsed.success)
    throw new Error(
      "Turn distances must be whole stitch counts of at least 2.",
    );
  if (
    !setup &&
    pairs &&
    (start < 2 ||
      end > maxDistance ||
      (pairs > 1 && end - start < 3 * (pairs - 1)))
  )
    throw new Error(
      "The suggested 60–80% spread cannot fit this many turns at least 3 stitches apart. Enter custom turn distances or revise the back-neck height.",
    );
  const distances = parsed?.success
    ? parsed.data.distances
    : Array.from({ length: pairs }, (_, i) =>
        pairs === 1
          ? start
          : Math.round(start + (i * (end - start)) / (pairs - 1)),
      );
  const direction =
    distances.length > 1 ? Math.sign(distances[1] - distances[0]) : 1;
  if (
    distances.length !== pairs ||
    distances.some(
      (distance, i) =>
        distance > maxDistance ||
        (i > 0 && (distance - distances[i - 1]) * direction < 2),
    )
  )
    throw new Error(
      `Enter ${pairs} turn distances from 2 to ${maxDistance}, all increasing or all decreasing by at least 2 stitches per pair.`,
    );
  const rows = distances.flatMap((distance, i) => [
    {
      number: 2 * i + 1,
      side: "RS" as const,
      distance,
      work: i === 0 ? distance : distances[i - 1] - 1 + distance,
    },
    {
      number: 2 * i + 2,
      side: "WS" as const,
      distance,
      work: 2 * distance - 1,
    },
  ]);
  return {
    neck: target.neck,
    distances,
    direction: direction < 0 ? ("narrowing" as const) : ("widening" as const),
    maxDistance,
    rows,
    extraRows: pairs * 2,
    actualBackRise: target.actualBackRise,
    returnToCentre: pairs ? distances.at(-1)! - 1 : 0,
    frontUntouched: target.neck - 2 * Math.max(0, ...distances),
  };
}

export function shortRowInstructions(
  plan: ReturnType<typeof planYokeShortRows>,
): string[] {
  if (!plan.rows.length)
    return [
      "No neckline short rows. Begin chart round 1 at the centre-back marker.",
    ];
  return [
    `After the neckband, place the beginning-of-round marker at centre back, with ${plan.neck} stitches on the needles. Start with the right side facing. Work in the main colour, without increases.`,
    "DS = German double stitch. After each turn, slip the last worked stitch purlwise with yarn in front and pull the yarn firmly up and over the needle. For a purl row bring the yarn between the needles to the front. A DS is one stitch, not an increase; it is not included in the following K/P count.",
    ...plan.rows.map(
      (row) =>
        `Short row ${row.number} (${row.side}): ${row.number === 1 ? "" : "Make DS, then "}${row.side === "RS" ? "K" : "P"} ${row.work}, passing centre back if reached, to finish ${row.distance} stitches ${row.side === "RS" ? "clockwise" : "counterclockwise"} from the marker. Turn. Work both legs of any earlier DS together as one stitch when reached.`,
    ),
    `Return (RS): make DS, then K ${plan.returnToCentre} to the centre-back marker. Do not turn.`,
    `Chart round 1: work all ${plan.neck} stitches in the chart's colours, knitting both legs of each remaining DS together as one stitch. This is the first full chart round, not an additional round. Then continue chart round 2 and its increase schedule.`,
  ];
}
