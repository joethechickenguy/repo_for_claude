// E4: the liquefier workshop (Stage 4). Design a cold plant (method, compressor pressure, exchanger,
// column) and start it: the cold end falls toward its asymptote over in-game days (C's liquefier model
// and cool-down curve, drawn live) until the first drop, or stalls above -190 °C and the run is given
// up. A plant that liquefies runs every day after: it sets `has_liquid_air` and `cryo_process`, and with
// a rectifying column (air_separation) makes liquid oxygen into the stores and sets `lox_kg_per_day`,
// the Stage 4 gate's number.
import { LIQUID_AIR_C, AMBIENT_C, liquefier, temperatureAtDay } from "../../models";
import type { LiquefierDials, LiquefierMethod, LiquefierResult } from "../../models";
import type { JsonValue, TickContext } from "../../engine";
import { registerWorkshop } from "../shell";
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

export const LIQUEFIER = "liquefier_workshop";
const S = WS.liquefier;

/** cryo_process enum member for each method. */
const PROCESS: Record<LiquefierMethod, string> = { cascade: "cascade", throttle_regenerative: "linde", expansion_engine: "claude" };

interface Run {
  start: number;
  design: LiquefierDials;
  producing: boolean;
}

interface LiquefierData {
  dials: Record<string, JsonValue>;
  run: Run | null;
  history: HistoryEntry[];
}

const initial: LiquefierData = { dials: {}, run: null, history: [] };

export function liquefierDials(game: Game): DialView[] {
  return dialsWithLocks(game, LIQUEFIER, {
    method: lockUntil(game, { throttle_regenerative: "linde_liquefier", expansion_engine: "claude_expander" }),
  });
}

/** The plant the dials describe. */
export function liquefierDesign(game: Game, values: Record<string, JsonValue>): LiquefierDials {
  const d = (id: string) => liquefierDials(game).find((x) => x.id === id);
  return {
    method: dialOption<LiquefierMethod>(values, d("method"), "cascade"),
    ...(d("pressure") ? { pressure: dialNumber(values, d("pressure"), 100) } : {}),
    ...(d("exchanger_length") ? { exchanger_length: dialNumber(values, d("exchanger_length"), 5) } : {}),
    ...(d("column") ? { column: dialNumber(values, d("column"), 0) } : {}),
  };
}

export function liquefierResult(game: Game, design: LiquefierDials): LiquefierResult {
  return liquefier(design, { compressor_kw: playNum(game, LIQUEFIER, "compressor_kw") });
}

/** Oxygen the plant puts in the stores a day: only with a column and air separation built. */
export function loxPerDay(game: Game, design: LiquefierDials, r: LiquefierResult): number {
  return isDone(game, "air_separation") && (design.column ?? 0) > 0 ? r.oxygen_kg_per_day : 0;
}

export function liquefierRows(game: Game, r: LiquefierResult): OutputRow[] {
  return [
    { label: S.compressor, value: n(playNum(game, LIQUEFIER, "compressor_kw"), "kW") },
    { label: S.liters, value: n(r.liters_per_day, "L") },
    { label: S.oxygen, value: n(r.oxygen_kg_per_day, "kg") },
    { label: S.kwh, value: r.kwh_per_kg === null ? "—" : n(r.kwh_per_kg, "kWh"), tone: r.kwh_per_kg === null ? "bad" : "normal" },
    { label: S.purity, value: n(r.purity_pct, "%") },
    { label: S.firstDrop, value: r.days_to_first_drop === null ? S.never : fill(S.days, { n: n(r.days_to_first_drop) }), tone: r.days_to_first_drop === null ? "bad" : "good" },
    { label: S.asymptote, value: n(r.asymptote_c, "°C"), tone: r.asymptote_c > LIQUID_AIR_C ? "bad" : "good" },
  ];
}

function chart(game: Game, r: LiquefierResult, now?: number): string {
  const trial = playNum(game, LIQUEFIER, "trial_days");
  const xMax = r.days_to_first_drop === null ? trial : Math.max(1, r.days_to_first_drop * 1.5, now ?? 0);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const t = (xMax * i) / 60;
    pts.push([t, temperatureAtDay(r, t)]);
  }
  return lineChartSVG(pts, {
    title: S.chart,
    xMax,
    yMin: LIQUID_AIR_C - 10,
    yMax: AMBIENT_C,
    hline: { y: LIQUID_AIR_C, label: `${LIQUID_AIR_C} °C` },
    ...(now !== undefined ? { now } : {}),
    bad: r.days_to_first_drop === null,
  });
}

