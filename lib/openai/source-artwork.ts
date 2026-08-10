import "server-only";

import type { ChartLayoutMode } from "@/lib/openai/chart-grid";

type SourceArtworkInput = {
  apiKey: string;
  prompt: string;
  width: number;
  height: number;
  chartAspect: number;
  minimumColors: number;
  maximumColors: number;
  layoutMode: ChartLayoutMode;
  signal: AbortSignal;
  reference?: {
    base64: string;
    mimeType: string;
    use: "subject" | "style";
  };
};

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: { code?: string; message?: string };
};

export class SourceArtworkApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SourceArtworkApiError";
  }
}

function imageSizeForAspect(inputAspect: number) {
  const aspect = Math.max(1 / 3, Math.min(3, inputAspect));
  const targetPixels = 1024 * 1024;
  const height = Math.sqrt(targetPixels / aspect);
  const width = height * aspect;
  const roundTo16 = (value: number) => Math.max(16, Math.round(value / 16) * 16);
  return `${roundTo16(width)}x${roundTo16(height)}`;
}

function smallChartGuidance(width: number, height: number) {
  if (Math.min(width, height) <= 18 || width * height <= 350) {
    return "The stitch budget is tiny. Use only a few large shapes, make essential features visually chunky, and remove nearly all decorative detail.";
  }
  if (Math.min(width, height) <= 30 || width * height <= 900) {
    return "The stitch budget is small. Use a bold silhouette and only a few large internal details.";
  }
  return "Keep all important features large enough to remain clear when translated into individual stitches.";
}

export async function generateSourceArtwork(input: SourceArtworkInput) {
  const colorRequirement = input.minimumColors === input.maximumColors
    ? `Use exactly ${input.minimumColors} clearly distinct flat colours total, including the background.`
    : `Use between ${input.minimumColors} and ${input.maximumColors} clearly distinct flat colours total, including the background.`;
  const layoutRequirement = input.layoutMode === "repeat"
    ? "Design one seamless repeating tile. The composition must continue naturally across its left/right and top/bottom edges, with no blank border."
    : "Design one centered motif with a small, even background margin.";
  const artworkPrompt = `
Create clean visual source artwork that will immediately be translated into a knitting chart exactly ${input.width} stitches wide by ${input.height} rows tall.

Subject: ${input.prompt}
${input.reference ? `Use the supplied image as a ${input.reference.use === "style" ? "visual style reference only; do not copy its subject unless requested" : "subject or composition reference"}.` : ""}

Hard requirements:
- Think in the very limited budget of ${input.width} × ${input.height} logical stitch blocks before composing the design.
- ${smallChartGuidance(input.width, input.height)}
- ${layoutRequirement}
- ${colorRequirement}
- Use flat, crisp pixel-art-like shapes with a bold, immediately readable silhouette.
- The finished physical width-to-height ratio is ${input.chartAspect.toFixed(3)} because knit stitches are rectangular.
- No gradients, lighting, shadows, texture, transparency, blur, antialiasing, lettering, numbers, borders, mockups, or visible grid lines.
- Fill the complete image with only the artwork and its background.
`.trim();

  let response: Response;
  if (input.reference) {
    const decoded = Buffer.from(input.reference.base64, "base64");
    if (!decoded.length) throw new SourceArtworkApiError("The reference image could not be read.", 400);
    const imageBytes = new ArrayBuffer(decoded.length);
    new Uint8Array(imageBytes).set(decoded);
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("image", new Blob([imageBytes], { type: input.reference.mimeType }), "colorwork-reference.png");
    form.append("prompt", artworkPrompt);
    form.append("n", "1");
    form.append("quality", "low");
    form.append("size", imageSizeForAspect(input.chartAspect));
    response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      cache: "no-store",
      signal: input.signal,
    });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: artworkPrompt,
        n: 1,
        quality: "low",
        size: imageSizeForAspect(input.chartAspect),
      }),
      cache: "no-store",
      signal: input.signal,
    });
  }

  let result: OpenAIImageResponse;
  try {
    result = await response.json() as OpenAIImageResponse;
  } catch {
    throw new SourceArtworkApiError("OpenAI returned an unreadable image response. Please try again.", 502);
  }
  if (!response.ok) {
    if (response.status === 401) throw new SourceArtworkApiError("The OpenAI API key was not accepted.", 502);
    if (response.status === 429) throw new SourceArtworkApiError("OpenAI is busy or the account limit was reached. Please try again shortly.", 429);
    if (result.error?.code === "moderation_blocked") {
      throw new SourceArtworkApiError("That request could not be generated. Try describing the motif differently.", 400);
    }
    throw new SourceArtworkApiError("OpenAI could not create the source design. Please try again.", 502);
  }
  const image = result.data?.[0]?.b64_json;
  if (!image) throw new SourceArtworkApiError("OpenAI did not return a source design. Please try again.", 502);
  return image;
}
