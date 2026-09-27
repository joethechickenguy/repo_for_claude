// E1: the furnace workshop (Stages 1-3). A campaign is one furnace run: the player sets the dials,
// sees what a campaign would give (C's furnace model, live), and runs it. The charge (ore, fuel, lime)
// leaves the stores when it starts; the metal arrives when it ends, ~30 days later, or nothing does
// and the history says why ("the slag froze"). Campaigns count toward `campaigns_run`; a blast
// furnace campaign sets `coke_rate` and `iron_quality`, a converter heat `steel_quality`. The
// smelting jobs keep running beside it: the workshop is where the crews try things.
import { bessemerBlow, blastFurnace, REQUIRED_TEMPERATURE_C, smeltBloom, smeltCopper, WIND_CALM_SEASON_FACTOR } from "../../models";
import type { AirSupply, BlastSource, ChargeMode, ConverterLining, FurnaceFuel, LowHigh, Manganese, OreChoice } from "../../models";
import type { JsonValue, TickContext } from "../../engine";
import { registerWorkshop } from "../shell";
import { registerGameSystem, type Game } from "../shellGame";
import { FURNACE_CAMPAIGNS_METRIC, IRON_TOTAL_METRIC } from "../shellSystems";
import { fill } from "../strings";
import {
  actionHTML,
  dialNumber,
  dialOption,
  dialsWithLocks,
  doneReason,
  flag,
  isDone,
  lockUntil,
  mountScreen,
  n,
  nodeName,
  noteHTML,
  num,
  outputsBlock,
  playList,
  playNum,
  progressHTML,
  pushHistory,
  setState,
  str,
} from "./common";
import { type DialValue, type DialView, type HistoryEntry, optionWords, type OutputRow, workshopSystem, WorkshopSystem } from "./kit";
import { WS } from "./strings";

export const FURNACE = "furnace_workshop";
const S = WS.furnace;

type Kind = ChargeMode | "converter";

/** What a campaign (or a converter heat) would do if started now. */
export interface FurnacePlan {
  kind: Kind;
  days: number;
  /** Resources charged at the start (already scaled to what's in store). */
  charge: Record<string, number>;
  /** The full charge the dials ask for. */
  fullCharge: Record<string, number>;
  /** Fraction of the full charge in store (0: can't run). */
  scale: number;
  /** The first input short of a full charge, for the reason line. */
  short: { resource: string; have: number; need: number } | null;
  metal: string;
  metal_kg: number;
  failure: string | null;
  /** Extra lines under the outputs (cold-short, calm season). */
  notes: string[];
  writes: Record<string, number>;
  rows: OutputRow[];
  /** One line for the history title. */
  title: string;
}

interface Running {
  kind: Kind;
  start: number;
  end: number;
  metal: string;
  metal_kg: number;
  failure: string | null;
  writes: Record<string, number>;
  title: string;
  detail: string;
  pigSulfur?: boolean;
}

interface FurnaceData {
  dials: Record<string, JsonValue>;
  running: Running | null;
  history: HistoryEntry[];
  campaigns: number;
  ironTotal: number;
  /** The last blast campaign's pig carried sulfur (null: none run yet; the state decides). */
  pigSulfur: boolean | null;
}

const initial: FurnaceData = { dials: {}, running: null, history: [], campaigns: 0, ironTotal: 0, pigSulfur: null };

