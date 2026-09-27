// E2: the engine workshop (Stages 2-4). Design, see live outputs, build (costs iron and months), run.
// The screen runs C's engine models on the dials: the Savery pump alone at first, then the piston
// engine (force = pressure x area; hoop stress and the burst date shown before building), a generator,
// transmission and prime mover. A finished build becomes the colony's running engine: it sets
// `engine_type`, `coal_per_engine_kw`, `dynamo_output_kw`, `grid_kw`, `factory_power_kw` and
// `power_station_efficiency`, and the engine tenders' coal-to-work rate follows the design. If its
// margin is thin, the boiler bursts on the date the screen showed: `boiler_explosions` + 1.
import {
  coalPerDayKg,
  generatorOutput,
  NEWCOMEN_MAX_BOILER_ATM,
  pistonEngine,
  powerStation,
  PRIME_MOVER_SHAFT_RPM,
  primeMoverEfficiency,
  SAFE_MARGIN,
  saveryPump,
  transmissionLoss,
} from "../../models";
import type { Condenser, EngineType, Flywheel, GeneratorKind, GeneratorResult, PlateType, PrimeMover, Transmission } from "../../models";
import { DAYS_PER_YEAR, ELECTRICITY_KW_METRIC, type JsonValue, type TickContext, WORK_KW_METRIC } from "../../engine";
import { registerWorkshop } from "../shell";
import { yearDay } from "../shellFormat";
import { registerGameSystem, type Game } from "../shellGame";
import { fill } from "../strings";
import {
  actionHTML,
  dialNumber,
  dialOption,
  dialsWithLocks,
  doneReason,
  esc,
  isDone,
  lockUntil,
  mountScreen,
  n,
  nodeName,
  noteHTML,
  num,
  outputsBlock,
  playNum,
  progressHTML,
  pushHistory,
  setState,
} from "./common";
import { type DialValue, type DialView, type HistoryEntry, type OutputRow, workshopSystem, WorkshopSystem } from "./kit";
import { WS } from "./strings";

export const ENGINE_WS = "engine_workshop";
const S = WS.engine;

/** state-variables.yaml, iron_quality: "Below 2: tool life and plate strength fall a third." */
export const WEAK_IRON_BELOW = 2;
export const WEAK_IRON_PLATE_FACTOR = 2 / 3;
/** The job the running engine drives: its coal-to-work rate follows the built design. */
export const ENGINE_JOB = "tend_engine";

/** What the current dials would build. */
export interface EngineDesign {
  kind: EngineType;
  mover: PrimeMover | null;
  shaft_kw: number;
  water_lifted_per_day: number;
  coal_per_day: number;
  coal_per_engine_kw: number;
  iron_cost_kg: number;
  safety_margin: number;
  years_to_failure: number | null;
  hoop_stress_pa: number | null;
  generator: GeneratorKind;
  dynamo: GeneratorResult | null;
  /** The generator can't run: the engine is a beam pump. */
  needsRotative: boolean;
  line_loss_pct: number | null;
  delivered_kw: number;
  station_efficiency: number | null;
  rotative: boolean;
  notes: string[];
  title: string;
}

/** A design being built, or the engine running. */
interface Built {
  design: EngineDesign;
  start: number;
  /** Day the build finishes (building) or finished (running). */
  done: number;
  /** Day the boiler bursts, or null. */
  burst: number | null;
}

interface EngineData {
  dials: Record<string, JsonValue>;
  building: Built | null;
  running: Built | null;
  history: HistoryEntry[];
  /** This workshop's factor on the tender job's yield (so it replaces, not stacks on, node factors). */
  factor: number;
  /** The running engine had no coal today. */
  starved?: boolean;
}

const initial: EngineData = { dials: {}, building: null, running: null, history: [], factor: 1, starved: false };

/** A shaft or generator engine (not a pump the tenders feed): it burns its own coal from the stores. */
export function burnsOwnCoal(e: EngineDesign): boolean {
  return (e.rotative || e.generator !== "none") && e.kind !== "savery";
}

