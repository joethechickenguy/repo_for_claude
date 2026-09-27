// The bot's workshop habits (tests/play/bot.ts): what a middling player does in each workshop.
import type { JsonValue } from "../../src/engine";
import type { Game } from "../../src/ui/shellGame";
import { isDone } from "../../src/ui/workshops/common";
import { buildEngine, ENGINE_WS, engineDesign, engineDials, runningEngine } from "../../src/ui/workshops/engine";
import { workshopSystem } from "../../src/ui/workshops/kit";
import { SHOP, shopDials, shopSetup, startRetool } from "../../src/ui/workshops/machineShop";
import "../../src/ui/workshops/furnace";
import { liquefierDesign, liquefierDials, startLiquefier } from "../../src/ui/workshops/liquefier";
import { PROPELLANTS } from "../../src/models";
import { enginePropellants, queueFiring, ROCKET_ENGINE, rocketEngineDesign, rocketEngineDials, rocketEngineResult } from "../../src/ui/workshops/rocketEngine";
import { adoptRocket, currentRocket, marginDeductions, payloadT, ROCKET, rocketAllDials, routeOf } from "../../src/ui/workshops/rocket";
import { adoptedVehicle, CAMPAIGN, launch, launchBlocked, startFix, startTest, testBlocked, testSpecs, vehicleFlaws } from "../../src/ui/workshops/campaign";
import { missionBudgetKmS, optimalStaging, stageIsp, stageStructuralFraction, type RocketStageDials } from "../../src/models";

type Data = { dials: Record<string, JsonValue>; [k: string]: JsonValue };
const data = (g: Game, ws: string): Data | null => (workshopSystem<JsonValue>(g, ws)?.data as Data | undefined) ?? null;

/** The best open option of each option dial, in the order the stage file lists them (last is best). */
function bestOptions(dials: ReturnType<typeof shopDials>): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const d of dials) if (d.options) out[d.id] = [...d.options].reverse().find((o) => !d.locked?.[o]) ?? d.options[0]!;
  return out;
}

/** Machine shop: whenever a better setup is possible than the one in use, retool to it. */
export function shopHabit(g: Game): void {
  const d = data(g, SHOP) as (Data & { retool: JsonValue; current: { tolerance_mm: number; bearing_quality: number } | null }) | null;
  if (!d || d.retool || !shopDials(g).length) return;
  const best = bestOptions(shopDials(g));
  const s = shopSetup(g, best);
  const cur = d.current;
  if (cur && cur.tolerance_mm <= s.tolerance_mm && cur.bearing_quality >= s.bearing_quality) return;
  d.dials = best;
  startRetool(g);
}

/** Engine workshop: once there's a generator dial, build an engine that runs a 50 kW+ dynamo. */
export function dynamoHabit(g: Game): void {
  const d = data(g, ENGINE_WS) as (Data & { building: JsonValue }) | null;
  const dials = engineDials(g);
  if (!d || d.building || !dials.some((x) => x.id === "generator")) return;
  const run = runningEngine(g);
  const want = (x: number) => (run ? run.design.dynamo?.dynamo_output_kw ?? 0 : 0) + 1 < x;
  const opt = (id: string, pref: string[]) => {
    const dl = dials.find((x) => x.id === id);
    return dl ? (pref.find((o) => dl.options?.includes(o) && !dl.locked?.[o]) ?? dl.options![0]!) : undefined;
  };
  const hp = dials.find((x) => x.id === "boiler_pressure")!.range![1];
  const base: Record<string, JsonValue> = {
    lift_height: 30,
    cylinder_diameter: 1.5,
    boiler_pressure: Math.min(3, hp),
    condenser: opt("condenser", ["separate"]) ?? "none",
    // On the water-turbine route the turbine drives the dynamo; otherwise a rotative engine does.
    flywheel: isDone(g, "water_turbine") ? "beam_pump" : "rotative",
    generator: "self_excited",
    ...(opt("transmission", ["ac_transformed"]) ? { transmission: opt("transmission", ["ac_transformed"])! } : {}),
    ...(opt("prime_mover", ["turbine", "piston"]) ? { prime_mover: opt("prime_mover", ["turbine", "piston"])! } : {}),
  };
  const plate = opt("plate", ["rolled", "hammered"])!;
  // Thickest plate that's still safe for good; a middling player keeps the margin bar blue.
  let design = null;
  search: for (const atm of [3, 2.5, 2, 1.5])
    for (const t of [8, 12, 16, 20]) {
      const v = { ...base, boiler_pressure: Math.min(atm, hp), plate: { value: t, option: plate } };
      const e = engineDesign(g, v);
      if (e.years_to_failure === null && (e.dynamo?.dynamo_output_kw ?? 0) >= 50) {
        design = v;
        break search;
      }
    }
  if (!design) return;
  const e = engineDesign(g, design);
  // Rebuild for more output, or when a new dial (transmission, prime mover) would change the design.
  const newDial = run && ((e.line_loss_pct !== null && run.design.line_loss_pct === null) || (e.mover !== run.design.mover && e.station_efficiency !== null));
  if (!want(e.dynamo?.dynamo_output_kw ?? 0) && !newDial) return;
  if (g.engine.stock("iron_kg") < e.iron_cost_kg) return;
  d.dials = design;
  buildEngine(g);
}

