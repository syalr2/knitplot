import { connectedFabric } from "./connected-preview";
import type {
  PreviewLayoutRequest,
  PreviewLayoutResponse,
} from "./preview-layout-request";

// This module runs only in the dedicated, same-origin preview worker. It has
// no DOM, account access, network requests or persistence.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PreviewLayoutRequest>) => void) | null;
  postMessage(message: PreviewLayoutResponse): void;
};
scope.onmessage = ({ data }) => {
  try {
    scope.postMessage({
      fabric: connectedFabric(data.document, data.repeats, data.mirrored),
    });
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Could not calculate the knitted preview.",
    });
  }
};
