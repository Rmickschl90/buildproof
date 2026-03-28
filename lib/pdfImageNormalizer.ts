import sharp from "sharp";

const MAX_WIDTH = 2200;
const MAX_HEIGHT = 2200;
const JPEG_QUALITY = 82;

export async function normalizeImageForPdf(input: {
  bytes: Uint8Array | Buffer;
  mimeType?: string | null;
  fileName?: string | null;
}) {
  const source = Buffer.isBuffer(input.bytes)
    ? input.bytes
    : Buffer.from(input.bytes);

  const resized = sharp(source, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_WIDTH,
      height: MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    });

  const jpegBuffer = await resized.jpeg({ quality: JPEG_QUALITY }).toBuffer();

  const meta = await sharp(jpegBuffer).metadata();

  return {
    bytes: new Uint8Array(jpegBuffer),
    width: meta.width || 0,
    height: meta.height || 0,
    mimeType: "image/jpeg",
  };
}