// Headless Stage 1 on package A's engine: the loader's node logic runs as an EngineSystem (Build
// labor, milestones, writes_state, job unlocks), package C's energy model supplies
// energy_w_per_person from the fuel the engine burns, and a fixed labor policy stands in for the
// player's choices. Job rates come from A's Stage 1 fixture: the YAML gives them only as comments.
//
// Stubbed here, pending their packages: `campaigns_run` (E1's furnace campaigns) counts every 30
// days of smelting as one campaign.

import { describe, expect, it } from "vitest";
import {
  advanceBuilds,
  emptyBook,
  isAffordable,
  nodeStatus,
  revealNodes,
  stageOpen,
  startBuild,
  tree,
  type NodeBook,
} from "../src/content";
import { Engine, type EngineSystem, type JsonValue, type StateVarDef, type TickContext } from "../src/engine";
import { energyPerPerson } from "../src/models/energy";
import { stage1Content } from "./engine/fixtures/stage1";

/** Every declared state variable in the engine's input shape, with the loader's defaults. */
const stateVars: StateVarDef[] = Object.values(tree.stateVariables).map((v) => ({
  id: v.id,
  type: v.type,
  ...(v.values ? { values: v.values } : {}),
  initial: v.default,
}));

/** Days of smelting per furnace campaign (stub for E1; DESIGN.md: "a furnace campaign (~30 days)"). */
const CAMPAIGN_DAYS = 30;

class Projects implements EngineSystem {
  readonly id = "projects";
  book: NodeBook = emptyBook();
  completedOn: Record<string, number> = {};
  milestones: string[] = [];
  skippedJobs: string[] = [];
  private smeltDays = 0;

  constructor(private readonly plan: string[]) {}

  tick(ctx: TickContext): void {
    const e = ctx.engine;
    const burned = ctx.report.burned;
    e.setMetric(
      "energy_w_per_person",
      energyPerPerson({ fuel_kg_per_day: { wood: burned.wood_kg ?? 0, charcoal: burned.charcoal_kg ?? 0 }, population: e.population }).energy_w_per_person,
    );
    if ((ctx.report.jobs.smelt_copper?.fraction ?? 0) > 0 && (ctx.report.jobs.smelt_copper?.people ?? 0) > 0) this.smeltDays++;
    e.setMetric("campaigns_run", Math.floor(this.smeltDays / CAMPAIGN_DAYS));

    const shown = revealNodes(tree, e, this.book);
    this.book = shown.book;
    for (const id of this.plan) {
      if (nodeStatus(tree, id, e, this.book) !== "available" || !isAffordable(tree, id, e)) continue;
      const r = startBuild(tree, id, e, this.book);
      if (!r.ok) continue;
      if (!e.spend(r.consume)) throw new Error(`spend failed for ${id}`);
      this.book = r.book;
      this.handle(ctx, r.events);
    }
    const r = advanceBuilds(tree, this.book, ctx.laborAvailable("build"));
    ctx.takeLabor("build", ctx.laborAvailable("build") - r.unused);
    this.book = r.book;
    this.handle(ctx, r.events);
  }

  private handle(ctx: TickContext, events: ReturnType<typeof advanceBuilds>["events"]): void {
    for (const ev of events) {
      if (ev.type === "milestone") {
        this.milestones.push(ev.milestone.id);
        continue;
      }
      ctx.engine.applyWrites(ev.writes);
      for (const job of ev.jobs) {
        if (ctx.engine.jobDef(job)) ctx.engine.unlockJob(job);
        else this.skippedJobs.push(job); // no rate for it in the fixture yet
      }
      this.completedOn[ev.node] = ctx.day;
      ctx.pause({ kind: "node_complete", subject: ev.node });
    }
  }

  save(): JsonValue {
    return this.book as unknown as JsonValue;
  }
  load(d: JsonValue): void {
    this.book = d as unknown as NodeBook;
  }
}

/** The scripted player: fixed crews per job once it is unlocked; everyone else builds. */
const POLICY: [string, number][] = [
  ["knap_flint", 500],
  ["gather_wood", 3000],
  ["dig_clay", 800],
  ["fire_pottery", 200],
  ["burn_charcoal", 800],
  ["mine_malachite", 400],
  ["smelt_copper", 1000],
  ["cast_copper_tools", 150],
];

function staff(e: Engine): void {
  e.assign("build", 0); // free last day's builders before crewing the other jobs
  let used = 0;
  for (const [job, n] of POLICY) if (e.isJobUnlocked(job)) used += e.assign(job, n);
  e.assign("build", e.population - used);
}

const PLAN = ["digging_sticks", "pit_kiln", "charcoal_clamps", "trail_green_stones", "crucibles_blowpipes", "stone_molds", "pot_bellows", "gate_reliable_smelting"];

function runStage1(): { engine: Engine; projects: Projects } {
  const stage1 = tree.stages[0]!;
  const engine = new Engine(stage1Content({ stateVars, startingJobs: stage1.startingJobs, population: tree.draft.peopleTotal }));
  engine.state.set("bundles_taken", { primitive_technology: 1, metallurgy_1: 1, survey_copper_tin: 1 });
  const projects = new Projects(PLAN);
  engine.addSystem(projects);
  const MAX_DAYS = 12 * 365;
  while (!stageOpen(tree, 2, projects.book) && engine.day < MAX_DAYS) {
    staff(engine);
    engine.tick();
  }
  return { engine, projects };
}

describe("headless Stage 1 on package A's engine", () => {
  it("reaches the gate by scripted choices (bellows route) and opens Stage 2", () => {
    const { engine, projects } = runStage1();
    expect(projects.book.completed).toEqual(PLAN);
    expect(stageOpen(tree, 2, projects.book)).toBe(true);
    // Every milestone of the plan's nodes fires, in order (J pass 1 added first_bead and first_bellows).
    expect(projects.milestones).toEqual(["native_copper_find", "sledges", "first_bead", "first_bellows"]);
    expect(engine.get("has_copper")).toBe(true);
    expect(engine.get("has_bellows")).toBe(true);
    expect(engine.state.getNumber("metal_tools")).toBeGreaterThanOrEqual(5000);
    expect(engine.metric("energy_w_per_person")).toBeGreaterThanOrEqual(250);
    // Completions follow the plan, each on a later day. (At the fixture's rates: ~1,230 days.)
    const days = PLAN.map((id) => projects.completedOn[id]!);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    // pot_bellows unlocks hunt_for_hides, which has no rate in the fixture yet.
    expect(projects.skippedJobs).toEqual(["hunt_for_hides"]);
  });

  it("is deterministic: the same choices give the same days", () => {
    const a = runStage1();
    const b = runStage1();
    expect(b.engine.day).toBe(a.engine.day);
    expect(b.projects.completedOn).toEqual(a.projects.completedOn);
  });
});
