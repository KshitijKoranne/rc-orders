import { getDb } from "../../../db";
import { sql } from "drizzle-orm";
import { orders as ordersTable, products as productsTable } from "../../../db/schema";

export const runtime = "nodejs";

const paymentStatuses = new Set(["Pending", "Partial", "Paid"]);
const orderStatuses = new Set([
  "New",
  "In Progress",
  "Ready",
  "Delivered",
  "Cancelled",
]);
const maxRecords = 5_000;
const maxImageLength = 20_000_000;
const maxPayloadLength = 100_000_000;

type RecordMap = Record<string, unknown>;

function isRecord(value: unknown): value is RecordMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textValue(value: unknown, field: string, maxLength = 10_000) {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function requiredText(value: unknown, field: string, maxLength = 10_000) {
  const text = textValue(value, field, maxLength).trim();
  if (!text) throw new Error(`Invalid ${field}`);
  return text;
}

function integerValue(value: unknown, field: string, minimum = 0) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > 100_000_000) {
    throw new Error(`Invalid ${field}`);
  }
  return number;
}

function productValue(value: unknown) {
  if (!isRecord(value)) throw new Error("Invalid product");
  return {
    id: requiredText(value.id, "product id", 120),
    rCode: requiredText(value.rCode, "R-code", 40),
    name: requiredText(value.name, "product name", 200),
    price: integerValue(value.price, "product price", 1),
    image: value.image === undefined ? "" : textValue(value.image, "product image", maxImageLength),
    notes: textValue(value.notes, "product notes"),
    createdAt: requiredText(value.createdAt, "product date", 80),
  };
}

function orderValue(value: unknown) {
  if (!isRecord(value)) throw new Error("Invalid order");
  const paymentStatus = requiredText(value.paymentStatus, "payment status", 30);
  const orderStatus = requiredText(value.orderStatus, "order status", 30);
  if (!paymentStatuses.has(paymentStatus)) throw new Error("Invalid payment status");
  if (!orderStatuses.has(orderStatus)) throw new Error("Invalid order status");

  return {
    id: requiredText(value.id, "order id", 120),
    orderNo: requiredText(value.orderNo, "order number", 40),
    rCode: requiredText(value.rCode, "order R-code", 40),
    fragrance: textValue(value.fragrance ?? "", "fragrance", 40),
    unitPrice: integerValue(value.unitPrice, "unit price"),
    customer: requiredText(value.customer, "customer", 200),
    phone: textValue(value.phone, "phone", 80),
    product: requiredText(value.product, "order product", 200),
    quantity: integerValue(value.quantity, "quantity", 1),
    amount: integerValue(value.amount, "amount"),
    paid: integerValue(value.paid, "paid"),
    paymentStatus,
    orderStatus,
    dueDate: textValue(value.dueDate, "due date", 40),
    source: requiredText(value.source, "source", 80),
    notes: textValue(value.notes, "order notes"),
    createdAt: requiredText(value.createdAt, "order date", 80),
  };
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function imageUrl(id: string) {
  return `/api/products/${encodeURIComponent(id)}/image`;
}

function mergeStoredImage(
  product: ReturnType<typeof productValue>,
  storedImage: string | undefined,
) {
  if (!product.image || product.image === imageUrl(product.id)) {
    return { ...product, image: storedImage ?? "" };
  }
  if (!/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(product.image)) {
    throw new Error("Invalid product image");
  }
  return product;
}

export async function GET(request: Request) {
  const includeImages = new URL(request.url).searchParams.get("includeImages") === "1";

  try {
    const db = await getDb();
    const productsPromise = includeImages
      ? db.select().from(productsTable)
      : db
          .select({
            id: productsTable.id,
            rCode: productsTable.rCode,
            name: productsTable.name,
            price: productsTable.price,
            notes: productsTable.notes,
            createdAt: productsTable.createdAt,
            hasImage: sql<boolean>`char_length(${productsTable.image}) > 0`,
          })
          .from(productsTable)
          .then((products) =>
            products.map(({ hasImage, ...product }) => ({
              ...product,
              image: "",
              imageUrl: hasImage ? imageUrl(product.id) : "",
            })),
          );
    const [products, orders] = await Promise.all([
      productsPromise,
      db.select().from(ordersTable),
    ]);

    return Response.json(
      { products, orders },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Could not read Rithya Creations records", error);
    return errorResponse("Database unavailable", 503);
  }
}

export async function PUT(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxPayloadLength) return errorResponse("Backup is too large", 413);

  try {
    const payload: unknown = await request.json();
    if (!isRecord(payload) || !Array.isArray(payload.products) || !Array.isArray(payload.orders)) {
      return errorResponse("Invalid records payload", 400);
    }
    if (payload.products.length > maxRecords || payload.orders.length > maxRecords) {
      return errorResponse("Too many records", 400);
    }

    const products = payload.products.map(productValue);
    const orders = payload.orders.map(orderValue);
    const db = await getDb();

    // ponytail: a full snapshot keeps the single-user app simple; split mutations only if usage grows beyond this small VPS workflow.
    await db.transaction(async (transaction) => {
      const storedProducts = await transaction
        .select({ id: productsTable.id, image: productsTable.image })
        .from(productsTable);
      const storedImages = new Map(storedProducts.map((product) => [product.id, product.image]));
      const productsWithImages = products.map((product) =>
        mergeStoredImage(product, storedImages.get(product.id)),
      );

      await transaction.delete(ordersTable);
      await transaction.delete(productsTable);
      if (productsWithImages.length) {
        await transaction.insert(productsTable).values(productsWithImages);
      }
      if (orders.length) await transaction.insert(ordersTable).values(orders);
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid")) {
      return errorResponse(error.message, 400);
    }
    console.error("Could not save Rithya Creations records", error);
    return errorResponse("Could not save records", 500);
  }
}
