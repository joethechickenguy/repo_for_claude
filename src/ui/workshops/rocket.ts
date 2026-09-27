// E6: the rocket workshop (Stage 6), the interface mockup's screen 5 driven by C's rocket model. The
// global dials (stages, route) sit above a per-stage table whose columns are the stage file's per-stage
// dials (propellant mass, propellants, tanks, feed) plus each stage's dry mass and Δv; below it, the
// liftoff mass and the Δv bar against the mission budget with its Orbit / Toward the Moon / Landed
// marks. "Almost no construction": adopting a design is a paper decision. The adopted vehicle is
// `vehicle_design`, and its margin (less what midcourse correction and crew safety spend) is
// `dv_margin_km_s`, kept current each day. Flaws expected are the test campaign's (package H).
import { designRocket, MISSION_BUDGET_KM_S, ROUTE_DV_ADJUST_KM_S, singleStageMaxDvKmS } from "../../models";
import type { Propellants, RocketDesign, RocketDesignInputs, RocketStageDials, Route, StageFeed, TankMaterial } from "../../models";
import type { JsonValue, TickContext } from "../../engine";
import { registerWorkshop } from "../shell";
import { registerGameSystem, type Game } from "../shellGame";
import { fill } from "../strings";
import {
  actionHTML,
  dialNumber,
  dialOption,
  dialsWithLocks,
  esc,
  flag,
  isDone,
  mountScreen,
  n,
  nodeName,
  noteHTML,
  num,
  outputsBlock,
  playList,
  playNum,
  playOf,
  pushHistory,
  setState,
} from "./common";
import { type DialValue, type DialView, type HistoryEntry, optionWords, workshopSystem, WorkshopSystem } from "./kit";
import { WS } from "./strings";

export const ROCKET = "rocket_workshop";
const S = WS.rocket;

/** Dials that apply to each stage (the table's columns); the rest are the vehicle's. */
export const PER_STAGE = ["propellant_mass", "propellants", "tank_material", "feed"] as const;

interface RocketData {
  dials: Record<string, JsonValue>;
  /** Per-stage dial values, bottom stage first; always as many rows as the stage dial's maximum. */
  stages: Record<string, JsonValue>[];
  adopted: { stages: RocketStageDials[]; route: Route | null } | null;
  history: HistoryEntry[];
}

const initial: RocketData = { dials: {}, stages: [], adopted: null, history: [] };

/** Every rocket dial with its locks: propellants only what the chemistry makes, aluminum with duralumin. */
export function rocketAllDials(game: Game): DialView[] {
  const needs = (f: string, node: string): string | undefined => (flag(game, f) ? undefined : fill(WS.frame.needs, { name: nodeName(game, node) }));
  const drop = (r: Record<string, string | undefined>): Record<string, string> =>
    Object.fromEntries(Object.entries(r).filter((e): e is [string, string] => e[1] !== undefined));
  return dialsWithLocks(game, ROCKET, {
    propellants: drop({
      ethanol_lox: needs("has_ethanol", "fuel_alcohol"),
      kerosene_lox: needs("has_kerosene", "oil"),
      hypergolic: needs("has_hypergolics", "hypergolic_propellants"),
    }),
    tank_material: drop({ aluminum: needs("has_duralumin", "aluminum") }),
  });
}

/** The vehicle-wide dials the kit draws (stages, route). */
export function rocketDials(game: Game): DialView[] {
  return rocketAllDials(game)
    .filter((d) => !(PER_STAGE as readonly string[]).includes(d.id))
    .map((d) => (d.id === "stage_count" ? { ...d, step: 1 } : d));
}

function stageCountDial(game: Game): DialView | undefined {
  return rocketAllDials(game).find((d) => d.id === "stage_count");
}

