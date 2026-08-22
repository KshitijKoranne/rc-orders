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
  image?: string;
  imageUrl?: string;
  notes: string;
  createdAt: string;
};

type OrderItem = {
  id: string;
  rCode: string;
  fragrance: string;
  unitPrice: number;
  product: string;
  quantity: number;
  amount: number;
};

type Order = {
  id: string;
  orderNo: string;
  customer: string;
  phone: string;
  items: OrderItem[];
  amount: number;
  paid: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  dueDate: string;
  source: string;
  notes: string;
  createdAt: string;
};

type NumericInput = number | "";
type RawOrder = Partial<Omit<Order, "items">> & {
  items?: unknown;
  rCode?: string;
  fragrance?: string;
  unitPrice?: number;
  product?: string;
  quantity?: number;
};
type OrderItemForm = Omit<OrderItem, "id"> & {
  unitPrice: NumericInput;
  quantity: NumericInput;
  amount: NumericInput;
};
type OrderForm = Omit<
  Order,
  "id" | "orderNo" | "createdAt" | "items" | "amount" | "paid"
> & {
  items: Array<OrderItemForm & { id: string }>;
  paid: NumericInput;
};
type ProductForm = Omit<Product, "id" | "createdAt" | "price"> & { price: NumericInput };
type TabKey = "new-r-code" | "new-order" | "catalogue" | "orders";
type QueueFilter = "all" | "due-today" | "overdue" | "ready" | "payment-due";
type ImageViewerState = { src: string; alt: string };
type BackupStatus = "idle" | "preparing" | "saving" | "error";

const orderStatuses: OrderStatus[] = [
  "New",
  "In Progress",
  "Ready",
  "Delivered",
  "Cancelled",
];

const fragranceOptions = [
  "Jasmin",
  "Rose",
  "Sandlewood",
  "Lavender",
  "Kevada",
  "Mogra",
  "Kapur",
  "Lemon",
  "Orange",
  "Vanilla",
  "Kesarchandan",
];

function makeEmptyOrderItem(): OrderItemForm & { id: string } {
  return {
    id: makeId("item"),
    rCode: "",
    fragrance: "",
    unitPrice: 0,
    product: "",
    quantity: 1,
    amount: 0,
  };
}

function makeInitialOrderForm(): OrderForm {
  return {
    items: [makeEmptyOrderItem()],
    customer: "",
    phone: "",
    paid: 0,
    paymentStatus: "Pending",
    orderStatus: "New",
    dueDate: "",
    source: "WhatsApp",
    notes: "",
  };
}

const initialProductForm: ProductForm = {
  rCode: "",
  name: "",
  price: 0,
  image: "",
  notes: "",
};

const maxImageDataLength = 20_000_000;

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

