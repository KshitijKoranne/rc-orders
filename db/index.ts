import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type SqlClient = ReturnType<typeof postgres>;

let client: SqlClient | undefined;
let schemaPromise: Promise<void> | undefined;

function getClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  client ??= postgres(process.env.DATABASE_URL, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
  });
  return client;
}

async function ensureSchema(sql: SqlClient) {
  await sql`
    CREATE TABLE IF NOT EXISTS rithya_products (
      id text PRIMARY KEY,
      r_code text NOT NULL UNIQUE,
      name text NOT NULL,
      price integer NOT NULL,
      cost integer NOT NULL DEFAULT 0,
      image text NOT NULL DEFAULT '',
      image_hash text NOT NULL DEFAULT '',
      notes text NOT NULL DEFAULT '',
      created_at text NOT NULL
    )
  `;
  await sql`
    ALTER TABLE rithya_products
    ADD COLUMN IF NOT EXISTS image_hash text NOT NULL DEFAULT ''
  `;
  await sql`
    ALTER TABLE rithya_products
    ADD COLUMN IF NOT EXISTS cost integer NOT NULL DEFAULT 0
  `;
  await sql`
    UPDATE rithya_products
    SET image_hash = md5(image)
    WHERE image_hash = '' AND image <> ''
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS rithya_orders (
      id text PRIMARY KEY,
      order_no text NOT NULL UNIQUE,
      items text NOT NULL DEFAULT '[]',
      r_code text NOT NULL,
      fragrance text NOT NULL DEFAULT '',
      unit_price integer NOT NULL,
      customer text NOT NULL,
      phone text NOT NULL DEFAULT '',
      product text NOT NULL,
      quantity integer NOT NULL,
      courier_charges integer NOT NULL DEFAULT 0,
      amount integer NOT NULL,
      paid integer NOT NULL,
      payment_status text NOT NULL,
      order_status text NOT NULL,
      due_date text NOT NULL DEFAULT '',
      source text NOT NULL,
      notes text NOT NULL DEFAULT '',
      created_at text NOT NULL
    )
  `;
  await sql`
    ALTER TABLE rithya_orders
    ADD COLUMN IF NOT EXISTS fragrance text NOT NULL DEFAULT ''
  `;
  await sql`
    ALTER TABLE rithya_orders
    ADD COLUMN IF NOT EXISTS items text NOT NULL DEFAULT '[]'
  `;
  await sql`
    ALTER TABLE rithya_orders
    ADD COLUMN IF NOT EXISTS courier_charges integer NOT NULL DEFAULT 0
  `;
}

export async function getDb() {
  const sql = getClient();
  if (!schemaPromise) {
    schemaPromise = ensureSchema(sql).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
  return drizzle(sql, { schema });
}
