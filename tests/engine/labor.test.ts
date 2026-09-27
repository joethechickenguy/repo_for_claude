// Labor tiers: people, works, departments. Pinned rows untouched; every assignment recorded.
import { describe, expect, it } from "vitest";
import { Engine, EngineError, type WorksDef } from "../../src/engine";
import { stage1Content, STAGE1_JOBS } from "./fixtures/stage1";

const SMELTER: WorksDef = {
  id: "smelter",
  output: "copper_kg",
  primaryJob: "smelt_copper",
  supportJobs: ["mine_malachite", "fire_pottery", "dig_clay"],
  department: "metals",
};
const CHARCOAL: WorksDef = { id: "charcoal", output: "charcoal_kg", primaryJob: "burn_charcoal", department: "fuel" };
const WOODLOT: WorksDef = { id: "woodlot", output: "wood_kg", primaryJob: "gather_wood", department: "fuel" };

function engine(population = 10000): Engine {
  const e = new Engine(stage1Content({ population, params: { defaultSpoilPerDay: 0 } }));
  for (const j of STAGE1_JOBS) e.unlockJob(j.id);
  e.addStock("blades", 1e6); // full tool coverage, so crews size at full speed
  return e;
}

const people = (e: Engine) => {
  const s = e.staffing();
  return (job: string, works?: string) =>
    s.records.filter((r) => r.jobId === job && r.worksId === works).reduce((a, r) => a + r.people, 0);
};

describe("people tier", () => {
  it("the engine does nothing: works and targets are ignored", () => {
    const e = engine();
    e.addWorks(SMELTER, 25);
    e.assign("smelt_copper", 7);
    expect(e.laborTier()).toBe("people");
    expect(e.assigned("smelt_copper")).toBe(7);
    expect(e.assigned("mine_malachite")).toBe(0);
    expect(e.staffing().records).toEqual([{ jobId: "smelt_copper", people: 7, reason: "manual", shortfall: 0 }]);
  });
});

