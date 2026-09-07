import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { products as productsTable } from "../../../../../db/schema";
import {
  refreshSessionFromRequest,
  unauthorizedResponse,
  withSessionCookie,
} from "../../../../../lib/auth";

export const runtime = "nodejs";

const maxImageLength = 20_000_000;
const thumbnailSize = 256;

// Thumbnails are made once per image, then held in memory. Nothing is written to the database.
const thumbnailCache = new Map<string, Buffer>();
const thumbnailCacheLimit = 300;

function readThumbnailCache(key: string) {
  const cached = thumbnailCache.get(key);
  if (!cached) return undefined;
  // Re-insert so the oldest key stays at the front for eviction.
  thumbnailCache.delete(key);
  thumbnailCache.set(key, cached);
  return cached;
}

function writeThumbnailCache(key: string, body: Buffer) {
  if (thumbnailCache.size >= thumbnailCacheLimit) {
    const oldest = thumbnailCache.keys().next().value;
    if (oldest !== undefined) thumbnailCache.delete(oldest);
  }
  thumbnailCache.set(key, body);
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function decodeImageDataUrl(value: string) {
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

async function makeThumbnail(bytes: Buffer) {
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await refreshSessionFromRequest(request);
  if (!session) return unauthorizedResponse(request);

  try {
    const { id } = await params;
    if (!id || id.length > 120) return errorResponse("Invalid product id", 400);
    const searchParams = new URL(request.url).searchParams;
    const variant = searchParams.get("variant");
    if (variant && variant !== "thumbnail") return errorResponse("Invalid image variant", 400);

    const db = await getDb();
    const [product] = await db
      .select({ image: productsTable.image, imageHash: productsTable.imageHash })
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);

    if (!product?.image) return errorResponse("Image not found", 404);

    // Versioned URLs change when a product image changes, so browsers can keep optimized bytes.
    const hasVersion = Boolean(searchParams.get("v"));
    const cacheControl = hasVersion
      ? "private, max-age=31536000, immutable"
      : "private, no-cache";
    const version =
      product.imageHash || createHash("sha256").update(product.image).digest("hex");
    const etag = `"${variant || "full"}-${version}"`;

    // The ETag follows the stored image, so a revalidation decodes and resizes nothing.
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": cacheControl },
      });
    }

    const cached = variant === "thumbnail" ? readThumbnailCache(etag) : undefined;
    if (cached) {
      return withSessionCookie(
        new Response(cached as unknown as BodyInit, {
          headers: { "Cache-Control": cacheControl, ETag: etag, "Content-Type": "image/webp" },
        }),
        session,
        request,
      );
    }

    if (product.image.length > maxImageLength) {
      console.error("Stored product image is too large", { id });
      return errorResponse("Image unavailable", 503);
    }

    const decoded = decodeImageDataUrl(product.image);
    if (!decoded) {
      console.error("Stored product image is invalid", { id });
      return errorResponse("Image unavailable", 503);
    }

    let body: Buffer<ArrayBufferLike> = decoded.bytes;
    let contentType = decoded.contentType;
    if (variant === "thumbnail") {
      const thumbnail = await makeThumbnail(decoded.bytes);
      if (thumbnail) {
        body = thumbnail;
        contentType = "image/webp";
        writeThumbnailCache(etag, thumbnail);
      }
    }

    return withSessionCookie(
      new Response(body as unknown as BodyInit, {
        headers: { "Cache-Control": cacheControl, ETag: etag, "Content-Type": contentType },
      }),
      session,
      request,
    );
  } catch (error) {
    console.error("Could not read product image", error);
    return errorResponse("Image service unavailable", 503);
  }
}
