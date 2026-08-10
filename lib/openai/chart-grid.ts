import "server-only";

export type ChartLayoutMode = "motif" | "repeat";

export type ChartGrid = {
  palette: string[];
  rows: string[];
};

type ReferenceImage = {
  base64: string;
  mimeType: string;
  use: "subject" | "style";
};

type GenerateChartGridInput = {
  apiKey: string;
  prompt: string;
  width: number;
  height: number;
  minimumColors: number;
  maximumColors: number;
  layoutMode: ChartLayoutMode;
  signal: AbortSignal;
  reference?: ReferenceImage;
  source?: ChartGrid;
};

type ResponsesApiResult = {
  error?: { code?: string; message?: string };
  incomplete_details?: { reason?: string };
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
};

export class ChartGridApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ChartGridApiError";
  }
}

function detailGuidance(width: number, height: number) {
  const smallerSide = Math.min(width, height);
  const cells = width * height;
  if (smallerSide <= 18 || cells <= 350) {
    return "This is a very small chart. Use an extremely simple, bold design with very few shapes. Make important features at least 2 stitches thick where possible and omit decorative detail.";
  }
  if (smallerSide <= 30 || cells <= 900) {
    return "This is a small chart. Use a bold silhouette, limit small details, and reserve isolated single stitches for only the most important accents.";
  }
  return "Use the available stitches deliberately. Avoid detail that would be illegible when each character becomes one stitch.";
}

function extractOutputText(result: ResponsesApiResult) {
  for (const output of result.output ?? []) {
    for (const content of output.content ?? []) {
      if (content.type === "refusal" && content.refusal) {
        throw new ChartGridApiError("That request could not be generated. Try describing the motif differently.", 400);
      }
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

export function validateChartGrid(
  value: unknown,
  width: number,
  height: number,
  minimumColors: number,
  maximumColors: number,
  requireEveryColor = true,
): ChartGrid | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { palette?: unknown; rows?: unknown };
  if (!Array.isArray(candidate.palette) || !Array.isArray(candidate.rows)) return null;
  if (candidate.palette.length < minimumColors || candidate.palette.length > maximumColors) return null;
  if (candidate.rows.length !== height) return null;

  const palette = candidate.palette.filter((color): color is string =>
    typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color),
  );
  if (palette.length !== candidate.palette.length) return null;
  if (new Set(palette.map((color) => color.toLowerCase())).size !== palette.length) return null;

  const rows = candidate.rows.filter((row): row is string => typeof row === "string");
  if (rows.length !== height || rows.some((row) => row.length !== width)) return null;
  const used = new Set<number>();
  for (const row of rows) {
    for (const character of row) {
      if (!/^[0-7]$/.test(character)) return null;
      const index = Number(character);
      if (!Number.isInteger(index) || index < 0 || index >= palette.length) return null;
      used.add(index);
    }
  }
  if (requireEveryColor && used.size !== palette.length) return null;
  return { palette: palette.map((color) => color.toLowerCase()), rows };
}

export async function generateChartGrid(input: GenerateChartGridInput): Promise<ChartGrid> {
  const exactColors = input.minimumColors === input.maximumColors;
  const colorRequirement = exactColors
    ? `Use exactly ${input.minimumColors} colours, including the background, and use every palette colour in the grid.`
    : `Use between ${input.minimumColors} and ${input.maximumColors} colours, including the background. Use the fewest colours that clearly express the design, and use every listed palette colour.`;
  const layoutRequirement = input.layoutMode === "repeat"
    ? "The entire grid is one seamless repeating tile. Continue the pattern cleanly across both the left/right and top/bottom edges. Do not add a blank border or a centered isolated motif. Favor rhythmic Nordic-style geometry and symmetry when appropriate to the request."
    : "Create one centered motif. Put the main background colour at palette index 0 and leave a small, even background margin where the design allows.";
  const sourceRequirement = input.source
    ? `\nCurrent chart to edit (palette indexes correspond to the rows):\n${JSON.stringify(input.source)}\nPreserve everything the edit request does not ask to change.`
    : "";
  const instruction = input.source
    ? `Edit this existing knitting chart: ${input.prompt}`
    : `Create this knitting chart: ${input.prompt}`;

  const prompt = `${instruction}

You are producing the final editable stitch chart itself, not source artwork and not a picture of knitting.

Hard requirements:
- The chart is exactly ${input.width} stitches wide by ${input.height} rows tall.
- Return exactly ${input.height} row strings. Every row string must contain exactly ${input.width} characters.
- Each character is one stitch and must be a single digit referring to its zero-based palette index.
- Row 0 is the visual top of the design.
- ${colorRequirement}
- Palette values must be distinct six-digit hex colours such as #2f493d.
- Each stitch has exactly one flat colour. No gradients, texture, shadows, transparency, antialiasing, lettering, grid lines, or metadata inside the chart.
- ${detailGuidance(input.width, input.height)}
- ${layoutRequirement}
${sourceRequirement}`.trim();

  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  if (input.reference) {
    content.push({
      type: "input_image",
      image_url: `data:${input.reference.mimeType};base64,${input.reference.base64}`,
      detail: "high",
    });
    content[0] = {
      type: "input_text",
      text: `${prompt}\nThe supplied image is a ${input.reference.use === "style" ? "style reference only; do not copy its subject unless the request says to" : "subject or composition reference"}. Simplify it aggressively to fit the exact stitch grid.`,
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CHART_MODEL?.trim() || "gpt-5.6",
      store: false,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "knitting_chart_grid",
          strict: true,
          schema: {
            type: "object",
            properties: {
              palette: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "string" } },
            },
            required: ["palette", "rows"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 20_000,
    }),
    cache: "no-store",
    signal: input.signal,
  });

  let result: ResponsesApiResult;
  try {
    result = await response.json() as ResponsesApiResult;
  } catch {
    throw new ChartGridApiError("OpenAI returned an unreadable response. Please try again.", 502);
  }

  if (!response.ok) {
    if (response.status === 401) throw new ChartGridApiError("The OpenAI API key was not accepted.", 502);
    if (response.status === 429) throw new ChartGridApiError("OpenAI is busy or the account limit was reached. Please try again shortly.", 429);
    if (result.error?.code === "moderation_blocked") {
      throw new ChartGridApiError("That request could not be generated. Try describing the motif differently.", 400);
    }
    throw new ChartGridApiError("OpenAI could not generate this chart. Please try again.", 502);
  }

  if (result.incomplete_details) {
    throw new ChartGridApiError("OpenAI did not finish the chart. Please try again.", 502);
  }

  const outputText = extractOutputText(result);
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new ChartGridApiError("OpenAI returned an incomplete chart. Please try again.", 502);
  }
  const chart = validateChartGrid(parsed, input.width, input.height, input.minimumColors, input.maximumColors);
  if (!chart) {
    throw new ChartGridApiError("OpenAI did not keep to the exact chart size. Please try once more.", 502);
  }
  return chart;
}
