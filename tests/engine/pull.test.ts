// Done-criterion: production never exceeds demand plus a small buffer (pull-based production).
//
// Reading (tech-tree/open-questions.md, engine section): pull applies to works whose target is
// `pull`. Their producers fill consumer demand + claims + a buffer of PULL_BUFFER_DAYS of demand and
// stop there. Jobs the player staffs by hand are not capped: "mining beyond that piles up visibly".
import { describe, expect, it } from "vitest";
import { Engine, PULL_BUFFER_DAYS, type TickReport, type WorksDef } from "../../src/engine";
import { stage1Content, STAGE1_JOBS } from "./fixtures/stage1";

const SMELTER: WorksDef = {
  id: "smelter",
  output: "copper_kg",
  primaryJob: "smelt_copper",
  supportJobs: ["mine_malachite", "fire_pottery", "dig_clay"],
};
const CHARCOAL: WorksDef = { id: "charcoal", output: "charcoal_kg", primaryJob: "burn_charcoal" };
const WOODLOT: WorksDef = { id: "woodlot", output: "wood_kg", primaryJob: "gather_wood" };

/** A furnace at 25 kg copper/day pulling charcoal, which pulls wood. */
function chain(spoil = 0): Engine {
  const e = new Engine(stage1Content({ params: { defaultSpoilPerDay: spoil } }));
  for (const j of STAGE1_JOBS) e.unlockJob(j.id);
  e.addStock("blades", 1e6);
  e.addWorks(SMELTER, 25);
  e.addWorks(CHARCOAL, "pull");
  e.addWorks(WOODLOT, "pull");
  e.setLaborTier("works");
  return e;
}

/** Stock after the tick may not exceed demand + claims + buffer for a pull-managed resource. */
function expectCapped(e: Engine, r: TickReport, resource: string) {
  const req = r.requested[resource] ?? 0;
  const limit = req * (1 + PULL_BUFFER_DAYS) + e.claimed(resource);
  expect(e.stock(resource), `${resource} day ${r.day}`).toBeLessThanOrEqual(limit + 1e-6);
}

describe("pull-based production", () => {
  it("a furnace's pull sets charcoal and wood output; neither exceeds demand plus buffer", () => {
    const e = chain();
    const totals = { charcoalMade: 0, charcoalUsed: 0, woodMade: 0, woodUsed: 0, copper: 0 };
    let maxReq = { charcoal: 0, wood: 0 };
    for (let d = 0; d < 365; d++) {
      const r = e.tick();
      expectCapped(e, r, "charcoal_kg");
      expectCapped(e, r, "wood_kg");
      totals.charcoalMade += r.produced.charcoal_kg ?? 0;
      totals.charcoalUsed += r.consumed.charcoal_kg ?? 0;
      totals.woodMade += r.produced.wood_kg ?? 0;
      totals.woodUsed += r.consumed.wood_kg ?? 0;
      if (d >= 335) totals.copper += r.produced.copper_kg ?? 0;
      maxReq = {
        charcoal: Math.max(maxReq.charcoal, r.requested.charcoal_kg ?? 0),
        wood: Math.max(maxReq.wood, r.requested.wood_kg ?? 0),
      };
    }
    // Over a year, what was made is what was used plus at most the buffer left in stock.
    expect(totals.charcoalMade).toBeLessThanOrEqual(totals.charcoalUsed + maxReq.charcoal * (1 + PULL_BUFFER_DAYS));
    expect(totals.woodMade).toBeLessThanOrEqual(totals.woodUsed + maxReq.wood * (1 + PULL_BUFFER_DAYS));
    // And the chain converged: the furnace makes its 25 kg/day.
    expect(totals.copper / 30).toBeCloseTo(25, 6);
    // Crews were sized from the pull: 250 kg charcoal/day -> 13 burners (rounded up), 1,250+ kg wood.
    expect(e.assigned("burn_charcoal")).toBe(13);
    expect(e.assigned("gather_wood")).toBeGreaterThanOrEqual(Math.ceil(1250 / 40));
  });

  it("the capped jobs report why they slowed", () => {
    const e = chain();
    e.run(100);
    const r = e.report!;
    // 13 burners can make 260 kg; the furnace wants 250. The extra 10 kg/day fills the 500 kg buffer
    // in about 50 days, after which the burners are held back.
    expect(r.jobs.burn_charcoal!.fraction).toBeLessThan(1);
    expect(r.jobs.burn_charcoal!.limitedBy).toBe("pull");
  });

  it("a claim (a node waiting for resources) is filled over the refill period and then stops", () => {
    const e = chain();
    e.run(20);
    e.setClaim("charcoal_clamps", { wood_kg: 20000 });
    let peak = 0;
    for (let d = 0; d < 200; d++) {
      const r = e.tick();
      expectCapped(e, r, "wood_kg");
      peak = Math.max(peak, e.stock("wood_kg"));
    }
    expect(peak).toBeGreaterThan(20000);
    expect(e.spend({ wood_kg: 20000 })).toBe(true);
    e.setClaim("charcoal_clamps", null);
    e.run(5);
    expect(e.stock("wood_kg")).toBeLessThanOrEqual((e.requested("wood_kg") ?? 0) * (1 + PULL_BUFFER_DAYS) + 1e-6);
  });

  it("with no consumer, a pull works makes nothing and its people are idle-sized to zero", () => {
    const e = new Engine(stage1Content());
    e.addStock("blades", 1e6);
    e.addWorks(WOODLOT, "pull");
    e.setLaborTier("works");
    e.run(10);
    expect(e.stock("wood_kg")).toBe(0);
    expect(e.assigned("gather_wood")).toBe(0);
  });

  it("player-staffed jobs are not capped: surplus piles up visibly", () => {
    const e = new Engine(stage1Content({ params: { defaultSpoilPerDay: 0 } }));
    e.addStock("blades", 1e6);
    e.assign("gather_wood", 1000);
    e.run(10);
    expect(e.stock("wood_kg")).toBe(400000);
    expect(e.requested("wood_kg")).toBe(0);
  });
});
