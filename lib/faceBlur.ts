"use client";
// P3 — on-device face pixelation with MediaPipe, BEFORE upload (README §9).
// Same signature as the mock in lib/api.ts, so P1 swaps one line:
//   export { blurFaces } from "./faceBlur";
// Never throws: if MediaPipe can't load (offline, old browser) the photo is returned
// unchanged with facesBlurred = -1 so the UI can say "Couldn't check for faces".
import type { FaceDetector } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detectorPromise: Promise<FaceDetector | null> | null = null;

/** Call when /report mounts so the model is ready by the time the photo is taken. */
export function preloadFaceDetector(): Promise<FaceDetector | null> {
  detectorPromise ??= (async () => {
    try {
      const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      return await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    } catch (err) {
      console.warn("[faceBlur] MediaPipe unavailable:", err);
      detectorPromise = null; // allow a retry next time
      return null;
    }
  })();
  return detectorPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("could not decode image"));
    im.src = src;
  });
}

/** Pixelate one box by scaling down and back up (ctx.filter blur is unreliable on iOS Safari). */
function pixelate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(w / 16));
  small.height = Math.max(1, Math.round(h / 16));
  small.getContext("2d")!.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

export async function blurFaces(dataUrl: string): Promise<{ dataUrl: string; facesBlurred: number }> {
  const detector = await preloadFaceDetector();
  if (!detector) return { dataUrl, facesBlurred: -1 };
  try {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);

    const { detections } = detector.detect(canvas);
    let n = 0;
    for (const d of detections) {
      const b = d.boundingBox;
      if (!b) continue;
      const px = b.width * 0.2;
      const py = b.height * 0.2;
      const x = Math.max(0, b.originX - px);
      const y = Math.max(0, b.originY - py);
      pixelate(ctx, x, y, Math.min(canvas.width - x, b.width + 2 * px), Math.min(canvas.height - y, b.height + 2 * py));
      n++;
    }
    if (n === 0) return { dataUrl, facesBlurred: 0 }; // untouched, no re-encode
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), facesBlurred: n };
  } catch (err) {
    console.warn("[faceBlur] detection failed:", err);
    return { dataUrl, facesBlurred: -1 };
  }
}
