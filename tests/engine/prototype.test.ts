// Done-criterion: a 1,000-day run of Stage 1's starting jobs reproduces the prototype's numbers
// within 10%.
//
// Differences between the engine run and the prototype, all deliberate:
// - Step: the prototype steps 0.25 day; the engine steps 1 day. This is the main source of error
//   (a few percent, largest while tool stocks are ramping).
// - Spoilage: DESIGN.md makes wood, charcoal and clay spoil; the prototype has none. Spoilage is set
//   to 0 here so the comparison is like for like (spoilage has its own tests).
// - Rates: every job rate in the stage-1 YAML agrees with the prototype (fixtures/stage1.ts cites
//   each). Where the YAML differs from the prototype it is outside the engine: the gate is 250 W in
//   the YAML vs 400 W in the prototype, wind furnaces cost 2.0M person-days vs 2.4M, and the trail
//   appears after charcoal clamps rather than at 200 kg charcoal. Those are package B's node logic.
// - The prototype's `rate` and `energy` values are smoothed displays (package D and C), not compared.
import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine";
import { runPrototype, type ProtoJob, type ProtoRes } from "./fixtures/prototype-reference";
import { stage1Content, STAGE1_JOBS } from "./fixtures/stage1";

const JOB: Record<ProtoJob, string> = {
  gather: "gather_wood",
  knap: "knap_flint",
  build: "build",
  clay: "dig_clay",
  pot: "fire_pottery",
  char: "burn_charcoal",
  mine: "mine_malachite",
  smelt: "smelt_copper",
  cast: "cast_copper_tools",
};

const RES: Record<ProtoRes, string> = {
  wood: "wood_kg",
  blades: "blades",
  clay: "clay_kg",
  pots: "pots",
  charcoal: "charcoal_kg",
  ore: "ore_kg",
  copper: "copper_kg",
  ctools: "copper_tools",
};

const DAYS = 1000;
const AT = [10, 50, 100, 250, 500, 750, 1000];
const TOLERANCE = 0.1;
/** Below this, a stock is effectively empty in both runs (a job consumes everything made). */
const EMPTY = 1;
// Tolerance is 10% of the stock, or of one day's production when the stock is smaller than that.
// A stock that a consumer drains to zero crosses zero on a slightly different day with a 1-day step
// than a 0.25-day step (wood on day 10 of the full chain: 16.6 t vs 22.9 t while 75 t/day is cut);
// comparing that to the stock itself would measure the step size, not the model.

function compare(alloc: Partial<Record<ProtoJob, number>>, unlockAll: boolean) {
  const ref = runPrototype(alloc, DAYS, AT);
  const engine = new Engine(stage1Content({ params: { defaultSpoilPerDay: 0 } }));
  if (unlockAll) for (const j of STAGE1_JOBS) engine.unlockJob(j.id);
  for (const [k, n] of Object.entries(alloc)) expect(engine.assign(JOB[k as ProtoJob], n!)).toBe(n);

  let buildLabor = 0;
  const rows: { day: number; key: string; proto: number; engine: number; flow: number }[] = [];
  for (let day = 1; day <= DAYS; day++) {
    const report = engine.tick();
    buildLabor += report.labor.build ?? 0;
    const snap = ref.find((s) => s.day === day);
    if (!snap) continue;
    for (const k of Object.keys(RES) as ProtoRes[])
      rows.push({ day, key: k, proto: snap.r[k], engine: engine.stock(RES[k]), flow: report.produced[RES[k]] ?? 0 });
    rows.push({ day, key: "build_labor", proto: snap.pd, engine: buildLabor, flow: report.labor.build ?? 0 });
  }
  return rows;
}

function expectWithin(rows: ReturnType<typeof compare>) {
  for (const r of rows) {
    const scale = Math.max(Math.abs(r.proto), r.flow);
    if (scale < EMPTY) {
      expect(Math.abs(r.engine), `${r.key} day ${r.day}`).toBeLessThan(EMPTY);
    } else {
      expect(Math.abs(r.engine - r.proto) / scale, `${r.key} day ${r.day}: ${r.engine} vs ${r.proto}`).toBeLessThanOrEqual(
        TOLERANCE,
      );
    }
  }
}

describe("1,000 days against the Stage 1 prototype", () => {
  it("starting jobs only, tool-starved (gather, knap, build)", () => {
    // Few knappers: blades settle where knapping equals wear, so tool coverage is well below 1.
    const rows = compare({ gather: 5000, knap: 60, build: 3000 }, false);
    expectWithin(rows);
    const last = rows.filter((r) => r.day === DAYS);
    expect(last.find((r) => r.key === "wood")!.proto).toBeGreaterThan(1e8);
    expect(last.find((r) => r.key === "blades")!.proto).toBeLessThan(8000); // tools never cover users
  });

  it("starting jobs only, well supplied", () => {
    expectWithin(compare({ gather: 4000, knap: 1500, build: 4000 }, false));
  });

  it("every Stage 1 prototype job running (clay, pottery, charcoal, ore, smelting, casting)", () => {
    const rows = compare(
      { gather: 3000, knap: 50, build: 2000, clay: 800, pot: 200, char: 600, mine: 700, smelt: 500, cast: 100 },
      true,
    );
    expectWithin(rows);
    // Casting eats every kg of copper, and copper tools carry tool coverage.
    const last = rows.filter((r) => r.day === DAYS);
    expect(last.find((r) => r.key === "copper")!.proto).toBeLessThan(EMPTY);
    expect(last.find((r) => r.key === "ctools")!.proto).toBeGreaterThan(10000);
  });
});
