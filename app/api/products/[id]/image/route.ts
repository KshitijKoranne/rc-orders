import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { products as productsTable } from "../../../../../db/schema";
import { decodeImageDataUrl, makeStoredThumbnail } from "../../../../../lib/thumbnail";
import {
  refreshSessionFromRequest,
  unauthorizedResponse,
  withSessionCookie,
} from "../../../../../lib/auth";

export const runtime = "nodejs";

const maxImageLength = 20_000_000;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
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
      .select({
        image: productsTable.image,
        imageHash: productsTable.imageHash,
        imageThumb: productsTable.imageThumb,
      })
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

    let source = product.image;
    if (variant === "thumbnail") {
      let thumb = product.imageThumb;
      if (!thumb) {
        // Backfill for a product saved before thumbnails were stored. This writes
        // image_thumb for this one row and reads or changes nothing else.
        thumb = await makeStoredThumbnail(product.image);
        if (thumb) {
          await db
            .update(productsTable)
            .set({ imageThumb: thumb })
            .where(eq(productsTable.id, id));
        }
      }
      if (thumb) source = thumb;
    }

    if (source.length > maxImageLength) {
      console.error("Stored product image is too large", { id });
      return errorResponse("Image unavailable", 503);
    }

    const decoded = decodeImageDataUrl(source);
    if (!decoded) {
      console.error("Stored product image is invalid", { id });
      return errorResponse("Image unavailable", 503);
    }

    return withSessionCookie(
      new Response(decoded.bytes as unknown as BodyInit, {
        headers: {
          "Cache-Control": cacheControl,
          ETag: etag,
          "Content-Type": decoded.contentType,
        },
      }),
      session,
      request,
    );
  } catch (error) {
    console.error("Could not read product image", error);
    return errorResponse("Image service unavailable", 503);
  }
}
