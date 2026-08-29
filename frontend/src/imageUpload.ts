export async function compressImage(file: File, maxEdge = 1600): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 350_000) {
    bitmap.close();
    return file;
  }
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob || blob.size >= file.size) {
    return file;
  }
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

/** Crop a displayed photo to the cover frame (same as CSS object-fit: cover + object-position Y). */
export async function cropCover(src: string, aspect: number, focusY = 50, maxWidth = 1600): Promise<File> {
  const img = await loadImage(src);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const ratio = Math.max(aspect, 0.2);
  let cropW = srcW;
  let cropH = srcW / ratio;
  if (cropH > srcH) {
    cropH = srcH;
    cropW = srcH * ratio;
  }
  const sx = (srcW - cropW) / 2;
  const sy = (srcH - cropH) * (Math.min(100, Math.max(0, focusY)) / 100);
  const outW = Math.max(1, Math.min(maxWidth, Math.round(cropW)));
  const outH = Math.max(1, Math.round(outW / ratio));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not crop this photo.");
  }
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) {
    throw new Error("Could not crop this photo.");
  }
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load this photo to crop."));
    img.src = src;
  });
}
