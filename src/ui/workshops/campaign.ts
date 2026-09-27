// Package H: the test campaign (Stage 6), screen and system. The flaws the adopted vehicle carries come
// from the stage file's flaw table (`test_campaign.play.flaws`, each with a `when` condition over state
// and the vehicle); tests take months and liquid oxygen and reveal the flaws of their kind once enough
// have been run (instrumentation and trained engineers need fewer); fixes take months; the launch lists
// the known unfixed flaws with their severity and the areas no test has touched, then flies, resolved
// from the run's seed (src/models/flaws.ts). A lost pilot costs two years; a landing is the score.
import { evaluate, parseExpr, type StateValue } from "../../content";
import { designRocket, effectiveSeverity, isRevealed, PROPELLANTS, resolveLaunch, seedFrom } from "../../models";
import type { FlawSpec, LaunchResult, MissionSafety, Phase, RocketStageDials, Severity, TestType } from "../../models";
import type { JsonValue, TickContext } from "../../engine";
import { registerWorkshop } from "../shell";
import { yearDay } from "../shellFormat";
import { registerGameSystem, type Game } from "../shellGame";
import { fill } from "../strings";
import { actionHTML, dialOption, dialsWithLocks, doneReason, esc, flag, mountScreen, n, noteHTML, num, outputsBlock, playNum, playOf, progressHTML, pushHistory, setState } from "./common";
import { type DialValue, type DialView, type HistoryEntry, optionWords, workshopSystem, WorkshopSystem } from "./kit";
import { ROCKET, rocketInputs } from "./rocket";
import { WS } from "./strings";

export const CAMPAIGN = "test_campaign";
const S = WS.campaign;

interface Activity {
  kind: string;
  start: number;
  end: number;
}

interface LaunchRecord {
  day: number;
  outcome: LaunchResult["outcome"];
  cause: string | null;
  struck: { id: string; severity: Severity }[];
}

interface CampaignData {
  dials: Record<string, JsonValue>;
  testsDone: Record<string, number>;
  test: Activity | null;
  fix: Activity | null;
  known: string[];
  fixed: string[];
  launches: LaunchRecord[];
  /** Day a new vehicle (and pilot) is ready after a failed launch, and when that began. */
  rebuildUntil: number | null;
  rebuildFrom?: number;
  newPilot?: boolean;
  landedDay: number | null;
  history: HistoryEntry[];
}

const initial: CampaignData = { dials: {}, testsDone: {}, test: null, fix: null, known: [], fixed: [], launches: [], rebuildUntil: null, landedDay: null, history: [] };

interface TestSpec {
  months: number;
  lox_kg: number;
  flight?: boolean;
}

/** A flaw row from the stage file. */
export interface FlawRow extends FlawSpec {
  when: string;
}

export function flawTable(game: Game): FlawRow[] {
  const rows = (playOf(game, CAMPAIGN).flaws ?? []) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    category: String(r.category),
    when: String(r.when),
    revealedBy: (r.revealed_by as TestType[]) ?? [],
    exposure: Number(r.exposure),
    fixMonths: Number(r.fix_months),
    severity: r.severity as Severity,
    phase: r.phase as Phase,
  }));
}

export function testSpecs(game: Game): Record<string, TestSpec> {
  return (playOf(game, CAMPAIGN).tests ?? {}) as unknown as Record<string, TestSpec>;
}

const sysOf = (game: Game) => workshopSystem<CampaignData & JsonValue>(game, CAMPAIGN);

/** The vehicle adopted in the rocket workshop (E6), or null. */
export function adoptedVehicle(game: Game): { stages: RocketStageDials[]; route: string | null } | null {
  const d = workshopSystem<JsonValue>(game, ROCKET)?.data as { adopted?: { stages: RocketStageDials[]; route: string | null } | null } | undefined;
  return d?.adopted ?? null;
}

/** Facts about the vehicle the flaw table's `when` conditions read. */
export function vehicleFacts(stages: readonly RocketStageDials[]): Record<string, StateValue> {
  const last = stages[stages.length - 1];
  return {
    vehicle_stages: stages.length,
    turbopump_stages: stages.filter((s) => s.feed === "turbopump").length,
    lox_stages: stages.filter((s) => s.propellants !== "hypergolic").length,
    largest_stage_t: Math.max(0, ...stages.map((s) => s.propellant_mass)),
    lox_lander: !!last && last.propellants !== "hypergolic",
  };
}

/** The flaws the adopted vehicle carries, given the colony's state (deterministic). */
export function vehicleFlaws(game: Game): FlawRow[] {
  const v = adoptedVehicle(game);
  if (!v) return [];
  const facts = vehicleFacts(v.stages);
  const lookup = (name: string): StateValue | undefined => (name in facts ? facts[name] : game.engine.get(name));
  return flawTable(game).filter((f) => evaluate(parseExpr(f.when), lookup));
}

