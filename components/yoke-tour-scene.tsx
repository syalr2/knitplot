"use client";

import { createPortal } from "react-dom";
import { tutorialExampleDocument } from "@/lib/tutorial-examples";
import { emptyStitchDraft } from "@/components/use-yoke-stitches";
import { YokeEditor } from "./yoke-editor";
import { YokePlanDialog } from "./yoke-plan-dialog";

export type YokeTourSceneName =
  "measurements" | "schedule" | "preview" | "editor";

const noChange = () => {};
const noCommit = () => false;

export function YokeTourScene({ scene }: { scene: YokeTourSceneName }) {
  const example =
    scene === "editor" ? tutorialExampleDocument("tidal-fish-yoke") : null;
  return createPortal(
    <div data-yoke-tour-scene={scene} inert>
      {scene === "editor" ? (
        example && (
          <div className="yoke-tour-editor">
            <h2>{example.title} · tutorial preview</h2>
            <div className="workspace">
              <YokeEditor
                document={example.document}
                view="chart"
                onViewChange={noChange}
                onChange={noChange}
                onCreate={noCommit}
                onStrokeStart={noChange}
                undo={noChange}
                redo={noChange}
                canUndo={false}
                canRedo={false}
                tabsFull={false}
                stitchDraft={emptyStitchDraft}
                onStitchDraftChange={noChange}
              />
            </div>
          </div>
        )
      ) : (
        <YokePlanDialog
          tourStage={scene}
          tabsFull={false}
          onCommit={noCommit}
          onClose={noChange}
        />
      )}
    </div>,
    document.body,
  );
}
