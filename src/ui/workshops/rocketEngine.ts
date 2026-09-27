// E5: the rocket engine workshop (Stage 5). Design an engine (C's rocket-engine model, live: thrust,
// Isp at sea level and in vacuum, how long the chamber lasts), queue it for the stand, fire. A firing
// takes stand days (play.firing_days) and the LOX a planned 60 s burn needs from the stores; it
// records how long the chamber lasted and the thrust, and draws the chamber-pressure trace. The best
// firing sets `engine_static_fire_s` and `engine_thrust_kn` (the Stage 5 gate); each firing sets
// `injector_quality` and `feed_system`. Every day the stand queue writes `stand_days_balance` and the
// next firing's oxygen `lox_balance`, the stage's two bars. Flaws are the test campaign's (package H).
import { rocketEngine } from "../../models";
import type { Cooling, EnginePropellants, Feed, Injector, RocketEngineDials, RocketEngineResult } from "../../models";
import type { JsonValue, TickContext } from "../../engine";
import { registerWorkshop } from "../shell";
import { registerGameSystem, type Game } from "../shellGame";
import { STATIC_FIRE_METRIC, THRUST_METRIC } from "../shellSystems";
import { fill } from "../strings";
import {
  actionHTML,
  dialNumber,
  dialOption,
  dialsWithLocks,
  doneReason,
  esc,
  flag,
  isDone,
  lineChartSVG,
  lockUntil,
  mountScreen,
  n,
  noteHTML,
  outputsBlock,
  playNum,
  progressHTML,
  pushHistory,
  setState,
} from "./common";
import { type DialValue, type DialView, type HistoryEntry, type OutputRow, workshopSystem, WorkshopSystem } from "./kit";
import { WS } from "./strings";

export const ROCKET_ENGINE = "rocket_engine_workshop";
const S = WS.rocketEngine;

/** Chamber-pressure trace (display only): start-up ramp, s; roughness as a fraction of pressure. Estimates. */
const TRACE_RAMP_S = 1;
const TRACE_ROUGHNESS = 0.25;

interface Queued {
  design: RocketEngineDials;
  title: string;
}

interface Firing extends Queued {
  start: number;
  end: number;
}

interface RocketEngineData {
  dials: Record<string, JsonValue>;
  queue: Queued[];
  firing: Firing | null;
  best: { burn_s: number; thrust_kn: number } | null;
  last: Queued | null;
  history: HistoryEntry[];
}

const initial: RocketEngineData = { dials: {}, queue: [], firing: null, best: null, last: null, history: [] };

export function rocketEngineDials(game: Game): DialView[] {
  return dialsWithLocks(game, ROCKET_ENGINE, {
    feed: lockUntil(game, { peroxide_turbopump: "hydrogen_peroxide", gas_generator_turbopump: "gas_generator_turbopump" }),
  });
}

/** The colony's propellants: kerosene once there's oil, else alcohol (the two routes into first_liquid_rocket). */
export function enginePropellants(game: Game): EnginePropellants {
  return flag(game, "has_kerosene") ? "kerosene_lox" : "ethanol_lox";
}

export function rocketEngineDesign(game: Game, values: Record<string, JsonValue>): RocketEngineDials {
  const d = (id: string) => rocketEngineDials(game).find((x) => x.id === id);
  return {
    mixture_ratio: dialNumber(values, d("mixture_ratio"), 1.4),
    chamber_pressure: dialNumber(values, d("chamber_pressure"), 15),
    nozzle: d("nozzle") ? dialNumber(values, d("nozzle"), 4) : playNum(game, ROCKET_ENGINE, "default_nozzle"),
    ...(d("cooling") ? { cooling: dialOption<Cooling>(values, d("cooling"), "none") } : {}),
    ...(d("injector") ? { injector: dialOption<Injector>(values, d("injector"), "showerhead") } : {}),
    ...(d("feed") ? { feed: dialOption<Feed>(values, d("feed"), "pressure_fed") } : {}),
  };
}

export function rocketEngineResult(game: Game, design: RocketEngineDials): RocketEngineResult {
  return rocketEngine(design, { propellants: enginePropellants(game) });
}

/** LOX a planned burn needs, kg. */
export function loxNeed(game: Game, r: RocketEngineResult): number {
  return r.oxidizer_flow_kg_s * playNum(game, ROCKET_ENGINE, "planned_burn_s");
}

/** The store the engine's fuel comes from (kerosene from the refinery, or alcohol from the stills). */
export function fuelResource(game: Game): string {
  return enginePropellants(game) === "kerosene_lox" ? "kerosene_kg" : "ethanol_kg";
}

/** Fuel a planned burn needs, kg. */
export function fuelNeed(game: Game, r: RocketEngineResult): number {
  return r.fuel_flow_kg_s * playNum(game, ROCKET_ENGINE, "planned_burn_s");
}