/** The earned dials, with options the colony can't use yet locked and the node that opens them named. */
export function furnaceDials(game: Game): DialView[] {
  const needFlag = (f: string, node: string): string | undefined => (flag(game, f) ? undefined : node);
  const lock = lockUntil;
  const locks: Record<string, Record<string, string>> = {
    air_supply: lock(game, { bellows_crews: needFlag("has_bellows", "pot_bellows"), wind_site: needFlag("has_wind_furnaces", "wind_furnaces") }),
    ore_choice: lock(game, { bog_iron: "bog_iron", hillside_ore: "hillside_ore" }),
    charge_mode: lock(game, { iron_blast: "blast_furnace" }),
    blast_source: lock(game, { water_wheel: "water_wheels" }),
    furnace_fuel: flag(game, "has_coke") ? {} : { coke: fill(WS.frame.needs, { name: nodeName(game, "coal_mining") }) },
    converter_lining: lock(game, { basic_dolomite: "mineral_prospecting" }),
    manganese: lock(game, { spiegeleisen: "mineral_prospecting" }),
  };
  // Before either deposit is chosen, leave the ore dial open (prospecting found both).
  if (!isDone(game, "bog_iron") && !isDone(game, "hillside_ore")) locks.ore_choice = {};
  return dialsWithLocks(game, FURNACE, locks);
}

const byId = (dials: readonly DialView[]) => (id: string) => dials.find((d) => d.id === id);

function resName(game: Game, id: string): string {
  // "Charcoal (kg)" -> "Charcoal": the unit is on the number.
  return (game.tree.resources[id]?.name ?? optionWords(id)).replace(/\s*\([^)]*\)$/, "");
}

/** Is `day` in the ridge's calm season (play.calm_season, days of the year)? */
export function inCalmSeason(game: Game, day: number): boolean {
  const [a, b] = playList(game, FURNACE, "calm_season") as number[];
  if (typeof a !== "number" || typeof b !== "number") return false;
  const d = day % 365;
  return d >= a && d < b;
}

function scaleCharge(game: Game, full: Record<string, number>): { scale: number; short: FurnacePlan["short"] } {
  let scale = 1;
  let short: FurnacePlan["short"] = null;
  for (const [r, need] of Object.entries(full)) {
    if (need <= 0) continue;
    const have = game.engine.stock(r);
    if (have < need && !short) short = { resource: r, have, need };
    scale = Math.min(scale, have / need);
  }
  return { scale: Math.max(0, scale), short };
}

const times = (rec: Record<string, number>, k: number): Record<string, number> =>
  Object.fromEntries(Object.entries(rec).map(([r, v]) => [r, v * k]));

