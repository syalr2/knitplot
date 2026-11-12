import type { ChartDocument } from "@/lib/chart";
import { yokeWrittenRounds } from "@/lib/yoke-knit";
import { planYokeShortRows, shortRowInstructions } from "@/lib/yoke-short-rows";

export function YokeInstructionsSheet({
  document,
}: {
  document: ChartDocument;
}) {
  const project = document.yoke!;
  const { repeatCount, rounds } = yokeWrittenRounds(project);
  const repeatInstruction =
    repeatCount > 1
      ? `Work each listed sequence ${repeatCount} times per round.`
      : null;
  let shortRows: string[] = [];
  if (project.measurements.backRise) {
    try {
      const plan = planYokeShortRows(project.measurements, project.shortRows);
      if (plan.extraRows) shortRows = shortRowInstructions(plan);
    } catch {
      shortRows = [
        "Review the back-neck turn positions in Edit shaping before starting Round 1.",
      ];
    }
  }
  return (
    <article className="instruction-sheet">
      <header className="instruction-title-block">
        <p className="eyebrow">Circular colourwork yoke</p>
        <h1>{document.name || "Untitled yoke"}</h1>
        <p>
          {rounds.length} rounds · {rounds[0].startingStitches} stitches at the
          neck · {rounds.at(-1)!.endingStitches} stitches at the lower edge
        </p>
        <p>
          Gauge: {document.gaugeStitches} stitches and {document.gaugeRows}{" "}
          rounds over {document.gaugeMeasure} {document.gaugeUnit}.
        </p>
      </header>
      <section className="instruction-section">
        <h2>Colour key</h2>
        <div className="instruction-colours">
          {project.palette.map((hex, i) => (
            <div key={i}>
              <span
                className="instruction-swatch"
                style={{ background: hex }}
              />
              <strong>{i === 0 ? "MC" : `CC${i}`}</strong>
              <code>{hex.toUpperCase()}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="instruction-section">
        <h2>How to work the yoke</h2>
        <p>
          Work in the round, starting at centre back. Follow the sequences in
          the order written. Colour counts are ordinary knit stitches; shaping
          and other stitch actions are marked separately. Use the main colour
          for stitch actions unless a contrast colour is shown in parentheses.
        </p>
        <p>
          {repeatInstruction ?? "Work each listed sequence once per round."}{" "}
          Stitch totals are for the whole round.
        </p>
      </section>
      {shortRows.length ? (
        <section className="instruction-section">
          <h2>Back-neck short rows</h2>
          {shortRows.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ) : null}
      <section className="instruction-section written-instructions">
        <h2>Written rounds</h2>
        {repeatInstruction ? <p>{repeatInstruction}</p> : null}
        <ol className="written-row-list">
          {rounds.map((round) => (
            <li key={round.number}>
              <strong>Round {round.number}</strong>
              <div>{round.sequence}</div>
              <small className="written-row-math">
                {round.startingStitches} sts in → {round.endingStitches} sts out{" "}
                ({round.change > 0 ? "+" : ""}
                {round.change})
              </small>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
