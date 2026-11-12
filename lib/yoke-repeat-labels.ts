// The editor's front half spans one-quarter to three-quarters of a round.
// Use repeat midpoints to give side-crossing repeats a single stable label.
const frontStart = (count: number) => Math.ceil(count / 4 - 0.5);
const frontEnd = (count: number) => Math.ceil((3 * count) / 4 - 0.5);

export function yokeRepeatNumber(section: number, count: number) {
  return ((section - frontStart(count) + count) % count) + 1;
}

export function yokeRepeatSides(count: number) {
  const start = frontStart(count);
  const frontCount = frontEnd(count) - start;
  return (["Front", "Back"] as const).map((name, side) => {
    const first = side === 0 ? 0 : frontCount;
    const last = side === 0 ? frontCount : count;
    return {
      name,
      repeats: Array.from({ length: last - first }, (_, i) => ({
        number: first + i + 1,
        section: (first + i + start) % count,
      })),
    };
  });
}

export function yokeRepeatList(sections: readonly number[], count: number) {
  const numbers = sections
    .map((section) => yokeRepeatNumber(section, count))
    .sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  for (const number of numbers) {
    const previous = ranges.at(-1);
    if (previous && previous.end + 1 === number) previous.end = number;
    else ranges.push({ start: number, end: number });
  }
  return ranges
    .map(({ start, end }) =>
      end - start < 2
        ? start === end
          ? String(start)
          : `${start}, ${end}`
        : `${start}–${end}`,
    )
    .join(", ");
}
