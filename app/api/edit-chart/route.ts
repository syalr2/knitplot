type EditRequest = {
  prompt?: unknown;
  image?: unknown;
  mimeType?: unknown;
  width?: unknown;
  height?: unknown;
  colorCount?: unknown;
  colorMode?: unknown;
  minimumColors?: unknown;
  maximumColors?: unknown;
  chartAspect?: unknown;
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
  let body: EditRequest;
  try {
    body = await request.json() as EditRequest;
  } catch {
    return errorResponse("The edit request was not valid.", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const image = typeof body.image === "string" ? body.image : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/png";
  const width = body.width;
  const height = body.height;
  const colorCount = body.colorCount;
  const colorMode = body.colorMode === "range" ? "range" : "exact";
  const minimumColors = body.minimumColors;
  const maximumColors = body.maximumColors;
  const chartAspect = body.chartAspect;

  if (prompt.length < 3 || prompt.length > 800) {
    return errorResponse("Describe the change in between 3 and 800 characters.", 400);
  }
  if (!image || image.length > 25_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    return errorResponse("The source image was not valid.", 400);
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return errorResponse("OpenAI is not configured for this app yet.", 503);

  const colorRequirement = colorMode === "exact"
    ? `Use exactly ${colorCount} clearly distinct solid colors total, including one single-color background.`
    : `Use between ${minimumColors} and ${maximumColors} clearly distinct solid colors total, including one single-color background. Choose the smallest number in that range that preserves the important visual information.`;

  let imageBytes: ArrayBuffer;
  try {
    const decoded = Buffer.from(image, "base64");
    if (!decoded.length) throw new Error("Empty image");
    imageBytes = new ArrayBuffer(decoded.length);
    new Uint8Array(imageBytes).set(decoded);
  } catch {
    return errorResponse("The source image could not be read.", 400);
  }

  const editPrompt = `
Edit the supplied colorwork source artwork according to this request: ${prompt}

Preserve the existing motif, composition, pose, and all details that the request does not ask to change.

Hard requirements for the edited result:
- Flat, crisp pixel-art style with a bold, immediately readable silhouette.
- It must remain suitable for a chart exactly ${width} stitches wide by ${height} rows tall.
- Keep the physical width-to-height ratio at ${chartAspect.toFixed(3)} because knit stitches are rectangular.
- ${colorRequirement}
- Every conceptual stitch must resolve to one color only.
- No gradients, lighting, shadows, texture, transparency, blur, antialiasing, lettering, numbers, borders, or visible grid lines.
- Keep important details large enough to survive conversion to a ${width} by ${height} chart.
- Fill the entire image with the artwork and background; output only the edited image.
`.trim();

  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("image", new Blob([imageBytes], { type: mimeType }), "colorwork-source.png");
  form.append("prompt", editPrompt);
  form.append("n", "1");
  form.append("quality", "low");
  form.append("size", imageSizeForAspect(chartAspect));

  try {
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
    });
    const result = await response.json() as OpenAIImageResponse;

    if (!response.ok) {
      if (response.status === 401) return errorResponse("The OpenAI API key was not accepted.", 502);
      if (response.status === 429) return errorResponse("OpenAI is busy or the account limit was reached. Please try again shortly.", 429);
      if (result.error?.code === "moderation_blocked") {
        return errorResponse("That edit could not be made. Try describing the change differently.", 400);
      }
      return errorResponse("OpenAI could not edit this image. Please try again.", 502);
    }

    const editedImage = result.data?.[0]?.b64_json;
    if (!editedImage) return errorResponse("OpenAI did not return an edited image. Please try again.", 502);

    return Response.json(
      { image: editedImage, mimeType: "image/png" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse("The image edit took too long. Please try again.", 504);
    }
    return errorResponse("The app could not reach OpenAI. Please try again.", 502);
  }
}
