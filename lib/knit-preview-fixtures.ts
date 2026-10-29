import { ChartDocument, defaultDocument, StitchAction } from "./chart";

// Synthetic diagnostic charts. Counts are in knitting order (bottom to top),
// with real increase/decrease actions, not just rows padded with placeholders.
export function shapingFixture(
  start: number,
  end: number,
  height: number,
  profile: "even" | "steps" | "late" = "even",
  placement: "distributed" | "left" | "centre" = "distributed",
): ChartDocument {
  const width = Math.max(start, end);
  const counts = Array.from({ length: height }, (_, i) => {
    const t = i / (height - 1);
    const progress =
      profile === "steps"
        ? Math.floor(t * 4) / 4
        : profile === "late"
          ? t * t * t
          : t;
    return Math.round(start + (end - start) * progress);
  });
  const actions = counts.map((count, r): StitchAction[] => {
    const delta = r ? count - counts[r - 1] : 0;
    const shaping = new Set(
      Array.from({ length: Math.abs(delta) }, (_, i) =>
        placement === "left"
          ? i + 1
          : placement === "centre"
            ? Math.floor((count - Math.abs(delta)) / 2) + i
            : Math.floor(((i + 0.5) * count) / Math.abs(delta)),
      ),
    );
    return Array.from({ length: width }, (_, c) =>
      c >= count
        ? "no-stitch"
        : shaping.has(c)
          ? delta > 0
            ? c % 2
              ? "m1l"
              : "m1r"
            : c % 2
              ? "ssk"
              : "k2tog"
          : "knit",
    );
  });
  const cells = counts.map((count, r) =>
    Array.from({ length: width }, (_, c) => {
      const band = Math.floor(r / 4) % 4;
      const motif = Math.abs((c / Math.max(1, count - 1)) * 2 - 1);
      return band === 0 || Math.abs(motif - 0.45) < 0.12 ? "accent" : "base";
    }),
  );
  return {
    ...defaultDocument,
    name: `${start} to ${end} stitches`,
    width,
    height,
    palette: [
      { id: "base", hex: "#C7D6BD" },
      { id: "accent", hex: "#38554A" },
    ],
    cells: cells.reverse(),
    stitchActions: actions.reverse(),
  };
}

export const fanFixtures = [
  {
    name: "Shallow growth",
    start: 24,
    end: 30,
    rows: 40,
    profile: "even" as const,
    expected: true,
  },
  {
    name: "Moderate growth",
    start: 18,
    end: 36,
    rows: 40,
    profile: "even" as const,
    expected: true,
  },
  {
    name: "Steep growth",
    start: 16,
    end: 40,
    rows: 40,
    profile: "even" as const,
    expected: true,
  },
  {
    name: "Decreasing",
    start: 40,
    end: 20,
    rows: 40,
    profile: "even" as const,
    expected: true,
  },
  {
    name: "Four increase bands",
    start: 24,
    end: 40,
    rows: 48,
    profile: "steps" as const,
    expected: true,
  },
  {
    name: "Late concentrated growth",
    start: 20,
    end: 48,
    rows: 40,
    profile: "late" as const,
    expected: true,
  },
  {
    name: "Very steep growth",
    start: 12,
    end: 48,
    rows: 20,
    profile: "even" as const,
    expected: false,
  },
  {
    name: "No shaping",
    start: 32,
    end: 32,
    rows: 40,
    profile: "even" as const,
    expected: false,
  },
];

// Same increase schedule, different placement. Colours follow existing loops,
// rather than being redrawn at a fraction of each row's changing width.
export function edgeShapingFixture(
  placement: "both" | "left" | "distributed" | "plain",
): ChartDocument {
  const width = 40,
    height = 33;
  let previous: string[] = Array.from({ length: 24 }, (_, c) =>
    c === 7 || c === 8 || c === 15 || c === 16 ? "accent" : "base",
  );
  const cells: string[][] = [],
    actions: StitchAction[][] = [];
  for (let r = 0; r < height; r++) {
    const increase = placement !== "plain" && r > 0 && r % 4 === 0;
    const count = previous.length + (increase ? 2 : 0);
    const positions = increase
      ? placement === "both"
        ? [1, count - 2]
        : placement === "left"
          ? [1, 2]
          : [Math.floor(count / 3), Math.floor((2 * count) / 3)]
      : [];
    let parent = 0;
    const colours: string[] = [],
      row: StitchAction[] = [];
    for (let c = 0; c < count; c++) {
      const added = positions.includes(c);
      row.push(added ? (c < count / 2 ? "m1r" : "m1l") : "knit");
      colours.push(added ? "base" : previous[parent++]);
    }
    previous = colours;
    cells.push([...colours, ...Array(width - count).fill("base")]);
    actions.push([
      ...row,
      ...Array<StitchAction>(width - count).fill("no-stitch"),
    ]);
  }
  return {
    ...defaultDocument,
    name: `Edge shaping: ${placement}`,
    width,
    height,
    gaugeStitches: 20,
    gaugeRows: 24,
    palette: [
      { id: "base", hex: "#C7D6BD" },
      { id: "accent", hex: "#38554A" },
    ],
    cells: cells.reverse(),
    stitchActions: actions.reverse(),
  };
}
