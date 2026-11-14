"use client";
// P3 — client image prep (README §3, §8): compress to ≤ 300 KB JPEG, max 1280 px, then base64.
// Same signature as the temporary prepareImage in lib/api.ts, so P1 swaps one line:
//   export { prepareImage, toBase64 } from "./image";
import imageCompression from "browser-image-compression";

const MAX_MB = 0.3;
const MAX_PX = 1280;

/** Friendly error for the UI ("Retake" / pick another photo). */
export class ImageError extends Error {}

/** "data:image/jpeg;base64,AAAA" → "AAAA" (API routes take base64 with no data: prefix). */
export function toBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/** Compress a camera/gallery file and return it as a JPEG data URL + raw base64. */
export async function prepareImage(file: File): Promise<{ dataUrl: string; base64: string }> {
  if (file.type && !file.type.startsWith("image/")) throw new ImageError("That file isn't a photo.");
  try {
    const small = await imageCompression(file, {
      maxSizeMB: MAX_MB,
      maxWidthOrHeight: MAX_PX,
      fileType: "image/jpeg",
      initialQuality: 0.8,
      useWebWorker: true,
    });
    const dataUrl = await imageCompression.getDataUrlFromFile(small);
    if (!dataUrl.startsWith("data:image/")) throw new Error("not an image data URL");
    return { dataUrl, base64: toBase64(dataUrl) };
  } catch (err) {
    // e.g. HEIC on a desktop browser that can't decode it
    console.warn("[image] compression failed:", err);
    throw new ImageError("Couldn't read that photo. Try taking it again, or pick a JPEG/PNG.");
  }
}
