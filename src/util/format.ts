export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `${trimDecimal(value / 1_000_000_000)}b`;
  }

  if (abs >= 1_000_000) {
    return `${trimDecimal(value / 1_000_000)}m`;
  }

  if (abs >= 1_000) {
    return `${trimDecimal(value / 1_000)}k`;
  }

  return String(value);
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en").format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${trimDecimal(value)}%`;
}

export function formatBool(value: boolean): string {
  return value ? "yes" : "no";
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

export function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}
