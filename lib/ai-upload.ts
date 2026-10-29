/** Leave headroom beneath the hosted function's 4.5 MB JSON request limit. */
export const MAX_REFERENCE_BASE64 = 3_000_000;
export const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024;

export async function prepareReferenceImage(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > MAX_REFERENCE_FILE_BYTES
  ) {
    throw new Error("Choose a PNG, JPEG, or WebP image smaller than 10 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("That reference image could not be opened.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.75, 0.6]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      const base64 = url.slice(url.indexOf(",") + 1);
      if (base64.length <= MAX_REFERENCE_BASE64)
        return { base64, url, mimeType: "image/jpeg" };
    }
    throw new Error(
      "That image is too large. Please use a smaller reference image.",
    );
  } finally {
    bitmap.close();
  }
}
