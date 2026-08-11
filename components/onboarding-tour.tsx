"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import type { ChartDocument } from "@/lib/chart";
import { tutorialExamples, type TutorialExample } from "@/lib/tutorial-examples";

const TUTORIAL_STORAGE_KEY = "knitplot-tutorial-v1";

type TourStep = {
  target: string;
  eyebrow: string;
  title: string;
  body: string;
};

const steps: TourStep[] = [
  {
    target: "colours",
    eyebrow: "Choose your yarn colours",
    title: "Start with the palette",
    body: "Click a colour to draw with it, change any swatch, or add up to eight colours. The first colour is always the chart background.",
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
    title: "Import, generate, follow, and print",
    body: "Start from an image, use optional AI tools, create printable instructions, or open Knit Mode while you work the pattern.",
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

type Props = {
  tabsFull: boolean;
  onOpenExample: (id: TutorialExample["id"]) => void;
};

type TargetRect = { top: number; left: number; width: number; height: number };

function designBounds(document: ChartDocument) {
  if (!document.instructions.trimBackground) {
    return { startRow: 0, endRow: document.height - 1, startColumn: 0, endColumn: document.width - 1 };
  }
  const background = document.palette[0].id;
  const points: Array<[number, number]> = [];
  document.cells.forEach((row, rowIndex) => row.forEach((colorId, columnIndex) => {
    if (colorId !== background) points.push([rowIndex, columnIndex]);
  }));
  if (!points.length) return { startRow: 0, endRow: document.height - 1, startColumn: 0, endColumn: document.width - 1 };
  return {
    startRow: Math.max(0, Math.min(...points.map(([row]) => row)) - 2),
    endRow: Math.min(document.height - 1, Math.max(...points.map(([row]) => row)) + 2),
    startColumn: Math.max(0, Math.min(...points.map(([, column]) => column)) - 2),
    endColumn: Math.min(document.width - 1, Math.max(...points.map(([, column]) => column)) + 2),
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
    const bounds = designBounds(document);
    const sourceRows = bounds.endRow - bounds.startRow + 1;
    const sourceColumns = bounds.endColumn - bounds.startColumn + 1;
    const rows = sourceRows * previewRepeats.y;
    const columns = sourceColumns * previewRepeats.x;
    const stitchAspect = document.gaugeRows / document.gaugeStitches;
    const availableWidth = canvas.width - 24;
    const availableHeight = canvas.height - 20;
    const cellHeight = Math.min(availableHeight / rows, availableWidth / (columns * stitchAspect));
    const cellWidth = cellHeight * stitchAspect;
    const left = (canvas.width - columns * cellWidth) / 2;
    const top = (canvas.height - rows * cellHeight) / 2;
    const colors = new Map(document.palette.map((color) => [color.id, color.hex]));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f5f1e8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let repeatY = 0; repeatY < previewRepeats.y; repeatY += 1) {
      for (let repeatX = 0; repeatX < previewRepeats.x; repeatX += 1) {
        for (let row = 0; row < sourceRows; row += 1) {
          for (let column = 0; column < sourceColumns; column += 1) {
            const colorId = document.cells[bounds.startRow + row][bounds.startColumn + column];
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

  return <canvas ref={canvasRef} width="360" height="170" aria-label={`Preview of ${example.title}`} role="img" />;
}

export function OnboardingTour({ tabsFull, onOpenExample }: Props) {
  const [view, setView] = useState<"closed" | "welcome" | "tour">("closed");
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    let timer: number | null = null;
    try {
      if (!window.localStorage.getItem(TUTORIAL_STORAGE_KEY)) {
        timer = window.setTimeout(() => {
          if (!window.document.querySelector('[role="dialog"]')) setView("welcome");
        }, 550);
      }
    } catch {
      // The tour still works from the help button when browser storage is unavailable.
    }
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  function rememberTour() {
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "seen");
    } catch {
      // Private browsing should not prevent closing the tutorial.
    }
  }

  function closeTutorial() {
    rememberTour();
    setView("closed");
    setTargetRect(null);
  }

  function startTour() {
    rememberTour();
    setStepIndex(0);
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
    const selector = `[data-tour="${steps[stepIndex].target}"]`;
    const element = window.document.querySelector<HTMLElement>(selector);
    if (!element) {
      setTargetRect(null);
      return;
    }
    const details = element instanceof HTMLDetailsElement ? element : null;
    const detailsWasOpen = details?.open ?? false;
    if (details && !detailsWasOpen) details.open = true;
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const update = () => {
      const rect = element.getBoundingClientRect();
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    const timer = window.setTimeout(update, 280);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      if (details && !detailsWasOpen) details.open = false;
    };
  }, [view, stepIndex]);

  useEffect(() => {
    if (view === "closed") return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTutorial();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [view]);

  const bubbleStyle = (() => {
    if (!targetRect || typeof window === "undefined") return {};
    if (window.innerWidth < 640) return { left: 12, right: 12, bottom: 12 } satisfies CSSProperties;
    const width = Math.min(350, window.innerWidth - 32);
    const left = Math.max(16, Math.min(window.innerWidth - width - 16, targetRect.left + targetRect.width / 2 - width / 2));
    const below = targetRect.top + targetRect.height + 16;
    const top = below + 210 < window.innerHeight ? below : Math.max(16, targetRect.top - 226);
    return { left, top, width } satisfies CSSProperties;
  })();
  const step = steps[stepIndex];

  return (
    <>
      <button className="help-button" aria-label="Help and examples" title="Help and examples" onClick={() => setView("welcome")}>?</button>

      {view === "welcome" ? (
        <div className="tutorial-backdrop" role="presentation">
          <section className="tutorial-welcome" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title">
            <button className="close-dialog tutorial-close" aria-label="Close tutorial" onClick={closeTutorial}>×</button>
            <div className="tutorial-welcome-copy">
              <span className="tutorial-yarn-mark" aria-hidden="true" />
              <p className="eyebrow">Welcome to KnitPlot</p>
              <h1 id="tutorial-welcome-title">Plot something wonderful.</h1>
              <p>Create, preview, save, and follow your own colourwork charts. Take a two-minute tour or explore one of these editable examples.</p>
              <div className="tutorial-welcome-actions">
                <button className="primary-button" onClick={startTour}>Show me around</button>
                <button onClick={closeTutorial}>I’ll explore myself</button>
              </div>
            </div>
            <div className="tutorial-examples">
              {tutorialExamples.map((example) => (
                <article className="tutorial-example-card" key={example.id}>
                  <ExamplePreview example={example} />
                  <div>
                    <span>{example.document.width} × {example.document.height}</span>
                    <h2>{example.title}</h2>
                    <p>{example.description}</p>
                    <button onClick={() => openExample(example.id)} disabled={tabsFull}>Open example</button>
                  </div>
                </article>
              ))}
            </div>
            {tabsFull ? <p className="tutorial-limit-note">Close a chart tab before opening an example.</p> : null}
          </section>
        </div>
      ) : null}

      {view === "tour" ? (
        <div className="tour-layer" aria-live="polite">
          {targetRect ? <div className="tour-highlight" style={{
            top: targetRect.top - 7,
            left: targetRect.left - 7,
            width: targetRect.width + 14,
            height: targetRect.height + 14,
          }} /> : <div className="tour-dim" />}
          <section className="tour-card" style={bubbleStyle} role="dialog" aria-label={`Tutorial step ${stepIndex + 1} of ${steps.length}`}>
            <div className="tour-card-progress"><span>{stepIndex + 1} of {steps.length}</span><button aria-label="Skip tutorial" onClick={closeTutorial}>×</button></div>
            <p className="eyebrow">{step.eyebrow}</p>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            <div className="tour-card-actions">
              <button onClick={closeTutorial}>Skip tour</button>
              <div>
                {stepIndex > 0 ? <button onClick={() => setStepIndex((current) => current - 1)}>Back</button> : null}
                <button className="primary-button" onClick={() => {
                  if (stepIndex === steps.length - 1) closeTutorial();
                  else setStepIndex((current) => current + 1);
                }}>{stepIndex === steps.length - 1 ? "Start creating" : "Next"}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
