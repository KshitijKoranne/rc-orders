export type NumericInput = number | "";

export function normalizeRCode(value: string) {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits && /^(R-?)?\d+$/.test(trimmed)) {
    if (!/[1-9]/.test(digits)) return "";
    const significantDigits = digits.replace(/^0+(?=\d)/, "");
    return `R-${significantDigits.padStart(4, "0")}`;
  }
  return trimmed;
}

export function matchesRCodeSearch(rCode: string, name: string, search: string) {
  const searchTerm = search.trim().toLowerCase();
  if (!searchTerm) return true;
  const normalizedSearch = normalizeRCode(search).toLowerCase();
  const fields = [rCode.toLowerCase(), normalizeRCode(rCode).toLowerCase(), name.toLowerCase()];
  return fields.some(
    (field) => field.includes(searchTerm) || (normalizedSearch && field.includes(normalizedSearch)),
  );
}

export function derivePaymentStatus(amount: number, paid: number) {
  if (paid <= 0) return "Pending" as const;
  if (paid >= amount && amount > 0) return "Paid" as const;
  return "Partial" as const;
}

export function isActiveOrderStatus(status: string) {
  return status !== "Cancelled" && status !== "Delivered";
}

export function orderTotal(
  items: Array<{ amount: NumericInput }>,
  courierCharges: NumericInput = 0,
) {
  return (
    items.reduce((total, item) => total + (Number(item.amount) || 0), 0) +
    (Number(courierCharges) || 0)
  );
}

/**
 * Profit is derived, not stored. A cost change in the catalogue
 * recalculates the profit of every order, old and new.
 * Courier charges are excluded on both sides: the customer pays them
 * and the courier takes them, so they are not margin.
 */
export type ProfitItem = { rCode: string; quantity: number; amount: number };

export function costByRCode(products: Array<{ rCode: string; cost?: number }>) {
  const map = new Map<string, number>();
  products.forEach((product) => map.set(product.rCode, Number(product.cost) || 0));
  return map;
}

export function orderCost(items: ProfitItem[], costs: Map<string, number>) {
  return items.reduce(
    (sum, item) => sum + (costs.get(item.rCode) ?? 0) * (Number(item.quantity) || 0),
    0,
  );
}

export function orderGoodsRevenue(items: ProfitItem[]) {
  return items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

export function orderProfit(items: ProfitItem[], costs: Map<string, number>) {
  return orderGoodsRevenue(items) - orderCost(items, costs);
}

export function marginPercent(profit: number, revenue: number) {
  if (revenue <= 0) return 0;
  return Math.round((profit / revenue) * 1000) / 10;
}

/** Catalogue order: R-0002 before R-0010 before R-10000. */
export function compareRCode(a: { rCode: string }, b: { rCode: string }) {
  return a.rCode.localeCompare(b.rCode, undefined, { numeric: true });
}

/**
 * One fragrance per unit, stored in the item's existing `fragrance` text as "Rose, Jasmin".
 * A single stored value means every unit has that fragrance (old orders read this way).
 */
export function unitFragrances(fragrance: string, quantity: number) {
  const count = Math.min(Math.max(Math.floor(Number(quantity)) || 1, 1), 100);
  const parts = fragrance ? fragrance.split(",").map((part) => part.trim()) : [];
  return Array.from({ length: count }, (_, index) =>
    parts.length === 1 ? parts[0] : (parts[index] ?? ""),
  );
}

/** Stored form: "" when none, one value when all units match, else one entry per unit. */
export function storedFragrance(fragrance: string, quantity: number) {
  const units = unitFragrances(fragrance, quantity);
  if (!units.some(Boolean)) return "";
  return new Set(units).size === 1 ? units[0] : units.join(", ");
}

/** Display form: "Rose ×2, Jasmin". */
export function fragranceSummary(fragrance: string) {
  const counts = new Map<string, number>();
  fragrance
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => counts.set(part, (counts.get(part) ?? 0) + 1));
  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ");
}
