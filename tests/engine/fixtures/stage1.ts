// Stage 1 content for engine tests, in the engine's input shape.
//
// The stage-1 YAML gives job rates only as comments after `unlocks.jobs` (a YAML loader drops them),
// so package B's output has no structured job rates yet (tech-tree/open-questions.md, engine section).
// Until it does, this fixture transcribes them. Each number cites where it comes from; where the YAML
// says nothing the prototype's value is used and marked "prototype".
import type { EngineContent, JobDef, ResourceDef, StateVarDef, ToolDef } from "../../../src/engine";

export const STAGE1_JOBS: JobDef[] = [
  // YAML ground_stone_axes effect: "Gather wood with an axe: 60 kg/day instead of 40".
  { id: "gather_wood", outputs: { wood_kg: 40 }, tool: true },
  // prototype: "3 blades a day from river flint". The YAML has no rate.
  { id: "knap_flint", outputs: { blades: 3 } },
  // Build feeds the build labor pool; prototype: a tool job.
  { id: "build", labor: "build", tool: true },
  // YAML digging_sticks: "dig_clay # 50 kg/day with a tool".
  { id: "dig_clay", outputs: { clay_kg: 50 }, tool: true },
  // YAML pit_kiln: "fire_pottery # 12 kg clay + 24 kg wood -> 2 pots per worker-day". The wood is fuel.
  { id: "fire_pottery", inputs: { clay_kg: 12, wood_kg: 24 }, outputs: { pots: 2 }, burns: { wood_kg: 24 } },
  // YAML charcoal_clamps: "burn_charcoal # 100 kg wood -> 20 kg charcoal per worker-day".
  { id: "burn_charcoal", inputs: { wood_kg: 100 }, outputs: { charcoal_kg: 20 } },
  // YAML trail_green_stones: "mine_malachite # 15 kg/day with a tool".
  { id: "mine_malachite", outputs: { ore_kg: 15 }, tool: true },
  // YAML crucibles_blowpipes: "20% yield baseline"; per-worker quantities are the prototype's
  // (2.5 kg ore, 5 kg charcoal, a twentieth of a pot -> 0.5 kg copper = 20% of ore).
  {
    id: "smelt_copper",
    inputs: { ore_kg: 2.5, charcoal_kg: 5, pots: 0.05 },
    outputs: { copper_kg: 0.5 },
    burns: { charcoal_kg: 5 },
  },
  // YAML stone_molds: "cast_copper_tools # 1 kg copper per tool; 4 tools per worker-day".
  { id: "cast_copper_tools", inputs: { copper_kg: 4 }, outputs: { copper_tools: 4 } },
];

// YAML tool_wear pressure: "flint lasts ~20 worker-days, copper ~200, bronze ~400".
export const STAGE1_TOOLS: ToolDef[] = [
  { resource: "blades", lifeWorkerDays: 20 },
  { resource: "copper_tools", lifeWorkerDays: 200, metal: true },
];

// resources.yaml entries used in Stage 1, plus two the YAML uses but doesn't declare:
// `ore_kg` (crucibles_blowpipes requires "ore_kg > 150") and `copper_tools` (metal_tools' stock).
export const STAGE1_RESOURCES: ResourceDef[] = [
  { id: "wood_kg", producedBy: "gather_wood", perishable: true },
  { id: "blades", producedBy: "knap_flint" },
  { id: "clay_kg", producedBy: "dig_clay", perishable: true },
  { id: "pots", producedBy: "fire_pottery" },
  { id: "charcoal_kg", producedBy: "burn_charcoal", perishable: true },
  { id: "ore_kg", producedBy: "mine_malachite" },
  { id: "copper_kg", producedBy: "smelt_copper" },
  { id: "copper_tools", producedBy: "cast_copper_tools" },
];

// The subset of state-variables.yaml the engine binds or trains into, as declared there.
export const STAGE1_STATE_VARS: StateVarDef[] = [
  { id: "tool_wear", type: "number" },
  { id: "metal_tools", type: "count" },
  { id: "jobs_active", type: "count" },
  { id: "works_active", type: "count" },
  { id: "labor_tier", type: "enum", values: ["people", "works", "departments"] },
  { id: "year", type: "number" },
  { id: "trained_smiths", type: "count" },
  { id: "machinists_trained", type: "count" },
  { id: "has_copper", type: "flag" },
  { id: "forest_cover", type: "number" },
  { id: "bundles_taken", type: "set" },
  { id: "engine_type", type: "enum", values: ["none", "savery", "newcomen", "watt", "high_pressure"] },
];

/** Stage 1 content. `starting_jobs: [gather_wood, knap_flint, build]` from the stage-1 YAML. */
export function stage1Content(overrides: Partial<EngineContent> = {}): EngineContent {
  return {
    population: 10000, // draft.yaml people_total
    stateVars: STAGE1_STATE_VARS,
    resources: STAGE1_RESOURCES,
    jobs: STAGE1_JOBS,
    tools: STAGE1_TOOLS,
    startingJobs: ["gather_wood", "knap_flint", "build"],
    trades: ["trained_smiths", "machinists_trained"],
    ...overrides,
  };
}
