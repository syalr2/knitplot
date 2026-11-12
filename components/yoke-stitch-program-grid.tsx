"use client";
import { contrastTextColor, stitchActionLabel } from "@/lib/chart";
import {
  resolveYokeProgram,
  type YokeStitchProgram,
} from "@/lib/yoke-stitch-program";

export function YokeStitchProgramGrid({
  program,
  palette,
  section,
  onPick,
  countsOnly = false,
}: {
  program: YokeStitchProgram;
  palette: string[];
  section: number;
  onPick?: (round: number, operation: string) => void;
  countsOnly?: boolean;
}) {
  const rounds = resolveYokeProgram(program);
  const widths = program.startingCounts.map((_, s) =>
    Math.max(
      1,
      ...(countsOnly
        ? rounds.map((round) => round.sections[s].length)
        : program.rounds.map((round) => round[s].length)),
    ),
  );
  const offsets = widths.map(
    (_, s) => widths.slice(0, s).reduce((a, b) => a + b, 0) + s,
  );
  const width = (widths.reduce((a, b) => a + b, 0) + widths.length) * 24 + 44;
  const height = program.rounds.length * 26 + 34;
  return (
    <div className="yoke-program-grid-scroll">
      <svg
        role="img"
        aria-label={
          countsOnly
            ? "Recalculated stitch counts by repeat"
            : "Stitch instructions by repeat"
        }
        viewBox={`0 0 ${width} ${height}`}
        style={{ width, height }}
      >
        {widths.map((count, s) => (
          <g key={s}>
            <text
              x={44 + (offsets[s] + count / 2) * 24}
              y={18}
              textAnchor="middle"
              fontSize={11}
            >{`Repeat ${s + 1}`}</text>
          </g>
        ))}
        {program.rounds.map((repeatSections, r) => {
          const y = 30 + (program.rounds.length - 1 - r) * 26;
          return (
            <g key={r}>
              <text x={30} y={y + 16} textAnchor="end" fontSize={10}>
                {r + 1}
              </text>
              {repeatSections.map((ops, s) => {
                const items = countsOnly
                  ? rounds[r].sections[s].map((loop) => ({
                      id: loop.id,
                      action: loop.action,
                      color: loop.color,
                      owner: loop.operation,
                    }))
                  : ops.map((op) => ({ ...op, owner: op.id }));
                return (
                  <g key={s} opacity={onPick && s !== section ? 0.9 : 1}>
                    {items.map((op, c) => {
                      const color = palette[op.color] ?? palette[0];
                      const label =
                        op.action === "knit" ||
                        (c > 0 && items[c - 1].owner === op.owner)
                          ? ""
                          : stitchActionLabel(op.action);
                      return (
                        <g
                          key={op.id}
                          data-round={r}
                          data-repeat={s}
                          data-operation={op.id}
                          onClick={() => {
                            if (s === section) onPick?.(r, op.id);
                          }}
                          style={{
                            cursor:
                              onPick && s === section ? "crosshair" : "default",
                          }}
                        >
                          <rect
                            x={44 + (offsets[s] + c) * 24}
                            y={y}
                            width={24}
                            height={26}
                            fill={color}
                            stroke="#7c8277"
                            strokeWidth={0.5}
                          />
                          {label ? (
                            <text
                              x={56 + (offsets[s] + c) * 24}
                              y={y + 16}
                              fontSize={Math.min(8, 24 / label.length)}
                              textAnchor="middle"
                              fill={contrastTextColor(color)}
                              pointerEvents="none"
                            >
                              {label}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                    <text
                      x={44 + (offsets[s] + widths[s]) * 24 + 3}
                      y={y + 17}
                      fontSize={8}
                      fill="#4a594e"
                    >
                      {rounds[r].sections[s].length}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