/** A campaign with the current dials, as it would run if started on `day`. */
export function furnacePlan(game: Game, values: Record<string, JsonValue>, day = game.engine.day): FurnacePlan {
  const dials = furnaceDials(game);
  const d = byId(dials);
  const days = playNum(game, FURNACE, "campaign_days");
  const kind = dialOption<ChargeMode>(values, d("charge_mode"), "copper");
  const air = dialOption<AirSupply>(values, d("air_supply"), "blowpipes");
  const ratio = dialNumber(values, d("fuel_ratio"), 2);
  const calm = air === "wind_site" && inCalmSeason(game, day);
  const notes: string[] = [];
  if (calm) notes.push(fill(S.calm, { pct: Math.round(WIND_CALM_SEASON_FACTOR * 100) }));
  const label = S.chargeKinds[kind] ?? kind;

  if (kind === "copper") {
    const probe = smeltCopper({ air_supply: air, fuel_ratio: ratio }, 1, calm);
    const ore = playNum(game, FURNACE, "copper_ore_kg") * probe.output_multiplier;
    const full = { ore_kg: ore, charcoal_kg: ore * ratio };
    const { scale, short } = scaleCharge(game, full);
    const r = smeltCopper({ air_supply: air, fuel_ratio: ratio }, ore * scale, calm);
    return {
      kind, days, charge: times(full, scale), fullCharge: full, scale, short, metal: "copper_kg", metal_kg: r.metal_kg, failure: r.failure, notes, writes: {},
      title: `${label}, ${optionWords(air)}, ${n(ratio)} kg/kg`,
      rows: [
        { label: S.temperature, value: n(r.temperature_c, "°C"), tone: r.failure ? "bad" : "good" },
        { label: S.required, value: n(REQUIRED_TEMPERATURE_C.copper, "°C") },
        { label: S.ore, value: n(ore * scale, "kg") },
        { label: S.fuel, value: n(r.fuel_kg, "kg") },
        { label: S.metal, value: n(r.metal_kg, "kg"), tone: r.failure ? "bad" : "normal" },
      ],
    };
  }

  const oreChoice = dialOption<OreChoice>(values, d("ore_choice"), str(game, "iron_ore_phosphorus") === "high" ? "bog_iron" : "hillside_ore");
  if (kind === "iron_bloom") {
    const ore = playNum(game, FURNACE, "bloom_ore_kg");
    const full = { iron_ore_kg: ore, charcoal_kg: ore * ratio };
    const { scale, short } = scaleCharge(game, full);
    const r = smeltBloom({ air_supply: air, fuel_ratio: ratio, ore_choice: oreChoice }, ore * scale);
    return {
      kind, days, charge: times(full, scale), fullCharge: full, scale, short, metal: "bloom_kg", metal_kg: r.metal_kg, failure: r.failure, notes, writes: {},
      title: `${label}, ${optionWords(oreChoice)}, ${optionWords(air)}, ${n(ratio)} kg/kg`,
      rows: [
        { label: S.temperature, value: n(r.temperature_c, "°C"), tone: r.failure === "too_cold" ? "bad" : "good" },
        { label: S.required, value: n(REQUIRED_TEMPERATURE_C.iron_bloom, "°C") },
        { label: S.ore, value: n(ore * scale, "kg") },
        { label: S.fuel, value: n(r.fuel_kg, "kg") },
        { label: S.metal, value: n(r.metal_kg, "kg"), tone: r.failure ? "bad" : "normal" },
        { label: S.ironQuality, value: n(r.iron_quality) },
      ],
    };
  }

  // Blast furnace: continuous, so a campaign is `days` of its daily throughput.
  const fuel = dialOption<FurnaceFuel>(values, d("furnace_fuel"), "charcoal");
  const bf = blastFurnace(
    {
      stack_height: dialNumber(values, d("stack_height"), 6),
      blast_source: dialOption<BlastSource>(values, d("blast_source"), "treadwheels"),
      ore_choice: oreChoice,
      furnace_fuel: fuel,
      flux: d("flux") ? dialNumber(values, d("flux"), 0) : 0,
      blast_temperature: d("blast_temperature") ? dialNumber(values, d("blast_temperature"), 20) : 20,
    },
    { coal_sulfur: str(game, "coal_sulfur") === "high" ? "high" : "low" },
  );
  const fuelRes = fuel === "coke" ? "coke_kg" : "charcoal_kg";
  const full: Record<string, number> = { iron_ore_kg: bf.ore_kg_per_day * days, [fuelRes]: bf.fuel_kg_per_day * days };
  if (bf.lime_kg_per_day > 0) full.lime_kg = bf.lime_kg_per_day * days;
  // A frozen furnace still eats its first charge: a day's worth.
  if (bf.failure) {
    const probe = blastFurnace({ stack_height: 6, blast_source: "water_wheel", ore_choice: oreChoice, furnace_fuel: fuel }, { water_wheels: 1 });
    full.iron_ore_kg = probe.ore_kg_per_day;
    full[fuelRes] = probe.fuel_kg_per_day;
  }
  const { scale, short } = scaleCharge(game, full);
  const metal_kg = bf.metal_kg_per_day * days * scale;
  return {
    kind, days, charge: times(full, scale), fullCharge: full, scale, short, metal: "iron_kg", metal_kg, failure: bf.failure, notes,
    writes: bf.failure ? {} : { coke_rate: bf.coke_rate, iron_quality: bf.iron_quality, ...(bf.carries_sulfur ? { pig_sulfur: 1 } : { pig_sulfur: 0 }) },
    title: `${label}, ${n(dialNumber(values, d("stack_height"), 6))} m, ${optionWords(fuel)}`,
    rows: [
      { label: S.blast, value: `${n(bf.blast_kw)} / ${n(bf.blast_kw_needed)} kW`, tone: bf.failure === "frozen_weak_blast" ? "bad" : "normal" },
      { label: S.ore, value: n(full.iron_ore_kg! * scale, "kg") },
      { label: S.fuel, value: n(full[fuelRes]! * scale, "kg") },
      ...(full.lime_kg ? [{ label: S.lime, value: n(full.lime_kg * scale, "kg") }] : []),
      { label: S.metal, value: n(metal_kg, "kg"), tone: bf.failure ? ("bad" as const) : ("normal" as const) },
      { label: S.cokeRate, value: n(bf.coke_rate, "t") },
      { label: S.ironQuality, value: n(bf.iron_quality) },
    ],
  };
}

