export async function normalizeImageFileForUpload(file: File): Promise<File> {
    if (typeof window === "undefined") return file;
    if (!file.type.toLowerCase().startsWith("image/")) return file;

    const maxLongEdge = 2200;
    const jpegQuality = 0.82;

    try {
        const bitmap = await createImageBitmap(file);

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
            bitmap.close?.();
            return file;
        }

        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/jpeg", jpegQuality);
        });

        if (!blob) return file;

        const originalName = file.name || "attachment";
        const baseName = originalName.replace(/\.[^.]+$/, "");
        const normalizedName = `${baseName}.jpg`;

        return new File([blob], normalizedName, {
            type: "image/jpeg",
            lastModified: Date.now(),
        });
    } catch {
        return file;
    }
}