"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import type { ChartDocument } from "@/lib/chart";
import { YokeTourScene, type YokeTourSceneName } from "./yoke-tour-scene";
import {
  tutorialExamples,
  type TutorialExample,
} from "@/lib/tutorial-examples";

const TUTORIAL_STORAGE_KEY = "knitplot-tutorial-v1";

type TourStep = {
  target?: string;
  scene?: "file" | YokeTourSceneName;
  eyebrow: string;
  title: string;
  body: string;
};

const regularSteps: TourStep[] = [
  {
    target: "colours",
    eyebrow: "Choose your yarn colours",
    title: "Start with the palette",
    body: "Click a colour to draw with it, change any swatch, or add up to eight colours. The first colour is always the chart background.",
  },
  {
    target: "stitches",
    eyebrow: "Add chart instructions",
    title: "Keep stitches separate",
    body: "Add purl, cast-on, bind-off, shaping, and no-stitch cells here. Each instruction has its own editable display colour and works like a drawing swatch.",
  },
  {
    target: "chart-size",
    eyebrow: "Shape the chart",
    title: "Set stitches, rows, and gauge",
    body: "Chart size controls the number of stitches. Gauge controls each stitch’s proportions and calculates the finished measurements.",
  },
  {
    target: "drawing-tools",
    eyebrow: "Make changes",
    title: "Draw one stitch or a whole area",
    body: "Draw and drag, fill connected areas, erase, or select a rectangle. Undo, transformations, and zoom are here too.",
  },
  {
    target: "chart-canvas",
    eyebrow: "Your working chart",
    title: "Every rectangle is one stitch",
    body: "The row and column numbers stay attached to the grid as you zoom. Everything you import or generate remains editable here.",
  },
  {
    target: "workflow-actions",
    eyebrow: "More ways to work",
    title: "Import, follow, and print",
    body: "Start from an image, create printable instructions, or open Knit Mode while you work the pattern.",
  },
  {
    target: "knitted-preview",
    eyebrow: "See it knitted up",
    title: "Preview the fabric and repeats",
    body: "Choose normal or mirrored repeats, then press Refresh preview whenever you want to redraw the approximate knitted fabric.",
  },
  {
    target: "chart-tabs",
    eyebrow: "Keep ideas together",
    title: "Work on several charts at once",
    body: "Open, duplicate, and compare up to eight charts in the same workspace. Each tab remembers its own preview and Knit Mode progress.",
  },
  {
    target: "file-menu",
    eyebrow: "Keep your work",
    title: "Save or move your chart",
    body: "Download an editable .knitplot file at any time. Signed-in users can also save to My Charts and continue on another computer.",
  },
];

const yokeSteps: TourStep[] = [
  {
    target: "new-circular-yoke",
    scene: "file",
    eyebrow: "Yoke Design Studio",
    title: "Open the Yoke Design Studio",
    body: "Choose File → Circular yoke to start a new design. This walkthrough uses a sample and won’t change your charts.",
  },
  {
    target: "yoke-measurements",
    scene: "measurements",
    eyebrow: "Yoke Design Studio",
    title: "Start with your measurements",
    body: "Enter body measurements plus ease, or finished sweater measurements directly. Use the diagrams if you’re unsure, then enter your gauge and choose Calculate targets.",
  },
  {
    target: "yoke-increase-schedule",
    scene: "schedule",
    eyebrow: "Yoke Design Studio",
    title: "Move or spread out increases",
    body: "Check the neckline and sleeve split counts first. In Increase schedule, change Round to move a set of increases, or edit the stitch positions to move individual increases within the repeat.",
  },
  {
    target: "yoke-short-rows",
    scene: "preview",
    eyebrow: "Yoke Design Studio",
    title: "Preview the shape and short rows",
    body: "Choose Preview yoke to check the shape and adjust any back-neck short-row turns before creating the chart. You can return to these settings with Edit shaping.",
  },
  {
    target: "yoke-views",
    scene: "editor",
    eyebrow: "Yoke Design Studio",
    title: "Choose a drawing view",
    body: "Use Standard chart for a straight grid, One repeat for detail, or Half yoke and Whole yoke to see how your design sits around the sweater.",
  },
  {
    target: "yoke-editing-scope",
    scene: "editor",
    eyebrow: "Yoke Design Studio",
    title: "Choose which repeats to edit",
    body: "Viewing repeat controls which repeat you see up close. Edit controls where new strokes go: this repeat, selected repeats (such as the front), or all repeats. To spread an existing motif, use Copy repeat instead.",
  },
  {
    target: "stitches",
    scene: "editor",
    eyebrow: "Yoke Design Studio",
    title: "Refine your shaping as you draw",
    body: "Use Stitches to draft shaping changes directly on the chart, then choose Review shaping changes to check the stitch counts before applying. Open Tidal Fish Yoke from Help and examples to try it on a finished design.",
  },
];

