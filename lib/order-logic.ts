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