/** What a firing takes from the stores. */
export function firingCost(game: Game, r: RocketEngineResult): Record<string, number> {
  return { lox_kg: loxNeed(game, r), [fuelResource(game)]: fuelNeed(game, r) };
}

/** injector_quality after a firing: the injector's, +1 on heat-resistant steel (Stage 4 choice), at most 2. */
export function injectorQuality(game: Game, r: RocketEngineResult): number {
  return Math.min(2, r.injector_quality + (isDone(game, "heat_resistant_steel") && r.injector_quality > 0 ? 1 : 0));
}

/** Seconds the chamber lasts on a planned burn. */
export function burnAchieved(game: Game, r: RocketEngineResult): number {
  return Math.min(playNum(game, ROCKET_ENGINE, "planned_burn_s"), r.burn_time_s);
}

function title(game: Game, d: RocketEngineDials): string {
  return `${n(d.mixture_ratio)} : 1, ${n(d.chamber_pressure)} bar${d.cooling ? `, ${d.cooling}` : ""}${d.injector ? `, ${d.injector.replace(/_/g, " ")}` : ""}${d.feed ? `, ${d.feed.replace(/_/g, " ")}` : ""}`;
}

export function rocketEngineRows(game: Game, r: RocketEngineResult): OutputRow[] {
  const planned = playNum(game, ROCKET_ENGINE, "planned_burn_s");
  return [
    { label: S.thrust, value: n(r.thrust_kn, "kN") },
    { label: S.thrustVac, value: n(r.thrust_vac_kn, "kN") },
    { label: S.ispSl, value: n(r.isp_sl_s, "s") },
    { label: S.ispVac, value: n(r.isp_vac_s, "s") },
    { label: S.burn, value: Number.isFinite(r.burn_time_s) ? n(r.burn_time_s, "s") : S.holds, tone: r.burn_time_s < planned ? "bad" : "good" },
    { label: S.pc, value: n(r.chamber_pressure_bar, "bar"), tone: r.feed_limited ? "bad" : "normal" },
    { label: S.lox, value: n(loxNeed(game, r), "kg") },
    { label: S.fuel, value: n(fuelNeed(game, r), "kg") },
    { label: S.flaws, value: WS.frame.pendingH },
  ];
}

function notes(r: RocketEngineResult): string[] {
  const out: string[] = [];
  if (r.feed_limited) out.push(fill(S.feedLimited, { pc: n(r.chamber_pressure_bar) }));
  if (r.stability_margin < 1) out.push(S.rough);
  if (r.oxidizer_rich) out.push(S.oxRich);
  if (r.flow_separation_sl) out.push(S.separation);
  return out;
}

/** The chamber-pressure trace of a firing: ramp, plateau (rough when unstable), and the burn-through. */
export function traceSVG(game: Game, r: RocketEngineResult): string {
  const planned = playNum(game, ROCKET_ENGINE, "planned_burn_s");
  const end = burnAchieved(game, r);
  const pc = r.chamber_pressure_bar;
  const rough = Math.max(0, 1 - r.stability_margin) * TRACE_ROUGHNESS;
  const pts: [number, number][] = [];
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const t = (planned * i) / steps;
    if (t > end) {
      pts.push([t, 0]);
      continue;
    }
    const ramp = Math.min(1, t / TRACE_RAMP_S);
    // Deterministic roughness that grows through the burn (a picture, not a simulation).
    const wobble = rough * Math.sin(t * 9.1) * Math.min(1, t / (planned / 3));
    pts.push([t, pc * ramp * (1 + wobble)]);
  }
  return lineChartSVG(pts, { title: S.trace, xMax: planned, yMin: 0, yMax: Math.max(1, pc * 1.4), bad: end < planned || rough > 0 });
}

/** Stands the colony has: a second test stand doubles the stand's throughput. */
export function standCount(game: Game): number {
  return isDone(game, "second_test_stand") ? 2 : 1;
}

/** Stand days one firing takes from the queue. */
export function firingDays(game: Game): number {
  return playNum(game, ROCKET_ENGINE, "firing_days") / standCount(game);
}

export function queueFiring(game: Game): boolean {
  const sys = workshopSystem<RocketEngineData & JsonValue>(game, ROCKET_ENGINE);
  if (!sys) return false;
  const design = rocketEngineDesign(game, sys.data.dials);
  sys.data.queue.push({ design, title: title(game, design) });
  return true;
}

function standDays(game: Game, d: RocketEngineData, today: number): number {
  const per = firingDays(game);
  return d.queue.length * per + (d.firing ? Math.max(0, d.firing.end - today) : 0);
}

