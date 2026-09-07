import { Buffer } from "node:buffer";

export const thumbnailSize = 256;

export function decodeImageDataUrl(value: string) {
  const match = value.match(/^data:(image\/[a-z0-9.+-]+)((?:;[^,]*)?),([\s\S]*)$/i);
  if (!match) return null;

  try {
    const encoded = match[3];
    if (!/(?:^|;)base64$/i.test(match[2])) return null;
    const bytes = /^[A-Za-z0-9+/]*={0,2}$/.test(encoded) && encoded.length % 4 === 0
      ? Buffer.from(encoded, "base64")
      : null;
    if (!bytes?.length) return null;
    return { contentType: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

async function resize(bytes: Buffer) {
  if (process.env.RITHYA_NODE_RUNTIME !== "1") return null;

  try {
    const { default: sharp } = await import("sharp");
    return await sharp(bytes)
      .rotate()
      .resize({
        width: thumbnailSize,
        height: thumbnailSize,
        fit: "cover",
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (error) {
    console.error("Could not create product image thumbnail", error);
    return null;
  }
}

/**
 * Makes the stored thumbnail for a full-size image data URL.
 * Returns "" when the image is empty, invalid, or sharp is unavailable, so the
 * caller falls back to the full-size image and never loses the original.
 */
export async function makeStoredThumbnail(image: string) {
  if (!image) return "";
  const decoded = decodeImageDataUrl(image);
  if (!decoded) return "";
  const thumbnail = await resize(decoded.bytes);
  if (!thumbnail) return "";
  return `data:image/webp;base64,${thumbnail.toString("base64")}`;
}