export function engineDials(game: Game): DialView[] {
  const locks: Record<string, Record<string, string>> = {
    plate: lockUntil(game, { rolled: "plate_rolling" }),
    prime_mover: {
      ...lockUntil(game, { water_turbine: "water_turbine" }),
      ...(num(game, "steel_quality") >= 2 ? {} : { turbine: fill(WS.frame.needs, { name: nodeName(game, "open_hearth") }) }),
    },
  };
  return dialsWithLocks(game, ENGINE_WS, locks).map((d) =>
    // Until the high-pressure engine, the boiler stays at an atmospheric engine's pressure.
    d.id === "boiler_pressure" && d.range && !isDone(game, "high_pressure_engine")
      ? { ...d, range: [d.range[0], Math.min(d.range[1], NEWCOMEN_MAX_BOILER_ATM)] as [number, number] }
      : d,
  );
}

const byId = (dials: readonly DialView[]) => (id: string) => dials.find((d) => d.id === id);

/** The design the dials describe (C's models, live). */
export function engineDesign(game: Game, values: Record<string, JsonValue>): EngineDesign {
  const dials = engineDials(game);
  const d = byId(dials);
  const notes: string[] = [];
  const lift = dialNumber(values, d("lift_height"), 9);
  if (!d("cylinder_diameter")) {
    const s = saveryPump({ lift_height: lift });
    if (s.required_gauge_pa > 0) notes.push(fill(S.suction, { m: n(s.suction_lift_m) }));
    return {
      kind: "savery", mover: null, shaft_kw: 0, water_lifted_per_day: s.water_lifted_per_day, coal_per_day: s.coal_per_day, coal_per_engine_kw: 0,
      iron_cost_kg: playNum(game, ENGINE_WS, "savery_iron_kg"), safety_margin: s.safety_margin, years_to_failure: s.years_to_failure, hoop_stress_pa: null,
      generator: "none", dynamo: null, needsRotative: false, line_loss_pct: null, delivered_kw: 0, station_efficiency: null, rotative: false, notes,
      title: `${S.kind.savery}, ${n(lift)} m`,
    };
  }
  const plateDial = d("plate");
  const plateType = dialOption<PlateType>(values, plateDial, "hammered");
  const thickness = dialNumber(values, plateDial, 8);
  const weak = num(game, "iron_quality") < WEAK_IRON_BELOW;
  if (weak) notes.push(S.lowIron);
  const flywheel = dialOption<Flywheel>(values, d("flywheel"), "beam_pump");
  const piston = pistonEngine(
    {
      lift_height: lift,
      cylinder_diameter: dialNumber(values, d("cylinder_diameter"), 0.5),
      boiler_pressure: dialNumber(values, d("boiler_pressure"), 1),
      plate: { thickness_mm: thickness, type: plateType },
      condenser: dialOption<Condenser>(values, d("condenser"), "none"),
      flywheel,
    },
    { plate_strength_factor: weak ? WEAK_IRON_PLATE_FACTOR : 1 },
  );
  // Prime mover: the dial from Stage 4; before it, a water turbine if that's what the colony built
  // and the engine isn't rotative, else the piston engine.
  let mover: PrimeMover = "piston";
  if (d("prime_mover")) mover = dialOption<PrimeMover>(values, d("prime_mover"), "piston");
  else if (flywheel !== "rotative" && isDone(game, "water_turbine")) mover = "water_turbine";
  const rotative = flywheel === "rotative" || mover !== "piston";
  const shaft_kw = mover === "water_turbine" ? playNum(game, ENGINE_WS, "water_turbine_kw") * Math.max(1, num(game, "river_sites")) : piston.shaft_kw;
  const eff = primeMoverEfficiency(mover, piston.engine_type);
  const coal_per_day = mover === "piston" ? piston.coal_per_day : mover === "turbine" ? coalPerDayKg(shaft_kw, eff) : 0;

  const generator = dialOption<GeneratorKind>(values, d("generator"), "none");
  const needsRotative = generator !== "none" && !rotative;
  const dynamo = d("generator") && !needsRotative
    ? generatorOutput({ generator, shaft_kw, bearing_quality: num(game, "bearing_quality"), prime_mover: mover, shaft_rpm: PRIME_MOVER_SHAFT_RPM[mover] })
    : null;
  if (needsRotative) notes.push(S.needsRotative);
  const kw = dynamo?.dynamo_output_kw ?? 0;
  const line = d("transmission") ? transmissionLoss({ transmission: dialOption<Transmission>(values, d("transmission"), "dc_local"), power_kw: kw, distance_km: playNum(game, ENGINE_WS, "grid_km") }) : null;
  const station = d("prime_mover") || d("transmission") ? powerStation(kw, mover, piston.engine_type) : null;
  const name = mover === "piston" ? S.kind[piston.engine_type]! : S.mover[mover]!;
  return {
    kind: piston.engine_type,
    mover,
    shaft_kw,
    water_lifted_per_day: rotative ? 0 : piston.water_lifted_per_day,
    coal_per_day,
    coal_per_engine_kw: eff > 0 ? (coal_per_day / Math.max(1e-9, shaft_kw)) / 24 : 0,
    iron_cost_kg: piston.iron_cost_kg,
    safety_margin: piston.safety_margin,
    years_to_failure: piston.years_to_failure,
    hoop_stress_pa: piston.hoop_stress_pa,
    generator,
    dynamo,
    needsRotative,
    line_loss_pct: line?.line_loss_pct ?? null,
    delivered_kw: line ? line.delivered_kw : kw,
    station_efficiency: station ? station.power_station_efficiency : null,
    rotative,
    notes,
    title: `${name}, ${n(dialNumber(values, d("cylinder_diameter"), 0.5))} m, ${n(dialNumber(values, d("boiler_pressure"), 1))} atm`,
  };
}

