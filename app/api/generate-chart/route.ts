import { claimAiRequest, resolveOpenAIKey } from "@/lib/openai/credentials";
import {
  generateSourceArtwork,
  SourceArtworkApiError,
} from "@/lib/openai/source-artwork";
import { hasValidRequestOrigin } from "@/lib/security/origin";
import { errorResponse, readJsonObject } from "@/lib/http";
import { generateRequestSchema, readAiRequest } from "@/lib/ai-request";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!hasValidRequestOrigin(request))
    return errorResponse("Invalid request origin.", 403);

  let body;
  try {
    body = readAiRequest(generateRequestSchema, await readJsonObject(request));
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
    chartAspect,
    referenceImage,
    referenceMimeType,
    referenceUse,
  } = body;

  const keyResult = await resolveOpenAIKey();
  if ("error" in keyResult)
    return errorResponse(keyResult.error, keyResult.status);
  const requestClaim = await claimAiRequest(keyResult.userId);
  if (!requestClaim.allowed) return errorResponse(requestClaim.message, 429);

  try {
    const minimum =
      colorMode === "exact"
        ? (colorCount as number)
        : (minimumColors as number);
    const maximum =
      colorMode === "exact"
        ? (colorCount as number)
        : (maximumColors as number);
    const operationSignal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(150_000),
    ]);
    const sourceArtwork = await generateSourceArtwork({
      apiKey: keyResult.key,
      prompt,
      width,
      height,
      chartAspect,
      minimumColors: minimum,
      maximumColors: maximum,
      layoutMode,
      reference: referenceImage
        ? {
            base64: referenceImage,
            mimeType: referenceMimeType,
            use: referenceUse,
          }
        : undefined,
      signal: operationSignal,
    });
    return Response.json(
      { image: sourceArtwork.base64, mimeType: sourceArtwork.mimeType },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SourceArtworkApiError)
      return errorResponse(error.message, error.status);
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse(
        "Chart generation took too long. Please try again.",
        504,
      );
    }
    return errorResponse(
      "The app could not reach OpenAI. Please try again.",
      502,
    );
  }
}
