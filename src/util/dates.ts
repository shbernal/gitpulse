const millisPerDay = 24 * 60 * 60 * 1000;
const daysPerMonth = 30.44;
const daysPerYear = 365.25;
const shortMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function daysSince(isoDate: string | null | undefined, now = new Date()): number | null {
  if (!isoDate) {
    return null;
  }

  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / millisPerDay));
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "n/a";
  }

  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toISOString().slice(0, 10);
}

export function formatMonthYear(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return "n/a";
  }

  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return `${shortMonths[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatRelativeDays(days: number | null): string {
  if (days === null) {
    return "n/a";
  }

  if (days === 0) {
    return "today";
  }

  if (days < daysPerMonth * 2) {
    return `${days} ${plural(days, "day")} ago`;
  }

  if (days < 365) {
    const months = Math.min(11, Math.round(days / daysPerMonth));
    return `${months} ${plural(months, "month")} ago`;
  }

  const years = Math.round(days / daysPerYear);
  return `${years} ${plural(years, "year")} ago`;
}

function plural(value: number, unit: string): string {
  return value === 1 ? unit : `${unit}s`;
}

export function formatDateWithAge(isoDate: string | null | undefined, days: number | null): string {
  const date = formatDate(isoDate);

  if (date === "n/a" || days === null) {
    return date;
  }

  return `${date} (${formatRelativeDays(days)})`;
}
