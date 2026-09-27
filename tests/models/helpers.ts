import { expect } from "vitest";

/** Assert |actual - expected| <= rel * |expected| (the "≈" in the content files). */
export function expectNear(actual: number, expected: number, rel: number): void {
  const tol = Math.abs(expected) * rel;
  if (!(Math.abs(actual - expected) <= tol)) {
    expect.fail(`expected ${actual} to be within ${rel * 100}% of ${expected} (±${tol})`);
  }
}

/** Assert lo <= actual <= hi (a range stated in the content files, e.g. "2-3 t"). */
export function expectBetween(actual: number, lo: number, hi: number): void {
  expect(actual).toBeGreaterThanOrEqual(lo);
  expect(actual).toBeLessThanOrEqual(hi);
}
