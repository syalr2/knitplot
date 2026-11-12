import type { yokeRoundingReview } from "@/lib/yoke-rounding";

export function YokeRoundingReview({
  review,
  unit,
  accepted,
  onAccept,
  onRepeats,
}: {
  review: ReturnType<typeof yokeRoundingReview>;
  unit: "cm" | "in";
  accepted: boolean;
  onAccept: (value: boolean) => void;
  onRepeats: (value: number) => void;
}) {
  if (!review.changes.length) return null;
  return (
    <section
      className="yoke-rounding-review"
      aria-label="Review adjusted measurements"
    >
      <h3>Check the adjusted measurements</h3>
      <p>Fitting whole repeats changes these measurements by more than 5%:</p>
      <ul>
        {review.changes.map((change) => (
          <li key={change.name}>
            {change.name}: {change.requested.toFixed(1)} →{" "}
            <strong>
              {change.actual.toFixed(1)} {unit}
            </strong>{" "}
            ({change.percent > 0 ? "+" : ""}
            {change.percent.toFixed(1)}%)
          </li>
        ))}
      </ul>
      {review.alternatives.length ? (
        <>
          <p>
            Other repeat counts give a closer neck opening. They also change the
            motif width and body rounding:
          </p>
          {review.alternatives.map((option) => (
            <button
              key={option.repeats}
              type="button"
              onClick={() => onRepeats(option.repeats)}
            >
              Try {option.repeats} repeats · neck {option.neck.toFixed(1)}, body{" "}
              {option.body.toFixed(1)} {unit}
            </button>
          ))}
        </>
      ) : null}
      <label>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAccept(event.target.checked)}
        />
        Use these adjusted measurements
      </label>
    </section>
  );
}