export function exposureCtx(game: Game) {
  return {
    instrumentationLevel: num(game, "instrumentation_level"),
    instrumentationCut: playNum(game, CAMPAIGN, "instrumentation_cut"),
    skilled: num(game, "rocket_engineers_trained") >= playNum(game, CAMPAIGN, "skilled_engineers"),
    skilledCut: playNum(game, CAMPAIGN, "skilled_cut"),
  };
}

export function safetyOf(game: Game): MissionSafety {
  return {
    // The tower is solid motors: without them there's no escape system to fire.
    hasEscapeSystem: flag(game, "has_escape_system") && flag(game, "has_solids"),
    hasPressureSuit: flag(game, "has_pressure_suit"),
    hasMidcourse: flag(game, "has_midcourse"),
    dvMarginKmS: num(game, "dv_margin_km_s"),
    survivableMarginKmS: playNum(game, CAMPAIGN, "survivable_margin_km_s"),
  };
}

/** Liquid oxygen the launch loads: each stage's propellant at its oxidizer share (hypergolics carry none). */
export function launchLox(stages: readonly RocketStageDials[]): number {
  return stages.reduce((sum, s) => {
    if (s.propellants === "hypergolic") return sum;
    const mr = PROPELLANTS[s.propellants].best_mixture_ratio;
    return sum + s.propellant_mass * 1000 * (mr / (1 + mr));
  }, 0);
}

/** Categories each test type exercises (from the flaw table: public knowledge, the notebook says so). */
export function categoriesFor(game: Game, test: string): string[] {
  const out = new Set<string>();
  for (const f of flawTable(game)) if ((f.revealedBy as string[]).includes(test)) out.add(f.category);
  return [...out];
}

function coveredCategories(game: Game, d: CampaignData): Set<string> {
  const out = new Set<string>();
  for (const [t, k] of Object.entries(d.testsDone)) if (k > 0) for (const c of categoriesFor(game, t)) out.add(c);
  return out;
}

const words = (id: string): string => optionWords(id);

function writeState(game: Game, d: CampaignData): void {
  game.engine.state.setIfDeclared("known_flaws", [...d.known]);
  game.engine.state.setIfDeclared("fixed_flaws", [...d.fixed]);
}

/** Why a test can't start now, or null. */
export function testBlocked(game: Game, type: string): string | null {
  const d = sysOf(game)?.data;
  if (!d) return "";
  if (!adoptedVehicle(game)) return S.noVehicle;
  if (d.test) return S.busy;
  const spec = testSpecs(game)[type];
  if (!spec) return "";
  if (game.engine.stock("lox_kg") < spec.lox_kg)
    return fill(WS.frame.notEnough, { name: game.resourceName("lox_kg").toLowerCase(), have: n(game.engine.stock("lox_kg")), need: n(spec.lox_kg) });
  return null;
}

export function startTest(game: Game, type: string): boolean {
  const sys = sysOf(game);
  if (!sys || testBlocked(game, type) !== null) return false;
  const spec = testSpecs(game)[type]!;
  if (!game.engine.spend({ lox_kg: spec.lox_kg })) return false;
  const start = game.engine.day;
  sys.data.test = { kind: type, start, end: start + spec.months * playNum(game, CAMPAIGN, "days_per_month") };
  return true;
}

export function startFix(game: Game, flaw: string): boolean {
  const sys = sysOf(game);
  if (!sys) return false;
  const d = sys.data;
  const f = flawTable(game).find((x) => x.id === flaw);
  if (!f || d.fix || !d.known.includes(flaw) || d.fixed.includes(flaw)) return false;
  const start = game.engine.day;
  d.fix = { kind: flaw, start, end: start + f.fixMonths * playNum(game, CAMPAIGN, "days_per_month") };
  return true;
}

/** Why the crewed launch can't go now, or null. */
export function launchBlocked(game: Game): string | null {
  const d = sysOf(game)?.data;
  if (!d) return "";
  const v = adoptedVehicle(game);
  if (!v) return S.noVehicle;
  if (d.landedDay !== null) return fill(S.scoreLine, { year: yearDay(d.landedDay).year });
  if (d.rebuildUntil !== null && game.engine.day < d.rebuildUntil) {
    const from = d.rebuildFrom ?? game.engine.day;
    return fill(S.rebuilding, { pilot: d.newPilot ? S.newPilot : "", day: game.engine.day - from, days: d.rebuildUntil - from });
  }
  if (num(game, "dv_margin_km_s") < 0) return S.noMargin;
  const lox = launchLox(v.stages);
  if (game.engine.stock("lox_kg") < lox) return fill(WS.frame.notEnough, { name: game.resourceName("lox_kg").toLowerCase(), have: n(game.engine.stock("lox_kg")), need: n(lox) });
  return null;
}

