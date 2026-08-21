import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const products = pgTable("rithya_products", {
  id: text("id").primaryKey(),
  rCode: text("r_code").notNull().unique(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  image: text("image").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const orders = pgTable("rithya_orders", {
  id: text("id").primaryKey(),
  orderNo: text("order_no").notNull().unique(),
  items: text("items").notNull().default("[]"),
  rCode: text("r_code").notNull(),
  fragrance: text("fragrance").notNull().default(""),
  unitPrice: integer("unit_price").notNull(),
  customer: text("customer").notNull(),
  phone: text("phone").notNull().default(""),
  product: text("product").notNull(),
  quantity: integer("quantity").notNull(),
  amount: integer("amount").notNull(),
  paid: integer("paid").notNull(),
  paymentStatus: text("payment_status").notNull(),
  orderStatus: text("order_status").notNull(),
  dueDate: text("due_date").notNull().default(""),
  source: text("source").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
});
