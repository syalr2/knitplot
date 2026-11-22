"use client";

import { useId, useRef, useState, type RefObject } from "react";
import { canvasBlob, downloadBlob, fileName } from "@/lib/browser-download";
import { fitImage } from "@/lib/image-fit";
import { recordShareEvent, type SharePreviewView } from "@/lib/usage-analytics";

// Frame the fabric at its own proportions. The optional credit adds a
// footer without scaling the artwork down.
function renderCard(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement,
  credit: boolean,
) {
  const shortEdge = Math.min(source.width, source.height);
  const margin = Math.min(24, Math.max(8, Math.round(shortEdge * 0.035)));
  const creditSize = Math.min(22, Math.max(12, Math.round(shortEdge * 0.045)));
  const creditHeight = credit ? creditSize + margin : 0;
  target.width = source.width + margin * 2;
  target.height = source.height + margin * 2 + creditHeight;
  const context = target.getContext("2d");
  if (!context) throw new Error("Canvas unavailable.");
  context.fillStyle = "#f7f5ef";
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(source, margin, margin);
  if (credit) {
    context.fillStyle = "#46574b";
    context.font = `${creditSize}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(
      "Made with KnitPlot · knitplot.art",
      target.width / 2,
      target.height - margin,
      source.width,
    );
  }
}

export function SharePreview({
  canvasRef,
  name,
  view,
  stale,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  name: string;
  view: SharePreviewView;
  stale?: boolean;
}) {
  const heading = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLCanvasElement>(null);
  const snapshot = useRef<HTMLCanvasElement | null>(null);
  const [credit, setCredit] = useState(true);
  const [message, setMessage] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [busy, setBusy] = useState(false);

  function openDialog() {
    const source = canvasRef.current;
    if (stale || source?.dataset.previewState === "error") {
      setMessage("Refresh the knitted preview before sharing it.");
      return;
    }
    if (!source || source.dataset.previewState !== "ready" || !card.current) {
      setMessage("Wait for the knitted preview to finish rendering.");
      return;
    }
    try {
      const frame = document.createElement("canvas");
      const fit = fitImage(source.width, source.height, 1200, 1200);
      frame.width = fit.width;
      frame.height = fit.height;
      const context = frame.getContext("2d");
      if (!context) throw new Error("Canvas unavailable.");
      context.drawImage(source, 0, 0, frame.width, frame.height);
      snapshot.current = frame;
      renderCard(card.current, frame, credit);
      setMessage("");
      setDownloadError("");
      dialog.current?.showModal();
    } catch {
      setMessage("Couldn’t create a share image. Please try again.");
    }
  }

  async function download() {
    if (!card.current || busy) return;
    setBusy(true);
    setDownloadError("");
    try {
      downloadBlob(await canvasBlob(card.current), fileName(name, "share.png"));
      recordShareEvent({ name: "Share image downloaded", view, credit });
      dialog.current?.close();
      setMessage("Share image downloaded.");
    } catch {
      setDownloadError("Couldn’t download the share image. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-preview-action">
      <button type="button" onClick={openDialog}>
        Share preview
      </button>
      <small className="share-feedback" role="status">
        {message}
      </small>
      <dialog
        className="share-preview-dialog"
        ref={dialog}
        aria-labelledby={heading}
        onClose={() => {
          snapshot.current = null;
        }}
      >
        <div className="share-preview-heading">
          <h2 id={heading}>Share your knitted preview</h2>
          <button
            type="button"
            aria-label="Close share preview"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <canvas ref={card} role="img" aria-label="Share image preview" />
        <label className="share-credit">
          <input
            type="checkbox"
            checked={credit}
            disabled={busy}
            onChange={(event) => {
              const checked = event.target.checked;
              if (card.current && snapshot.current)
                renderCard(card.current, snapshot.current, checked);
              setCredit(checked);
            }}
          />
          Include “Made with KnitPlot”
        </label>
        {downloadError && <p role="alert">{downloadError}</p>}
        <button
          type="button"
          className="primary-button"
          disabled={busy}
          onClick={download}
        >
          {busy ? "Creating image…" : "Download share image"}
        </button>
      </dialog>
    </div>
  );
}