/** Liquefier: run the best plant the dials allow; restart only when a better design becomes possible. */
export function liquefierHabit(g: Game): void {
  const dials = liquefierDials(g);
  const m = dials.find((x) => x.id === "method");
  const d = data(g, "liquefier_workshop") as (Data & { run: { design: JsonValue } | null }) | null;
  if (!m || !d) return;
  const method = ["expansion_engine", "throttle_regenerative", "cascade"].find((o) => !m.locked?.[o])!;
  const values: Record<string, JsonValue> = { method, pressure: method === "expansion_engine" ? 40 : 200, exchanger_length: 10, column: 30 };
  const want = JSON.stringify(liquefierDesign(g, values));
  if (d.run && JSON.stringify(d.run.design) === want) return;
  d.dials = values;
  startLiquefier(g);
}

/** Rocket engine: whenever nothing is on the stand, fire the best design the dials allow if it beats the record. */
export function rocketEngineHabit(g: Game): void {
  const dials = rocketEngineDials(g);
  const d = data(g, ROCKET_ENGINE) as (Data & { queue: JsonValue[]; firing: JsonValue; best: { burn_s: number; thrust_kn: number } | null }) | null;
  if (!d || !dials.length || d.queue.length || d.firing) return;
  // The best open option of a dial, or undefined (one pass) when the dial hasn't arrived.
  const open = (id: string, pref: string[]): (string | undefined)[] => {
    const x = dials.find((y) => y.id === id);
    return x ? pref.filter((o) => x.options?.includes(o) && !x.locked?.[o]).slice(0, 1) : [undefined];
  };
  const range = (id: string) => dials.find((y) => y.id === id)?.range;
  const pcMax = range("chamber_pressure")?.[1] ?? 60;
  const mr = PROPELLANTS[enginePropellants(g)].best_mixture_ratio;
  let best: { v: Record<string, JsonValue>; score: number; burn: number; thrust: number } | null = null;
  for (const pc of [15, 20, 25, 30, 40, 50, 60].filter((x) => x <= pcMax))
    for (const cooling of open("cooling", ["regenerative", "film", "none"]))
      for (const injector of open("injector", ["impinging_baffled", "impinging", "showerhead"]))
        for (const feed of open("feed", ["gas_generator_turbopump", "peroxide_turbopump", "pressure_fed"]))
          for (const nozzle of range("nozzle") ? [4, 6, 8] : [undefined]) {
            const v: Record<string, JsonValue> = { mixture_ratio: mr, chamber_pressure: pc };
            if (cooling) v.cooling = cooling;
            if (injector) v.injector = injector;
            if (feed) v.feed = feed;
            if (nozzle !== undefined) v.nozzle = nozzle;
            const r = rocketEngineResult(g, rocketEngineDesign(g, v));
            if (r.flow_separation_sl || r.feed_limited) continue;
            if (!Number.isFinite(r.thrust_kn)) continue;
            const burn = Math.min(60, r.burn_time_s);
            const score = burn * 1e4 + r.thrust_kn;
            if (!best || score > best.score) best = { v, score, burn, thrust: r.thrust_kn };
          }
  // The dials before cooling exists: still fire once (regenerative cooling waits on a first firing).
  if (!best) return;
  const rec = d.best;
  if (rec && !(best.burn > rec.burn_s + 1e-9 || (best.burn >= rec.burn_s - 1e-9 && best.thrust > rec.thrust_kn + 1))) return;
  d.dials = best.v;
  queueFiring(g);
}

