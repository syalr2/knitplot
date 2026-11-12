import type { YokeMeasurements } from "./yoke-plan";
export type YokeMeasurementMode = "body" | "finished";

export function finishedYokeSizes(
  input: Pick<
    YokeMeasurements,
    "chest" | "bodyEase" | "upperArm" | "sleeveEase"
  > & { measurementMode?: YokeMeasurementMode },
) {
  return {
    body:
      input.chest + (input.measurementMode === "finished" ? 0 : input.bodyEase),
    sleeve:
      input.upperArm +
      (input.measurementMode === "finished" ? 0 : input.sleeveEase),
  };
}

/** Retain ease as a hidden preference, but never apply it twice in finished mode. */
export function switchYokeMeasurementMode(
  input: YokeMeasurements,
  mode: YokeMeasurementMode,
): YokeMeasurements {
  if ((input.measurementMode ?? "body") === mode) return input;
  const sizes = finishedYokeSizes(input);
  if (
    ![sizes.body, sizes.sleeve, input.bodyEase, input.sleeveEase].every(
      Number.isFinite,
    ) ||
    sizes.body <= 0 ||
    sizes.sleeve <= 0
  )
    throw new Error(
      "Complete the body and sleeve measurements before changing input mode.",
    );
  if (mode === "finished")
    return {
      ...input,
      measurementMode: mode,
      chest: sizes.body,
      upperArm: sizes.sleeve,
    };
  // A smaller newly entered garment can outgrow the remembered ease preference.
  // Reset only that preference rather than inventing a zero/negative body size.
  const bodyEase = sizes.body > input.bodyEase ? input.bodyEase : 0;
  const sleeveEase = sizes.sleeve > input.sleeveEase ? input.sleeveEase : 0;
  return {
    ...input,
    measurementMode: mode,
    chest: sizes.body - bodyEase,
    bodyEase,
    upperArm: sizes.sleeve - sleeveEase,
    sleeveEase,
  };
}