describe("works tier", () => {
  it("sizes the primary crew to the target and support crews to its inputs", () => {
    const e = engine();
    e.addWorks(SMELTER, 25);
    e.setLaborTier("works");
    const p = people(e);
    expect(p("smelt_copper", "smelter")).toBe(50); // 25 kg/day / 0.5 kg per worker
    expect(p("mine_malachite", "smelter")).toBe(9); // 125 kg ore / 15 per worker, rounded up
    expect(p("fire_pottery", "smelter")).toBe(2); // 2.5 pots / 2 per worker
    expect(p("dig_clay", "smelter")).toBe(1); // 24 kg clay for 2 potters / 50 per worker
    expect(e.staffing().records.every((r) => r.reason === "auto" && r.shortfall === 0)).toBe(true);
    expect(e.idle()).toBe(10000 - 62);
  });

  it("sizes crews for tool efficiency: bare-handed miners need four times the people", () => {
    const e = new Engine(stage1Content());
    for (const j of STAGE1_JOBS) e.unlockJob(j.id);
    e.addWorks({ id: "mine", output: "ore_kg", primaryJob: "mine_malachite" }, 150);
    e.setLaborTier("works");
    e.tick(); // no tools: efficiency 0.25 is what the next staffing uses
    expect(e.assigned("mine_malachite")).toBe(40);
  });

  it("never touches a pinned row, and records the shortfall against it", () => {
    const e = engine();
    e.addWorks(SMELTER, 25);
    e.pin("smelter", "smelt_copper", 30);
    e.setLaborTier("works");
    const rec = e.staffing().records.find((r) => r.jobId === "smelt_copper")!;
    expect(rec).toMatchObject({ people: 30, reason: "pinned", shortfall: 20 });
    expect(people(e)("mine_malachite", "smelter")).toBe(5); // fed for 30 smelters, not 50
    e.pin("smelter", "smelt_copper", null);
    expect(people(e)("smelt_copper", "smelter")).toBe(50);
  });

  it("a works with no target staffs only its pinned rows", () => {
    const e = engine();
    e.addWorks(SMELTER);
    e.pin("smelter", "mine_malachite", 12);
    e.setLaborTier("works");
    expect(e.staffing().records).toEqual([
      { jobId: "mine_malachite", worksId: "smelter", department: "metals", people: 12, reason: "pinned", shortfall: 0 },
    ]);
  });

  it("jobs outside every works keep the player's manual counts", () => {
    const e = engine();
    e.addWorks(SMELTER, 25);
    e.assign("knap_flint", 100);
    e.assign("smelt_copper", 999); // covered by a works: ignored in the works tier
    e.setLaborTier("works");
    expect(e.assigned("knap_flint")).toBe(100);
    expect(e.assigned("smelt_copper")).toBe(50);
  });

  it("fills works in list order when the pool runs out; reordering changes who gets people", () => {
    const e = engine(55);
    e.addWorks(SMELTER, 25); // wants 62
    e.addWorks(WOODLOT, 400); // wants 10
    e.setLaborTier("works");
    expect(e.assigned("smelt_copper")).toBe(50);
    expect(e.assigned("gather_wood")).toBe(0);
    const short = e.staffing().records.filter((r) => r.shortfall > 0);
    expect(short.map((r) => r.jobId)).toEqual(["mine_malachite", "fire_pottery", "dig_clay", "gather_wood"]);
    e.moveWorks("woodlot", 0);
    expect(e.assigned("gather_wood")).toBe(10);
    expect(e.assigned("smelt_copper")).toBe(45);
  });

  it("works_active counts works with a target", () => {
    const e = engine();
    e.addWorks(SMELTER, 25);
    e.addWorks(WOODLOT);
    e.setLaborTier("works");
    e.tick();
    expect(e.state.getNumber("works_active")).toBe(1);
  });

  it("the tier comes from labor_tier, so a node's writes_state switches it", () => {
    const e = engine();
    e.addWorks(SMELTER, 25);
    e.applyWrites([{ variable: "labor_tier", value: "works" }]);
    expect(e.assigned("smelt_copper")).toBe(50);
  });

  it("refuses rows and works that don't exist", () => {
    const e = engine();
    e.addWorks(SMELTER, 25);
    expect(() => e.pin("smelter", "knap_flint", 3)).toThrow(EngineError);
    expect(() => e.setWorksTarget("nope", 1)).toThrow(EngineError);
    expect(() => e.addWorks({ id: "x", output: "copper_kg", primaryJob: "fly" })).toThrow(EngineError);
    e.removeWorks("smelter");
    expect(e.works()).toHaveLength(0);
  });
});

describe("departments tier", () => {
  it("staffs works in department priority order; ties keep list order", () => {
    const e = engine(55);
    e.addWorks(SMELTER, 25); // metals, wants 62
    e.addWorks(WOODLOT, 400); // fuel, wants 10
    e.setLaborTier("departments");
    e.setDepartmentPriority("metals", 1);
    e.setDepartmentPriority("fuel", 2);
    expect(e.assigned("gather_wood")).toBe(10);
    expect(e.assigned("smelt_copper")).toBe(45);
    e.setDepartmentPriority("metals", 3);
    expect(e.assigned("gather_wood")).toBe(0);
    expect(e.assigned("smelt_copper")).toBe(50);
    const rec = e.staffing().records.find((r) => r.jobId === "smelt_copper")!;
    expect(rec.department).toBe("metals");
  });

  it("department priorities can come from content", () => {
    const e = new Engine(
      stage1Content({ departments: [{ id: "fuel", priority: 5 }, { id: "metals", priority: 1 }], works: [SMELTER, WOODLOT] }),
    );
    expect(e.departmentPriority("fuel")).toBe(5);
    expect(e.works().map((w) => w.def.id)).toEqual(["smelter", "woodlot"]);
  });
});
