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
