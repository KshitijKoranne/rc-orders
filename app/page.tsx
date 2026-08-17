"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type PaymentStatus = "Pending" | "Partial" | "Paid";
type OrderStatus = "New" | "In Progress" | "Ready" | "Delivered" | "Cancelled";

type Product = {
  id: string;
  rCode: string;
  name: string;
  price: number;
  image: string;
  notes: string;
  createdAt: string;
};

type Order = {
  id: string;
  orderNo: string;
  rCode: string;
  unitPrice: number;
  customer: string;
  phone: string;
  product: string;
  quantity: number;
  amount: number;
  paid: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  dueDate: string;
  source: string;
  notes: string;
  createdAt: string;
};

type OrderForm = Omit<Order, "id" | "orderNo" | "createdAt">;
type ProductForm = Omit<Product, "id" | "createdAt">;

const ordersKey = "rithya-creation-orders-v2";
const productsKey = "rithya-creation-products-v1";

const paymentStatuses: PaymentStatus[] = ["Pending", "Partial", "Paid"];
const orderStatuses: OrderStatus[] = [
  "New",
  "In Progress",
  "Ready",
  "Delivered",
  "Cancelled",
];

const initialOrderForm: OrderForm = {
  rCode: "",
  unitPrice: 0,
  customer: "",
  phone: "",
  product: "",
  quantity: 1,
  amount: 0,
  paid: 0,
  paymentStatus: "Pending",
  orderStatus: "New",
  dueDate: "",
  source: "WhatsApp",
  notes: "",
};

const initialProductForm: ProductForm = {
  rCode: "",
  name: "",
  price: 0,
  image: "",
  notes: "",
};

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRCode(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits && /^(R-?)?\d+$/.test(trimmed)) {
    return `R-${digits.padStart(4, "0")}`;
  }
  return trimmed;
}

function derivePaymentStatus(amount: number, paid: number): PaymentStatus {
  if (paid <= 0) return "Pending";
  if (paid >= amount && amount > 0) return "Paid";
  return "Partial";
}

