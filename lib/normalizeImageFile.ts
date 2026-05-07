export async function normalizeImageFileForUpload(file: File): Promise<File> {
    if (typeof window === "undefined") return file;
    if (!file.type.toLowerCase().startsWith("image/")) return file;

    const maxLongEdge = 2200;
    const jpegQuality = 0.82;

    let objectUrl: string | null = null;

    try {
        objectUrl = URL.createObjectURL(file);

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();

            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Image failed to load"));

            image.src = objectUrl!;
        });

        const scale = Math.min(
            1,
            maxLongEdge / Math.max(img.naturalWidth, img.naturalHeight)
        );

        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return file;

        ctx.drawImage(img, 0, 0, width, height);

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
    } finally {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }
}