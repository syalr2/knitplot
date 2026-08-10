import { generateChartGrid, ChartGridApiError, validateChartGrid } from "@/lib/openai/chart-grid";
import { claimAiRequest, resolveOpenAIKey } from "@/lib/openai/credentials";
import { hasValidRequestOrigin } from "@/lib/security/origin";

type EditRequest = {
  prompt?: unknown;
  width?: unknown;
  height?: unknown;
  colorCount?: unknown;
  colorMode?: unknown;
  minimumColors?: unknown;
  maximumColors?: unknown;
  layoutMode?: unknown;
  palette?: unknown;
  rows?: unknown;
};

export const runtime = "nodejs";
export const maxDuration = 180;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request)) return errorResponse("Invalid request origin.", 403);

  let body: EditRequest;
  try {
    body = await request.json() as EditRequest;
  } catch {
    return errorResponse("The edit request was not valid.", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const width = body.width;
  const height = body.height;
  const colorCount = body.colorCount;
  const colorMode = body.colorMode === "range" ? "range" : "exact";
  const minimumColors = body.minimumColors;
  const maximumColors = body.maximumColors;
  const layoutMode = body.layoutMode === "repeat" ? "repeat" : "motif";

  if (prompt.length < 3 || prompt.length > 800) {
    return errorResponse("Describe the change in between 3 and 800 characters.", 400);
  }
  const exactColorsAreValid = Number.isInteger(colorCount) && typeof colorCount === "number" && colorCount >= 2 && colorCount <= 8;
  const rangeColorsAreValid =
    Number.isInteger(minimumColors) && typeof minimumColors === "number" && minimumColors >= 2 && minimumColors <= 8 &&
    Number.isInteger(maximumColors) && typeof maximumColors === "number" && maximumColors >= minimumColors && maximumColors <= 8;
  if (
    !Number.isInteger(width) || typeof width !== "number" || width < 1 || width > 100 ||
    !Number.isInteger(height) || typeof height !== "number" || height < 1 || height > 100 ||
    (colorMode === "exact" ? !exactColorsAreValid : !rangeColorsAreValid)
  ) {
    return errorResponse("The chart settings were not valid.", 400);
  }
  const source = validateChartGrid({ palette: body.palette, rows: body.rows }, width, height, 2, 8, false);
  if (!source) return errorResponse("The source chart was not valid.", 400);

  const keyResult = await resolveOpenAIKey();
  if ("error" in keyResult) return errorResponse(keyResult.error, keyResult.status);
  const requestClaim = await claimAiRequest(keyResult.userId);
  if (!requestClaim.allowed) return errorResponse(requestClaim.message, 429);

  try {
    const chart = await generateChartGrid({
      apiKey: keyResult.key,
      prompt,
      width,
      height,
      minimumColors: colorMode === "exact" ? colorCount as number : minimumColors as number,
      maximumColors: colorMode === "exact" ? colorCount as number : maximumColors as number,
      layoutMode,
      source,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
    });
    return Response.json(chart, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChartGridApiError) return errorResponse(error.message, error.status);
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse("The chart edit took too long. Please try again.", 504);
    }
    return errorResponse("The app could not reach OpenAI. Please try again.", 502);
  }
}