const fullTour = [...regularSteps, ...yokeSteps];

type Props = {
  tabsFull: boolean;
  onOpenExample: (id: TutorialExample["id"]) => void;
  onTourFileOpen: (open: boolean) => void;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  cardHeight: number;
};

function designBounds(document: ChartDocument) {
  if (!document.instructions.trimBackground) {
    return {
      startRow: 0,
      endRow: document.height - 1,
      startColumn: 0,
      endColumn: document.width - 1,
    };
  }
  const background = document.palette[0].id;
  const points: Array<[number, number]> = [];
  document.cells.forEach((row, rowIndex) =>
    row.forEach((colorId, columnIndex) => {
      if (colorId !== background) points.push([rowIndex, columnIndex]);
    }),
  );
  if (!points.length)
    return {
      startRow: 0,
      endRow: document.height - 1,
      startColumn: 0,
      endColumn: document.width - 1,
    };
  return {
    startRow: Math.max(0, Math.min(...points.map(([row]) => row)) - 2),
    endRow: Math.min(
      document.height - 1,
      Math.max(...points.map(([row]) => row)) + 2,
    ),
    startColumn: Math.max(
      0,
      Math.min(...points.map(([, column]) => column)) - 2,
    ),
    endColumn: Math.min(
      document.width - 1,
      Math.max(...points.map(([, column]) => column)) + 2,
    ),
  };
}

function ExamplePreview({ example }: { example: TutorialExample }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { document, previewRepeats } = example;
    if (document.yoke) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const { cells, palette } = document.yoke;
      const center = canvas.width / 2;
      const innerRadius = 22;
      const rowHeight = (center - 10 - innerRadius) / cells.length;
      cells.forEach((row, round) => {
        const radius = innerRadius + (round + 0.5) * rowHeight;
        const pitch = (2 * Math.PI) / row.length;
        context.lineWidth = rowHeight + 0.5;
        row.forEach((colour, stitch) => {
          context.strokeStyle = palette[colour];
          context.beginPath();
          context.arc(
            center,
            center,
            radius,
            stitch * pitch,
            (stitch + 1) * pitch + 0.003,
          );
          context.stroke();
        });
      });
      return;
    }
    const bounds = designBounds(document);
    const sourceRows = bounds.endRow - bounds.startRow + 1;
    const sourceColumns = bounds.endColumn - bounds.startColumn + 1;
    const rows = sourceRows * previewRepeats.y;
    const columns = sourceColumns * previewRepeats.x;
    const stitchAspect = document.gaugeRows / document.gaugeStitches;
    const availableWidth = canvas.width - 24;
    const availableHeight = canvas.height - 20;
    const cellHeight = Math.min(
      availableHeight / rows,
      availableWidth / (columns * stitchAspect),
    );
    const cellWidth = cellHeight * stitchAspect;
    const left = (canvas.width - columns * cellWidth) / 2;
    const top = (canvas.height - rows * cellHeight) / 2;
    const colors = new Map(
      document.palette.map((color) => [color.id, color.hex]),
    );
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f5f1e8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let repeatY = 0; repeatY < previewRepeats.y; repeatY += 1) {
      for (let repeatX = 0; repeatX < previewRepeats.x; repeatX += 1) {
        for (let row = 0; row < sourceRows; row += 1) {
          for (let column = 0; column < sourceColumns; column += 1) {
            const colorId =
              document.cells[bounds.startRow + row][
                bounds.startColumn + column
              ];
            context.fillStyle = colors.get(colorId) ?? "#ffffff";
            context.fillRect(
              left + (repeatX * sourceColumns + column) * cellWidth,
              top + (repeatY * sourceRows + row) * cellHeight,
              Math.ceil(cellWidth),
              Math.ceil(cellHeight),
            );
          }
        }
      }
    }
  }, [example]);

  return (
    <canvas
      ref={canvasRef}
      width="320"
      height="320"
      className={example.document.yoke ? "tutorial-yoke-preview" : undefined}
      aria-label={`Preview of ${example.title}`}
      role="img"
    />
  );
}

