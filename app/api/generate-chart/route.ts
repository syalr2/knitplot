type GenerateRequest = {
  prompt?: unknown;
  width?: unknown;
  height?: unknown;
  colorCount?: unknown;
  colorMode?: unknown;
  minimumColors?: unknown;
  maximumColors?: unknown;
  chartAspect?: unknown;
  referenceImage?: unknown;
  referenceMimeType?: unknown;
  referenceUse?: unknown;
};

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string }>;
  error?: {
    code?: string;
    message?: string;
    type?: string;
  };
};

export const runtime = "nodejs";
export const maxDuration = 180;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function imageSizeForAspect(inputAspect: number) {
  const aspect = Math.max(1 / 3, Math.min(3, inputAspect));
  const targetPixels = 1024 * 1024;
  const height = Math.sqrt(targetPixels / aspect);
  const width = height * aspect;
  const roundTo16 = (value: number) => Math.max(16, Math.round(value / 16) * 16);
  return `${roundTo16(width)}x${roundTo16(height)}`;
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = await request.json() as GenerateRequest;
  } catch {
    return errorResponse("The generation request was not valid.", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const width = body.width;
  const height = body.height;
  const colorCount = body.colorCount;
  const colorMode = body.colorMode === "range" ? "range" : "exact";
  const minimumColors = body.minimumColors;
  const maximumColors = body.maximumColors;
  const chartAspect = body.chartAspect;
  const referenceImage = typeof body.referenceImage === "string" ? body.referenceImage : "";
  const referenceMimeType = typeof body.referenceMimeType === "string" ? body.referenceMimeType : "image/png";
  const referenceUse = body.referenceUse === "style" ? "style" : "subject";

  if (prompt.length < 3 || prompt.length > 800) {
    return errorResponse("Describe the motif in between 3 and 800 characters.", 400);
  }
  const exactColorsAreValid = Number.isInteger(colorCount) && typeof colorCount === "number" && colorCount >= 2 && colorCount <= 8;
  const rangeColorsAreValid =
    Number.isInteger(minimumColors) && typeof minimumColors === "number" && minimumColors >= 2 && minimumColors <= 8 &&
    Number.isInteger(maximumColors) && typeof maximumColors === "number" && maximumColors >= minimumColors && maximumColors <= 8;
  if (
    !Number.isInteger(width) || typeof width !== "number" || width < 1 || width > 100 ||
    !Number.isInteger(height) || typeof height !== "number" || height < 1 || height > 100 ||
    (colorMode === "exact" ? !exactColorsAreValid : !rangeColorsAreValid) ||
    typeof chartAspect !== "number" || !Number.isFinite(chartAspect) || chartAspect <= 0
  ) {
    return errorResponse("The chart settings were not valid.", 400);
  }
  if (
    referenceImage &&
    (referenceImage.length > 25_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(referenceMimeType))
  ) {
    return errorResponse("The reference image was not valid.", 400);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return errorResponse("OpenAI is not configured for this app yet.", 503);
  }

  const colorRequirement = colorMode === "exact"
    ? `Use exactly ${colorCount} clearly distinct solid colors total, including one single-color background.`
    : `Use between ${minimumColors} and ${maximumColors} clearly distinct solid colors total, including one single-color background. Choose the smallest number in that range that preserves the important visual information.`;

  const generationPrompt = `
Create clean source artwork for an editable stranded-colorwork knitting chart.

Subject: ${prompt}
${referenceImage ? `Reference image: Use the supplied image as a ${referenceUse === "style" ? "visual style reference only; do not copy its subject unless requested" : "subject and composition reference"}.` : ""}

Hard requirements:
- Flat, crisp pixel-art style with a bold, immediately readable silhouette.
- The target chart is exactly ${width} stitches wide by ${height} rows tall.
- The finished chart has a physical width-to-height ratio of ${chartAspect.toFixed(3)} because knit stitches are rectangular.
- ${colorRequirement}
- Every conceptual stitch must resolve to one color only.
- No gradients, lighting, shadows, texture, transparency, blur, antialiasing, lettering, numbers, borders, or visible grid lines.
- Keep important details large enough to survive conversion to a ${width} by ${height} chart.
- Center the motif and leave a small, even margin around it. Do not add unrelated objects.
- Fill the entire image with the artwork and background; output only the image.
`.trim();

  try {
    let response: Response;
    if (referenceImage) {
      const decoded = Buffer.from(referenceImage, "base64");
      if (!decoded.length) return errorResponse("The reference image could not be read.", 400);
      const imageBytes = new ArrayBuffer(decoded.length);
      new Uint8Array(imageBytes).set(decoded);
      const form = new FormData();
      form.append("model", "gpt-image-2");
      form.append("image", new Blob([imageBytes], { type: referenceMimeType }), "colorwork-reference.png");
      form.append("prompt", generationPrompt);
      form.append("n", "1");
      form.append("quality", "low");
      form.append("size", imageSizeForAspect(chartAspect));
      response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
      });
    } else {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: generationPrompt,
          n: 1,
          quality: "low",
          size: imageSizeForAspect(chartAspect),
        }),
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
      });
    }
    const result = await response.json() as OpenAIImageResponse;

    if (!response.ok) {
      if (response.status === 401) return errorResponse("The OpenAI API key was not accepted.", 502);
      if (response.status === 429) return errorResponse("OpenAI is busy or the account limit was reached. Please try again shortly.", 429);
      if (result.error?.code === "moderation_blocked") {
        return errorResponse("That request could not be generated. Try describing the motif differently.", 400);
      }
      return errorResponse("OpenAI could not generate this image. Please try again.", 502);
    }

    const image = result.data?.[0]?.b64_json;
    if (!image) return errorResponse("OpenAI did not return an image. Please try again.", 502);

    return Response.json(
      { image, mimeType: "image/png" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse("Image generation took too long. Please try again.", 504);
    }
    return errorResponse("The app could not reach OpenAI. Please try again.", 502);
  }
}