export function startLiquefier(game: Game): boolean {
  const sys = workshopSystem<LiquefierData & JsonValue>(game, LIQUEFIER);
  if (!sys) return false;
  if (sys.data.run?.producing) setState(game, "lox_kg_per_day", 0);
  sys.data.run = { start: game.engine.day, design: liquefierDesign(game, sys.data.dials), producing: false };
  return true;
}

export function stopLiquefier(game: Game): void {
  const sys = workshopSystem<LiquefierData & JsonValue>(game, LIQUEFIER);
  if (!sys?.data.run) return;
  sys.data.run = null;
  setState(game, "lox_kg_per_day", 0);
  pushHistory(sys.data.history, { day: game.engine.day, title: S.stop, detail: S.stopped });
}

function title(d: LiquefierDials): string {
  const bits = [S.method[d.method] ?? d.method];
  if (d.pressure !== undefined) bits.push(`${n(d.pressure)} atm`);
  if (d.exchanger_length !== undefined) bits.push(`exchanger ${n(d.exchanger_length)}`);
  if (d.column !== undefined) bits.push(`${n(d.column)} trays`);
  return bits.join(", ");
}

function tickLiquefier(game: Game, ctx: TickContext, sys: WorkshopSystem<LiquefierData & JsonValue>): void {
  const run = sys.data.run;
  if (!run) return;
  const today = ctx.day + 1;
  const t = today - run.start;
  const r = liquefierResult(game, run.design);
  if (r.days_to_first_drop === null) {
    if (t >= playNum(game, LIQUEFIER, "trial_days")) {
      pushHistory(sys.data.history, { day: today, title: title(run.design), detail: fill(S.stalled, { t: n(r.asymptote_c) }), tone: "bad" });
      sys.data.run = null;
      ctx.pause(doneReason(LIQUEFIER));
    }
    return;
  }
  if (!run.producing && t >= r.days_to_first_drop) {
    run.producing = true;
    setState(game, "has_liquid_air", true);
    setState(game, "cryo_process", PROCESS[run.design.method]);
    pushHistory(sys.data.history, { day: today, title: title(run.design), detail: fill(S.firstDropAt, { kg: n(r.kg_per_day), pur: n(r.purity_pct) }), tone: "good" });
    ctx.pause(doneReason(LIQUEFIER));
  }
  if (run.producing) {
    const lox = loxPerDay(game, run.design, r);
    if (lox > 0) ctx.engine.addStock("lox_kg", lox);
    setState(game, "lox_kg_per_day", lox);
  }
}

registerGameSystem((game) => new WorkshopSystem<LiquefierData & JsonValue>(LIQUEFIER, initial as LiquefierData & JsonValue, (ctx, sys) => tickLiquefier(game, ctx, sys)));

registerWorkshop(LIQUEFIER, (el, game) => {
  const sys = workshopSystem<LiquefierData & JsonValue>(game, LIQUEFIER);
  if (!sys) return;
  return mountScreen(el, game, {
    dials: () => liquefierDials(game),
    values: () => sys.data.dials as Record<string, DialValue>,
    setValue: (id, v) => void (sys.data.dials = { ...sys.data.dials, [id]: v as JsonValue }),
    body: () => {
      const d = sys.data;
      const design = liquefierDesign(game, d.dials);
      const r = liquefierResult(game, design);
      let h = outputsBlock(liquefierRows(game, r), S.design);
      h += chart(game, r);
      h += actionHTML("start", d.run ? S.restart : S.start, null);
      if (d.run) {
        const rr = liquefierResult(game, d.run.design);
        const t = game.engine.day - d.run.start;
        h += `<h3>${esc(title(d.run.design))}</h3>`;
        if (!d.run.producing) {
          const total = rr.days_to_first_drop ?? playNum(game, LIQUEFIER, "trial_days");
          h += progressHTML(S.cooling, t, Math.max(1, Math.ceil(total)));
        } else h += noteHTML(fill(S.running, { kg: n(rr.kg_per_day), o2: n(loxPerDay(game, d.run.design, rr)) }));
        h += outputsBlock([{ label: S.temp, value: n(temperatureAtDay(rr, t), "°C") }], "");
        h += chart(game, rr, t);
        h += actionHTML("stop", S.stop, null);
      }
      return h;
    },
    act: (a) => (a === "stop" ? stopLiquefier(game) : void startLiquefier(game)),
    history: () => sys.data.history,
  });
});