function burstText(game: Game, e: EngineDesign, doneDay: number | null): { text: string; bad: boolean } {
  if (e.years_to_failure === null) return { text: S.safe, bad: false };
  if (e.years_to_failure === 0 && doneDay === null) return { text: S.burstsAtOnce, bad: true };
  if (doneDay === null) return { text: fill(S.bursts, { years: n(e.years_to_failure) }), bad: true };
  const { year, day } = yearDay(doneDay + Math.round(e.years_to_failure * DAYS_PER_YEAR));
  return { text: fill(S.burstsOn, { year, day }), bad: true };
}

/** The outputs table for a design. */
export function engineRows(game: Game, e: EngineDesign, doneDay: number | null = null): OutputRow[] {
  const rows: OutputRow[] = [];
  if (e.kind !== "savery") rows.push({ label: S.shaft, value: n(e.shaft_kw, "kW") });
  if (!e.rotative) rows.push({ label: S.water, value: n(e.water_lifted_per_day, "m³/day") });
  rows.push({ label: S.coal, value: n(e.coal_per_day, "kg/day") });
  if (e.coal_per_engine_kw > 0) rows.push({ label: S.coalPerKwh, value: n(e.coal_per_engine_kw, "kg") });
  rows.push({ label: S.iron, value: n(e.iron_cost_kg, "kg") });
  if (e.hoop_stress_pa !== null) rows.push({ label: S.stress, value: n(e.hoop_stress_pa / 1e6, "MPa") });
  const margin = e.safety_margin;
  rows.push({ label: S.margin, value: Number.isFinite(margin) ? n(margin) : "∞", tone: margin < SAFE_MARGIN ? "bad" : "good" });
  const b = burstText(game, e, doneDay);
  rows.push({ label: "", value: b.text, tone: b.bad ? "bad" : "good" });
  if (e.dynamo && e.generator !== "none") {
    const lim = S.limited[e.dynamo.limited_by] ?? "";
    rows.push({ label: S.dynamo, value: n(e.dynamo.dynamo_output_kw, "kW") + (lim ? ` (${lim})` : "") });
  }
  if (e.line_loss_pct !== null) {
    rows.push({ label: S.loss, value: n(e.line_loss_pct, "%"), tone: e.line_loss_pct > 20 ? "bad" : "normal" });
    rows.push({ label: S.delivered, value: n(e.delivered_kw, "kW") });
  }
  if (e.station_efficiency !== null) rows.push({ label: S.efficiency, value: n(e.station_efficiency * 100, "%") });
  return rows;
}