export function OnboardingTour({
  tabsFull,
  onOpenExample,
  onTourFileOpen,
}: Props) {
  const [view, setView] = useState<"closed" | "welcome" | "tour">("closed");
  const [stepIndex, setStepIndex] = useState(0);
  const [yokeOnly, setYokeOnly] = useState(false);
  const steps = yokeOnly ? yokeSteps : fullTour;
  const step = steps[stepIndex];
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const tourCardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let timer: number | null = null;
    try {
      if (!window.localStorage.getItem(TUTORIAL_STORAGE_KEY)) {
        timer = window.setTimeout(() => {
          if (!window.document.querySelector('[role="dialog"]'))
            setView("welcome");
        }, 550);
      }
    } catch {
      // The tour still works from the help button when browser storage is unavailable.
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  function rememberTour() {
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
    } catch {
      // Private browsing should not prevent closing the tutorial.
    }
  }

  const closeTutorial = useCallback(() => {
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
    } catch {
      /* Closing remains available when storage is full. */
    }
    setView("closed");
    setTargetRect(null);
    onTourFileOpen(false);
  }, [onTourFileOpen]);

  function goToStep(index: number, route = steps) {
    setTargetRect(null);
    setStepIndex(index);
    onTourFileOpen(route[index].scene === "file");
  }

  function startTour(onlyYoke = false) {
    rememberTour();
    setYokeOnly(onlyYoke);
    goToStep(0, onlyYoke ? yokeSteps : fullTour);
    setView("tour");
  }

  function openExample(id: TutorialExample["id"]) {
    if (tabsFull) return;
    rememberTour();
    onOpenExample(id);
    setView("closed");
  }

  useEffect(() => {
    if (view !== "tour") return;
    const { target, scene } = step;
    const root =
      scene && scene !== "file"
        ? window.document.querySelector("[data-yoke-tour-scene]")
        : window.document;
    const element = target
      ? root?.querySelector<HTMLElement>(`[data-tour="${target}"]`)
      : null;
    if (!element) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear measurements when the external DOM target no longer exists.
      setTargetRect(null);
      return;
    }
    const details = element instanceof HTMLDetailsElement ? element : null;
    const detailsWasOpen = details?.open ?? false;
    if (details && !detailsWasOpen) details.open = true;
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    const update = () => {
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        cardHeight: tourCardRef.current?.offsetHeight ?? 0,
      });
    };
    const observer = new ResizeObserver(update);
    if (tourCardRef.current) observer.observe(tourCardRef.current);
    const timer = window.setTimeout(update, 280);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      if (details && !detailsWasOpen) details.open = false;
    };
  }, [view, step]);

  useEffect(() => {
    if (view === "closed") return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTutorial();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [view, closeTutorial]);

  const bubbleStyle = (() => {
    if (!targetRect || typeof window === "undefined") return {};
    if (window.innerWidth < 640)
      return { left: 12, right: 12, bottom: 12 } satisfies CSSProperties;
    const width = Math.min(350, window.innerWidth - 32);
    const left = Math.max(
      16,
      Math.min(
        window.innerWidth - width - 16,
        targetRect.left + targetRect.width / 2 - width / 2,
      ),
    );
    const below = targetRect.top + targetRect.height + 16;
    const above = targetRect.top - targetRect.cardHeight - 16;
    const maxTop = window.innerHeight - targetRect.cardHeight - 12;
    const top = Math.max(12, Math.min(maxTop, below <= maxTop ? below : above));
    return { left, top, width } satisfies CSSProperties;
  })();

  return (
    <>
      <button
        className="help-button"
        aria-label="Help and examples"
        title="Help and examples"
        onClick={() => setView("welcome")}
      >
        ?
      </button>

      {view === "welcome" ? (
        <div className="tutorial-backdrop" role="presentation">
          <section
            className="tutorial-welcome"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-welcome-title"
          >
            <button
              className="close-dialog tutorial-close"
              aria-label="Close tutorial"
              onClick={closeTutorial}
            >
              ×
            </button>
            <div className="tutorial-welcome-copy">
              <span className="tutorial-yarn-mark" aria-hidden="true" />
              <p className="eyebrow">Welcome to KnitPlot</p>
              <h1 id="tutorial-welcome-title">Plot something wonderful.</h1>
              <p>
                Create, preview, save, and follow your own colourwork charts.
                Take a two-minute tour or explore one of these editable
                examples.
              </p>
              <div className="tutorial-welcome-actions">
                <button className="primary-button" onClick={() => startTour()}>
                  Show me around
                </button>
                <button onClick={closeTutorial}>I’ll explore myself</button>
              </div>
            </div>
            <div className="tutorial-examples">
              {tutorialExamples.map((example) => (
                <article className="tutorial-example-card" key={example.id}>
                  <ExamplePreview example={example} />
                  <div>
                    <span>
                      {example.document.yoke
                        ? `Circular yoke · ${example.document.height} rounds`
                        : `${example.document.width} × ${example.document.height}`}
                    </span>
                    <h2>{example.title}</h2>
                    <p>{example.description}</p>
                    <button
                      onClick={() => openExample(example.id)}
                      disabled={tabsFull}
                    >
                      Open example
                    </button>
                    {example.id === "tidal-fish-yoke" ? (
                      <button
                        className="tutorial-yoke-shortcut"
                        onClick={() => startTour(true)}
                      >
                        Yoke tutorial
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
            {tabsFull ? (
              <p className="tutorial-limit-note">
                Close a chart tab before opening an example.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {view === "tour" ? (
        <>
          {step.scene && step.scene !== "file" ? (
            <YokeTourScene scene={step.scene} />
          ) : null}
          <div
            className={
              step.scene ? "tour-layer tour-layer-guided" : "tour-layer"
            }
            aria-live="polite"
          >
            {targetRect ? (
              <div
                className="tour-highlight"
                style={{
                  top: targetRect.top - 7,
                  left: targetRect.left - 7,
                  width: targetRect.width + 14,
                  height: targetRect.height + 14,
                }}
              />
            ) : (
              <div className="tour-dim" />
            )}
            <section
              ref={tourCardRef}
              className={
                targetRect ? "tour-card" : "tour-card tour-card-centered"
              }
              style={bubbleStyle}
              role="dialog"
              aria-label={`Tutorial step ${stepIndex + 1} of ${steps.length}`}
            >
              <div className="tour-card-progress">
                <span>
                  {stepIndex + 1} of {steps.length}
                </span>
                <button aria-label="Skip tutorial" onClick={closeTutorial}>
                  ×
                </button>
              </div>
              <p className="eyebrow">{step.eyebrow}</p>
              <h2>{step.title}</h2>
              <p>{step.body}</p>
              <div className="tour-card-actions">
                <button onClick={closeTutorial}>Skip tour</button>
                <div>
                  {stepIndex > 0 ? (
                    <button onClick={() => goToStep(stepIndex - 1)}>
                      Back
                    </button>
                  ) : null}
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (stepIndex === steps.length - 1) closeTutorial();
                      else goToStep(stepIndex + 1);
                    }}
                  >
                    {stepIndex === steps.length - 1 ? "Start creating" : "Next"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}
