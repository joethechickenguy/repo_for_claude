// Physical constants shared by the models. These are facts, not tuning knobs; every estimate lives
// in the model file that uses it, as a named constant with a comment.

/** Standard gravity, m/s² (exact by definition). Converts Isp in seconds to exhaust speed. */
export const G0_M_S2 = 9.80665;

/** One standard atmosphere, Pa (exact by definition). */
export const ATM_PA = 101_325;

/** One bar, Pa. */
export const BAR_PA = 100_000;

export const SECONDS_PER_DAY = 86_400;
export const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;
export const HOURS_PER_DAY = 24;

/** 0 °C in kelvin. */
export const ZERO_C_K = 273.15;

/** Fresh water, kg/m³. */
export const WATER_DENSITY_KG_M3 = 1_000;

/** Universal gas constant, J/(mol·K). */
export const R_UNIVERSAL_J_MOL_K = 8.314_462_618;

/** Copper resistivity at 20 °C, Ω·m. */
export const COPPER_RESISTIVITY_OHM_M = 1.72e-8;

/** Convert °C to K and back. */
export const cToK = (c: number): number => c + ZERO_C_K;
export const kToC = (k: number): number => k - ZERO_C_K;

/** Linear interpolation through sorted (x, y) anchors, clamped at both ends. */
export function interpolate(anchors: ReadonlyArray<readonly [number, number]>, x: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (!first || !last) throw new Error("interpolate: no anchors");
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

/** Deterministic bisection for a monotonic function; returns x with f(x) ≈ target. */
export function bisect(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  iterations = 200,
): number {
  const increasing = f(hi) > f(lo);
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    // At double precision the interval stops shrinking (~60 halvings): every later step would leave
    // lo and hi as they are, so stopping here returns exactly the same number.
    if (mid === lo || mid === hi) break;
    const above = f(mid) > target;
    if (above === increasing) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