/** A bar for the safety margin, with the 1.5 safe line (C's SAFE_MARGIN). */
function marginBar(margin: number): string {
  const cap = 3;
  const w = Math.max(0, Math.min(1, (Number.isFinite(margin) ? margin : cap) / cap)) * 100;
  const safe = (SAFE_MARGIN / cap) * 100;
  const tone = margin < SAFE_MARGIN ? "var(--red)" : "var(--blue)";
  return `<div class="wk-bar" style="position:relative" aria-label="${esc(S.margin)}"><i style="width:${w.toFixed(1)}%; background:${tone}"></i><b style="position:absolute; top:-3px; bottom:-3px; left:${safe}%; border-left:1px solid var(--ink)"></b></div>`;
}

/** The job's own coal-to-work rate, kg coal per kWh (from its YAML inputs and outputs). */
function jobCoalPerKwh(game: Game): number | null {
  const j = game.content.jobs.find((x) => x.id === ENGINE_JOB);
  const coal = j?.inputs?.coal_kg;
  const kwh = j?.outputs?.engine_work_kwh;
  return coal && kwh ? coal / kwh : null;
}

/** Put the running engine's design into the colony. */
function applyEngine(game: Game, d: EngineData, e: EngineDesign | null): void {
  const eng = game.engine;
  if (e) {
    if (e.mover === "piston" || e.kind === "savery") setState(game, "engine_type", e.kind);
    if (e.coal_per_engine_kw > 0) setState(game, "coal_per_engine_kw", e.coal_per_engine_kw);
    setState(game, "dynamo_output_kw", e.dynamo?.dynamo_output_kw ?? 0);
    if (e.line_loss_pct !== null) setState(game, "grid_kw", e.delivered_kw);
    if (e.station_efficiency !== null) setState(game, "power_station_efficiency", e.station_efficiency);
    if (e.rotative) setState(game, "factory_power_kw", e.shaft_kw);
    if (e.mover === "water_turbine") setState(game, "hydro_kw", e.shaft_kw);
  } else {
    setState(game, "dynamo_output_kw", 0);
    setState(game, "factory_power_kw", 0);
  }
  // The tenders' coal-to-work follows the design: net factor = job's rate / the design's, replacing
  // (not stacking on) any node factor while this engine runs.
  const base = jobCoalPerKwh(game);
  if (!eng.jobDef(ENGINE_JOB) || base === null) return;
  const others = eng.modifier("yield", ENGINE_JOB) / d.factor;
  const target = e && e.coal_per_engine_kw > 0 ? base / e.coal_per_engine_kw : null;
  const mine = target === null ? null : target / others;
  eng.setModifier("yield", ENGINE_JOB, `workshop:${ENGINE_WS}`, mine);
  d.factor = mine ?? 1;
}

/** Start building the current design: the iron leaves the stores now. */
export function buildEngine(game: Game): boolean {
  const sys = workshopSystem<EngineData & JsonValue>(game, ENGINE_WS);
  if (!sys || sys.data.building) return false;
  const e = engineDesign(game, sys.data.dials);
  if (!game.engine.spend({ iron_kg: e.iron_cost_kg })) return false;
  const start = game.engine.day;
  sys.data.building = { design: e, start, done: start + playNum(game, ENGINE_WS, "build_days"), burst: null };
  return true;
}

/** The running engine's day: burn its coal, deliver its power (energy counts work and electricity x2.5). */
function runEngine(game: Game, ctx: TickContext, d: EngineData): void {
  const e = d.running?.design;
  const eng = ctx.engine;
  if (!e || !burnsOwnCoal(e)) {
    eng.setMetric(WORK_KW_METRIC, 0);
    eng.setMetric(ELECTRICITY_KW_METRIC, 0);
    return;
  }
  const fed = e.coal_per_day <= 0 || eng.spend({ coal_kg: e.coal_per_day });
  d.starved = !fed;
  const kw = e.dynamo?.dynamo_output_kw ?? 0;
  setState(game, "dynamo_output_kw", fed ? kw : 0);
  if (e.rotative) setState(game, "factory_power_kw", fed ? e.shaft_kw : 0);
  if (e.line_loss_pct !== null) setState(game, "grid_kw", fed ? e.delivered_kw : 0);
  eng.setMetric(ELECTRICITY_KW_METRIC, fed ? e.delivered_kw : 0);
  eng.setMetric(WORK_KW_METRIC, fed && kw <= 0 ? e.shaft_kw : 0);
}

