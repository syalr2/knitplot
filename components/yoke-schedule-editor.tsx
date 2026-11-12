"use client";
import { suggestIncreasePositions, type IncreaseEvent } from "@/lib/yoke-plan";
export type ScheduleDraft = {
  round: string;
  count: string;
  positions: string;
  stitch: "m1l" | "m1r";
};
export function scheduleDrafts(events: IncreaseEvent[]): ScheduleDraft[] {
  return events.map((event) => ({
    round: String(event.round),
    count: String(event.count),
    positions:
      event.placements
        ?.map(
          (slot, index) =>
            `${slot + 1}${event.directions?.[index] === "m1l" ? "L" : event.directions?.[index] === "m1r" ? "R" : ""}`,
        )
        .join(", ") ?? "",
    stitch: event.stitch ?? "m1l",
  }));
}
export function YokeScheduleEditor({
  schedule,
  onChange,
  neck,
  repeats,
}: {
  schedule: ScheduleDraft[];
  onChange: (value: ScheduleDraft[]) => void;
  neck: number;
  repeats: number;
}) {
  function update(index: number, patch: Partial<ScheduleDraft>) {
    onChange(
      schedule.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    );
  }
  return (
    <div className="yoke-schedule-editor">
      {schedule.map((entry, index) => {
        let suggested = "Check stitch counts first";
        try {
          suggested = suggestIncreasePositions(
            (index ? Number(schedule[index - 1].count) : neck) / repeats,
            Number(entry.count) / repeats,
          )
            .map((slot) => slot + 1)
            .join(", ");
        } catch {
          /* Incomplete numeric drafts are allowed while typing. */
        }
        return (
          <fieldset key={index}>
            <legend>Increase round {index + 1}</legend>
            <div className="yoke-schedule">
              <div>
                <label>
                  Round
                  <input
                    aria-label={`Increase ${index + 1} round`}
                    type="number"
                    value={entry.round}
                    onChange={(event) =>
                      update(index, { round: event.target.value })
                    }
                  />
                </label>
                <label>
                  Stitches after
                  <input
                    aria-label={`Increase ${index + 1} stitches`}
                    type="number"
                    value={entry.count}
                    onChange={(event) =>
                      update(index, { count: event.target.value })
                    }
                  />
                </label>
                <button
                  onClick={() =>
                    onChange(schedule.filter((_, i) => i !== index))
                  }
                  aria-label={`Remove increase ${index + 1}`}
                >
                  ×
                </button>
              </div>
            </div>
            <label>
              Increase stitch
              <select
                aria-label={`Increase ${index + 1} stitch type`}
                value={entry.stitch}
                onChange={(event) =>
                  update(index, { stitch: event.target.value as "m1l" | "m1r" })
                }
              >
                <option value="m1l">M1L</option>
                <option value="m1r">M1R</option>
              </select>
            </label>
            <label>
              New-stitch positions in repeat, left → right
              <input
                aria-label={`Increase ${index + 1} positions`}
                value={entry.positions}
                placeholder="Use suggested positions"
                onChange={(event) =>
                  update(index, { positions: event.target.value })
                }
              />
            </label>
            <small>
              Suggested: {suggested}. Add L or R for individual directions, e.g.
              3L, 7R.
            </small>
            <button
              className="secondary-button"
              disabled={suggested === "Check stitch counts first"}
              onClick={() => update(index, { positions: suggested })}
            >
              Use suggested positions
            </button>
          </fieldset>
        );
      })}
      <button
        className="secondary-button"
        onClick={() =>
          onChange([
            ...schedule,
            { round: "", count: "", positions: "", stitch: "m1l" },
          ])
        }
      >
        + Increase round
      </button>
    </div>
  );
}