function numericInputValue(value: string): NumericInput {
  if (!value) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
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

function orderTotal(items: Array<{ amount: NumericInput }>) {
  return items.reduce((total, item) => total + (Number(item.amount) || 0), 0);
}

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

async function prepareProductImage(file: File) {
  if (!file.type.startsWith("image/") || file.size === 0) {
    throw new Error("Not an image");
  }
  const dataUrl = await readAsDataUrl(file);
  if (dataUrl.length > maxImageDataLength) throw new Error("Image is too large");
  return dataUrl;
}

function makeOrderNo(orders: Order[]) {
  const max = orders.reduce((highest, order) => {
    const match = order.orderNo.match(/RC-(\d+)/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1000);
  return `RC-${max + 1}`;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function migrateOrder(raw: RawOrder): Order {
  const quantity = Number(raw.quantity) || 1;
  const legacyAmount = Number(raw.amount) || 0;
  const legacyUnitPrice = Number(raw.unitPrice) || (quantity ? legacyAmount / quantity : legacyAmount);
  const legacyItem: OrderItem = {
    id: makeId("item"),
    rCode: normalizeRCode(raw.rCode || ""),
    fragrance: raw.fragrance || "",
    unitPrice: legacyUnitPrice,
    product: raw.product || "",
    quantity,
    amount: legacyAmount,
  };
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = (rawItems.length ? rawItems : [legacyItem]).map((rawItem, index) => {
    const item =
      typeof rawItem === "object" && rawItem !== null
        ? (rawItem as Partial<OrderItem>)
        : legacyItem;
    const itemQuantity = Number(item.quantity) || 1;
    const itemUnitPrice = Number(item.unitPrice) || 0;
    return {
      id: item.id || `${raw.id || "order"}-item-${index + 1}`,
      rCode: normalizeRCode(item.rCode || ""),
      fragrance: item.fragrance || "",
      unitPrice: itemUnitPrice,
      product: item.product || "",
      quantity: itemQuantity,
      amount: Number(item.amount) || itemUnitPrice * itemQuantity,
    };
  });
  const amount = orderTotal(items);
  const paid = Number(raw.paid) || 0;
  return {
    id: raw.id || makeId("order"),
    orderNo: raw.orderNo || "RC-1001",
    customer: raw.customer || "",
    phone: raw.phone || "",
    items,
    amount,
    paid,
    paymentStatus: derivePaymentStatus(amount, paid),
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
  const [orderForm, setOrderForm] = useState<OrderForm>(makeInitialOrderForm);
  const [productForm, setProductForm] = useState<ProductForm>(initialProductForm);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | OrderStatus>("All");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [isLoaded, setIsLoaded] = useState(false);
  const [databaseConnected, setDatabaseConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("orders");
  const [isDirty, setIsDirty] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const [imageScale, setImageScale] = useState(1);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>("idle");
  const imageUploadIdRef = useRef(0);
  const saveRequestRef = useRef(0);
  const imageViewerTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!imageViewer) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImageViewer(null);
    };
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".image-viewer button:not(:disabled)"),
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("keydown", trapFocus);
    const focusTimer = window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(".image-viewer button:not(:disabled)")?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("keydown", trapFocus);
      imageViewerTriggerRef.current?.focus();
      imageViewerTriggerRef.current = null;
    };
  }, [imageViewer]);

  useEffect(() => {
    let active = true;

    async function loadRecords() {
      try {
        const response = await fetch("/api/records", { cache: "no-store" });
        if (!response.ok) throw new Error("Database unavailable");
        const payload = (await response.json()) as {
          products?: Product[];
          orders?: RawOrder[];
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
    if (!isLoaded || !databaseConnected || !isDirty) return;
    const requestId = ++saveRequestRef.current;
    const saveTimer = window.setTimeout(async () => {
      setIsSyncing(true);
      setSyncError(false);
      try {
        const productsForSave = products.map((product) => {
          const snapshot = { ...product };
          delete snapshot.imageUrl;
          if (!snapshot.image) delete snapshot.image;
          return snapshot;
        });
        const response = await fetch("/api/records", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ products: productsForSave, orders }),
        });
        if (!response.ok) throw new Error("Could not save records");
        if (requestId === saveRequestRef.current) setIsDirty(false);
      } catch {
        if (requestId === saveRequestRef.current) {
          setSyncError(true);
          setNotice("Could not save changes to the database.");
        }
      } finally {
        if (requestId === saveRequestRef.current) setIsSyncing(false);
      }
    }, 250);

    return () => window.clearTimeout(saveTimer);
  }, [databaseConnected, isDirty, isLoaded, orders, products]);

  const productByCode = useMemo(() => {
    return new Map(products.map((product) => [product.rCode, product]));
  }, [products]);

  const queueCounts = useMemo(() => {
    const today = localDateKey();
    const actionable = orders.filter(
      (order) => order.orderStatus !== "Cancelled" && order.orderStatus !== "Delivered",
    );
    return {
      all: orders.length,
      dueToday: actionable.filter((order) => order.dueDate === today).length,
      overdue: actionable.filter((order) => order.dueDate && order.dueDate < today).length,
      ready: actionable.filter((order) => order.orderStatus === "Ready").length,
      paymentDue: actionable.filter((order) => order.amount > order.paid).length,
    };
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const search = query.trim().toLowerCase();
    const today = localDateKey();
    return orders.filter((order) => {
      const matchesOrderFields = [
        order.orderNo,
        order.customer,
        order.phone,
        order.source,
      ].some((field) => field.toLowerCase().includes(search));
      const matchesItemFields = order.items.some((item) =>
        [item.rCode, item.product, item.fragrance].some((field) =>
          field.toLowerCase().includes(search),
        ),
      );
      const matchesSearch = !search || matchesOrderFields || matchesItemFields;
      const matchesStatus =
        statusFilter === "All" || order.orderStatus === statusFilter;
      const isActionable =
        order.orderStatus !== "Cancelled" && order.orderStatus !== "Delivered";
      const matchesQueue =
        queueFilter === "all" ||
        (queueFilter === "due-today" && isActionable && order.dueDate === today) ||
        (queueFilter === "overdue" && isActionable && order.dueDate && order.dueDate < today) ||
        (queueFilter === "ready" && isActionable && order.orderStatus === "Ready") ||
        (queueFilter === "payment-due" && isActionable && order.amount > order.paid);
      return matchesSearch && matchesStatus && matchesQueue;
    });
  }, [orders, query, queueFilter, statusFilter]);

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
    field: Exclude<keyof OrderForm, "items">,
    value: string | number | PaymentStatus | OrderStatus,
  ) {
    setOrderForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "paid") {
        next.paymentStatus = derivePaymentStatus(orderTotal(next.items), Number(value));
      }
      return next;
    });
  }

  function updateOrderItem(
    index: number,
    field: keyof OrderItemForm,
    value: string | number,
  ) {
    setOrderForm((current) => {
      const items = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, [field]: value };
        if (field === "rCode") {
          const product = productByCode.get(normalizeRCode(String(value)));
          if (product) {
            next.rCode = product.rCode;
            next.product = product.name;
            next.unitPrice = product.price;
            next.amount = product.price * Number(next.quantity || 1);
          } else {
            next.product = "";
            next.unitPrice = 0;
            next.amount = 0;
          }
        }
        if (field === "quantity") {
          const product = productByCode.get(normalizeRCode(next.rCode));
          const unitPrice = (product?.price ?? Number(next.unitPrice)) || 0;
          next.unitPrice = product?.price ?? next.unitPrice;
          next.amount = unitPrice * Number(value || 1);
        }
        return next;
      });
      return {
        ...current,
        items,
        paymentStatus: derivePaymentStatus(orderTotal(items), Number(current.paid)),
      };
    });
  }

  function addOrderItem() {
    setOrderForm((current) => ({
      ...current,
      items: [...current.items, makeEmptyOrderItem()],
    }));
  }

  function removeOrderItem(id: string) {
    setOrderForm((current) => {
      if (current.items.length <= 1) return current;
      const items = current.items.filter((item) => item.id !== id);
      return {
        ...current,
        items,
        paymentStatus: derivePaymentStatus(orderTotal(items), Number(current.paid)),
      };
    });
  }

  function updateProductField(field: keyof ProductForm, value: string | number) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  function resetOrderForm() {
    setOrderForm(makeInitialOrderForm());
    setEditingOrderId(null);
  }

  function resetProductForm() {
    imageUploadIdRef.current += 1;
    setIsPreparingImage(false);
    setProductForm(initialProductForm);
    setEditingProductId(null);
  }

  function openImageViewer(src: string, alt: string) {
    if (document.activeElement instanceof HTMLElement) {
      imageViewerTriggerRef.current = document.activeElement;
    }
    setImageScale(1);
    setImageViewer({ src, alt });
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!databaseConnected) {
      setNotice("Database unavailable. Reconnect before saving changes.");
      return;
    }
    const cleanProduct = {
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
      setIsDirty(true);
      setProducts((current) =>
        current.map((product) =>
          product.id === editingProductId ? { ...product, ...cleanProduct } : product,
        ),
      );
    } else {
      setIsDirty(true);
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
    if (!databaseConnected) {
      setNotice("Database unavailable. Reconnect before saving changes.");
      return;
    }
    const cleanItems = orderForm.items.map((item) => {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      return {
        ...item,
        rCode: normalizeRCode(item.rCode),
        fragrance: item.fragrance.trim(),
        product: item.product.trim(),
        quantity,
        unitPrice,
        amount: Number(item.amount) || unitPrice * quantity,
      };
    });
    const amount = orderTotal(cleanItems);
    const cleanOrder = {
      ...orderForm,
      customer: orderForm.customer.trim(),
      phone: orderForm.phone.trim(),
      items: cleanItems,
      source: orderForm.source.trim() || "Direct",
      notes: orderForm.notes.trim(),
      amount,
      paid: Number(orderForm.paid) || 0,
    };
    cleanOrder.paymentStatus = derivePaymentStatus(cleanOrder.amount, cleanOrder.paid);

    const missingItem = cleanOrder.items.find((item) => !item.rCode);
    if (missingItem) {
      setNotice("Enter an R-code for every item before saving the order.");
      return;
    }
    const uncataloguedItem = cleanOrder.items.find(
      (item) => !productByCode.has(item.rCode),
    );
    if (uncataloguedItem) {
      setNotice(
        `Add ${uncataloguedItem.rCode} to catalogue first so price is controlled.`,
      );
      return;
    }

    if (editingOrderId) {
      setIsDirty(true);
      setOrders((current) =>
        current.map((order) =>
          order.id === editingOrderId ? { ...order, ...cleanOrder } : order,
        ),
      );
    } else {
      setIsDirty(true);
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
    setNotice(
      `${cleanOrder.items.length} item${cleanOrder.items.length === 1 ? "" : "s"} order saved.`,
    );
    resetOrderForm();
  }

  function editProduct(product: Product) {
    setProductForm({
      rCode: product.rCode,
      name: product.name,
      price: product.price,
      image: product.image,
      imageUrl: product.imageUrl,
      notes: product.notes,
    });
    setEditingProductId(product.id);
    setActiveTab("new-r-code");
    window.setTimeout(() => {
      document.getElementById("panel-new-r-code")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("catalogueRCode")?.focus();
    }, 0);
  }

  function editOrder(order: Order) {
    setOrderForm({
      items: order.items.map((item) => ({ ...item })),
      customer: order.customer,
      phone: order.phone,
      paid: order.paid,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      dueDate: order.dueDate,
      source: order.source,
      notes: order.notes,
    });
    setEditingOrderId(order.id);
    setActiveTab("new-order");
    window.setTimeout(() => {
      document.getElementById("panel-new-order")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById(`orderRCode-${order.items[0]?.id}`)?.focus();
    }, 0);
  }

  function deleteProduct(id: string) {
    if (!databaseConnected) {
      setNotice("Database unavailable. Reconnect before deleting records.");
      return;
    }
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const isUsed = orders.some((order) =>
      order.items.some((item) => item.rCode === product.rCode),
    );
    if (isUsed) {
      setNotice(`Cannot delete ${product.rCode}; it is used in an order.`);
      return;
    }
    if (!window.confirm(`Delete ${product.rCode} from the catalogue?`)) return;
    setIsDirty(true);
    setProducts((current) => current.filter((item) => item.id !== id));
  }

  function deleteOrder(id: string) {
    if (!databaseConnected) {
      setNotice("Database unavailable. Reconnect before deleting records.");
      return;
    }
    if (!window.confirm("Delete this order?")) return;
    setIsDirty(true);
    setOrders((current) => current.filter((order) => order.id !== id));
  }

  function exportCsv() {
    const headers = [
      "Order No",
      "R Code",
      "Fragrance",
      "Customer",
      "Phone",
      "Product",
      "Qty",
      "Unit Price",
      "Line Amount",
      "Order Total",
      "Paid",
      "Balance",
      "Payment",
      "Status",
      "Due Date",
      "Source",
      "Notes",
    ];
    const rows = orders.flatMap((order) =>
      order.items.map((item) => [
        order.orderNo,
        item.rCode,
        item.fragrance,
        order.customer,
        order.phone,
        item.product,
        item.quantity,
        item.unitPrice,
        item.amount,
        order.amount,
        order.paid,
        Math.max(order.amount - order.paid, 0),
        order.paymentStatus,
        order.orderStatus,
        order.dueDate,
        order.source,
        order.notes,
      ]),
    );
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    downloadFile(csv, "rithya-orders.csv", "text/csv");
  }

  async function backupJson() {
    if (!databaseConnected || isDirty || isSyncing) {
      setBackupStatus("error");
      setNotice(
        databaseConnected
          ? "Finish saving changes before creating a backup."
          : "Database unavailable. Reconnect before creating a backup.",
      );
      return;
    }
    setBackupStatus("preparing");
    setNotice("Preparing backup with original product images…");

    try {
      const response = await fetch("/api/records?includeImages=1", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not read complete records");
      const payload = (await response.json()) as {
        products?: Product[];
        orders?: RawOrder[];
      };
      if (!Array.isArray(payload.products) || !Array.isArray(payload.orders)) {
        throw new Error("Invalid complete records response");
      }

      const backedUpProducts = new Map(payload.products.map((product) => [product.id, product]));
      const missingImages = products.some((product) => {
        if (!product.image && !product.imageUrl) return false;
        return !backedUpProducts.get(product.id)?.image;
      });
      if (missingImages) throw new Error("Complete records did not include every product image");

      setBackupStatus("saving");
      setNotice("Saving backup…");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      downloadFile(
        JSON.stringify({ products: payload.products, orders: payload.orders }, null, 2),
        "rithya-creation-backup.json",
        "application/json",
      );
      setBackupStatus("idle");
      setNotice("Backup saved with original product images.");
    } catch {
      setBackupStatus("error");
      setNotice("Backup failed. No file was downloaded because complete images were not verified.");
    }
  }

  function restoreJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!databaseConnected) {
      setNotice("Database unavailable. Reconnect before restoring a backup.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (Array.isArray(imported)) {
          setIsDirty(true);
          setOrders(imported.map(migrateOrder));
        } else {
          if (!Array.isArray(imported.orders) || !Array.isArray(imported.products)) {
            throw new Error("Invalid backup");
          }
          setIsDirty(true);
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
    const uploadId = imageUploadIdRef.current + 1;
    imageUploadIdRef.current = uploadId;
    setIsPreparingImage(true);

    try {
      const image = await prepareProductImage(file);
      if (uploadId !== imageUploadIdRef.current) return;
      updateProductField("image", image);
      setNotice("Photo ready. Save the R-code to keep it.");
    } catch {
      if (uploadId !== imageUploadIdRef.current) return;
      input.value = "";
      setNotice("Could not read that photo. Choose a valid image under 15 MB.");
    } finally {
      if (uploadId === imageUploadIdRef.current) setIsPreparingImage(false);
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
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabItems.length - 1
          : (currentIndex + direction + tabItems.length) % tabItems.length;
    setActiveTab(tabItems[nextIndex].key);
    window.setTimeout(() => {
      document.getElementById(`tab-${tabItems[nextIndex].key}`)?.focus();
    }, 0);
  }

  const hasOrderFilters =
    Boolean(query.trim()) || statusFilter !== "All" || queueFilter !== "all";
  const orderEmptyText = queueFilter !== "all"
    ? "Nothing in this queue"
    : hasOrderFilters
      ? "No matching orders"
      : "Your order book is clear";
  const orderEmptyDetail = queueFilter !== "all"
    ? "Try another attention queue or return to all orders."
    : hasOrderFilters
      ? "No orders found in this view. Clear the filters to see the full order book."
      : products.length
        ? "New orders will appear here as soon as you save them."
        : "No orders found yet. Add an R-code first, then use it to build an order.";

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
            className={`sync-status ${databaseConnected ? "connected" : "offline"} ${
              isSyncing ? "saving" : syncError ? "failed" : ""
            }`}
          >
            {databaseConnected
              ? isSyncing
                ? "Saving"
                : syncError
                  ? "Save failed"
                  : "Saved"
              : isLoaded
                ? "Offline"
                : "Connecting"}
          </span>
          <div className="header-tools">
            <button className="tool-button" onClick={exportCsv} type="button">
              Export CSV
            </button>
            <button
              aria-busy={backupStatus === "preparing" || backupStatus === "saving"}
              className="tool-button"
              disabled={backupStatus === "preparing" || backupStatus === "saving"}
              onClick={backupJson}
              type="button"
            >
              {backupStatus === "preparing"
                ? "Preparing backup"
                : backupStatus === "saving"
                  ? "Saving backup"
                  : backupStatus === "error"
                    ? "Retry backup"
                    : "Backup"}
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
              tabIndex={activeTab === tab.key ? 0 : -1}
              type="button"
            >
              <span>{tab.label}</span>
              {tab.key === "catalogue" && <span className="tab-count">{products.length}</span>}
              {tab.key === "orders" && <span className="tab-count">{orders.length}</span>}
            </button>
          ))}
        </nav>

        <div className="work-summary">
          <div className="work-summary-lead">
            <span className="section-kicker">Work surface</span>
            <h2>Keep the next thing moving.</h2>
            <p>
              {totals.count} active order{totals.count === 1 ? "" : "s"} ·{" "}
              {totals.catalogue} R-code{totals.catalogue === 1 ? "" : "s"} in the shelf.
            </p>
          </div>
          <div className="summary-metrics">
            <Metric label="R-codes" value={String(totals.catalogue)} />
            <Metric label="Active orders" value={String(totals.count)} />
            <Metric label="Pending" value={currency(totals.pending)} tone="warn" />
            <Metric label="Ready" value={String(totals.ready)} />
          </div>
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
                    updateProductField("price", numericInputValue(event.target.value))
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
              <ProductImage product={productForm} onEnlarge={openImageViewer} />
              <div className="field">
                <label htmlFor="catalogueImage">
                  {isPreparingImage ? "Preparing product photo" : "Product photo"}
                </label>
                <input
                  id="catalogueImage"
                  type="file"
                  accept="image/*"
                  disabled={isPreparingImage}
                  onClick={(event) => {
                    // Clear before opening so selecting the same file again still fires change.
                    event.currentTarget.value = "";
                  }}
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
              <button className="primary-button" disabled={isPreparingImage} type="submit">
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

                <div className="order-items-section">
                  <div className="order-items-heading">
                    <div>
                      <span className="section-kicker">Items</span>
                      <h3>Order items</h3>
                    </div>
                    <button className="secondary-button" onClick={addOrderItem} type="button">
                      + Add item
                    </button>
                  </div>

                  <div className="order-items-list">
                    {orderForm.items.map((item, index) => {
                      const selectedProduct = productByCode.get(normalizeRCode(item.rCode));
                      return (
                        <article className="order-item-editor" key={item.id}>
                          <div className="order-item-editor-heading">
                            <strong>Item {index + 1}</strong>
                            {orderForm.items.length > 1 && (
                              <button
                                className="danger-button"
                                onClick={() => removeOrderItem(item.id)}
                                type="button"
                              >
                                Remove
                              </button>
                            )}
                          </div>

                          <div className="form-grid code-row">
                            <div className="field">
                              <label htmlFor={`orderRCode-${item.id}`}>R-code</label>
                              <RCodePicker
                                id={`orderRCode-${item.id}`}
                                products={products}
                                value={item.rCode}
                                onChange={(value) => updateOrderItem(index, "rCode", value)}
                                onCreateProduct={() => setActiveTab("new-r-code")}
                                onEnlarge={openImageViewer}
                              />
                            </div>
                            <div className={`selected-product-card ${selectedProduct ? "" : "empty"}`}>
                              <ProductImage product={selectedProduct} onEnlarge={openImageViewer} />
                              <div>
                                <span className="selected-product-label">Selected item</span>
                                <strong>{selectedProduct?.name || "Choose an R-code"}</strong>
                                {selectedProduct && <span>{currency(selectedProduct.price)}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="form-grid two-up">
                            <div className="field">
                              <label htmlFor={`product-${item.id}`}>Product</label>
                              <input
                                id={`product-${item.id}`}
                                required
                                readOnly={Boolean(selectedProduct)}
                                value={item.product}
                                onChange={(event) =>
                                  updateOrderItem(index, "product", event.target.value)
                                }
                                placeholder="Choose an R-code first"
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`fragrance-${item.id}`}>Fragrance</label>
                              <select
                                id={`fragrance-${item.id}`}
                                value={item.fragrance}
                                onChange={(event) =>
                                  updateOrderItem(index, "fragrance", event.target.value)
                                }
                              >
                                <option value="">Select fragrance</option>
                                {fragranceOptions.map((fragrance) => (
                                  <option key={fragrance} value={fragrance}>
                                    {fragrance}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="form-grid three-up">
                            <div className="field">
                              <label htmlFor={`quantity-${item.id}`}>Qty</label>
                              <input
                                id={`quantity-${item.id}`}
                                inputMode="numeric"
                                min="1"
                                type="number"
                                value={item.quantity}
                                onChange={(event) =>
                                  updateOrderItem(
                                    index,
                                    "quantity",
                                    numericInputValue(event.target.value),
                                  )
                                }
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`unitPrice-${item.id}`}>Rate</label>
                              <input
                                id={`unitPrice-${item.id}`}
                                inputMode="numeric"
                                readOnly
                                value={item.unitPrice}
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`amount-${item.id}`}>Line amount</label>
                              <input
                                id={`amount-${item.id}`}
                                inputMode="numeric"
                                min="0"
                                type="number"
                                value={item.amount}
                                onChange={(event) =>
                                  updateOrderItem(
                                    index,
                                    "amount",
                                    numericInputValue(event.target.value),
                                  )
                                }
                              />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="notes">Order notes</label>
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
                <div className="order-total-panel">
                  <span className="field-label">Order total</span>
                  <strong>{currency(orderTotal(orderForm.items))}</strong>
                  <span>
                    {orderForm.items.length} item{orderForm.items.length === 1 ? "" : "s"}
                  </span>
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
                      updateOrderField("paid", numericInputValue(event.target.value))
                    }
                  />
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
                      <ProductImage product={product} onEnlarge={openImageViewer} />
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
            {!products.length && (
              <EmptyState
                actionLabel="Add an R-code"
                detail="Give each piece a code, price, and optional photo."
                onAction={() => setActiveTab("new-r-code")}
                text="No R-codes yet"
              />
            )}
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
                  aria-label="Search orders"
                  className="search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search orders"
                />
                <select
                  aria-label="Filter orders by status"
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

            <div className="queue-strip" aria-label="Order queues">
              {([
                ["all", "All orders", queueCounts.all],
                ["due-today", "Due today", queueCounts.dueToday],
                ["overdue", "Overdue", queueCounts.overdue],
                ["ready", "Ready", queueCounts.ready],
                ["payment-due", "Payment due", queueCounts.paymentDue],
              ] as Array<[QueueFilter, string, number]>).map(([key, label, count]) => (
                <button
                  aria-pressed={queueFilter === key}
                  className={`queue-button ${queueFilter === key ? "active" : ""}`}
                  key={key}
                  onClick={() => setQueueFilter(key)}
                  type="button"
                >
                  <span>{label}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>

            {visibleOrders.length ? (
              <>
                <div className="orders-table-wrap">
                  <table className="orders-table">
                    <caption className="sr-only">Orders</caption>
                    <thead>
                      <tr>
                        <th scope="col">Order</th>
                        <th scope="col">Items</th>
                        <th scope="col">Customer</th>
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
                          image={productByCode.get(order.items[0]?.rCode || "")?.image || ""}
                          imageUrl={productByCode.get(order.items[0]?.rCode || "")?.imageUrl}
                          onEnlarge={openImageViewer}
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
                      image={productByCode.get(order.items[0]?.rCode || "")?.image || ""}
                      imageUrl={productByCode.get(order.items[0]?.rCode || "")?.imageUrl}
                      onEnlarge={openImageViewer}
                      onEdit={editOrder}
                      onDelete={deleteOrder}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                actionLabel={hasOrderFilters ? "Clear filters" : products.length ? "New order" : "Add an R-code"}
                detail={orderEmptyDetail}
                onAction={() => {
                  if (hasOrderFilters) {
                    setQuery("");
                    setStatusFilter("All");
                    setQueueFilter("all");
                  } else {
                    setActiveTab(products.length ? "new-order" : "new-r-code");
                  }
                }}
                text={orderEmptyText}
              />
            )}
          </section>
        )}
      </section>
      {imageViewer && (
        <div
          aria-label={`${imageViewer.alt} enlarged`}
          aria-modal="true"
          className="image-viewer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImageViewer(null);
          }}
          role="dialog"
        >
          <div className="image-viewer-toolbar">
            <button
              aria-label="Zoom out"
              disabled={imageScale <= 1}
              onClick={() => setImageScale((current) => Math.max(1, current - 0.5))}
              type="button"
            >
              −
            </button>
            <button
              aria-label="Reset image zoom"
              autoFocus
              onClick={() => setImageScale(1)}
              type="button"
            >
              {Math.round(imageScale * 100)}%
            </button>
            <button
              aria-label="Zoom in"
              disabled={imageScale >= 3}
              onClick={() => setImageScale((current) => Math.min(3, current + 0.5))}
              type="button"
            >
              +
            </button>
            <button aria-label="Close enlarged image" onClick={() => setImageViewer(null)} type="button">
              Close
            </button>
          </div>
          <div className="image-viewer-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={imageViewer.alt}
              className="image-viewer-image"
              src={imageViewer.src}
              style={{
                maxHeight: imageScale === 1 ? "calc(100vh - 96px)" : "none",
                maxWidth: imageScale === 1 ? "calc(100vw - 48px)" : "none",
                transform: `scale(${imageScale})`,
              }}
            />
          </div>
        </div>
      )}
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

function ProductImage({
  product,
  onEnlarge,
}: {
  product?: Pick<Product, "image" | "imageUrl" | "rCode"> | ProductForm;
  onEnlarge?: (src: string, alt: string) => void;
}) {
  const imageSrc = product?.image || product?.imageUrl;
  if (imageSrc) {
    const alt = product.rCode ? `${product.rCode} product` : "Selected product";
    const image = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt}
        className={onEnlarge ? "product-image-content" : "product-image"}
        decoding="async"
        loading="lazy"
        src={imageSrc}
      />
    );
    if (onEnlarge) {
      return (
        <button
          aria-label={`Enlarge ${alt}`}
          className="product-image product-image-button"
          onClick={() => onEnlarge(imageSrc, alt)}
          type="button"
        >
          {image}
        </button>
      );
    }
    return (
      image
    );
  }
  return <div className="product-image empty-image">{product?.rCode || "R"}</div>;
}

function RCodePicker({
  id,
  products,
  value,
  onChange,
  onCreateProduct,
  onEnlarge,
}: {
  id: string;
  products: Product[];
  value: string;
  onChange: (value: string) => void;
  onCreateProduct: () => void;
  onEnlarge: (src: string, alt: string) => void;
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
          aria-controls={`${id}-options`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          autoComplete="off"
          id={id}
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
              <ProductImage product={previewProduct} onEnlarge={onEnlarge} />
              <div className="rcode-preview-copy">
                <span className="selected-product-label">Preview</span>
                <strong>{previewProduct.rCode}</strong>
                <span>{previewProduct.name}</span>
                <b>{currency(previewProduct.price)}</b>
              </div>
            </div>
          )}

          {filteredProducts.length ? (
            <div
              aria-label="Available R-codes"
              className="rcode-option-list"
              id={`${id}-options`}
              role="listbox"
            >
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
  imageUrl,
  onEnlarge,
  onEdit,
  onDelete,
}: {
  order: Order;
  image: string;
  imageUrl?: string;
  onEnlarge: (src: string, alt: string) => void;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
}) {
  const balance = Math.max(order.amount - order.paid, 0);
  const firstItem = order.items[0];
  return (
    <tr className="order-row">
      <td className="strong-cell">{order.orderNo}</td>
      <td>
        <div className="order-item-table-cell">
          <ProductImage
            product={{ image, imageUrl, rCode: firstItem?.rCode || "R" }}
            onEnlarge={onEnlarge}
          />
          <OrderItemsSummary items={order.items} />
        </div>
      </td>
      <td>
        <p className="strong-cell">{order.customer}</p>
        <p className="muted-line">{order.phone || "No phone"}</p>
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
  imageUrl,
  onEnlarge,
  onEdit,
  onDelete,
}: {
  order: Order;
  image: string;
  imageUrl?: string;
  onEnlarge: (src: string, alt: string) => void;
  onEdit: (order: Order) => void;
  onDelete: (id: string) => void;
}) {
  const balance = Math.max(order.amount - order.paid, 0);
  const firstItem = order.items[0];
  return (
    <article className="order-card">
      <div className="order-card-heading">
        <div className="order-card-identity">
          <ProductImage
            product={{ image, imageUrl, rCode: firstItem?.rCode || "R" }}
            onEnlarge={onEnlarge}
          />
          <div>
            <p className="code-label">
              {order.orderNo} | {order.items.map((item) => item.rCode).join(" · ")}
            </p>
            <h3>{order.customer}</h3>
            <p className="muted-line">{order.phone || "No phone"}</p>
          </div>
        </div>
        <Chip label={order.orderStatus} />
      </div>
      <OrderItemsSummary items={order.items} />
      <p className="muted-line">
        {order.source} | Due {order.dueDate || "-"}
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

function OrderItemsSummary({ items }: { items: OrderItem[] }) {
  return (
    <div className="order-items-summary">
      {items.map((item) => (
        <div className="order-item-summary" key={item.id}>
          <div className="order-item-summary-title">
            <span className="code-label">{item.rCode}</span>
            <strong>{item.product}</strong>
          </div>
          <p className="muted-line">
            Qty {item.quantity} x {currency(item.unitPrice)} = {currency(item.amount)}
            {item.fragrance ? ` | ${item.fragrance}` : ""}
          </p>
        </div>
      ))}
    </div>
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

function EmptyState({
  text,
  detail,
  actionLabel,
  onAction,
}: {
  text: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <strong>{text}</strong>
      {detail && <p>{detail}</p>}
      {actionLabel && onAction && (
        <button className="secondary-button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