/** The run's seed: fixed at the start of the run from what the draft carried, so replays agree. */
export function runSeed(game: Game): number {
  return seedFrom(JSON.stringify([game.engine.get("draft_roster") ?? null, game.engine.get("bundles_taken") ?? null]));
}

/** Fly the crewed mission. */
export function launch(game: Game): LaunchResult | null {
  const sys = sysOf(game);
  if (!sys || launchBlocked(game) !== null) return null;
  const d = sys.data;
  const v = adoptedVehicle(game)!;
  game.engine.spend({ lox_kg: launchLox(v.stages) });
  const flaws = vehicleFlaws(game).map((spec) => ({ spec, known: d.known.includes(spec.id), fixed: d.fixed.includes(spec.id) }));
  const seed = seedFrom(`${runSeed(game)}:${d.launches.length}`);
  const r = resolveLaunch(flaws, safetyOf(game), playNum(game, CAMPAIGN, "strike_chance"), seed);
  const today = game.engine.day;
  d.launches.push({ day: today, outcome: r.outcome, cause: r.cause, struck: r.struck });
  for (const s of r.struck) if (!d.known.includes(s.id)) d.known.push(s.id);
  const title = fill(S.launchTitle, { n: d.launches.length });
  if (r.outcome === "landed") {
    d.landedDay = today;
    setState(game, "crewed_landing_survived", true);
    setState(game, "landing_year", yearDay(today).year);
    pushHistory(d.history, { day: today, title, detail: fill(S.landed, { year: yearDay(today).year }), tone: "good" });
  } else {
    const dead = r.outcome === "pilot_lost";
    if (dead) setState(game, "pilots_lost", num(game, "pilots_lost") + 1);
    d.rebuildUntil = today + playNum(game, CAMPAIGN, dead ? "death_penalty_days" : "loss_penalty_days");
    d.rebuildFrom = today;
    d.newPilot = dead;
    const cause = words(r.cause ?? "");
    pushHistory(d.history, { day: today, title, detail: `${fill(dead ? S.pilotLost : S.missionLost, { cause })} ${fill(S.struck, { list: r.struck.map((x) => words(x.id)).join(", ") })}`, tone: "bad" });
  }
  writeState(game, d);
  return r;
}

function tickCampaign(game: Game, ctx: TickContext, sys: WorkshopSystem<CampaignData & JsonValue>): void {
  const d = sys.data;
  const today = ctx.day + 1;
  const t = d.test;
  if (t && today >= t.end) {
    d.test = null;
    d.testsDone[t.kind] = (d.testsDone[t.kind] ?? 0) + 1;
    if (testSpecs(game)[t.kind]?.flight) setState(game, "flight_tests", num(game, "flight_tests") + 1);
    const ctxE = exposureCtx(game);
    const found = vehicleFlaws(game).filter((f) => !d.known.includes(f.id) && isRevealed(f, ctxE, d.testsDone));
    for (const f of found) d.known.push(f.id);
    const areas = categoriesFor(game, t.kind).join(", ");
    pushHistory(d.history, {
      day: today,
      title: words(t.kind),
      detail: found.length ? fill(S.found, { list: found.map((f) => words(f.id)).join(", ") }) : fill(S.clean, { areas }),
      tone: found.length ? "bad" : "good",
    });
    writeState(game, d);
    ctx.pause(doneReason(CAMPAIGN));
  }
  const f = d.fix;
  if (f && today >= f.end) {
    d.fix = null;
    if (!d.fixed.includes(f.kind)) d.fixed.push(f.kind);
    pushHistory(d.history, { day: today, title: words(f.kind), detail: fill(S.flawDone, { name: words(f.kind) }), tone: "good" });
    writeState(game, d);
    ctx.pause(doneReason(CAMPAIGN));
  }
  if (d.rebuildUntil !== null && today >= d.rebuildUntil) d.rebuildUntil = null;
}

registerGameSystem((game) => new WorkshopSystem<CampaignData & JsonValue>(CAMPAIGN, initial as CampaignData & JsonValue, (ctx, sys) => tickCampaign(game, ctx, sys)));

/** The test-type dial only (the launch is its own section). */
export function campaignDials(game: Game): DialView[] {
  return dialsWithLocks(game, CAMPAIGN, {}).filter((d) => d.id === "test_type");
}

