import { connectedFabric } from "./connected-preview";
import { yokeFabric } from "./yoke-fabric-preview";
import { yokeSweaterFabric } from "./yoke-sweater-preview";
import { isYokeSweaterView } from "./yoke-preview-view";
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
      fabric: data.document.yoke
        ? isYokeSweaterView(data.yokeView)
          ? yokeSweaterFabric(
              data.document,
              data.yokeView === "sweater-front" ? "front" : "back",
            )
          : yokeFabric(data.document, data.yokeView, data.yokeRepeat)
        : connectedFabric(data.document, data.repeats, data.mirrored),
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
