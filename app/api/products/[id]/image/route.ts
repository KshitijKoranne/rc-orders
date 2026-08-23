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
      .select({ image: productsTable.image })
      .from(productsTable)
      .where(eq(productsTable.id, id))
      .limit(1);

    if (!product?.image) return errorResponse("Image not found", 404);
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
      }
    }

    const hasVersion = Boolean(searchParams.get("v"));
    const etag = `"${createHash("sha256")
      .update(contentType)
      .update("\0")
      .update(body)
      .digest("hex")}"`;
    const headers = {
      // Versioned URLs change when a product image changes, so browsers can keep optimized bytes.
      "Cache-Control": hasVersion ? "private, max-age=31536000, immutable" : "private, no-cache",
      ETag: etag,
      "Content-Type": contentType,
    };
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }

    return withSessionCookie(
      new Response(body as unknown as BodyInit, { headers }),
      session,
      request,
    );
  } catch (error) {
    console.error("Could not read product image", error);
    return errorResponse("Image service unavailable", 503);
  }
}
