export function fmt(value: string | number | null | undefined, maxFractionDigits = 3): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function isNegative(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return Number(value) < -0.0001;
}