function tickRocketEngine(game: Game, ctx: TickContext, sys: WorkshopSystem<RocketEngineData & JsonValue>): void {
  const d = sys.data;
  const today = ctx.day + 1;
  const f = d.firing;
  if (f && today >= f.end) {
    const r = rocketEngineResult(game, f.design);
    const burn = burnAchieved(game, r);
    const planned = playNum(game, ROCKET_ENGINE, "planned_burn_s");
    const better = !d.best || burn > d.best.burn_s || (burn === d.best.burn_s && r.thrust_kn > d.best.thrust_kn);
    if (better) d.best = { burn_s: burn, thrust_kn: r.thrust_kn };
    setState(game, "injector_quality", injectorQuality(game, r));
    if (f.design.feed) setState(game, "feed_system", f.design.feed);
    const ok = burn >= planned;
    pushHistory(d.history, {
      day: today,
      title: f.title,
      detail: ok
        ? fill(S.fired, { s: n(burn), kn: n(r.thrust_kn), isp: n(r.isp_sl_s) })
        : fill(S.burnedThrough, { s: n(burn), kn: n(r.thrust_kn) }),
      tone: ok ? "good" : "bad",
    });
    d.last = { design: f.design, title: f.title };
    d.firing = null;
    ctx.pause(doneReason(ROCKET_ENGINE));
  }
  if (!d.firing && d.queue.length) {
    const next = d.queue[0]!;
    if (ctx.engine.spend(firingCost(game, rocketEngineResult(game, next.design)))) {
      d.queue.shift();
      d.firing = { ...next, start: today, end: today + Math.ceil(firingDays(game)) };
    }
  }
  if (d.best) {
    ctx.engine.setMetric(STATIC_FIRE_METRIC, d.best.burn_s);
    ctx.engine.setMetric(THRUST_METRIC, d.best.thrust_kn);
  }
  if (game.book.completed.includes(game.tree.workshops[ROCKET_ENGINE]!.opensWith)) {
    setState(game, "stand_days_balance", playNum(game, ROCKET_ENGINE, "queue_year_days") - standDays(game, d, today));
    const next = d.queue[0];
    setState(game, "lox_balance", ctx.engine.stock("lox_kg") - (next ? loxNeed(game, rocketEngineResult(game, next.design)) : 0));
  }
}

registerGameSystem((game) => new WorkshopSystem<RocketEngineData & JsonValue>(ROCKET_ENGINE, initial as RocketEngineData & JsonValue, (ctx, sys) => tickRocketEngine(game, ctx, sys)));

function queueHTML(game: Game, d: RocketEngineData): string {
  let h = `<h3>${esc(S.queue)}</h3>`;
  h += outputsBlock([{ label: S.standDays, value: n(standDays(game, d, game.engine.day)) }], "");
  if (d.firing) h += progressHTML(`${S.firing}: ${d.firing.title}`, game.engine.day - d.firing.start, d.firing.end - d.firing.start);
  if (!d.queue.length) return h + noteHTML(S.queueEmpty);
  const next = d.queue[0]!;
  if (!d.firing)
    for (const [res, need] of Object.entries(firingCost(game, rocketEngineResult(game, next.design))))
      if (game.engine.stock(res) < need) h += noteHTML(fill(S.waiting, { name: game.resourceName(res), have: n(game.engine.stock(res)), need: n(need) }), true);
  h += `<ol class="wk-queue">`;
  d.queue.forEach((q, i) => {
    h += `<li><span class="grow"><b>${esc(q.title)}</b></span>`;
    if (i > 0) h += `<button type="button" data-act="first:${i}">${esc(S.first)}</button>`;
    h += `<button type="button" data-act="drop:${i}">${esc(S.drop)}</button></li>`;
  });
  return h + `</ol>`;
}

registerWorkshop(ROCKET_ENGINE, (el, game) => {
  const sys = workshopSystem<RocketEngineData & JsonValue>(game, ROCKET_ENGINE);
  if (!sys) return;
  return mountScreen(el, game, {
    dials: () => rocketEngineDials(game),
    values: () => sys.data.dials as Record<string, DialValue>,
    setValue: (id, v) => void (sys.data.dials = { ...sys.data.dials, [id]: v as JsonValue }),
    body: () => {
      const d = sys.data;
      const r = rocketEngineResult(game, rocketEngineDesign(game, d.dials));
      let h = noteHTML(fill(S.burning, { name: S.propellants[enginePropellants(game)] ?? "" }));
      h += outputsBlock(rocketEngineRows(game, r), S.design);
      for (const line of notes(r)) h += noteHTML(line, true);
      h += traceSVG(game, r);
      h += actionHTML("queue", S.queueIt, null);
      h += queueHTML(game, d);
      h += outputsBlock([{ label: S.best, value: d.best ? fill(S.bestLine, { s: n(d.best.burn_s), kn: n(d.best.thrust_kn) }) : S.none }], "");
      return h;
    },
    act: (a) => {
      const d = sys.data;
      if (a === "queue") queueFiring(game);
      else if (a.startsWith("drop:")) d.queue.splice(Number(a.slice(5)), 1);
      else if (a.startsWith("first:")) {
        const [q] = d.queue.splice(Number(a.slice(6)), 1);
        if (q) d.queue.unshift(q);
      }
    },
    history: () => sys.data.history,
  });
});