/** A converter heat with the current dials, or null before the converter exists. */
export function converterPlan(game: Game, values: Record<string, JsonValue>, pigSulfur: boolean | null = null): FurnacePlan | null {
  const dials = furnaceDials(game);
  const d = byId(dials);
  if (!d("blow_time")) return null;
  const heat = playNum(game, FURNACE, "converter_heat_kg");
  const full = { iron_kg: heat };
  const { scale, short } = scaleCharge(game, full);
  const sulfur: LowHigh = (pigSulfur ?? (str(game, "coal_sulfur") === "high" && flag(game, "has_coke"))) ? "high" : "low";
  const r = bessemerBlow(
    {
      converter_lining: dialOption<ConverterLining>(values, d("converter_lining"), "acid_silica"),
      blow_time: dialNumber(values, d("blow_time"), 20),
      manganese: dialOption<Manganese>(values, d("manganese"), "none"),
    },
    { iron_ore_phosphorus: str(game, "iron_ore_phosphorus") === "high" ? "high" : "low", coal_sulfur: sulfur },
  );
  const steel = r.failure ? 0 : heat * scale * playNum(game, FURNACE, "converter_yield");
  const notes = [...(r.cold_short ? [S.coldShort] : []), ...(r.hot_short ? [S.hotShort] : [])];
  return {
    kind: "converter",
    days: playNum(game, FURNACE, "converter_heat_days"),
    charge: times(full, scale),
    fullCharge: full,
    scale,
    short,
    metal: "steel_kg",
    metal_kg: steel,
    failure: r.failure,
    notes,
    writes: r.failure ? {} : { steel_quality: r.steel_quality, iron_quality: r.iron_quality },
    title: `${S.converter}, ${n(dialNumber(values, d("blow_time"), 20))} min`,
    rows: [
      { label: S.pig, value: n(heat * scale, "kg") },
      { label: S.carbon, value: n(r.carbon_pct, "%"), tone: r.failure ? "bad" : "good" },
      { label: S.steel, value: n(steel, "kg"), tone: r.failure ? "bad" : "normal" },
      { label: S.steelQuality, value: n(r.steel_quality), tone: r.cold_short || r.hot_short ? "bad" : "normal" },
    ],
  };
}

function detailOf(game: Game, p: FurnacePlan): string {
  if (p.failure) return S.failures[p.failure] ?? p.failure;
  const inputs = Object.entries(p.charge)
    .map(([r, v]) => `${n(v)} ${resName(game, r).toLowerCase()}`)
    .join(", ");
  return `${n(p.metal_kg)} kg ${resName(game, p.metal).toLowerCase()} from ${inputs}. ${p.notes.join(" ")}`.trim();
}

export class FurnaceWorkshop extends WorkshopSystem<FurnaceData & JsonValue> {}

/** Start a campaign (or a heat) with the current dials: the charge leaves the stores now. */
export function startFurnace(game: Game, kind: "campaign" | "converter"): boolean {
  const sys = workshopSystem<FurnaceData & JsonValue>(game, FURNACE);
  if (!sys || sys.data.running) return false;
  const p = kind === "converter" ? converterPlan(game, sys.data.dials, sys.data.pigSulfur) : furnacePlan(game, sys.data.dials);
  if (!p || p.scale <= 0) return false;
  if (!game.engine.spend(p.charge)) return false;
  const start = game.engine.day;
  sys.data.running = {
    kind: p.kind,
    start,
    end: start + p.days,
    metal: p.metal,
    metal_kg: p.metal_kg,
    failure: p.failure,
    writes: p.writes,
    title: p.title,
    detail: detailOf(game, p),
  };
  return true;
}

