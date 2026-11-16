export function ClubChartPreview({
  pixels,
  title,
  aspect = 1,
  label = "Preview",
}: {
  pixels: string[][];
  title: string;
  aspect?: number;
  label?: string;
}) {
  return (
    <svg
      className="club-chart-preview"
      role="img"
      aria-label={`${label} of ${title}`}
      viewBox={`0 0 ${(pixels[0]?.length ?? 1) * aspect} ${pixels.length || 1}`}
      shapeRendering="crispEdges"
    >
      <g transform={`scale(${aspect} 1)`}>
        <ClubColorPaths pixels={pixels} />
      </g>
    </svg>
  );
}

export function ClubColorPaths({ pixels }: { pixels: string[][] }) {
  const paths = new Map<string, string[]>();
  for (const [y, row] of pixels.entries()) {
    for (let x = 0; x < row.length;) {
      const fill = row[x];
      let end = x + 1;
      while (row[end] === fill && end < row.length) end++;
      const segments = paths.get(fill) ?? [];
      segments.push(`M${x} ${y}h${end - x}v1H${x}z`);
      paths.set(fill, segments);
      x = end;
    }
  }
  return [...paths].map(([fill, segments]) => (
    <path key={fill} fill={fill} d={segments.join("")} />
  ));
}
