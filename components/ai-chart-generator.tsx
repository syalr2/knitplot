"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { ColorCountChoice, convertImage } from "@/components/image-importer";
import { cellAspectRatio, ChartDocument, PaletteColor } from "@/lib/chart";

type Props = {
  document: ChartDocument;
  onImport: (palette: PaletteColor[], cells: string[][]) => void;
};

type GenerateResponse = {
  image?: string;
  mimeType?: string;
  error?: string;
};

type ChartSource = {
  image: HTMLImageElement;
  base64: string;
  mimeType: string;
  url: string;
};

async function chartAsImage(document: ChartDocument): Promise<ChartSource> {
  const aspect = cellAspectRatio(document);
  const scale = Math.max(2, Math.min(18, 1200 / (document.width * aspect), 900 / document.height));
  const cellHeight = scale;
  const cellWidth = scale * aspect;
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(document.width * cellWidth));
  canvas.height = Math.max(1, Math.round(document.height * cellHeight));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The current chart could not be prepared for editing.");
  const palette = new Map(document.palette.map((color) => [color.id, color.hex]));
  document.cells.forEach((row, rowIndex) => row.forEach((colorId, columnIndex) => {
    context.fillStyle = palette.get(colorId) ?? "#ffffff";
    context.fillRect(
      Math.round(columnIndex * cellWidth),
      Math.round(rowIndex * cellHeight),
      Math.ceil(cellWidth),
      Math.ceil(cellHeight),
    );
  }));
  const url = canvas.toDataURL("image/png");
  const base64 = url.slice(url.indexOf(",") + 1);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The current chart could not be prepared for editing."));
    image.src = url;
  });
  return { image, base64, mimeType: "image/png", url };
}

export function AiChartGenerator({ document, onImport }: Props) {
  const [mode, setMode] = useState<"generate" | "edit-chart">("generate");
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [referenceMimeType, setReferenceMimeType] = useState("image/png");
  const [referenceName, setReferenceName] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceUse, setReferenceUse] = useState<"subject" | "style">("subject");
  const [colorMode, setColorMode] = useState<"exact" | "range">("exact");
  const [colorCount, setColorCount] = useState(Math.min(5, Math.max(2, document.palette.length)));
  const [minimumColors, setMinimumColors] = useState(2);
  const [maximumColors, setMaximumColors] = useState(5);
  const [operation, setOperation] = useState<"generate" | "edit" | null>(null);
  const [error, setError] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [generatedMimeType, setGeneratedMimeType] = useState("image/png");
  const [originalChartSource, setOriginalChartSource] = useState<ChartSource | null>(null);
  const generatedImageRef = useRef<HTMLImageElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loading = operation !== null;

  const chartAspect = (document.width * cellAspectRatio(document)) / document.height;
  const previewAspect = Math.max(1 / 3, Math.min(3, chartAspect));
  const colorChoice: ColorCountChoice = colorMode === "exact"
    ? colorCount
    : { min: minimumColors, max: maximumColors };
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
    setGeneratedImage("");
    setGeneratedMimeType("image/png");
    setEditPrompt("");
    setReferenceImage("");
    setReferenceMimeType("image/png");
    setReferenceName("");
    setReferenceUrl("");
    setReferenceUse("subject");
    setOriginalChartSource(null);
    setMode("generate");
    generatedImageRef.current = null;
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

  async function openChartEditor() {
    try {
      const source = await chartAsImage(document);
      setMode("edit-chart");
      setColorMode("exact");
      setColorCount(Math.min(8, Math.max(2, document.palette.length)));
      setOriginalChartSource(source);
      generatedImageRef.current = source.image;
      setGeneratedImage(source.base64);
      setGeneratedMimeType(source.mimeType);
      setGeneratedUrl(source.url);
      setEditPrompt("");
      setError("");
      setOpen(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The current chart could not be prepared for editing.");
    }
  }

  function resetChartEdit() {
    if (!originalChartSource) return;
    generatedImageRef.current = originalChartSource.image;
    setGeneratedImage(originalChartSource.base64);
    setGeneratedMimeType(originalChartSource.mimeType);
    setGeneratedUrl(originalChartSource.url);
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
          referenceImage: referenceImage || undefined,
          referenceMimeType: referenceImage ? referenceMimeType : undefined,
          referenceUse: referenceImage ? referenceUse : undefined,
        }),
        signal: controller.signal,
      });
      const result = await response.json() as GenerateResponse;
      if (!response.ok || !result.image) {
        throw new Error(result.error || "The image could not be generated.");
      }

      const nextMimeType = result.mimeType || "image/png";
      const url = `data:${nextMimeType};base64,${result.image}`;
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The generated image could not be opened."));
        image.src = url;
      });
      generatedImageRef.current = image;
      setGeneratedImage(result.image);
      setGeneratedMimeType(nextMimeType);
      setGeneratedUrl(url);
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === "AbortError") return;
      setError(nextError instanceof Error ? nextError.message : "The image could not be generated.");
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
    if (cleanEditPrompt.length < 3 || !generatedImage) {
      setError("Add a little more detail about what you want to change.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setOperation("edit");
    setError("");

    try {
      const response = await fetch("/api/edit-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: cleanEditPrompt,
          image: generatedImage,
          mimeType: generatedMimeType,
          width: document.width,
          height: document.height,
          colorCount,
          colorMode,
          minimumColors,
          maximumColors,
          chartAspect,
        }),
        signal: controller.signal,
      });
      const result = await response.json() as GenerateResponse;
      if (!response.ok || !result.image) {
        throw new Error(result.error || "The image could not be edited.");
      }

      const nextMimeType = result.mimeType || "image/png";
      const url = `data:${nextMimeType};base64,${result.image}`;
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The edited image could not be opened."));
        image.src = url;
      });
      generatedImageRef.current = image;
      setGeneratedImage(result.image);
      setGeneratedMimeType(nextMimeType);
      setGeneratedUrl(url);
      setEditPrompt("");
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === "AbortError") return;
      setError(nextError instanceof Error ? nextError.message : "The image could not be edited.");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setOperation(null);
      }
    }
  }

  function useGeneratedChart() {
    const image = generatedImageRef.current;
    if (!image) return;
    try {
      const result = convertImage(image, document, colorChoice, "cover", { x: 50, y: 50 }, 1);
      onImport(result.palette, result.cells);
      closeDialog();
    } catch {
      setError("The generated image could not be converted into a chart.");
    }
  }

  return (
    <>
      <button className="primary-button" onClick={openGenerator}>Generate with AI</button>
      <button className="secondary-button" onClick={() => void openChartEditor()}>Edit chart with AI</button>

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
                  <img src={generatedUrl} alt="AI-generated colorwork motif preview" />
                </div>
                <p className="import-note">
                  {mode === "edit-chart" ? "AI will adapt your current chart" : "This draft will become a chart"} at {document.width} × {document.height} stitches using {colorDescription}. Every stitch remains editable. Each AI edit uses API credits.
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
                  <button onClick={mode === "edit-chart" ? resetChartEdit : () => { setGeneratedUrl(""); setGeneratedImage(""); generatedImageRef.current = null; setEditPrompt(""); }} disabled={loading}>
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
                <p className="import-note">Each draft uses your OpenAI API credits. Generation can take up to two minutes.</p>
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
