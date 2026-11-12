import {
  calculateYokeTargets,
  suggestYokeSchedule,
  type YokeMeasurements,
  type YokePlan,
} from "./yoke-plan";
import { finishedYokeSizes } from "./yoke-measurement-mode";

/** Five percent is a review threshold, not a knitting fit tolerance. Never auto-change a design. */
export function yokeRoundingReview(input: YokeMeasurements, plan: YokePlan) {
  const sizes = finishedYokeSizes(input);
  const fields = [
    { name: "Neck opening", requested: input.neck, actual: plan.actualNeck },
    {
      name: "Body circumference",
      requested: sizes.body,
      actual: plan.actualBody,
    },
    {
      name: "Upper sleeve",
      requested: sizes.sleeve,
      actual: plan.actualSleeve,
    },
    ...(plan.shoulder
      ? [
          {
            name: "Shoulder checkpoint",
            requested: input.shoulderCircumference!,
            actual:
              plan.shoulder.count / (input.gaugeStitches / input.gaugeMeasure),
          },
        ]
      : []),
  ];
  const changes = fields
    .map((field) => ({
      ...field,
      percent: (field.actual / field.requested - 1) * 100,
    }))
    .filter((field) => Math.abs(field.percent) > 5 + 1e-8);
  const alternatives: { repeats: number; neck: number; body: number }[] = [];
  if (changes.some((change) => change.name === "Neck opening")) {
    for (let repeats = 2; repeats <= 40; repeats++) {
      if (repeats === input.repeats) continue;
      try {
        const target = calculateYokeTargets({ ...input, repeats });
        suggestYokeSchedule(target, repeats);
        if (
          Math.abs(target.actualNeck - input.neck) + 1e-8 <
          Math.abs(plan.actualNeck - input.neck)
        )
          alternatives.push({
            repeats,
            neck: target.actualNeck,
            body: target.actualBody,
          });
      } catch {
        /* Only suggest viable plans within the existing limits. */
      }
    }
    alternatives.sort((a, b) => {
      const error =
        Math.abs(a.neck - input.neck) - Math.abs(b.neck - input.neck);
      return Math.abs(error) > 1e-8
        ? error
        : Math.abs(a.repeats - input.repeats) -
            Math.abs(b.repeats - input.repeats);
    });
  }
  return { changes, alternatives: alternatives.slice(0, 3) };
}
