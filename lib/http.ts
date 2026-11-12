/** Errors safe to show to a user; infrastructure errors must use a generic message. */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
export function errorResponse(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
export async function readJsonObject(
  request: Request,
  limit?: { bytes: number; message: string },
) {
  try {
    const value: unknown = limit
      ? JSON.parse(await readLimitedBody(request, limit))
      : await request.json();
    if (!isRecord(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError("The request must contain a valid JSON object.");
  }
}

async function readLimitedBody(
  request: Request,
  limit: { bytes: number; message: string },
) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit.bytes) {
        void reader.cancel().catch(() => {});
        throw new HttpError(limit.message, 413);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}
/** Platform limits sometimes return HTML, not our JSON error envelope. */
export async function responseJson<T>(response: Response): Promise<T> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new HttpError(
      response.status === 413
        ? "That upload is too large. Please use a smaller image."
        : "KnitPlot received an unexpected response. Please try again.",
      response.status || 502,
    );
  }
  if (!response.ok)
    throw new HttpError(
      isRecord(value) && typeof value.error === "string"
        ? value.error
        : "The request could not be completed. Please try again.",
      response.status,
    );
  return value as T;
}
