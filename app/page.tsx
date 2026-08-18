"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
type TabKey = "new-r-code" | "new-order" | "catalogue" | "orders";

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

const maxImageBytes = 900_000;
const maxImageDataLength = 1_250_000;

const tabItems: Array<{ key: TabKey; label: string }> = [
  { key: "new-r-code", label: "New R-code" },
  { key: "new-order", label: "New order" },
  { key: "catalogue", label: "Catalogue" },
  { key: "orders", label: "Orders" },
];

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

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      quality,
    );
  });
}

async function prepareProductImage(file: File) {
  if (file.size <= maxImageBytes) return readAsDataUrl(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not decode image"));
      element.src = objectUrl;
    });
    let scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare image");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas, Math.max(0.55, 0.82 - attempt * 0.06));
      const dataUrl = await readAsDataUrl(blob);
      if (dataUrl.length <= maxImageDataLength) return dataUrl;
      scale *= 0.8;
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  throw new Error("Image is too large");
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
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("orders");

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      try {
        const response = await fetch("/api/records", { cache: "no-store" });
        if (!response.ok) throw new Error("Database unavailable");
        const payload = (await response.json()) as {
          products?: Product[];
          orders?: Partial<Order>[];
        };
        if (!Array.isArray(payload.products) || !Array.isArray(payload.orders)) {
          throw new Error("Invalid records response");
        }
        if (!active) return;
        setProducts(payload.products);
        setOrders(payload.orders.map(migrateOrder));
        setDatabaseConnected(true);
        setSyncError(false);
      } catch {
        if (!active) return;
        setProducts([]);
        setOrders([]);
        setDatabaseConnected(false);
        setSyncError(false);
        setNotice("Database unavailable. Changes will not be saved.");
      } finally {
        if (active) setIsLoaded(true);
      }
    }

    loadRecords();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !databaseConnected) return;
    const saveTimer = window.setTimeout(async () => {
      setIsSyncing(true);
      setSyncError(false);
      try {
        const response = await fetch("/api/records", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ products, orders }),
        });
        if (!response.ok) throw new Error("Could not save records");
      } catch {
        setSyncError(true);
        setNotice("Could not save changes to the database.");
      } finally {
        setIsSyncing(false);
      }
    }, 250);

    return () => window.clearTimeout(saveTimer);
  }, [databaseConnected, isLoaded, orders, products]);

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
      setProducts((current) =>
        current.map((product) =>
          product.id === editingProductId ? { ...product, ...cleanProduct } : product,
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
    setActiveTab("new-r-code");
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
    setActiveTab("new-order");
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
    if (!window.confirm("Delete this order?")) return;
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

  async function uploadProductImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const image = await prepareProductImage(file);
      updateProductField("image", image);
      setNotice("Photo ready. Save the R-code to keep it.");
    } catch {
      setNotice("Could not read that photo. Choose a JPG, PNG, or WEBP image.");
    } finally {
      input.value = "";
    }
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

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: TabKey,
  ) {
    const currentIndex = tabItems.findIndex((tab) => tab.key === currentTab);
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabItems.length) % tabItems.length;
    setActiveTab(tabItems[nextIndex].key);
    window.setTimeout(() => {
      document.getElementById(`tab-${tabItems[nextIndex].key}`)?.focus();
    }, 0);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              RC
            </span>
            <h1>Rithya Creations</h1>
          </div>
          <span
            aria-live="polite"
            className={`sync-status ${databaseConnected ? "connected" : "offline"}`}
          >
            {isLoaded
              ? isSyncing
                ? "Saving"
                : syncError
                  ? "Save failed"
                  : databaseConnected
                    ? "Saved"
                    : "Offline"
              : "Connecting"}
          </span>
          <div className="header-tools">
            <button className="tool-button" onClick={exportCsv} type="button">
              Export CSV
            </button>
            <button className="tool-button" onClick={backupJson} type="button">
              Backup
            </button>
            <label className="tool-button file-trigger">
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
      </header>

      <section className="workspace">
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")}>
              Close
            </button>
          </div>
        )}

        <nav className="tab-nav" aria-label="Workspace sections" role="tablist">
          {tabItems.map((tab) => (
            <button
              aria-controls={`panel-${tab.key}`}
              aria-selected={activeTab === tab.key}
              className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
              id={`tab-${tab.key}`}
              key={tab.key}
              onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              {tab.key === "catalogue" && <span className="tab-count">{products.length}</span>}
              {tab.key === "orders" && <span className="tab-count">{orders.length}</span>}
            </button>
          ))}
        </nav>

        <div className="metric-grid">
          <Metric label="R-codes" value={String(totals.catalogue)} />
          <Metric label="Active orders" value={String(totals.count)} />
          <Metric label="Order value" value={currency(totals.revenue)} />
          <Metric label="Collected" value={currency(totals.collected)} />
          <Metric label="Pending" value={currency(totals.pending)} tone="warn" />
          <Metric label="Ready" value={String(totals.ready)} />
        </div>

        {activeTab === "new-r-code" && (
          <form
            aria-labelledby="tab-new-r-code"
            className="workspace-panel form-panel"
            id="panel-new-r-code"
            onSubmit={saveProduct}
            role="tabpanel"
          >
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Catalogue</span>
                <h2>{editingProductId ? "Edit R-code" : "New R-code"}</h2>
              </div>
              {editingProductId && (
                <button className="text-button" type="button" onClick={resetProductForm}>
                  Cancel
                </button>
              )}
            </div>

            <div className="form-grid two-up">
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
                placeholder="Product name"
              />
            </div>

            <div className="photo-field">
              <ProductImage product={productForm} />
              <div className="field">
                <label htmlFor="catalogueImage">Product photo</label>
                <input
                  id="catalogueImage"
                  type="file"
                  accept="image/*"
                  onChange={uploadProductImage}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="catalogueNotes">Catalogue notes</label>
              <textarea
                id="catalogueNotes"
                rows={3}
                value={productForm.notes}
                onChange={(event) => updateProductField("notes", event.target.value)}
                placeholder="Notes"
              />
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit">
                {editingProductId ? "Save R-code" : "Add R-code"}
              </button>
            </div>
          </form>
        )}

        {activeTab === "new-order" && (
          <form
            aria-labelledby="tab-new-order"
            className="workspace-panel form-panel"
            id="panel-new-order"
            onSubmit={saveOrder}
            role="tabpanel"
          >
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Orders</span>
                <h2>{editingOrderId ? "Edit order" : "New order"}</h2>
              </div>
              {editingOrderId && (
                <button className="text-button" type="button" onClick={resetOrderForm}>
                  Cancel
                </button>
              )}
            </div>

            <div className="order-form-layout">
              <div className="field-stack">
                <div className="form-grid code-row">
                  <div className="field">
                    <label htmlFor="orderRCode">R-code</label>
                    <RCodePicker
                      products={products}
                      value={orderForm.rCode}
                      onChange={(value) => updateOrderField("rCode", value)}
                      onCreateProduct={() => setActiveTab("new-r-code")}
                    />
                  </div>
                  <div className={`selected-product-card ${selectedProduct ? "" : "empty"}`}>
                    <ProductImage product={selectedProduct} />
                    <div>
                      <span className="selected-product-label">Selected item</span>
                      <strong>{selectedProduct?.name || "Choose an R-code"}</strong>
                      {selectedProduct && <span>{currency(selectedProduct.price)}</span>}
                    </div>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="customer">Customer name</label>
                  <input
                    id="customer"
                    autoComplete="name"
                    required
                    value={orderForm.customer}
                    onChange={(event) => updateOrderField("customer", event.target.value)}
                    placeholder="Customer name"
                  />
                </div>

                <div className="form-grid two-up">
                  <div className="field">
                    <label htmlFor="phone">Phone</label>
                    <input
                      id="phone"
                      autoComplete="tel"
                      inputMode="tel"
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
                    readOnly={Boolean(selectedProduct)}
                    value={orderForm.product}
                    onChange={(event) => updateOrderField("product", event.target.value)}
                    placeholder="Choose an R-code first"
                  />
                </div>

                <div className="field">
                  <label htmlFor="notes">Notes</label>
                  <textarea
                    id="notes"
                    rows={4}
                    value={orderForm.notes}
                    onChange={(event) => updateOrderField("notes", event.target.value)}
                    placeholder="Notes"
                  />
                </div>
              </div>

              <div className="field-stack order-side">
                <div className="form-grid two-up">
                  <div className="field">
                    <label htmlFor="quantity">Qty</label>
                    <input
                      id="quantity"
                      inputMode="numeric"
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
                    <input id="unitPrice" inputMode="numeric" readOnly value={orderForm.unitPrice} />
                  </div>
                  <div className="field">
                    <label htmlFor="amount">Amount</label>
                    <input
                      id="amount"
                      inputMode="numeric"
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
                      inputMode="numeric"
                      min="0"
                      type="number"
                      value={orderForm.paid}
                      onChange={(event) =>
                        updateOrderField("paid", Number(event.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="form-grid two-up">
                  <div className="field">
                    <span className="field-label">Payment</span>
                    <div className="value-field">
                      <Chip label={orderForm.paymentStatus} />
                    </div>
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
              </div>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit">
                {editingOrderId ? "Save order" : "Add order"}
              </button>
            </div>
          </form>
        )}

        {activeTab === "catalogue" && (
          <section
            aria-labelledby="tab-catalogue"
            className="workspace-panel content-panel"
            id="panel-catalogue"
            role="tabpanel"
          >
            <div className="panel-heading">
              <div>
                <span className="section-kicker">Catalogue</span>
                <h2>R-codes</h2>
              </div>
              <span className="panel-count">{products.length}</span>
            </div>

            <div className="product-grid">
              {products.map((product) => (
                <article className="product-card" key={product.id}>
                  <ProductImage product={product} />
                  <div className="product-card-body">
                    <div className="product-card-topline">
                      <div>
                        <p className="code-label">{product.rCode}</p>
                        <h3>{product.name}</h3>
                      </div>
                      <p className="product-price">{currency(product.price)}</p>
                    </div>
                    {product.notes && <p className="product-notes">{product.notes}</p>}
                    <div className="inline-actions">
                      <button
                        aria-label={`Edit ${product.rCode}`}
                        className="text-button"
                        type="button"
                        onClick={() => editProduct(product)}
                      >
                        Edit
                      </button>
                      <button
                        aria-label={`Delete ${product.rCode}`}
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
            {!products.length && <EmptyState text="No R-codes yet" />}
          </section>
        )}

        {activeTab === "orders" && (
          <section
            aria-labelledby="tab-orders"
            className="workspace-panel content-panel"
            id="panel-orders"
            role="tabpanel"
          >
            <div className="panel-heading orders-heading">
              <div>
                <span className="section-kicker">Order book</span>
                <h2>Orders</h2>
              </div>
              <div className="list-controls">
                <input
                  className="search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search orders"
                />
                <select
                  className="search-input filter-select"
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

            <div className="orders-table-wrap">
              <table className="orders-table">
                <caption className="sr-only">Orders</caption>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">R-code</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Product</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Due</th>
                    <th className="align-right" scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
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

            <div className="order-cards">
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

            {!visibleOrders.length && <EmptyState text="No orders found" />}
          </section>
        )}
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
    <article className={`metric-card ${tone === "warn" ? "warn" : ""}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  );
}

function ProductImage({ product }: { product?: Pick<Product, "image" | "rCode"> | ProductForm }) {
  if (product?.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={product.rCode ? `${product.rCode} product` : "Selected product"}
        className="product-image"
        src={product.image}
      />
    );
  }
  return <div className="product-image empty-image">{product?.rCode || "R"}</div>;
}

function RCodePicker({
  products,
  value,
  onChange,
  onCreateProduct,
}: {
  products: Product[];
  value: string;
  onChange: (value: string) => void;
  onCreateProduct: () => void;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const selectedCode = normalizeRCode(value);
  const searchTerm = search.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    if (!searchTerm) return true;
    return [product.rCode, product.name].some((field) =>
      field.toLowerCase().includes(searchTerm),
    );
  });
  const selectedIndex = Math.max(
    0,
    filteredProducts.findIndex((product) => product.rCode === selectedCode),
  );
  const previewProduct = filteredProducts[highlightedIndex] || filteredProducts[selectedIndex];

  function openPicker() {
    setIsOpen(true);
    setHighlightedIndex(selectedIndex);
  }

  function chooseProduct(product: Product) {
    onChange(product.rCode);
    setSearch("");
    setHighlightedIndex(0);
    setIsOpen(false);
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (!pickerRef.current?.contains(document.activeElement)) setIsOpen(false);
    }, 0);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
    if (!filteredProducts.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) =>
        Math.min(Math.max(current + direction, 0), filteredProducts.length - 1),
      );
    }
    if (event.key === "Enter" && isOpen && previewProduct) {
      event.preventDefault();
      chooseProduct(previewProduct);
    }
  }

  return (
    <div className="rcode-picker" ref={pickerRef}>
      <div className="rcode-input-wrap">
        <input
          aria-activedescendant={
            isOpen && previewProduct ? `rcode-option-${previewProduct.id}` : undefined
          }
          aria-autocomplete="list"
          aria-controls="rcode-options"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          autoComplete="off"
          id="orderRCode"
          onBlur={handleBlur}
          onChange={(event) => {
            setSearch(event.target.value);
            onChange(event.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={openPicker}
          onKeyDown={handleKeyDown}
          placeholder={products.length ? "Search by R-code or item" : "Add an R-code first"}
          required
          role="combobox"
          value={value}
        />
        <button
          aria-label="Show all R-codes"
          aria-expanded={isOpen}
          className="rcode-toggle"
          onClick={() => (isOpen ? setIsOpen(false) : openPicker())}
          type="button"
        >
          <span aria-hidden="true">⌄</span>
        </button>
      </div>

      {isOpen && (
        <div className="rcode-menu">
          {previewProduct && (
            <div className="rcode-preview" aria-live="polite">
              <ProductImage product={previewProduct} />
              <div className="rcode-preview-copy">
                <span className="selected-product-label">Preview</span>
                <strong>{previewProduct.rCode}</strong>
                <span>{previewProduct.name}</span>
                <b>{currency(previewProduct.price)}</b>
              </div>
            </div>
          )}

          {filteredProducts.length ? (
            <div aria-label="Available R-codes" className="rcode-option-list" id="rcode-options" role="listbox">
              {filteredProducts.map((product, index) => (
                <button
                  aria-selected={product.rCode === selectedCode}
                  className={`rcode-option ${previewProduct?.id === product.id ? "highlighted" : ""}`}
                  id={`rcode-option-${product.id}`}
                  key={product.id}
                  onClick={() => chooseProduct(product)}
                  onFocus={() => setHighlightedIndex(index)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  role="option"
                  type="button"
                >
                  <span>
                    <strong>{product.rCode}</strong>
                    <small>{product.name}</small>
                  </span>
                  <b>{currency(product.price)}</b>
                </button>
              ))}
            </div>
          ) : products.length ? (
            <p className="rcode-empty">No R-codes match “{search}”.</p>
          ) : (
            <div className="rcode-empty">
              <strong>No R-codes yet</strong>
              <span>Add the item to your catalogue first.</span>
              <button className="text-button" onClick={onCreateProduct} type="button">
                Add an R-code
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
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
    <tr className="order-row">
      <td className="strong-cell">{order.orderNo}</td>
      <td>
        <div className="order-code-cell">
          <ProductImage product={{ image, rCode: order.rCode }} />
          <span className="code-label">{order.rCode}</span>
        </div>
      </td>
      <td>
        <p className="strong-cell">{order.customer}</p>
        <p className="muted-line">{order.phone || "No phone"}</p>
      </td>
      <td>
        <p>{order.product}</p>
        <p className="muted-line">
          Qty {order.quantity} x {currency(order.unitPrice)} via {order.source}
        </p>
      </td>
      <td>
        <p className="strong-cell">{currency(order.amount)}</p>
        <p className="balance-line">Balance {currency(balance)}</p>
      </td>
      <td>
        <Chip label={order.paymentStatus} />
      </td>
      <td>
        <Chip label={order.orderStatus} />
      </td>
      <td>{order.dueDate || "-"}</td>
      <td className="align-right">
        <button
          aria-label={`Edit order ${order.orderNo}`}
          className="text-button"
          type="button"
          onClick={() => onEdit(order)}
        >
          Edit
        </button>
        <button
          aria-label={`Delete order ${order.orderNo}`}
          className="danger-button action-spaced"
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
    <article className="order-card">
      <div className="order-card-heading">
        <div className="order-card-identity">
          <ProductImage product={{ image, rCode: order.rCode }} />
          <div>
            <p className="code-label">
              {order.orderNo} | {order.rCode}
            </p>
            <h3>{order.customer}</h3>
            <p className="muted-line">{order.phone || "No phone"}</p>
          </div>
        </div>
        <Chip label={order.orderStatus} />
      </div>
      <p className="order-product">{order.product}</p>
      <p className="muted-line">
        Qty {order.quantity} x {currency(order.unitPrice)} | {order.source} | Due{" "}
        {order.dueDate || "-"}
      </p>
      <div className="mini-stat-grid">
        <MiniStat label="Amount" value={currency(order.amount)} />
        <MiniStat label="Paid" value={currency(order.paid)} />
        <MiniStat label="Balance" value={currency(balance)} />
      </div>
      {order.notes && <p className="order-notes">{order.notes}</p>}
      <div className="inline-actions">
        <button
          aria-label={`Edit order ${order.orderNo}`}
          className="text-button"
          type="button"
          onClick={() => onEdit(order)}
        >
          Edit
        </button>
        <button
          aria-label={`Delete order ${order.orderNo}`}
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
    <div className="mini-stat">
      <p className="mini-stat-label">{label}</p>
      <p className="mini-stat-value">{value}</p>
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

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