function knownHTML(game: Game, d: CampaignData): string {
  const table = new Map(vehicleFlaws(game).map((f) => [f.id, f]));
  const safety = safetyOf(game);
  let h = `<h3>${esc(S.known)}</h3>`;
  const known = d.known.filter((id) => table.has(id));
  if (!known.length) h += noteHTML(S.none);
  else {
    h += `<ol class="wk-queue">`;
    for (const id of known) {
      const f = table.get(id)!;
      const sev = S.severity[effectiveSeverity(f, safety)] ?? "";
      const done = d.fixed.includes(id);
      h += `<li class="${!done && effectiveSeverity(f, safety) === "fatal" ? "bad" : ""}"><span class="grow"><b>${esc(words(id))}</b> <span class="small muted">${esc(`${f.category} · ${sev}`)}</span></span>`;
      h += done ? `<span class="small blue">${esc(S.fixed)}</span>` : `<button type="button" data-act="fix:${esc(id)}"${d.fix ? " disabled" : ""}>${esc(fill(S.fix, { months: f.fixMonths }))}</button>`;
      h += `</li>`;
    }
    h += `</ol>`;
  }
  h += noteHTML(S.undiscovered);
  return h;
}

function launchHTML(game: Game, d: CampaignData): string {
  const v = adoptedVehicle(game);
  let h = `<h3>${esc(S.launch)}</h3>`;
  if (d.landedDay !== null) return h + outputsBlock([{ label: S.score, value: fill(S.scoreLine, { year: yearDay(d.landedDay).year }), tone: "good" }], "");
  const safety = safetyOf(game);
  const table = vehicleFlaws(game);
  const knownFatal = table.filter((f) => d.known.includes(f.id) && !d.fixed.includes(f.id) && effectiveSeverity(f, safety) === "fatal");
  const covered = coveredCategories(game, d);
  const all = [...new Set(flawTable(game).map((f) => f.category))];
  h += outputsBlock(
    [
      { label: S.covered, value: [...covered].join(", ") || WS.frame.none },
      { label: S.uncovered, value: all.filter((c) => !covered.has(c)).join(", ") || WS.frame.none, tone: all.some((c) => !covered.has(c)) ? "bad" : "good" },
      ...(v ? [{ label: S.launchLox, value: n(launchLox(v.stages), "kg") }] : []),
    ],
    "",
  );
  if (knownFatal.length) h += noteHTML(S.willFail, true);
  h += actionHTML("launch", S.go, launchBlocked(game));
  const last = d.launches[d.launches.length - 1];
  if (last && last.outcome !== "landed") h += noteHTML(d.history[d.history.length - 1]?.detail ?? "", true);
  return h;
}

registerWorkshop(CAMPAIGN, (el, game) => {
  const sys = sysOf(game);
  if (!sys) return;
  return mountScreen(el, game, {
    dials: () => campaignDials(game),
    values: () => sys.data.dials as Record<string, DialValue>,
    setValue: (id, v) => void (sys.data.dials = { ...sys.data.dials, [id]: v as JsonValue }),
    top: () => {
      const v = adoptedVehicle(game);
      if (!v) return noteHTML(S.noVehicle, true);
      const dsg = designRocket(rocketInputs(game, v.stages, (v.route as never) ?? null));
      return `<h3>${esc(S.vehicle)}</h3>` + noteHTML(fill(S.stages, { n: v.stages.length, dv: dsg.dv_total_km_s.toFixed(2), m: num(game, "dv_margin_km_s").toFixed(2) }));
    },
    body: () => {
      const d = sys.data;
      const type = dialOption<string>(d.dials, campaignDials(game)[0], "static_fire");
      const spec = testSpecs(game)[type];
      let h = "";
      if (d.test) h += progressHTML(`${S.testing}: ${words(d.test.kind)}`, game.engine.day - d.test.start, d.test.end - d.test.start);
      if (d.fix) h += progressHTML(`${S.fixing}: ${words(d.fix.kind)}`, game.engine.day - d.fix.start, d.fix.end - d.fix.start);
      if (spec)
        h += outputsBlock(
          [
            { label: S.months, value: n(spec.months) },
            { label: S.lox, value: n(spec.lox_kg, "kg") },
            { label: S.covers, value: categoriesFor(game, type).join(", ") },
          ],
          `${S.test}: ${words(type)}`,
        );
      h += actionHTML(`test:${type}`, S.run, testBlocked(game, type));
      h += knownHTML(game, d);
      h += launchHTML(game, d);
      return h;
    },
    act: (a) => {
      if (a.startsWith("test:")) startTest(game, a.slice(5));
      else if (a.startsWith("fix:")) startFix(game, a.slice(4));
      else if (a === "launch") launch(game);
    },
    history: () => sys.data.history,
  });
});
