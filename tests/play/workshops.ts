// The bot's workshop habits (tests/play/bot.ts): what a middling player does in each workshop.
import type { JsonValue } from "../../src/engine";
import type { Game } from "../../src/ui/shellGame";
import { isDone } from "../../src/ui/workshops/common";
import { buildEngine, ENGINE_WS, engineDesign, engineDials, runningEngine } from "../../src/ui/workshops/engine";
import { workshopSystem } from "../../src/ui/workshops/kit";
import { SHOP, shopDials, shopSetup, startRetool } from "../../src/ui/workshops/machineShop";
import "../../src/ui/workshops/furnace";
import { liquefierDesign, liquefierDials, startLiquefier } from "../../src/ui/workshops/liquefier";
import "../../src/ui/workshops/rocketEngine";
import "../../src/ui/workshops/rocket";

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
