export async function normalizeImageFileForUpload(file: File): Promise<File> {
  if (typeof window === "undefined") return file;

  const mime = file.type.toLowerCase();

  if (!mime.startsWith("image/")) {
    return file;
  }

  const maxLongEdge = 1800;
  const jpegQuality = 0.78;

  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(file);

    const scale = Math.min(
      1,
      maxLongEdge / Math.max(bitmap.width, bitmap.height)
    );

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Image normalization failed: canvas unavailable.");
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", jpegQuality);
    });

    if (!blob || blob.size <= 0) {
      throw new Error("Image normalization failed: empty image output.");
    }

    const originalName = file.name || "attachment";
    const baseName = originalName.replace(/\.[^.]+$/, "") || "attachment";
    const normalizedName = `${baseName}.jpg`;

    return new File([blob], normalizedName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (err: any) {
    throw new Error(
      err?.message ||
        "This photo could not be prepared for offline upload. Please retake it or choose it from your photo library."
    );
  } finally {
    bitmap?.close?.();
  }
}