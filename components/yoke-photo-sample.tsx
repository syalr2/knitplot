"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChartDocument } from "@/lib/chart";
import { renderSweaterPhoto } from "@/lib/yoke-photo-preview";

export function YokePhotoSample({
  document,
  canvasRef,
}: {
  document: ChartDocument;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}) {
  const internalRef = useRef<HTMLCanvasElement>(null);
  const canvas = canvasRef ?? internalRef;
  const [failedDocument, setFailedDocument] = useState<ChartDocument | null>(
    null,
  );
  useEffect(() => {
    const image = new Image();
    const reliefImage = new Image();
    let cancelled = false;
    if (canvas.current) canvas.current.dataset.previewState = "rendering";
    image.src = "/images/yoke/photo-sweater-front.webp";
    reliefImage.src = "/textures/merino-relief.png";
    void Promise.all([image.decode(), reliefImage.decode()])
      .then(() => {
        const element = canvas.current;
        if (cancelled || !element) return;
        element.width = image.naturalWidth;
        element.height = image.naturalHeight;
        const context = element.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable.");
        context.drawImage(image, 0, 0);
        const photo = context.getImageData(0, 0, element.width, element.height);
        context.clearRect(0, 0, element.width, element.height);
        context.filter = "blur(9px)";
        context.drawImage(image, 0, 0);
        context.filter = "none";
        const lighting = context.getImageData(
          0,
          0,
          element.width,
          element.height,
        );
        const relief = window.document.createElement("canvas");
        relief.width = reliefImage.naturalWidth;
        relief.height = reliefImage.naturalHeight;
        const texture = relief.getContext("2d")!;
        texture.drawImage(reliefImage, 0, 0);
        renderSweaterPhoto(
          photo,
          lighting.data,
          texture.getImageData(0, 0, relief.width, relief.height),
          document,
        );
        context.putImageData(photo, 0, 0);
        element.dataset.ready = "true";
        element.dataset.previewState = "ready";
      })
      .catch(() => {
        if (!cancelled) {
          if (canvas.current) canvas.current.dataset.previewState = "error";
          setFailedDocument(document);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [document, canvas]);
  return (
    <>
      {failedDocument === document ? (
        <p role="alert">Could not render the sweater photo.</p>
      ) : null}
      <canvas
        ref={canvas}
        role="img"
        aria-label={
          canvasRef
            ? "Photographic knitted fabric preview"
            : "Front sweater photo mockup"
        }
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          aspectRatio: "3 / 2",
        }}
      />
    </>
  );
}
