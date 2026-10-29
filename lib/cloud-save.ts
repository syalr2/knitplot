import { HttpError, responseJson } from "./http";
import { readCloudChartPayload } from "./cloud-charts";
import { tabSnapshot, type tabPayload } from "./workspace";

/** A successful write whose reply was lost must not become a false conflict. */
export async function saveCloudChart(
  id: string,
  data: ReturnType<typeof tabPayload>,
  version?: string,
  transport: typeof fetch = fetch,
) {
  const url = `/api/charts/${encodeURIComponent(id)}`;
  const signal = AbortSignal.timeout(20_000);
  const verifyMatchingRemote = async () => {
    const remote = await responseJson<{ updatedAt: string }>(
      await transport(url, { signal }),
    );
    if (tabSnapshot(readCloudChartPayload(remote)) !== tabSnapshot(data))
      throw new HttpError("This chart changed elsewhere.", 409);
    return remote.updatedAt;
  };
  try {
    if (!version) return await verifyMatchingRemote();
    const result = await responseJson<{ updatedAt: string }>(
      await transport(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, expectedVersion: version }),
        signal,
      }),
    );
    return result.updatedAt;
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new HttpError(
        "Cloud save took too long. Your local copy is kept; please retry the save.",
        504,
      );
    }
    if (error instanceof HttpError && error.status === 409)
      return verifyMatchingRemote();
    throw error;
  }
}
