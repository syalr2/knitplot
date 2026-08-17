"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { cellAspectRatio, ChartDocument, PaletteColor } from "@/lib/chart";
import { ColorCountChoice, convertImage } from "@/components/image-importer";

type Props = {
  document: ChartDocument;
  onImport: (palette: PaletteColor[], cells: string[][]) => void;
  accountsEnabled: boolean;
  signedIn: boolean;
  aiConnected: boolean;
};

type GenerateResponse = {
  palette?: string[];
  rows?: string[];
  image?: string;
  mimeType?: string;
  error?: string;
};

type ChartDraft = {
  palette: PaletteColor[];
  cells: string[][];
};

function documentAsDraft(document: ChartDocument): ChartDraft {
  return {
    palette: document.palette.map((color) => ({ ...color })),
    cells: document.cells.map((row) => [...row]),
  };
}

function responseAsDraft(result: GenerateResponse, width: number, height: number): ChartDraft | null {
  if (!Array.isArray(result.palette) || !Array.isArray(result.rows) || result.rows.length !== height) return null;
  if (result.palette.length < 2 || result.palette.length > 8) return null;
  const palette = result.palette.map((hex, index) => ({ id: `ai-${Date.now()}-${index}`, hex }));
  const cells = result.rows.map((row) => Array.from(row, (character) => palette[Number(character)]?.id ?? ""));
  if (cells.some((row) => row.length !== width || row.some((cell) => !cell))) return null;
  return { palette, cells };
}

function sourceArtworkAsDraft(
  result: GenerateResponse,
  document: ChartDocument,
  colorCount: ColorCountChoice,
  signal: AbortSignal,
) {
  return new Promise<ChartDraft>((resolve, reject) => {
    if (!result.image || !result.mimeType?.startsWith("image/")) {
      reject(new Error("OpenAI did not return a usable source design. Please try again."));
      return;
    }

    const image = new Image();
    const stop = () => {
      image.src = "";
      reject(new DOMException("Generation stopped.", "AbortError"));
    };
    signal.addEventListener("abort", stop, { once: true });
    image.onload = () => {
      signal.removeEventListener("abort", stop);
      try {
        resolve(convertImage(image, document, colorCount, "cover", { x: 50, y: 50 }, 1));
      } catch {
        reject(new Error("The generated design could not be converted into stitches. Please try again."));
      }
    };
    image.onerror = () => {
      signal.removeEventListener("abort", stop);
      reject(new Error("The generated design could not be opened. Please try again."));
    };
    image.src = `data:${result.mimeType};base64,${result.image}`;
  });
}

function draftAsIndexedGrid(draft: ChartDraft) {
  const indexes = new Map(draft.palette.map((color, index) => [color.id, index]));
  return {
    palette: draft.palette.map((color) => color.hex),
    rows: draft.cells.map((row) => row.map((colorId) => indexes.get(colorId) ?? 0).join("")),
  };
}

