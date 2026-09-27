import { describe, expect, it } from "vitest";
import { tree } from "../../../src/content";
import {
  BLOCK,
  BUILDERS_POOL_ID,
  buildResult,
  categoryCoverage,
  categoryFull,
  defaultDraftState,
  isSpecialtyPinned,
  isTopicPinned,
  poolValue,
  specialtyValue,
  stepCategory,
  stepPool,
  stepSpecialty,
  stepTopic,
  toggleSpecialtyPin,
  toggleTopicPin,
  topicValue,
  weakestArea,
  type DraftState,
} from "../../../src/ui/draft/model";

const rosterTotal = (state: DraftState) => tree.draft.roster.reduce((s, r) => s + poolValue(state, r.id), 0);
const pagesTotal = (state: DraftState) => Object.values(state.pages).reduce((a, b) => a + b, 0);

// ---- done-criterion 1: defaults load, Depart works with no interaction --------------------------------------------

describe("defaults", () => {
  it("sum to the people total and stay within the page budget with no interaction", () => {
    const state = defaultDraftState(tree);
    expect(rosterTotal(state)).toBe(tree.draft.peopleTotal);
    expect(pagesTotal(state)).toBe(tree.draft.pageBudget); // draft.yaml's defaults already sum to the budget
    expect(pagesTotal(state)).toBeLessThanOrEqual(tree.draft.pageBudget);
  });

  it("every pool's specialties sum to the pool, every category's topics sum to the category", () => {
    const state = defaultDraftState(tree);
    for (const r of tree.draft.roster) {
      const sum = r.specialties.reduce((s, sp) => s + specialtyValue(state, r.id, sp.id), 0);
      expect(sum).toBe(poolValue(state, r.id));
    }
    for (const c of tree.draft.pages) {
      const sum = c.topics.reduce((s, t) => s + topicValue(state, c.id, t.id), 0);
      expect(sum).toBe(state.pages[c.id]);
    }
  });

  it("Depart builds a result with no interaction (draft_roster and bundles_taken shapes)", () => {
    const state = defaultDraftState(tree);
    const result = buildResult(tree, state);
    expect(Object.keys(result.draftRoster).sort()).toEqual(tree.draft.roster.map((r) => r.id).sort());
    const buildersDefault = tree.draft.roster.find((r) => r.id === BUILDERS_POOL_ID)!.default;
    expect(result.draftRoster[BUILDERS_POOL_ID]).toBe(buildersDefault); // tech-tree/draft.yaml
    const allTopicIds = tree.draft.pages.flatMap((c) => c.topics.map((t) => t.id));
    expect(Object.keys(result.bundlesTaken).sort()).toEqual(allTopicIds.sort());
    for (const v of Object.values(result.bundlesTaken)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

// ---- done-criterion 2: every +/- keeps totals exact (seeded property test) -----------------------------------------

/** mulberry32: a tiny seeded PRNG, deterministic across runs (no Math.random; DESIGN.md ground rules). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(state: DraftState, step: string) {
  expect(rosterTotal(state)).toBe(tree.draft.peopleTotal);
  for (const r of tree.draft.roster) {
    const v = poolValue(state, r.id);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(r.full);
    const specSum = r.specialties.reduce((s, sp) => s + specialtyValue(state, r.id, sp.id), 0);
    expect(specSum, `${step}: ${r.id} specialties`).toBe(v);
    for (const sp of r.specialties) {
      const sv = specialtyValue(state, r.id, sp.id);
      expect(sv).toBeGreaterThanOrEqual(0);
      expect(sv).toBeLessThanOrEqual(sp.full);
    }
  }
  expect(pagesTotal(state)).toBeLessThanOrEqual(tree.draft.pageBudget);
  for (const c of tree.draft.pages) {
    const v = state.pages[c.id] ?? 0;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(categoryFull(c));
    const topicSum = c.topics.reduce((s, t) => s + topicValue(state, c.id, t.id), 0);
    expect(topicSum, `${step}: ${c.id} topics`).toBe(v);
    for (const t of c.topics) {
      const tv = topicValue(state, c.id, t.id);
      expect(tv).toBeGreaterThanOrEqual(0);
      expect(tv).toBeLessThanOrEqual(t.full);
    }
  }
}

describe("random click sequences (seeded, no Math.random)", () => {
  it("always keep people at exactly 10,000 and pages within budget", () => {
    const rnd = mulberry32(20260927);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    const pools = tree.draft.roster.filter((r) => r.id !== BUILDERS_POOL_ID);

    let state = defaultDraftState(tree);
    checkInvariants(state, "initial");
    for (let i = 0; i < 500; i++) {
      const delta = rnd() < 0.5 ? -1 : 1;
      const action = Math.floor(rnd() * 5);
      if (action === 0) {
        const pool = pick(pools);
        state = stepPool(tree, state, pool.id, delta);
      } else if (action === 1) {
        const pool = pick(tree.draft.roster);
        const spec = pick(pool.specialties);
        state = stepSpecialty(tree, state, pool.id, spec.id, delta);
      } else if (action === 2) {
        const pool = pick(tree.draft.roster);
        const spec = pick(pool.specialties);
        state = toggleSpecialtyPin(state, pool.id, spec.id);
      } else if (action === 3) {
        const cat = pick(tree.draft.pages);
        state = stepCategory(tree, state, cat.id, delta);
      } else {
        const cat = pick(tree.draft.pages);
        const topic = pick(cat.topics);
        state = stepTopic(tree, state, cat.id, topic.id, delta);
      }
      checkInvariants(state, `step ${i}`);
    }
  });

  it("pin toggles never break the totals either", () => {
    const rnd = mulberry32(7);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    let state = defaultDraftState(tree);
    for (let i = 0; i < 200; i++) {
      const cat = pick(tree.draft.pages);
      const topic = pick(cat.topics);
      state = rnd() < 0.5 ? toggleTopicPin(state, cat.id, topic.id) : stepTopic(tree, state, cat.id, topic.id, rnd() < 0.5 ? -1 : 1);
      checkInvariants(state, `pin step ${i}`);
    }
  });
});

// ---- done-criterion 3: weakest-area matches a hand computation for three allocations --------------------------------

describe("weakest area (hand-computed)", () => {
  it("test 1 - defaults: prospecting is weakest (survey pages 800 / 3600 full = 2/9 ~= 0.222, the lowest score)", () => {
    // Hand arithmetic (tech-tree/draft.yaml):
    //   prospecting: roster prospectors 800/1500 = 0.5333; pages survey 800/3600 = 0.2222 -> min 0.2222
    //   electricity: roster electrical 300/800 = 0.375; pages electricity 1200/2600 = 0.4615 -> min 0.375
    //   rocketry:    roster rocket_engineers 200/500 = 0.4; pages rocketry 2200/5600 = 0.3929 -> min 0.3929
    //   first_year, chemistry, cryogenics all land at exactly 0.4 (roster-limited); metallurgy and
    //   mechanics at 0.5333. 0.2222 is the overall minimum.
    const state = defaultDraftState(tree);
    const w = weakestArea(tree, state);
    expect(w.id).toBe("prospecting");
    expect(w.score).toBeCloseTo(800 / 3600, 6);
  });

  it("test 2 - starving chemistry pages: chemistry becomes weakest", () => {
    // Move 1,600 pages from chemistry (1800 -> 200) to survey (800 -> 2400), and prospectors to its
    // full 1500 (800 -> 1500, cascading -700 from builders). Hand arithmetic:
    //   prospecting: roster 1500/1500 = 1.0; pages survey 2400/3600 = 0.6667 -> min 0.6667
    //   chemistry:   roster chemists 400/1000 = 0.4 (unchanged); pages 200/3600 = 0.0556 -> min 0.0556
    // 0.0556 is now the overall minimum (below electricity's unchanged 0.375).
    let state = defaultDraftState(tree);
    state = stepPool(tree, state, "prospectors", 7); // 800 -> 1500 (7 blocks of 100)
    state = stepCategory(tree, state, "chemistry", -16); // 1800 -> 200
    state = stepCategory(tree, state, "survey", 16); // 800 -> 2400
    expect(poolValue(state, "prospectors")).toBe(1500);
    expect(state.pages.chemistry).toBe(200);
    expect(state.pages.survey).toBe(2400);
    const w = weakestArea(tree, state);
    expect(w.id).toBe("chemistry");
    expect(w.score).toBeCloseTo(200 / 3600, 6);
  });

  it("test 3 - a three-way tie at 0.4: the earliest area in draft.yaml's list wins", () => {
    // Raise the three areas that would otherwise sit below the 0.4 tie group (prospecting, electricity,
    // rocketry) strictly above it, without disturbing first_year/chemistry/cryogenics (still exactly
    // 0.4, roster-limited) or metallurgy/mechanics (still above 0.4). Hand arithmetic:
    //   survey 800 -> 1500 (+700, from metallurgy -300 and mechanics(pages) -400): coverage
    //     1500/3600 = 0.41667 > roster 0.5333 -> prospecting = 0.41667
    //   metallurgy pages 1500 -> 1200: coverage 1200/2800 = 0.42857, still > 0.4
    //   mechanics(pages) 1500 -> 1100: coverage 1100/2400 = 0.45833, still > 0.4
    //   chemistry pages 1800 -> 1700 (frees 100 for rocketry): coverage 1700/3600 = 0.47222, still
    //     above chemistry's roster-limited 0.4, so chemistry's score is unaffected
    //   rocketry pages 2200 -> 2300, roster rocket_engineers 200 -> 300 (+100 from builders):
    //     roster 300/500 = 0.6; pages 2300/5600 = 0.41071 -> min 0.41071 > 0.4
    //   electrical (roster) 300 -> 400 (+100 from builders): electricity roster 400/800 = 0.5;
    //     pages 1200/2600 = 0.46154 (unchanged) -> min 0.46154 > 0.4
    //   first_year: roster 200/500 = 0.4; pages primitive 400/800 = 0.5 (unchanged) -> 0.4
    //   chemistry:  roster chemists 400/1000 = 0.4; pages 0.47222 -> 0.4
    //   cryogenics: roster chemists 400/1000 = 0.4 (shared pool); pages cryogenics 600/1400 = 0.42857
    //     (unchanged) -> 0.4
    // The minimum (0.4) is now tied by first_year, chemistry and cryogenics; draft.yaml's `areas` list
    // has first_year before both, so it wins.
    let state = defaultDraftState(tree);
    state = stepCategory(tree, state, "metallurgy", -3); // 1500 -> 1200
    state = stepCategory(tree, state, "mechanics", -4); // 1500 -> 1100
    state = stepCategory(tree, state, "survey", 7); // 800 -> 1500
    state = stepCategory(tree, state, "chemistry", -1); // 1800 -> 1700
    state = stepCategory(tree, state, "rocketry", 1); // 2200 -> 2300
    state = stepPool(tree, state, "electrical", 1); // 300 -> 400
    state = stepPool(tree, state, "rocket_engineers", 1); // 200 -> 300
    expect(state.pages.metallurgy).toBe(1200);
    expect(state.pages.mechanics).toBe(1100);
    expect(state.pages.survey).toBe(1500);
    expect(state.pages.chemistry).toBe(1700);
    expect(state.pages.rocketry).toBe(2300);
    expect(poolValue(state, "electrical")).toBe(400);
    expect(poolValue(state, "rocket_engineers")).toBe(300);

    const first_year = Math.min(200 / 500, categoryCoverage(tree, state, "primitive"));
    const chemistry = Math.min(400 / 1000, categoryCoverage(tree, state, "chemistry"));
    const cryogenics = Math.min(400 / 1000, categoryCoverage(tree, state, "cryogenics"));
    expect(first_year).toBeCloseTo(0.4, 6);
    expect(chemistry).toBeCloseTo(0.4, 6);
    expect(cryogenics).toBeCloseTo(0.4, 6);

    const w = weakestArea(tree, state);
    expect(w.id).toBe("first_year");
    expect(w.score).toBeCloseTo(0.4, 6);
  });
});

// ---- done-criterion 4: a topic pin survives a change to its category -----------------------------------------------

describe("pin survives a category change", () => {
  it("a pinned topic keeps its value and pinned flag when the category's total changes", () => {
    let state = defaultDraftState(tree);
    // Pin survey_copper_tin at its current auto-spread share.
    state = toggleTopicPin(state, "survey", "survey_copper_tin");
    expect(isTopicPinned(state, "survey", "survey_copper_tin")).toBe(true);
    const pinnedValue = topicValue(state, "survey", "survey_copper_tin");

    // Change the category's total both up and down.
    state = stepCategory(tree, state, "survey", 3);
    expect(isTopicPinned(state, "survey", "survey_copper_tin")).toBe(true);
    expect(topicValue(state, "survey", "survey_copper_tin")).toBe(pinnedValue);

    state = stepCategory(tree, state, "survey", -6);
    expect(isTopicPinned(state, "survey", "survey_copper_tin")).toBe(true);
    expect(topicValue(state, "survey", "survey_copper_tin")).toBe(pinnedValue);

    // The category's total still matches what the topics sum to.
    const sum = tree.draft.pages
      .find((c) => c.id === "survey")!
      .topics.reduce((s, t) => s + topicValue(state, "survey", t.id), 0);
    expect(sum).toBe(state.pages.survey);
  });

  it("a pinned specialty survives a change to its pool (roster side of the same rule)", () => {
    let state = defaultDraftState(tree);
    state = toggleSpecialtyPin(state, "metallurgists", "steelmakers");
    const pinnedValue = specialtyValue(state, "metallurgists", "steelmakers");
    expect(isSpecialtyPinned(state, "metallurgists", "steelmakers")).toBe(true);

    state = stepPool(tree, state, "metallurgists", 4);
    expect(isSpecialtyPinned(state, "metallurgists", "steelmakers")).toBe(true);
    expect(specialtyValue(state, "metallurgists", "steelmakers")).toBe(pinnedValue);
  });
});

// ---- shape used by the loader (bundleCoverage/pagesTier/evaluate) ---------------------------------------------------

describe("DraftResult against the loader's own reading of the state", () => {
  it("bundlesTaken agrees with bundleCoverage/pagesTier for a node with a topic bundle", async () => {
    const { bundleCoverage, pagesTier } = await import("../../../src/content");
    const state = defaultDraftState(tree);
    const result = buildResult(tree, state);
    const view = {
      get: (name: string) => (name === "bundles_taken" ? result.bundlesTaken : undefined),
      stock: () => 0,
    };
    // metallurgy_1 (topic, default 800 of full 800: coverage 1.0 -> "known" per compileDraft's tiers).
    expect(bundleCoverage(tree, "metallurgy_1", view)).toBeCloseTo(topicValue(state, "metallurgy", "metallurgy_1") / 800, 6);
    const node = Object.values(tree.nodes).find((n) => n.pagesBundle === "metallurgy_1");
    if (node) expect(["known", "partial", "absent"]).toContain(pagesTier(tree, node.id, view));
  });

  it("draft_roster has every pool, including builders' computed remainder", () => {
    const state = defaultDraftState(tree);
    const result = buildResult(tree, state);
    const total = Object.values(result.draftRoster).reduce((a, b) => a + b, 0);
    expect(total).toBe(tree.draft.peopleTotal);
    expect(result.draftRoster[BUILDERS_POOL_ID]).toBe(poolValue(state, BUILDERS_POOL_ID));
  });
});
