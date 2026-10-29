import {
  generateChartGrid,
  ChartGridApiError,
  validateChartGrid,
} from "@/lib/openai/chart-grid";
import { claimAiRequest, resolveOpenAIKey } from "@/lib/openai/credentials";
import { hasValidRequestOrigin } from "@/lib/security/origin";
import { errorResponse, readJsonObject } from "@/lib/http";
import { editRequestSchema, readAiRequest } from "@/lib/ai-request";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);

  let body;
  try {
    body = readAiRequest(editRequestSchema, await readJsonObject(request));
  } catch {
    return errorResponse(
      "The AI request settings or reference image were not valid.",
      400,
    );
  }
  const {
    prompt,
    width,
    height,
    colorMode,
    colorCount,
    minimumColors,
    maximumColors,
    layoutMode,
  } = body;

  const source = validateChartGrid(
    { palette: body.palette, rows: body.rows },
    width,
    height,
    2,
    8,
    false,
  );
  if (!source) return errorResponse("The source chart was not valid.", 400);

  const keyResult = await resolveOpenAIKey();
  if ("error" in keyResult)
    return errorResponse(keyResult.error, keyResult.status);
  const requestClaim = await claimAiRequest(keyResult.userId);
  if (!requestClaim.allowed) return errorResponse(requestClaim.message, 429);

  try {
    const chart = await generateChartGrid({
      apiKey: keyResult.key,
      prompt,
      width,
      height,
      minimumColors:
        colorMode === "exact"
          ? (colorCount as number)
          : (minimumColors as number),
      maximumColors:
        colorMode === "exact"
          ? (colorCount as number)
          : (maximumColors as number),
      layoutMode,
      source,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(150_000)]),
    });
    return Response.json(chart, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChartGridApiError)
      return errorResponse(error.message, error.status);
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse(
        "The chart edit took too long. Please try again.",
        504,
      );
    }
    return errorResponse(
      "The app could not reach OpenAI. Please try again.",
      502,
    );
  }
}
