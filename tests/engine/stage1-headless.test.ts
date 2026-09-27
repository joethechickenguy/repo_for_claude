// A headless Stage 1 run on B's compiled tree: engine + ProjectsSystem (B's node logic) + EnergySystem
// (C's energy model), with scripted choices, reaches the gate. Also checks the tree adapter and that a
// save mid-stage (NodeBook included) replays identically.
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import {
  contentFromTree,
  Engine,
  EnergySystem,
  ProjectsSystem,
  type EngineContent,
  type EngineSystem,
  type TickContext,
} from "../../src/engine";
import { STAGE1_JOBS, STAGE1_RESOURCES, STAGE1_TOOLS } from "./fixtures/stage1";

const { content, jobsWithoutRates } = contentFromTree(tree, {
  jobs: STAGE1_JOBS,
  tools: STAGE1_TOOLS,
  resources: STAGE1_RESOURCES.filter((r) => !(r.id in tree.resources)),
});

/** The route: the B_bellows option, the only Stage 1 route open to a script without E1's workshop. */
const SCRIPT = [
  "digging_sticks",
  "pit_kiln",
  "charcoal_clamps",
  "trail_green_stones",
  "crucibles_blowpipes",
  "stone_molds",
  "pot_bellows",
  "gate_reliable_smelting",
];

/** People per job once it's unlocked; build takes the rest. */
const PLAN: [string, number][] = [
  ["gather_wood", 2700],
  ["knap_flint", 1000],
  ["dig_clay", 600],
  ["fire_pottery", 200],
  ["burn_charcoal", 500],
  ["mine_malachite", 300],
  ["smelt_copper", 400],
  ["cast_copper_tools", 300],
];

/** Stands in for E1's furnace workshop: one campaign per 30 days of smelting (`campaigns_run`). */
class Campaigns implements EngineSystem {
  readonly id = "campaigns";
  days = 0;
  tick(ctx: TickContext): void {
    if ((ctx.report.produced.copper_kg ?? 0) > 0) this.days++;
    ctx.engine.setMetric("campaigns_run", Math.floor(this.days / 30));
  }
  save() {
    return this.days;
  }
  load(d: unknown) {
    this.days = d as number;
  }
}

function setup(c: EngineContent = content) {
  const engine = new Engine(c);
  const projects = new ProjectsSystem(tree, engine);
  engine.addSystem(new EnergySystem({ wood_kg: "wood", charcoal_kg: "charcoal" }));
  engine.addSystem(new Campaigns());
  engine.addSystem(projects);
  return { engine, projects };
}

/** One scripted day: staff unlocked jobs, start whatever the script can afford, tick. */
function step(engine: Engine, projects: ProjectsSystem): void {
  let used = 0;
  engine.assign("build", 0); // free people first: assign() clamps to who's unassigned
  for (const [job, n] of PLAN) if (engine.isJobUnlocked(job)) used += engine.assign(job, n);
  engine.assign("build", engine.population - used);
  for (const id of SCRIPT) if (projects.status(id) === "available") projects.start(id);
  engine.tick();
}

describe("tree adapter", () => {
  it("builds engine content from B's tree", () => {
    expect(content.population).toBe(tree.draft.peopleTotal);
    expect(content.startingJobs).toEqual(["gather_wood", "knap_flint", "build"]);
    expect(content.stateVars).toHaveLength(Object.keys(tree.stateVariables).length);
    expect(content.trades).toContain("machinists_trained");
    expect(content.trades).toContain("trained_smiths");
    expect(content.trades).not.toContain("metal_tools");
    // Stage 1 jobs the fixture has no rates for yet.
    expect(jobsWithoutRates).toContain("grind_axes");
    expect(jobsWithoutRates).not.toContain("gather_wood");
  });

  it("every declared state variable loads into the store at its default", () => {
    const e = new Engine(content);
    for (const [id, v] of Object.entries(tree.stateVariables)) expect(e.get(id), id).toEqual(v.default);
  });
});

describe("headless Stage 1", () => {
  it("scripted choices reach the gate within the stage's ~6 years", () => {
    const { engine, projects } = setup();
    let day = 0;
    while (!projects.isComplete("gate_reliable_smelting") && day < 6 * 365) {
      step(engine, projects);
      day++;
    }
    expect(projects.book.completed).toEqual(SCRIPT);
    expect(engine.state.getNumber("metal_tools")).toBeGreaterThanOrEqual(5000);
    expect(engine.metric("energy_w_per_person")).toBeGreaterThanOrEqual(250);
    expect(engine.state.getFlag("has_copper")).toBe(true);
    expect(engine.state.getFlag("has_bellows")).toBe(true);
    expect(engine.isJobUnlocked("cast_copper_tools")).toBe(true);
    expect(day).toBeGreaterThan(365); // not trivially fast either (1,301 days when written)
  });

  it("the node book is saved; a reload mid-stage replays identically", () => {
    const a = setup();
    for (let d = 0; d < 700; d++) step(a.engine, a.projects);
    expect(a.projects.book.completed.length).toBeGreaterThan(2);
    const save = JSON.parse(JSON.stringify(a.engine.save()));
    const b = { engine: Engine.load(content, save), projects: undefined as unknown as ProjectsSystem };
    b.projects = new ProjectsSystem(tree, b.engine);
    b.engine.addSystem(new EnergySystem({ wood_kg: "wood", charcoal_kg: "charcoal" }));
    b.engine.addSystem(new Campaigns());
    b.engine.addSystem(b.projects);
    expect(b.projects.book).toEqual(a.projects.book);
    for (let d = 0; d < 400; d++) {
      step(a.engine, a.projects);
      step(b.engine, b.projects);
      expect(JSON.stringify(b.engine.report)).toBe(JSON.stringify(a.engine.report));
    }
    expect(b.projects.book).toEqual(a.projects.book);
  });

  it("reveals nodes as pause reasons", () => {
    const { engine } = setup();
    engine.assign("gather_wood", 1000);
    const r = engine.tick();
    // digging_sticks needs wood_kg > 300: 1,000 bare-handed gatherers cut 10 t on day one.
    expect(r.pauseReasons).toContainEqual({ kind: "node_revealed", subject: "digging_sticks" });
  });
});
