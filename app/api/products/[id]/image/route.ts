import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { products as productsTable } from "../../../../../db/schema";

export const runtime = "nodejs";

const maxImageLength = 20_000_000;

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id || id.length > 120) return errorResponse("Invalid product id", 400);

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

    const etag = `"${createHash("sha256")
      .update(decoded.contentType)
      .update("\0")
      .update(decoded.bytes)
      .digest("hex")}"`;
    const headers = {
      // Revalidate stable product URLs so a replacement image cannot stay stale in the browser.
      "Cache-Control": "private, no-cache",
      ETag: etag,
      "Content-Type": decoded.contentType,
    };
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }

    return new Response(decoded.bytes, { headers });
  } catch (error) {
    console.error("Could not read product image", error);
    return errorResponse("Image service unavailable", 503);
  }
}
