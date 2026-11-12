import type { YokeMeasurements } from "./yoke-plan";
import type { YokeMeasurementMode } from "./yoke-measurement-mode";
export type YokeField = Exclude<
  keyof YokeMeasurements,
  "unit" | "measurementMode"
>;
type Field = {
  key: YokeField;
  label: string;
  help?: string;
  optional?: boolean;
};
const fields: Field[] = [
  {
    key: "gaugeStitches",
    label: "Gauge stitches",
    help: "Count stitches across your blocked swatch.",
  },
  {
    key: "gaugeRows",
    label: "Gauge rows",
    help: "Count rows over the same measurement span.",
  },
  {
    key: "gaugeMeasure",
    label: "Gauge measured over",
    help: "The width and height of the square measured on your swatch, in the selected unit.",
  },
  {
    key: "neck",
    label: "Finished neck opening",
    help: "Full circumference along the base of the neckband. Do not double the straight width of a curved neck opening.",
  },
  {
    key: "chest",
    label: "Body chest / bust",
    help: "Tape around the fullest part of the torso, without added room. Enter ease separately.",
  },
  {
    key: "bodyEase",
    label: "Body ease",
    help: "Finished body circumference minus body chest/bust circumference. This is a design choice, not another tape measurement.",
  },
  {
    key: "upperArm",
    label: "Upper-arm circumference",
    help: "Around the fullest part of your relaxed upper arm. Measure your arm itself; enter sleeve ease separately.",
  },
  {
    key: "sleeveEase",
    label: "Sleeve ease",
    help: "Finished upper-sleeve circumference minus upper-arm circumference.",
  },
  {
    key: "underarm",
    label: "Each underarm width",
    help: "Width of the new stitches cast on at one underarm when separating the sleeves. This is a garment construction allowance, not the armhole circumference.",
  },
  {
    key: "depth",
    label: "Full-round yoke length",
    help: "Along the front fabric from the base of the neckline to the sleeve split. Not vertical armhole depth; excludes extra back short rows.",
  },
  {
    key: "backRise",
    label: "Extra back-neck height",
    help: "Extra fabric height at centre back compared with the front. Enter 0 to omit. Short-row turn positions are not generated yet.",
  },
  {
    key: "repeats",
    label: "Repeats around yoke",
    help: "How many copies of your motif go around the whole yoke. This is not a body measurement.",
  },
  {
    key: "shoulderCircumference",
    label: "Finished shoulder-level circumference",
    optional: true,
    help: "Around the entire yoke at the chosen shoulder line, including front, back and both sleeve portions. Use finished fabric, with desired room included—not shoulder width.",
  },
  {
    key: "shoulderLength",
    label: "Length to shoulder checkpoint",
    optional: true,
    help: "Along the front fabric from the base of the neckline to that same shoulder line. Enter both checkpoint fields, or leave both blank.",
  },
];
export function yokeMeasurementFields(mode: YokeMeasurementMode): Field[] {
  return fields
    .filter(
      (field) =>
        mode !== "finished" ||
        (field.key !== "bodyEase" && field.key !== "sleeveEase"),
    )
    .map((field) =>
      mode === "finished" && field.key === "chest"
        ? {
            ...field,
            label: "Finished body circumference",
            help: "Full circumference of the sweater body, with all desired room already included. For a straight body laid flat, measure just below the underarms and double that width.",
          }
        : mode === "finished" && field.key === "upperArm"
          ? {
              ...field,
              label: "Finished upper-sleeve circumference",
              help: "Full sleeve circumference just below the underarm, with desired room included. On a reference sweater, double its flat sleeve width measured across—not along—the sleeve.",
            }
          : field,
    );
}
export function yokeFieldInfo(key: YokeField, mode: YokeMeasurementMode) {
  return (
    yokeMeasurementFields(mode).find((field) => field.key === key) ??
    fields.find((field) => field.key === key)!
  );
}
export function measurementDrafts(measurements: YokeMeasurements) {
  return Object.fromEntries(
    fields.map(({ key }) => [
      key,
      measurements[key] === undefined ? "" : String(measurements[key]),
    ]),
  ) as Record<YokeField, string>;
}
export function readMeasurementDrafts(
  values: Record<YokeField, string>,
  unit: "cm" | "in",
  measurementMode: YokeMeasurementMode,
): YokeMeasurements {
  if (
    fields.some(({ key, optional }) => !optional && values[key].trim() === "")
  )
    throw new Error(
      "Fill in every measurement, using 0 for no ease or no short rows.",
    );
  return {
    ...Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => value.trim() !== "")
        .map(([key, value]) => [key, Number(value)]),
    ),
    unit,
    measurementMode,
  } as YokeMeasurements;
}