function makeOrderNo(orders: Order[]) {
  const max = orders.reduce((highest, order) => {
    const match = order.orderNo.match(/RC-(\d+)/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1000);
  return `RC-${max + 1}`;
}

function migrateOrder(raw: Partial<Order>): Order {
  const quantity = Number(raw.quantity) || 1;
  const amount = Number(raw.amount) || 0;
  const paid = Number(raw.paid) || 0;
  return {
    id: raw.id || makeId("order"),
    orderNo: raw.orderNo || "RC-1001",
    rCode: normalizeRCode(raw.rCode || ""),
    unitPrice: Number(raw.unitPrice) || (quantity ? amount / quantity : amount),
    customer: raw.customer || "",
    phone: raw.phone || "",
    product: raw.product || "",
    quantity,
    amount,
    paid,
    paymentStatus: raw.paymentStatus || derivePaymentStatus(amount, paid),
    orderStatus: raw.orderStatus || "New",
    dueDate: raw.dueDate || "",
    source: raw.source || "Direct",
    notes: raw.notes || "",
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function parseStoredArray<T>(value: string | null, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderForm, setOrderForm] = useState<OrderForm>(initialOrderForm);
  const [productForm, setProductForm] = useState<ProductForm>(initialProductForm);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | OrderStatus>("All");
  const [isLoaded, setIsLoaded] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const savedProducts = window.localStorage.getItem(productsKey);
      const savedOrders = window.localStorage.getItem(ordersKey);

      setProducts(parseStoredArray<Product>(savedProducts, []));
      setOrders(parseStoredArray<Partial<Order>>(savedOrders, []).map(migrateOrder));
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(ordersKey, JSON.stringify(orders));
    window.localStorage.setItem(productsKey, JSON.stringify(products));
  }, [isLoaded, orders, products]);

  const productByCode = useMemo(() => {
    return new Map(products.map((product) => [product.rCode, product]));
  }, [products]);

  const selectedProduct = productByCode.get(normalizeRCode(orderForm.rCode));

  const visibleOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        !search ||
        [
          order.orderNo,
          order.rCode,
          order.customer,
          order.phone,
          order.product,
          order.source,
        ].some((field) => field.toLowerCase().includes(search));
      const matchesStatus =
        statusFilter === "All" || order.orderStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, query, statusFilter]);

  const totals = useMemo(() => {
    const active = orders.filter((order) => order.orderStatus !== "Cancelled");
    return {
      count: active.length,
      catalogue: products.length,
      revenue: active.reduce((sum, order) => sum + Number(order.amount), 0),
      collected: active.reduce((sum, order) => sum + Number(order.paid), 0),
      pending: active.reduce(
        (sum, order) =>
          sum + Math.max(Number(order.amount) - Number(order.paid), 0),
        0,
      ),
      ready: active.filter((order) => order.orderStatus === "Ready").length,
    };
  }, [orders, products]);

  function updateOrderField(
    field: keyof OrderForm,
    value: string | number | PaymentStatus | OrderStatus,
  ) {
    setOrderForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "rCode") {
        const product = productByCode.get(normalizeRCode(String(value)));
        if (product) {
          next.rCode = product.rCode;
          next.product = product.name;
          next.unitPrice = product.price;
          next.amount = product.price * Number(next.quantity || 1);
        }
      }
      if (field === "quantity") {
        const product = productByCode.get(normalizeRCode(next.rCode));
        if (product) {
          next.unitPrice = product.price;
          next.amount = product.price * Number(value || 1);
        }
      }
      if (field === "amount" || field === "paid" || field === "quantity" || field === "rCode") {
        next.paymentStatus = derivePaymentStatus(Number(next.amount), Number(next.paid));
      }
      return next;
    });
  }

  function updateProductField(field: keyof ProductForm, value: string | number) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  function resetOrderForm() {
    setOrderForm(initialOrderForm);
    setEditingOrderId(null);
  }

  function resetProductForm() {
    setProductForm(initialProductForm);
    setEditingProductId(null);
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanProduct: ProductForm = {
      ...productForm,
      rCode: normalizeRCode(productForm.rCode),
      name: productForm.name.trim(),
      price: Number(productForm.price) || 0,
      notes: productForm.notes.trim(),
    };

    if (!cleanProduct.rCode || !cleanProduct.name || cleanProduct.price <= 0) {
      setNotice("Enter R-code, product name, and price before saving.");
      return;
    }

    const duplicate = products.find(
      (product) =>
        product.rCode === cleanProduct.rCode && product.id !== editingProductId,
    );
    if (duplicate) {
      setNotice(`${cleanProduct.rCode} already exists in the catalogue.`);
      return;
    }

    if (editingProductId) {
      const previousProduct = products.find((product) => product.id === editingProductId);
      const previousRCode = previousProduct?.rCode || cleanProduct.rCode;
      setProducts((current) =>
        current.map((product) =>
          product.id === editingProductId ? { ...product, ...cleanProduct } : product,
        ),
      );
      setOrders((current) =>
        current.map((order) =>
          order.rCode === previousRCode
            ? {
                ...order,
                rCode: cleanProduct.rCode,
                product: cleanProduct.name,
                unitPrice: cleanProduct.price,
                amount: cleanProduct.price * order.quantity,
                paymentStatus: derivePaymentStatus(
                  cleanProduct.price * order.quantity,
                  order.paid,
                ),
              }
            : order,
        ),
      );
    } else {
      setProducts((current) => [
        {
          ...cleanProduct,
          id: makeId("product"),
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    }
    setNotice(`${cleanProduct.rCode} saved.`);
    resetProductForm();
  }

  function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanOrder = {
      ...orderForm,
      rCode: normalizeRCode(orderForm.rCode),
      customer: orderForm.customer.trim(),
      phone: orderForm.phone.trim(),
      product: orderForm.product.trim(),
      source: orderForm.source.trim() || "Direct",
      notes: orderForm.notes.trim(),
      quantity: Number(orderForm.quantity) || 1,
      unitPrice: Number(orderForm.unitPrice) || 0,
      amount: Number(orderForm.amount) || 0,
      paid: Number(orderForm.paid) || 0,
    };
    cleanOrder.paymentStatus = derivePaymentStatus(cleanOrder.amount, cleanOrder.paid);

    if (!cleanOrder.rCode) {
      setNotice("Enter an R-code before saving the order.");
      return;
    }
    if (!productByCode.has(cleanOrder.rCode)) {
      setNotice(`Add ${cleanOrder.rCode} to catalogue first so price is controlled.`);
      return;
    }

    if (editingOrderId) {
      setOrders((current) =>
        current.map((order) =>
          order.id === editingOrderId ? { ...order, ...cleanOrder } : order,
        ),
      );
    } else {
      setOrders((current) => [
        {
          ...cleanOrder,
          id: makeId("order"),
          orderNo: makeOrderNo(current),
          createdAt: new Date().toISOString(),
        },
        ...current,
      ]);
    }
    setNotice(`${cleanOrder.rCode} order saved.`);
    resetOrderForm();
  }

  function editProduct(product: Product) {
    setProductForm({
      rCode: product.rCode,
      name: product.name,
      price: product.price,
      image: product.image,
      notes: product.notes,
    });
    setEditingProductId(product.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editOrder(order: Order) {
    setOrderForm({
      rCode: order.rCode,
      unitPrice: order.unitPrice,
      customer: order.customer,
      phone: order.phone,
      product: order.product,
      quantity: order.quantity,
      amount: order.amount,
      paid: order.paid,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      dueDate: order.dueDate,
      source: order.source,
      notes: order.notes,
    });
    setEditingOrderId(order.id);
    window.scrollTo({ top: 360, behavior: "smooth" });
  }

  function deleteProduct(id: string) {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const isUsed = orders.some((order) => order.rCode === product.rCode);
    if (isUsed) {
      setNotice(`Cannot delete ${product.rCode}; it is used in an order.`);
      return;
    }
    setProducts((current) => current.filter((item) => item.id !== id));
  }

  function deleteOrder(id: string) {
    setOrders((current) => current.filter((order) => order.id !== id));
  }

  function exportCsv() {
    const headers = [
      "Order No",
      "R Code",
      "Customer",
      "Phone",
      "Product",
      "Qty",
      "Unit Price",
      "Amount",
      "Paid",
      "Balance",
      "Payment",
      "Status",
      "Due Date",
      "Source",
      "Notes",
    ];
    const rows = orders.map((order) => [
      order.orderNo,
      order.rCode,
      order.customer,
      order.phone,
      order.product,
      order.quantity,
      order.unitPrice,
      order.amount,
      order.paid,
      Math.max(order.amount - order.paid, 0),
      order.paymentStatus,
      order.orderStatus,
      order.dueDate,
      order.source,
      order.notes,
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    downloadFile(csv, "rithya-orders.csv", "text/csv");
  }

  function backupJson() {
    downloadFile(
      JSON.stringify({ products, orders }, null, 2),
      "rithya-creation-backup.json",
      "application/json",
    );
  }

  function restoreJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (Array.isArray(imported)) {
          setOrders(imported.map(migrateOrder));
        } else {
          if (!Array.isArray(imported.orders) || !Array.isArray(imported.products)) {
            throw new Error("Invalid backup");
          }
          setOrders(imported.orders.map(migrateOrder));
          setProducts(imported.products);
        }
        resetOrderForm();
        resetProductForm();
        setNotice("Backup restored.");
      } catch {
        alert("Could not import this file. Please select a valid backup JSON.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function uploadProductImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 900_000) {
      setNotice("Use an image below 900 KB for now, otherwise browser storage fills quickly.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateProductField("image", String(reader.result));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function downloadFile(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#f8f3ea] text-[#2a2118]">
      <section className="border-b border-[#e6d8c6] bg-[#fffaf2]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8d5b28]">
                Rithya Creations
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
                R-code order manager
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b5a48] sm:text-base">
                Save each candle by R-code with image and price. Then enter the
                R-code in an order and the amount is calculated automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="secondary-button" onClick={exportCsv}>
                Export CSV
              </button>
              <button className="secondary-button" onClick={backupJson}>
                Backup
              </button>
              <label className="secondary-button cursor-pointer">
                Restore
                <input
                  className="sr-only"
                  type="file"
                  accept="application/json"
                  onChange={restoreJson}
                />
              </label>
            </div>
          </div>

          {notice && (
            <div className="notice" role="status">
              {notice}
              <button type="button" onClick={() => setNotice("")}>
                Dismiss
              </button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Metric label="R-codes" value={String(totals.catalogue)} />
            <Metric label="Active orders" value={String(totals.count)} />
            <Metric label="Order value" value={currency(totals.revenue)} />
            <Metric label="Collected" value={currency(totals.collected)} />
            <Metric label="Pending" value={currency(totals.pending)} tone="warn" />
            <Metric label="Ready" value={String(totals.ready)} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[410px_1fr] lg:px-8">
        <div className="space-y-5">
          <form className="panel space-y-4" onSubmit={saveProduct}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">
                  {editingProductId ? "Edit R-code" : "Add R-code"}
                </h2>
                <p className="text-sm text-[#756554]">
                  One R-code, one product image, one controlled price.
                </p>
              </div>
              {editingProductId && (
                <button className="text-button" type="button" onClick={resetProductForm}>
                  Cancel
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="catalogueRCode">R-code</label>
                <input
                  id="catalogueRCode"
                  required
                  value={productForm.rCode}
                  onBlur={(event) =>
                    updateProductField("rCode", normalizeRCode(event.target.value))
                  }
                  onChange={(event) => updateProductField("rCode", event.target.value)}
                  placeholder="R-0001"
                />
              </div>
              <div className="field">
                <label htmlFor="cataloguePrice">Price</label>
                <input
                  id="cataloguePrice"
                  required
                  min="1"
                  type="number"
                  value={productForm.price}
                  onChange={(event) =>
                    updateProductField("price", Number(event.target.value))
                  }
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="catalogueName">Product name</label>
              <input
                id="catalogueName"
                required
                value={productForm.name}
                onChange={(event) => updateProductField("name", event.target.value)}
                placeholder="Rose jar candle"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-[96px_1fr]">
              <ProductImage product={productForm} />
              <div className="field">
                <label htmlFor="catalogueImage">Product photo</label>
                <input
                  id="catalogueImage"
                  type="file"
                  accept="image/*"
                  onChange={uploadProductImage}
                />
                <p className="text-xs text-[#756554]">
                  Keep images below 900 KB in this v1.
                </p>
              </div>
            </div>

            <div className="field">
              <label htmlFor="catalogueNotes">Catalogue notes</label>
              <textarea
                id="catalogueNotes"
                rows={2}
                value={productForm.notes}
                onChange={(event) => updateProductField("notes", event.target.value)}
                placeholder="Scent, size, packaging, stock note..."
              />
            </div>

            <button className="primary-button" type="submit">
              {editingProductId ? "Save R-code" : "Add R-code"}
            </button>
          </form>

          <form className="panel space-y-4" onSubmit={saveOrder}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                {editingOrderId ? "Edit order" : "New order"}
              </h2>
              {editingOrderId && (
                <button className="text-button" type="button" onClick={resetOrderForm}>
                  Cancel
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div className="field">
                <label htmlFor="orderRCode">R-code</label>
                <input
                  id="orderRCode"
                  required
                  list="rCodeList"
                  value={orderForm.rCode}
                  onBlur={(event) =>
                    updateOrderField("rCode", normalizeRCode(event.target.value))
                  }
                  onChange={(event) => updateOrderField("rCode", event.target.value)}
                  placeholder="R-0001"
                />
                <datalist id="rCodeList">
                  {products.map((product) => (
                    <option
                      key={product.id}
                      value={product.rCode}
                      label={`${product.name} - ${currency(product.price)}`}
                    />
                  ))}
                </datalist>
              </div>
              <ProductImage product={selectedProduct} />
            </div>

            <div className="field">
              <label htmlFor="customer">Customer name</label>
              <input
                id="customer"
                required
                value={orderForm.customer}
                onChange={(event) => updateOrderField("customer", event.target.value)}
                placeholder="Customer name"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  value={orderForm.phone}
                  onChange={(event) => updateOrderField("phone", event.target.value)}
                  placeholder="Mobile number"
                />
              </div>
              <div className="field">
                <label htmlFor="source">Source</label>
                <input
                  id="source"
                  value={orderForm.source}
                  onChange={(event) => updateOrderField("source", event.target.value)}
                  placeholder="WhatsApp"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="product">Product</label>
              <input
                id="product"
                required
                value={orderForm.product}
                onChange={(event) => updateOrderField("product", event.target.value)}
                placeholder="Auto-filled from R-code"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="field">
                <label htmlFor="quantity">Qty</label>
                <input
                  id="quantity"
                  min="1"
                  type="number"
                  value={orderForm.quantity}
                  onChange={(event) =>
                    updateOrderField("quantity", Number(event.target.value))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="unitPrice">Rate</label>
                <input id="unitPrice" readOnly value={orderForm.unitPrice} />
              </div>
              <div className="field">
                <label htmlFor="amount">Amount</label>
                <input
                  id="amount"
                  min="0"
                  type="number"
                  value={orderForm.amount}
                  onChange={(event) =>
                    updateOrderField("amount", Number(event.target.value))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="paid">Paid</label>
                <input
                  id="paid"
                  min="0"
                  type="number"
                  value={orderForm.paid}
                  onChange={(event) =>
                    updateOrderField("paid", Number(event.target.value))
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field">
                <label htmlFor="paymentStatus">Payment</label>
                <select
                  id="paymentStatus"
                  value={orderForm.paymentStatus}
                  onChange={(event) =>
                    updateOrderField(
                      "paymentStatus",
                      event.target.value as PaymentStatus,
                    )
                  }
                >
                  {paymentStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="orderStatus">Order status</label>
                <select
                  id="orderStatus"
                  value={orderForm.orderStatus}
                  onChange={(event) =>
                    updateOrderField("orderStatus", event.target.value as OrderStatus)
                  }
                >
                  {orderStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="dueDate">Due date</label>
              <input
                id="dueDate"
                type="date"
                value={orderForm.dueDate}
                onChange={(event) => updateOrderField("dueDate", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                rows={3}
                value={orderForm.notes}
                onChange={(event) => updateOrderField("notes", event.target.value)}
                placeholder="Packaging, delivery, scent, custom request..."
              />
            </div>

            <button className="primary-button" type="submit">
              {editingOrderId ? "Save order" : "Add order"}
            </button>
          </form>
        </div>

        <div className="space-y-5 min-w-0">
          <section className="panel min-w-0">
            <div className="flex items-center justify-between gap-3 border-b border-[#eadfce] pb-4">
              <div>
                <h2 className="text-xl font-semibold">R-code catalogue</h2>
                <p className="text-sm text-[#756554]">
                  {products.length} products saved
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <article className="product-card" key={product.id}>
                  <ProductImage product={product} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#8d5b28]">
                          {product.rCode}
                        </p>
                        <h3 className="font-semibold">{product.name}</h3>
                      </div>
                      <p className="font-semibold">{currency(product.price)}</p>
                    </div>
                    {product.notes && (
                      <p className="mt-1 text-sm text-[#756554]">{product.notes}</p>
                    )}
                    <div className="mt-3 flex gap-3">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => editProduct(product)}
                      >
                        Edit
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => deleteProduct(product.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel min-w-0">
            <div className="flex flex-col gap-3 border-b border-[#eadfce] pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Orders</h2>
                <p className="text-sm text-[#756554]">
                  {visibleOrders.length} shown from {orders.length} total
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search R-code, customer, phone"
                />
                <select
                  className="search-input sm:w-40"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "All" | OrderStatus)
                  }
                >
                  <option>All</option>
                  {orderStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-[#80684f]">
                  <tr>
                    <th className="py-3">Order</th>
                    <th>R-code</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eadfce]">
                  {visibleOrders.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      image={productByCode.get(order.rCode)?.image || ""}
                      onEdit={editOrder}
                      onDelete={deleteOrder}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 xl:hidden">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  image={productByCode.get(order.rCode)?.image || ""}
                  onEdit={editOrder}
                  onDelete={deleteOrder}
                />
              ))}
            </div>

            {!visibleOrders.length && (
              <div className="rounded-lg border border-dashed border-[#d6c4ad] p-8 text-center text-[#756554]">
                No orders found. Add one from the form or change the filters.
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <article className="rounded-lg border border-[#eadfce] bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#8d735c]">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          tone === "warn" ? "text-[#9b3f1b]" : "text-[#2a2118]"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function ProductImage({ product }: { product?: Pick<Product, "image" | "rCode"> | ProductForm }) {
  if (product?.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={product.rCode ? `${product.rCode} candle` : "Selected candle"}
        className="product-image"
        src={product.image}
      />
    );
  }
  return <div className="product-image empty-image">{product?.rCode || "R"}</div>;
}

function OrderRow({
  order,
  image,
  onEdit,
  onDelete,
}: {
  order: Order;
  image: string;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
}) {
  const balance = Math.max(order.amount - order.paid, 0);
  return (
    <tr className="align-top">
      <td className="py-4 font-semibold">{order.orderNo}</td>
      <td className="py-4">
        <div className="flex items-center gap-2">
          <ProductImage product={{ image, rCode: order.rCode }} />
          <span className="font-semibold text-[#8d5b28]">{order.rCode}</span>
        </div>
      </td>
      <td className="py-4">
        <p className="font-medium">{order.customer}</p>
        <p className="text-xs text-[#756554]">{order.phone || "No phone"}</p>
      </td>
      <td className="py-4">
        <p>{order.product}</p>
        <p className="text-xs text-[#756554]">
          Qty {order.quantity} x {currency(order.unitPrice)} via {order.source}
        </p>
      </td>
      <td className="py-4">
        <p className="font-semibold">{currency(order.amount)}</p>
        <p className="text-xs text-[#9b3f1b]">Balance {currency(balance)}</p>
      </td>
      <td className="py-4">
        <Chip label={order.paymentStatus} />
      </td>
      <td className="py-4">
        <Chip label={order.orderStatus} />
      </td>
      <td className="py-4">{order.dueDate || "-"}</td>
      <td className="py-4 text-right">
        <button className="text-button" type="button" onClick={() => onEdit(order)}>
          Edit
        </button>
        <button
          className="danger-button ml-3"
          type="button"
          onClick={() => onDelete(order.id)}
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function OrderCard({
  order,
  image,
  onEdit,
  onDelete,
}: {
  order: Order;
  image: string;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
}) {
  const balance = Math.max(order.amount - order.paid, 0);
  return (
    <article className="rounded-lg border border-[#eadfce] bg-[#fffdf8] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <ProductImage product={{ image, rCode: order.rCode }} />
          <div>
            <p className="text-sm font-semibold text-[#8d5b28]">
              {order.orderNo} | {order.rCode}
            </p>
            <h3 className="text-lg font-semibold">{order.customer}</h3>
            <p className="text-sm text-[#756554]">{order.phone || "No phone"}</p>
          </div>
        </div>
        <Chip label={order.orderStatus} />
      </div>
      <p className="mt-3 font-medium">{order.product}</p>
      <p className="mt-1 text-sm text-[#756554]">
        Qty {order.quantity} x {currency(order.unitPrice)} | {order.source} | Due{" "}
        {order.dueDate || "-"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <MiniStat label="Amount" value={currency(order.amount)} />
        <MiniStat label="Paid" value={currency(order.paid)} />
        <MiniStat label="Balance" value={currency(balance)} />
      </div>
      {order.notes && <p className="mt-3 text-sm text-[#6b5a48]">{order.notes}</p>}
      <div className="mt-4 flex gap-3">
        <button className="text-button" type="button" onClick={() => onEdit(order)}>
          Edit
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={() => onDelete(order.id)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#f4eadc] p-2">
      <p className="text-[11px] uppercase tracking-[0.1em] text-[#80684f]">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className={`chip ${label.toLowerCase().replaceAll(" ", "-")}`}>
      {label}
    </span>
  );
}