function tickEngine(game: Game, ctx: TickContext, sys: WorkshopSystem<EngineData & JsonValue>): void {
  const d = sys.data;
  const today = ctx.day + 1;
  const b = d.building;
  if (b && today >= b.done) {
    const e = b.design;
    const burst = e.years_to_failure === null ? null : b.done + Math.round(e.years_to_failure * DAYS_PER_YEAR);
    d.running = { ...b, burst };
    d.building = null;
    applyEngine(game, d, e);
    const bt = burstText(game, e, b.done);
    pushHistory(d.history, { day: today, title: e.title, detail: `${S.built} ${bt.text}.`, tone: bt.bad ? "bad" : "good" });
    ctx.pause(doneReason(ENGINE_WS));
  }
  const r = d.running;
  if (r && r.burst !== null && today >= r.burst) {
    setState(game, "boiler_explosions", num(game, "boiler_explosions") + 1);
    d.running = null;
    applyEngine(game, d, null);
    pushHistory(d.history, { day: today, title: r.design.title, detail: S.burst, tone: "bad" });
    ctx.pause(doneReason(ENGINE_WS));
  }
  runEngine(game, ctx, d);
}

registerGameSystem((game) => new WorkshopSystem<EngineData & JsonValue>(ENGINE_WS, initial as EngineData & JsonValue, (ctx, sys) => tickEngine(game, ctx, sys)));

registerWorkshop(ENGINE_WS, (el, game) => {
  const sys = workshopSystem<EngineData & JsonValue>(game, ENGINE_WS);
  if (!sys) return;
  return mountScreen(el, game, {
    dials: () => engineDials(game),
    values: () => sys.data.dials as Record<string, DialValue>,
    setValue: (id, v) => void (sys.data.dials = { ...sys.data.dials, [id]: v as JsonValue }),
    body: () => {
      const d = sys.data;
      const e = engineDesign(game, d.dials);
      let h = "";
      if (d.building) h += progressHTML(`${S.building}: ${d.building.design.title}`, game.engine.day - d.building.start, d.building.done - d.building.start);
      h += outputsBlock(engineRows(game, e), S.design);
      h += marginBar(e.safety_margin);
      for (const line of e.notes) h += noteHTML(line, true);
      const days = playNum(game, ENGINE_WS, "build_days");
      const iron = game.engine.stock("iron_kg");
      const blocked = d.building
        ? fill(WS.frame.running, { what: S.building, day: game.engine.day - d.building.start, days: d.building.done - d.building.start })
        : iron < e.iron_cost_kg
          ? fill(WS.frame.notEnough, { name: (game.tree.resources["iron_kg"]?.name ?? "iron").toLowerCase(), have: n(iron), need: n(e.iron_cost_kg) })
          : null;
      h += actionHTML("build", fill(S.build, { days }), blocked);
      if (d.running && !d.building) h += noteHTML(S.replaced);
      if (d.running && d.starved) h += noteHTML(S.noCoal, true);
      if (d.running) h += outputsBlock(engineRows(game, d.running.design, d.running.done), `${S.running}: ${d.running.design.title}`);
      else h += `<h3>${esc(S.running)}</h3>` + noteHTML(S.none);
      return h;
    },
    act: () => void buildEngine(game),
    history: () => sys.data.history,
  });
});

/** For tests: is the workshop's engine running, and what's its burst day. */
export function runningEngine(game: Game): { design: EngineDesign; burst: number | null } | null {
  const r = workshopSystem<EngineData & JsonValue>(game, ENGINE_WS)?.data.running;
  return r ? { design: r.design, burst: r.burst } : null;
}

