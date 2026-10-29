import { HttpError, responseJson } from "./http";
import { readCloudChartPayload } from "./cloud-charts";
import { tabSnapshot, type tabPayload } from "./workspace";
import { cloudVersionToken, readCloudRevision } from "./cloud-revision";

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
    const remote = await responseJson<{ version: number }>(
      await transport(url, { signal }),
    );
    if (tabSnapshot(readCloudChartPayload(remote)) !== tabSnapshot(data))
      throw new HttpError("This chart changed elsewhere.", 409);
    return cloudVersionToken(remote);
  };
  try {
    if (!version) return await verifyMatchingRemote();
    const expectedVersion = readCloudRevision(
      /^\d+$/.test(version) ? Number(version) : version,
    );
    if (expectedVersion === undefined)
      throw new HttpError("Reopen this chart before saving it.", 428);
    const result = await responseJson<{ version: number }>(
      await transport(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, expectedVersion }),
        signal,
      }),
    );
    return cloudVersionToken(result);
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
