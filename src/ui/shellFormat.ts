// Number formatting for the shell: whole numbers with grouping, tabular in CSS. Deterministic
// (fixed locale) so tests and screenshots agree.
import { DAYS_PER_YEAR } from "../engine";

const LOCALE = "en-US";

/** 12,345 (rounded down for stocks, as the prototype does). */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.floor(n + 1e-9).toLocaleString(LOCALE);
}

/** Rounded to the nearest whole, with grouping. */
export function fmtRound(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString(LOCALE);
}

/** Small numbers keep up to two decimals (0.85), large ones are grouped. */
export function fmtSmart(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  if (a >= 100) return fmtRound(n);
  if (a >= 10) return n.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
  return n.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
}

/** Whole year and day of year from days elapsed. */
export function yearDay(days: number): { year: number; day: number } {
  return { year: Math.floor(days / DAYS_PER_YEAR), day: Math.floor(days % DAYS_PER_YEAR) };
}