function tickFurnace(game: Game, ctx: TickContext, sys: WorkshopSystem<FurnaceData & JsonValue>): void {
  const d = sys.data;
  d.ironTotal += (ctx.report.produced["iron_kg"] ?? 0) + (ctx.report.produced["bloom_kg"] ?? 0);
  const r = d.running;
  if (r && ctx.day + 1 >= r.end) {
    if (r.metal_kg > 0) ctx.engine.addStock(r.metal, r.metal_kg);
    if (r.metal === "iron_kg" || r.metal === "bloom_kg") d.ironTotal += r.metal_kg;
    for (const [k, v] of Object.entries(r.writes)) {
      if (k === "pig_sulfur") d.pigSulfur = v > 0;
      else setState(game, k, v);
    }
    if (r.kind !== "converter") d.campaigns++;
    pushHistory(d.history, { day: ctx.day + 1, title: r.failure ? `${r.title}: ${S.failed}` : r.title, detail: r.detail, tone: r.failure ? "bad" : "good" });
    d.running = null;
    ctx.pause(doneReason(FURNACE));
  }
  ctx.engine.setMetric(FURNACE_CAMPAIGNS_METRIC, d.campaigns);
  ctx.engine.setMetric(IRON_TOTAL_METRIC, d.ironTotal);
}

registerGameSystem((game) => new FurnaceWorkshop(FURNACE, initial as FurnaceData & JsonValue, (ctx, sys) => tickFurnace(game, ctx, sys)));

function blockedLine(game: Game, p: FurnacePlan, running: Running | null): string | null {
  if (running) return fill(WS.frame.running, { what: S.chargeKinds[running.kind] ?? S.converter, day: game.engine.day - running.start, days: running.end - running.start });
  if (p.scale <= 0 && p.short) return fill(WS.frame.notEnough, { name: resName(game, p.short.resource).toLowerCase(), have: n(p.short.have), need: n(p.short.need) });
  return null;
}

function planHTML(game: Game, p: FurnacePlan, act: string, label: string, running: Running | null, heading: string): string {
  let h = outputsBlock(p.rows, heading);
  h += noteHTML(p.failure ? (S.failures[p.failure] ?? p.failure) : S.ok, !!p.failure);
  for (const line of p.notes) h += noteHTML(line, true);
  if (p.scale > 0 && p.scale < 1 && p.short) h += noteHTML(fill(WS.frame.notEnough, { name: resName(game, p.short.resource).toLowerCase(), have: n(p.short.have), need: n(p.short.need) }));
  h += actionHTML(act, label, blockedLine(game, p, running));
  return h;
}

registerWorkshop(FURNACE, (el, game) => {
  const sys = workshopSystem<FurnaceData & JsonValue>(game, FURNACE);
  if (!sys) return;
  return mountScreen(el, game, {
    dials: () => furnaceDials(game),
    values: () => sys.data.dials as Record<string, DialValue>,
    setValue: (id, v) => void (sys.data.dials = { ...sys.data.dials, [id]: v as JsonValue }),
    body: () => {
      const r = sys.data.running;
      let h = r ? progressHTML(r.title, game.engine.day - r.start, r.end - r.start) : "";
      const p = furnacePlan(game, sys.data.dials);
      h += planHTML(game, p, "campaign", fill(S.run, { days: p.days }), r, `${S.charge}: ${S.chargeKinds[p.kind] ?? p.kind}`);
      const c = converterPlan(game, sys.data.dials, sys.data.pigSulfur);
      if (c) h += planHTML(game, c, "converter", S.blow, r, S.converter);
      h += outputsBlock([{ label: S.campaigns, value: n(num(game, "campaigns_run")) }], "");
      return h;
    },
    act: (a) => void startFurnace(game, a === "converter" ? "converter" : "campaign"),
    history: () => sys.data.history,
  });
});