/** Rocket workshop: size the stages for the budget plus a margin with the best chemistry and tanks open; re-adopt when that changes. */
export function rocketHabit(g: Game): void {
  const all = rocketAllDials(g);
  if (!all.length) return;
  const d = data(g, ROCKET) as (Data & { stages: Record<string, JsonValue>[] }) | null;
  if (!d) return;
  const pick = (id: string, pref: string[]) => {
    const x = all.find((y) => y.id === id)!;
    return pref.find((o) => x.options?.includes(o) && !x.locked?.[o]) ?? x.options![0]!;
  };
  const fuel = pick("propellants", ["kerosene_lox", "ethanol_lox"]);
  const lander = pick("propellants", ["hypergolic", fuel]);
  const tank = pick("tank_material", ["aluminum", "steel"]);
  const routeDial = all.find((x) => x.id === "route");
  if (routeDial) d.dials = { ...d.dials, route: pick("route", ["parking_orbit", "direct_ascent"]), stage_count: 4 };
  else d.dials = { ...d.dials, stage_count: 4 };
  const kinds: RocketStageDials[] = [0, 1, 2, 3].map((i) => ({
    propellant_mass: 1,
    propellants: (i === 3 ? lander : fuel) as RocketStageDials["propellants"],
    tank_material: tank as RocketStageDials["tank_material"],
    feed: i === 3 ? "pressure_fed" : "turbopump",
  }));
  const route = routeOf(g, d.dials);
  const target = missionBudgetKmS(route ?? undefined) + marginDeductions(g) + 0.45;
  const o = optimalStaging(kinds.map((k) => ({ isp_s: stageIsp(k), structural_fraction: stageStructuralFraction(k) })), payloadT(g), target);
  if (!o) return;
  const stages = kinds.map((k, i) => ({ ...k, propellant_mass: Math.ceil(o.propellant_mass_t[i]!) }));
  const want = JSON.stringify(stages);
  const cur = adoptedVehicle(g);
  if (cur && JSON.stringify(cur.stages) === want && (cur.route ?? null) === (route ?? null)) return;
  d.stages = stages as unknown as Record<string, JsonValue>[];
  const { design } = currentRocket(g, d as never);
  if (design.dv_margin_km_s < 0) return;
  adoptRocket(g);
}

const TEST_PLAN: [string, number][] = [
  ["static_fire", 3], ["tanking_hold", 2], ["vacuum_chamber", 2], ["orbital_flight", 1], ["impactor", 1], ["uncrewed_landing", 1],
];

/** Test campaign: cover every kind of test, fix what's found (worst first), launch when nothing known is unfixed. */
export function campaignHabit(g: Game): void {
  const d = data(g, CAMPAIGN) as (Data & { testsDone: Record<string, number>; known: string[]; fixed: string[]; test: JsonValue; fix: JsonValue }) | null;
  if (!d || !Object.keys(testSpecs(g)).length || !adoptedVehicle(g) || !rocketAllDials(g).length) return;
  if (!g.book.completed.includes(CAMPAIGN)) return;
  const table = new Map(vehicleFlaws(g).map((f) => [f.id, f]));
  const open = d.known.filter((id) => table.has(id) && !d.fixed.includes(id));
  if (!d.fix && open.length) {
    const rank = { fatal: 0, mission_loss: 1, survivable: 2 } as const;
    open.sort((a, b) => rank[table.get(a)!.severity] - rank[table.get(b)!.severity]);
    startFix(g, open[0]!);
  }
  if (!d.test) {
    const next = TEST_PLAN.find(([t, k]) => (d.testsDone[t] ?? 0) < k && testBlocked(g, t) === null);
    if (next) startTest(g, next[0]);
  }
  const planDone = TEST_PLAN.every(([t, k]) => (d.testsDone[t] ?? 0) >= k);
  if (planDone && !open.length && !d.fix && !d.test && launchBlocked(g) === null) launch(g);
}
