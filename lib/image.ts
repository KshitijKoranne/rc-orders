export function productImagePath(id: string) {
  return `/api/products/${encodeURIComponent(id)}/image`;
}

export function productImageUrl(id: string, version = "") {
  const params = new URLSearchParams({ variant: "thumbnail" });
  if (version) params.set("v", version);
  return `${productImagePath(id)}?${params.toString()}`;
}

export function isProductImageUrl(value: string, id: string) {
  const path = productImagePath(id);
  return value === path || value.startsWith(`${path}?`);
}

export function originalProductImageUrl(source: string) {
  if (!source.startsWith("/")) return source;
  const url = new URL(source, "http://rithya.local");
  url.searchParams.delete("variant");
  return `${url.pathname}${url.search}`;
}