/** Stages on the screen: the dial's value, or as many as the first design has. */
export function stageCount(game: Game, values: Record<string, JsonValue>): number {
  const d = stageCountDial(game);
  const [lo, hi] = d?.range ?? [1, 4];
  const v = typeof values.stage_count === "number" ? values.stage_count : defaultStageCount(game);
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function defaultStageCount(game: Game): number {
  return playList(game, ROCKET, "default_propellant_t").length || 1;
}

/** One stage's dials from its saved values (defaults: the mockup's propellant masses). */
export function stageDials(game: Game, values: Record<string, JsonValue>, index: number): RocketStageDials {
  const all = rocketAllDials(game);
  const d = (id: string) => all.find((x) => x.id === id);
  const defaults = playList(game, ROCKET, "default_propellant_t") as number[];
  const mass = typeof values.propellant_mass === "number" ? values.propellant_mass : (defaults[index] ?? dialNumber({}, d("propellant_mass"), 100));
  const [lo, hi] = d("propellant_mass")?.range ?? [0, Infinity];
  return {
    propellant_mass: Math.max(lo, Math.min(hi, mass)),
    propellants: dialOption<Propellants>(values, d("propellants"), "ethanol_lox"),
    tank_material: dialOption<TankMaterial>(values, d("tank_material"), "steel"),
    feed: dialOption<StageFeed>(values, d("feed"), "turbopump"),
  };
}

export function payloadT(game: Game): number {
  const c = num(game, "capsule_mass_t");
  return c > 0 ? c : playNum(game, ROCKET, "payload_t");
}

/** Margin the built nodes spend (midcourse correction, crew safety), km/s. */
export function marginDeductions(game: Game): number {
  const m = playOf(game, ROCKET).margin_deductions_km_s;
  if (!m || typeof m !== "object" || Array.isArray(m)) return 0;
  return Object.entries(m).reduce((sum, [node, v]) => sum + (isDone(game, node) && typeof v === "number" ? v : 0), 0);
}

export function routeOf(game: Game, values: Record<string, JsonValue>): Route | null {
  const d = rocketAllDials(game).find((x) => x.id === "route");
  return d ? dialOption<Route>(values, d, "direct_ascent") : null;
}

export function rocketInputs(game: Game, stages: readonly RocketStageDials[], route: Route | null): RocketDesignInputs {
  return { stages, payload_t: payloadT(game), ...(route ? { route } : {}), margin_deductions_km_s: marginDeductions(game) };
}

/** The design on the screen. */
export function currentRocket(game: Game, d: RocketData): { stages: RocketStageDials[]; route: Route | null; design: RocketDesign } {
  const k = stageCount(game, d.dials);
  const stages = Array.from({ length: k }, (_, i) => stageDials(game, d.stages[i] ?? {}, i));
  const route = routeOf(game, d.dials);
  return { stages, route, design: designRocket(rocketInputs(game, stages, route)) };
}

export function adoptRocket(game: Game): boolean {
  const sys = workshopSystem<RocketData & JsonValue>(game, ROCKET);
  if (!sys) return false;
  const { stages, route, design } = currentRocket(game, sys.data);
  sys.data.adopted = { stages, route };
  applyAdopted(game, sys.data);
  pushHistory(sys.data.history, {
    day: game.engine.day,
    title: stages.map((s) => `${n(s.propellant_mass)} t`).join(" / "),
    detail: fill(S.adoptedLine, { dv: n(design.dv_total_km_s), m: n(design.dv_margin_km_s), t: n(design.liftoff_mass_t) }),
    tone: design.dv_margin_km_s >= 0 ? "good" : "bad",
  });
  return true;
}

function applyAdopted(game: Game, d: RocketData): void {
  const a = d.adopted;
  if (!a) return;
  const design = designRocket(rocketInputs(game, a.stages, a.route));
  setState(game, "dv_margin_km_s", design.dv_margin_km_s);
  game.engine.state.setIfDeclared(
    "vehicle_design",
    a.stages.map((s, i) => `stage${i + 1}:${s.propellant_mass}t:${s.propellants}:${s.tank_material}:${s.feed}`),
  );
}

function tickRocket(game: Game, _ctx: TickContext, sys: WorkshopSystem<RocketData & JsonValue>): void {
  // Margin moves as nodes spend it (midcourse, crew safety) and the capsule's mass is set.
  applyAdopted(game, sys.data);
}

registerGameSystem((game) => new WorkshopSystem<RocketData & JsonValue>(ROCKET, initial as RocketData & JsonValue, (ctx, sys) => tickRocket(game, ctx, sys)));

function optionsHTML(d: DialView, value: string, field: string, label: string): string {
  let h = `<select data-field="${esc(field)}" aria-label="${esc(label)}">`;
  for (const o of d.options ?? []) {
    const why = d.locked?.[o];
    h += `<option value="${esc(o)}"${o === value ? " selected" : ""}${why ? " disabled" : ""}>${esc(optionWords(o))}${why ? ` (${esc(why)})` : ""}</option>`;
  }
  return h + `</select>`;
}

/** The mockup's per-stage table. */
export function stageTableHTML(game: Game, stages: readonly RocketStageDials[], design: RocketDesign): string {
  const all = rocketAllDials(game);
  const col = (id: string) => all.find((x) => x.id === id)!;
  let h = `<div class="tablewrap"><table class="wk-table"><thead><tr><th></th>`;
  h += `<th class="r">${esc(col("propellant_mass").name)}</th><th>${esc(col("propellants").name)}</th><th>${esc(col("tank_material").name)}</th><th>${esc(col("feed").name)}</th>`;
  h += `<th class="r">${esc(S.dry)}</th><th class="r">${esc(S.dv)}</th></tr></thead><tbody>`;
  stages.forEach((s, i) => {
    const name = fill(S.stage, { n: i + 1 });
    const r = design.stages[i]!;
    h += `<tr><td>${esc(name)}</td>`;
    h += `<td class="r"><input class="wk-num num" type="text" inputmode="decimal" data-field="${i}:propellant_mass" value="${s.propellant_mass}" aria-label="${esc(`${name}: ${col("propellant_mass").name}`)}"></td>`;
    h += `<td>${optionsHTML(col("propellants"), s.propellants, `${i}:propellants`, `${name}: ${col("propellants").name}`)}</td>`;
    h += `<td>${optionsHTML(col("tank_material"), s.tank_material, `${i}:tank_material`, `${name}: ${col("tank_material").name}`)}</td>`;
    h += `<td>${optionsHTML(col("feed"), s.feed, `${i}:feed`, `${name}: ${col("feed").name}`)}</td>`;
    h += `<td class="r num">${n(r.dry_mass_t)}</td><td class="r num">${r.dv_km_s.toFixed(2)}</td></tr>`;
  });
  return h + `</tbody></table></div>`;
}

/** The Δv bar: each stage's share, and the budget's marks. */
export function dvBarHTML(game: Game, design: RocketDesign, route: Route | null): string {
  const b = MISSION_BUDGET_KM_S;
  const orbit = b.to_orbit_km_s + (route ? ROUTE_DV_ADJUST_KM_S[route] : 0);
  const moon = orbit + b.toward_moon_km_s;
  const max = Math.max(playNum(game, ROCKET, "dv_bar_km_s"), design.budget_km_s * 1.05, design.dv_total_km_s);
  const pct = (v: number) => ((100 * v) / max).toFixed(2);
  let h = `<div class="wk-dv" role="img" aria-label="${esc(`${S.total} ${design.dv_total_km_s.toFixed(2)} km/s`)}">`;
  let x = 0;
  design.stages.forEach((s, i) => {
    h += `<i class="s${i % 4}" style="left:${pct(x)}%; width:${pct(s.dv_km_s)}%"></i>`;
    x += s.dv_km_s;
  });
  const marks: [number, string][] = [
    [orbit, S.marks.orbit],
    [moon, S.marks.moon],
    [design.budget_km_s, S.marks.landed],
  ];
  for (const [v, l] of marks) h += `<b style="left:${pct(v)}%"><span>${esc(l)}</span></b>`;
  return h + `</div>`;
}

export function dvTextHTML(design: RocketDesign): string {
  const ok = design.dv_margin_km_s >= 0;
  let h = `<p>${esc(S.total)} <b class="num">${design.dv_total_km_s.toFixed(2)} km/s</b> / ${esc(S.budget)} <span class="num">${design.budget_km_s.toFixed(2)} km/s</span>. `;
  h += ok
    ? `<span class="blue">${esc(fill(S.enough, { spare: design.dv_margin_km_s.toFixed(2) }))}</span>`
    : `<span class="red">${esc(fill(S.short, { short: (-design.dv_margin_km_s).toFixed(2) }))} ${esc(S.reach[design.reach] ?? "")}</span>`;
  return h + `</p>`;
}

registerWorkshop(ROCKET, (el, game) => {
  const sys = workshopSystem<RocketData & JsonValue>(game, ROCKET);
  if (!sys) return;
  return mountScreen(el, game, {
    dials: () => rocketDials(game),
    values: () => ({ stage_count: defaultStageCount(game), ...sys.data.dials }) as Record<string, DialValue>,
    setValue: (id, v) => void (sys.data.dials = { ...sys.data.dials, [id]: v as JsonValue }),
    body: () => {
      const d = sys.data;
      const { stages, route, design } = currentRocket(game, d);
      let h = `<h3>${esc(S.vehicle)}</h3>` + noteHTML(fill(S.payload, { t: n(payloadT(game)) }));
      h += stageTableHTML(game, stages, design);
      h += outputsBlock(
        [
          { label: S.liftoff, value: n(design.liftoff_mass_t, "t") },
          { label: S.margin, value: `${design.dv_margin_km_s.toFixed(2)} km/s`, tone: design.dv_margin_km_s >= 0 ? "good" : "bad" },
          { label: S.flawsExpected, value: WS.frame.pendingH },
        ],
        "",
      );
      h += dvBarHTML(game, design, route);
      h += dvTextHTML(design);
      h += noteHTML(S.budgetNote);
      if (stages.length === 1)
        h += noteHTML(fill(S.single, { dv: singleStageMaxDvKmS(stages[0]!).toFixed(2), orbit: `${MISSION_BUDGET_KM_S.to_orbit_km_s} km/s` }), true);
      h += actionHTML("adopt", S.adopt, null);
      if (d.adopted) {
        const a = designRocket(rocketInputs(game, d.adopted.stages, d.adopted.route));
        h += outputsBlock(
          [
            { label: S.total, value: `${a.dv_total_km_s.toFixed(2)} km/s` },
            { label: S.margin, value: `${a.dv_margin_km_s.toFixed(2)} km/s`, tone: a.dv_margin_km_s >= 0 ? "good" : "bad" },
            { label: S.liftoff, value: n(a.liftoff_mass_t, "t") },
          ],
          S.adopted,
        );
      } else h += noteHTML(S.none);
      return h;
    },
    field: (field, value) => {
      const [i, key] = field.split(":");
      const idx = Number(i);
      if (!key || !Number.isInteger(idx)) return;
      const stages = sys.data.stages;
      while (stages.length <= idx) stages.push({});
      if (key === "propellant_mass") {
        const x = Number(value.replace(/[\s,]/g, ""));
        if (Number.isFinite(x)) stages[idx] = { ...stages[idx], propellant_mass: x };
      } else stages[idx] = { ...stages[idx], [key]: value };
    },
    act: (a) => void (a === "adopt" && adoptRocket(game)),
    history: () => sys.data.history,
  });
});