function draftAsImage(draft: ChartDraft, document: ChartDocument) {
  const aspect = cellAspectRatio(document);
  const scale = Math.max(2, Math.min(18, 1200 / (document.width * aspect), 900 / document.height));
  const cellHeight = scale;
  const cellWidth = scale * aspect;
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(document.width * cellWidth));
  canvas.height = Math.max(1, Math.round(document.height * cellHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The current chart could not be prepared for editing.");
  const palette = new Map(draft.palette.map((color) => [color.id, color.hex]));
  draft.cells.forEach((row, rowIndex) => row.forEach((colorId, columnIndex) => {
    context.fillStyle = palette.get(colorId) ?? "#ffffff";
    context.fillRect(
      Math.round(columnIndex * cellWidth),
      Math.round(rowIndex * cellHeight),
      Math.ceil(cellWidth),
      Math.ceil(cellHeight),
    );
  }));
  return canvas.toDataURL("image/png");
}

export function AiChartGenerator({ document, onImport, accountsEnabled, signedIn, aiConnected }: Props) {
  const [mode, setMode] = useState<"generate" | "edit-chart">("generate");
  const [open, setOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [referenceMimeType, setReferenceMimeType] = useState("image/png");
  const [referenceName, setReferenceName] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceUse, setReferenceUse] = useState<"subject" | "style">("subject");
  const [layoutMode, setLayoutMode] = useState<"motif" | "repeat">("motif");
  const [colorMode, setColorMode] = useState<"exact" | "range">("exact");
  const [colorCount, setColorCount] = useState(Math.min(5, Math.max(2, document.palette.length)));
  const [minimumColors, setMinimumColors] = useState(2);
  const [maximumColors, setMaximumColors] = useState(5);
  const [operation, setOperation] = useState<"generate" | "edit" | null>(null);
  const [error, setError] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [generatedDraft, setGeneratedDraft] = useState<ChartDraft | null>(null);
  const [originalChartDraft, setOriginalChartDraft] = useState<ChartDraft | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loading = operation !== null;
  const canUseAi = !accountsEnabled || (signedIn && aiConnected);

  const chartAspect = (document.width * cellAspectRatio(document)) / document.height;
  const previewAspect = Math.max(1 / 3, Math.min(3, chartAspect));
  const colorDescription = colorMode === "exact"
    ? `${colorCount} colours`
    : `${minimumColors}–${maximumColors} colours`;

  function closeDialog() {
    abortRef.current?.abort();
    abortRef.current = null;
    setOpen(false);
    setOperation(null);
    setError("");
    setGeneratedUrl("");
    setGeneratedDraft(null);
    setEditPrompt("");
    setReferenceImage("");
    setReferenceMimeType("image/png");
    setReferenceName("");
    setReferenceUrl("");
    setReferenceUse("subject");
    setOriginalChartDraft(null);
    setMode("generate");
  }

  function stopOperation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setOperation(null);
    setError("Generation stopped.");
  }

  function openGenerator() {
    setMode("generate");
    setOpen(true);
    setError("");
  }

  function openChartEditor() {
    try {
      const source = documentAsDraft(document);
      setMode("edit-chart");
      setColorMode("exact");
      setColorCount(Math.min(8, Math.max(2, document.palette.length)));
      setOriginalChartDraft(source);
      setGeneratedDraft(source);
      setGeneratedUrl(draftAsImage(source, document));
      setEditPrompt("");
      setError("");
      setOpen(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The current chart could not be prepared for editing.");
    }
  }

  function resetChartEdit() {
    if (!originalChartDraft) return;
    setGeneratedDraft(originalChartDraft);
    setGeneratedUrl(draftAsImage(originalChartDraft, document));
    setEditPrompt("");
    setError("");
  }

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, loading]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (cleanPrompt.length < 3) {
      setError("Add a little more detail about what you want to make.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setOperation("generate");
    setError("");

    try {
      const response = await fetch("/api/generate-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanPrompt,
          width: document.width,
          height: document.height,
          colorCount,
          colorMode,
          minimumColors,
          maximumColors,
          chartAspect,
          layoutMode,
          referenceImage: referenceImage || undefined,
          referenceMimeType: referenceImage ? referenceMimeType : undefined,
          referenceUse: referenceImage ? referenceUse : undefined,
        }),
        signal: controller.signal,
      });
      const result = await response.json() as GenerateResponse;
      if (!response.ok) {
        throw new Error(result.error || "The chart could not be generated.");
      }
      const requestedColors: ColorCountChoice = colorMode === "exact"
        ? colorCount
        : { min: minimumColors, max: maximumColors };
      const draft = await sourceArtworkAsDraft(result, document, requestedColors, controller.signal);
      setGeneratedDraft(draft);
      setGeneratedUrl(draftAsImage(draft, document));
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === "AbortError") return;
      setError(nextError instanceof Error ? nextError.message : "The chart could not be generated.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setOperation(null);
      }
    }
  }

  function chooseReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Choose a PNG, JPEG, or WebP image smaller than 10 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      if (comma < 0) {
        setError("That reference image could not be opened.");
        return;
      }
      setReferenceImage(result.slice(comma + 1));
      setReferenceMimeType(file.type);
      setReferenceName(file.name);
      setReferenceUrl(result);
      setError("");
    };
    reader.onerror = () => setError("That reference image could not be opened.");
    reader.readAsDataURL(file);
  }

  function removeReference() {
    setReferenceImage("");
    setReferenceMimeType("image/png");
    setReferenceName("");
    setReferenceUrl("");
  }

  async function editGenerated(event: FormEvent) {
    event.preventDefault();
    const cleanEditPrompt = editPrompt.trim();
    if (cleanEditPrompt.length < 3 || !generatedDraft) {
      setError("Add a little more detail about what you want to change.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setOperation("edit");
    setError("");

    try {
      const indexed = draftAsIndexedGrid(generatedDraft);
      const response = await fetch("/api/edit-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanEditPrompt,
          width: document.width,
          height: document.height,
          colorCount,
          colorMode,
          minimumColors,
          maximumColors,
          layoutMode,
          palette: indexed.palette,
          rows: indexed.rows,
        }),
        signal: controller.signal,
      });
      const result = await response.json() as GenerateResponse;
      if (!response.ok) {
        throw new Error(result.error || "The chart could not be edited.");
      }
      const draft = responseAsDraft(result, document.width, document.height);
      if (!draft) throw new Error("OpenAI returned an invalid stitch chart. Please try again.");
      setGeneratedDraft(draft);
      setGeneratedUrl(draftAsImage(draft, document));
      setEditPrompt("");
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === "AbortError") return;
      setError(nextError instanceof Error ? nextError.message : "The chart could not be edited.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setOperation(null);
      }
    }
  }

  function useGeneratedChart() {
    if (!generatedDraft) return;
    onImport(generatedDraft.palette, generatedDraft.cells);
    closeDialog();
  }

  return (
    <>
      <button className="primary-button" onClick={() => canUseAi ? openGenerator() : setAccessOpen(true)}>Generate with AI</button>
      <button className="secondary-button" onClick={() => canUseAi ? openChartEditor() : setAccessOpen(true)}>Edit chart with AI</button>

      {accessOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="import-dialog ai-access-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-access-title">
            <div className="import-dialog-heading"><div><p className="eyebrow">Optional AI tools</p><h1 id="ai-access-title">{signedIn ? "Connect OpenAI to continue" : "Sign in to use AI"}</h1></div><button className="close-dialog" aria-label="Close" onClick={() => setAccessOpen(false)}>×</button></div>
            <p className="account-intro">{signedIn ? "Add your own OpenAI API key from your account page. KnitPlot encrypts it server-side and uses it only when you ask for an AI generation or edit." : "The chart maker and every non-AI tool work without an account. Sign in only if you want cloud saves or optional AI features."}</p>
            <div className="import-actions"><button onClick={() => setAccessOpen(false)}>Not now</button><Link className="primary-link" href={signedIn ? "/account" : "/sign-in"}>{signedIn ? "Open account" : "Sign in"}</Link></div>
          </section>
        </div>
      ) : null}

      {open ? (
        <div className="modal-backdrop" role="presentation">
          <section className="import-dialog ai-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-dialog-title">
            <div className="import-dialog-heading">
              <div>
                <p className="eyebrow">{mode === "edit-chart" ? "Adapt your current design" : "Create from a description"}</p>
                <h1 id="ai-dialog-title">{mode === "edit-chart" ? "Edit chart with AI" : "Generate chart with AI"}</h1>
              </div>
              <button className="close-dialog" aria-label="Close AI generator" onClick={closeDialog}>×</button>
            </div>

            {generatedUrl ? (
              <>
                <div className="ai-preview" style={{ aspectRatio: previewAspect }}>
                  {/* The generated data URL is temporary and never stored outside this browser session. */}
                  <img src={generatedUrl} alt="AI-generated colorwork chart preview" />
                </div>
                <p className="import-note">
                  This is the exact {document.width} × {document.height} stitch grid using {generatedDraft?.palette.length ?? colorDescription} colours. Every visible block is one editable stitch. Each AI edit uses API credits.
                </p>
                <form className="ai-edit-panel" onSubmit={editGenerated}>
                  <label>What would you like to change?
                    <textarea
                      maxLength={800}
                      placeholder="For example: make the scarf blue and keep everything else the same"
                      value={editPrompt}
                      onChange={(event) => setEditPrompt(event.target.value)}
                      disabled={loading}
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={loading || editPrompt.trim().length < 3}>
                    {operation === "edit" ? "Applying edit…" : "Apply edit"}
                  </button>
                </form>
                {loading ? (
                  <p className="ai-loading" role="status">
                    {operation === "edit" ? "Editing your current motif…" : "Generating a new version…"}
                  </p>
                ) : null}
                {error ? <p className="import-error" role="alert">{error}</p> : null}
                <div className="import-actions">
                  {loading ? <button onClick={stopOperation}>Stop</button> : null}
                  <button onClick={mode === "edit-chart" ? resetChartEdit : () => { setGeneratedUrl(""); setGeneratedDraft(null); setEditPrompt(""); }} disabled={loading}>
                    {mode === "edit-chart" ? "Reset to current chart" : "Start over"}
                  </button>
                  {mode === "generate" ? <button onClick={() => void generate()} disabled={loading}>
                    {operation === "generate" ? "Generating…" : "Generate a new version"}
                  </button> : null}
                  <button className="primary-button" onClick={useGeneratedChart} disabled={loading}>Use this chart</button>
                </div>
              </>
            ) : (
              <form className="ai-form" onSubmit={generate}>
                <label>Describe your motif
                  <textarea
                    autoFocus
                    maxLength={800}
                    placeholder="For example: a cheerful leaping cow with bold black patches on a cream background"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={loading}
                  />
                </label>
                <div className="ai-settings">
                  <div className="ai-colour-control">
                    <span>Number of colours</span>
                    <div className="ai-colour-mode" role="group" aria-label="Colour count type">
                      <button type="button" className={colorMode === "exact" ? "selected" : ""} aria-pressed={colorMode === "exact"} onClick={() => setColorMode("exact")} disabled={loading}>Exact</button>
                      <button type="button" className={colorMode === "range" ? "selected" : ""} aria-pressed={colorMode === "range"} onClick={() => setColorMode("range")} disabled={loading}>Range</button>
                    </div>
                    {colorMode === "exact" ? (
                      <select aria-label="Exact number of colours" value={colorCount} onChange={(event) => setColorCount(Number(event.target.value))} disabled={loading}>
                        {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    ) : (
                      <div className="ai-colour-range">
                        <label>From
                          <select value={minimumColors} onChange={(event) => {
                            const next = Number(event.target.value);
                            setMinimumColors(next);
                            if (next > maximumColors) setMaximumColors(next);
                          }} disabled={loading}>
                            {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                          </select>
                        </label>
                        <label>To
                          <select value={maximumColors} onChange={(event) => {
                            const next = Number(event.target.value);
                            setMaximumColors(next);
                            if (next < minimumColors) setMinimumColors(next);
                          }} disabled={loading}>
                            {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="ai-chart-summary">
                    <span>Current chart</span>
                    <strong>{document.width} × {document.height}</strong>
                    <small>Gauge shape included automatically</small>
                  </div>
                </div>
                <div className="ai-layout-control">
                  <span>Design type</span>
                  <div className="ai-layout-options" role="group" aria-label="Design type">
                    <button type="button" className={layoutMode === "motif" ? "selected" : ""} aria-pressed={layoutMode === "motif"} onClick={() => setLayoutMode("motif")} disabled={loading}>
                      <strong>Single motif</strong><small>One centered design</small>
                    </button>
                    <button type="button" className={layoutMode === "repeat" ? "selected" : ""} aria-pressed={layoutMode === "repeat"} onClick={() => setLayoutMode("repeat")} disabled={loading}>
                      <strong>Repeating tile</strong><small>Edges join as a pattern</small>
                    </button>
                  </div>
                </div>
                <div className="ai-reference">
                  <div className="ai-reference-heading">
                    <div><strong>Reference image</strong><span>Optional — use a photo, sketch, or style example</span></div>
                    {!referenceUrl ? <label className="secondary-button ai-reference-upload">Choose image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseReference} disabled={loading} /></label> : null}
                  </div>
                  {referenceUrl ? (
                    <div className="ai-reference-selected">
                      <img src={referenceUrl} alt="Selected AI reference" />
                      <div><strong>{referenceName}</strong>
                        <label>Use it as
                          <select value={referenceUse} onChange={(event) => setReferenceUse(event.target.value as "subject" | "style")} disabled={loading}>
                            <option value="subject">Subject or composition</option>
                            <option value="style">Style only</option>
                          </select>
                        </label>
                      </div>
                      <button type="button" onClick={removeReference} disabled={loading}>Remove</button>
                    </div>
                  ) : null}
                </div>
                <p className="import-note">AI will compose a clear source design, then KnitPlot will convert it in your browser into the exact {document.width} × {document.height} stitch grid. Each draft uses one AI image generation and your OpenAI API credits.</p>
                {loading ? <p className="ai-loading" role="status">Generating your motif…</p> : null}
                {error ? <p className="import-error" role="alert">{error}</p> : null}
                <div className="import-actions">
                  <button type="button" onClick={loading ? stopOperation : closeDialog}>{loading ? "Stop generation" : "Cancel"}</button>
                  <button className="primary-button" type="submit" disabled={loading || prompt.trim().length < 3}>
                    {loading ? "Generating…" : "Generate draft"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
