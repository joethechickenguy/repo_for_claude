// E3: the machine shop (Stage 3 on). Dials set the fit the shop can hold (reference surface, lead
// screw, gauging) and its bearings and power; the parts queue is the heartbeat: a year's standing
// demand per kind of part (the stage file's `play.parts`, each joining when its node is built), in the
// player's order, against shop hours. C's machine-shop model shows each part's reject rate and when
// it's done. Retooling (play.retool_days) commits the dials: `tolerance_mm` and `bearing_quality`. Every
// day the shop writes `shop_hours_balance` (hours a day minus the queue's yearly demand per day), so
// the heartbeat bar goes negative when the queue is more than a year of shop time.
import { bearingQualityOf, shopHoursPerDay, simulateQueue, toleranceMm } from "../../models";
import type { Bearings, FlatReference, Gauging, LeadScrew, MachineShopDials, QueuedPart, QueueResult, ShopPower } from "../../models";
import type { JsonValue, TickContext } from "../../engine";
import { registerWorkshop } from "../shell";
import { registerGameSystem, type Game } from "../shellGame";
import { fill } from "../strings";
import {
  actionHTML,
  dialOption,
  dialsWithLocks,
  doneReason,
  esc,
  isDone,
  lockUntil,
  mountScreen,
  n,
  noteHTML,
  num,
  outputsBlock,
  playList,
  playNum,
  progressHTML,
  pushHistory,
  setState,
} from "./common";
import { type DialValue, type DialView, type HistoryEntry, type OutputRow, workshopSystem, WorkshopSystem } from "./kit";
import { WS } from "./strings";

export const SHOP = "machine_shop";
const S = WS.shop;

/** A kind of part in the queue (from `play.parts`). */
export interface PartKind {
  id: string;
  name: string;
  hours: number;
  tolerance_mm: number;
  after: string;
}

interface Setup {
  dials: MachineShopDials;
  tolerance_mm: number;
  bearing_quality: number;
}

interface ShopData {
  dials: Record<string, JsonValue>;
  /** Part ids in the player's order; parts not listed yet join at the end. */
  order: string[];
  retool: { start: number; done: number; setup: Setup } | null;
  /** The setup the shop works to (null: not set up yet; hand work). */
  current: Setup | null;
  history: HistoryEntry[];
}

const initial: ShopData = { dials: {}, order: [], retool: null, current: null, history: [] };

export function partKinds(game: Game): PartKind[] {
  return playList(game, SHOP, "parts").map((p) => p as unknown as PartKind);
}

export function shopDials(game: Game): DialView[] {
  return dialsWithLocks(game, SHOP, {
    bearings: lockUntil(game, { hardened_steel: "precision_grinding" }),
  });
}

const byId = (dials: readonly DialView[]) => (id: string) => dials.find((d) => d.id === id);

/** The shop the dials describe. */
export function shopSetup(game: Game, values: Record<string, JsonValue>): Setup {
  const d = byId(shopDials(game));
  const dials: MachineShopDials = {
    flat_reference: dialOption<FlatReference>(values, d("flat_reference"), "none"),
    ...(d("lead_screw") ? { lead_screw: dialOption<LeadScrew>(values, d("lead_screw"), "hand_chased") } : {}),
    ...(d("gauging") ? { gauging: dialOption<Gauging>(values, d("gauging"), "rule") } : {}),
    ...(d("bearings") ? { bearings: dialOption<Bearings>(values, d("bearings"), "wood_and_tallow") } : {}),
    ...(d("shop_power") ? { shop_power: dialOption<ShopPower>(values, d("shop_power"), "line_shaft") } : {}),
  };
  return {
    dials,
    tolerance_mm: toleranceMm(dials, isDone(game, "precision_grinding")),
    bearing_quality: bearingQualityOf(dials.bearings ?? "wood_and_tallow", isDone(game, "oil")),
  };
}

/** Shop hours a day for a setup, from the machinists the colony has trained. */
export function shopHours(game: Game, setup: Setup | null): number {
  return shopHoursPerDay(setup?.dials ?? { flat_reference: "none" }, {
    machinists: num(game, "machinists_trained"),
    has_planer: isDone(game, "planer_milling"),
    has_tool_steel: isDone(game, "alloy_steels"),
  });
}

/** The queued parts in the player's order: every part whose node is built. */
export function queuedParts(game: Game, order: readonly string[]): PartKind[] {
  const live = partKinds(game).filter((p) => isDone(game, p.after));
  const pos = (id: string) => {
    const i = order.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return live.map((p, i) => ({ p, i })).sort((a, b) => pos(a.p.id) - pos(b.p.id) || a.i - b.i).map((x) => x.p);
}

/** The queue against a setup's tolerance and hours (null with no hours: nobody to run it). */
export function runQueue(game: Game, parts: readonly PartKind[], tolerance_mm: number, hours: number): QueueResult | null {
  if (!(hours > 0) || !parts.length) return null;
  const q: QueuedPart[] = parts.map((p) => ({ id: p.id, hours: p.hours, tolerance_mm: p.tolerance_mm }));
  return simulateQueue(q, tolerance_mm, hours);
}

/** Shop hours a day minus the queue's demand a day (its hours, rejects included, over a year). */
export function shopBalance(game: Game, d: ShopData): number {
  const tol = d.current?.tolerance_mm ?? num(game, "tolerance_mm");
  const hours = shopHours(game, d.current);
  const parts = queuedParts(game, d.order);
  const year = playNum(game, SHOP, "queue_year_days");
  const q = runQueue(game, parts, tol, Math.max(hours, 1e-9));
  const demand = q ? q.total_hours / year : 0;
  return hours - demand;
}

export function startRetool(game: Game): boolean {
  const sys = workshopSystem<ShopData & JsonValue>(game, SHOP);
  if (!sys || sys.data.retool) return false;
  const setup = shopSetup(game, sys.data.dials);
  const start = game.engine.day;
  sys.data.retool = { start, done: start + playNum(game, SHOP, "retool_days"), setup };
  return true;
}

/** Move a part one place up (-1) or down (+1) in the queue. */
export function movePart(game: Game, id: string, delta: -1 | 1): void {
  const sys = workshopSystem<ShopData & JsonValue>(game, SHOP);
  if (!sys) return;
  const ids = queuedParts(game, sys.data.order).map((p) => p.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  sys.data.order = [...ids, ...sys.data.order.filter((x) => !ids.includes(x))];
}

function tickShop(game: Game, ctx: TickContext, sys: WorkshopSystem<ShopData & JsonValue>): void {
  if (!isDone(game, game.tree.workshops[SHOP]!.opensWith)) return;
  const d = sys.data;
  const r = d.retool;
  if (r && ctx.day + 1 >= r.done) {
    d.current = r.setup;
    d.retool = null;
    setState(game, "tolerance_mm", r.setup.tolerance_mm);
    setState(game, "bearing_quality", r.setup.bearing_quality);
    pushHistory(d.history, {
      day: ctx.day + 1,
      title: Object.values(r.setup.dials).map((v) => String(v).replace(/_/g, " ")).join(", "),
      detail: fill(S.adopted, { tol: n(r.setup.tolerance_mm), bq: r.setup.bearing_quality }),
      tone: "good",
    });
    ctx.pause(doneReason(SHOP));
  }
  setState(game, "shop_hours_balance", shopBalance(game, d));
}

registerGameSystem((game) => new WorkshopSystem<ShopData & JsonValue>(SHOP, initial as ShopData & JsonValue, (ctx, sys) => tickShop(game, ctx, sys)));

function setupRows(game: Game, s: Setup, hours: number, q: QueueResult | null, year: number): OutputRow[] {
  const rows: OutputRow[] = [
    { label: S.tolerance, value: n(s.tolerance_mm, "mm") },
    { label: S.bearings, value: n(s.bearing_quality) },
    { label: S.machinists, value: n(num(game, "machinists_trained")) },
    { label: S.hours, value: n(hours) },
  ];
  if (q) {
    rows.push({ label: S.queueDays, value: fill(S.days, { n: n(q.queue_days) }), tone: q.queue_days > year ? "bad" : "good" });
    rows.push({ label: S.wasted, value: n(q.wasted_hours), tone: q.wasted_hours > 0 ? "bad" : "normal" });
  }
  return rows;
}

function queueHTML(game: Game, parts: readonly PartKind[], q: QueueResult | null, year: number): string {
  let h = `<h3>${esc(S.queue)}</h3>`;
  if (!parts.length) return h + noteHTML(S.empty);
  h += noteHTML(S.queueHint);
  h += `<ol class="wk-queue">`;
  parts.forEach((p, i) => {
    const r = q?.parts[i];
    const bad = !!r && (r.too_tight || r.finish_day > year);
    const bits = [fill(S.part, { hours: n(p.hours), tol: n(p.tolerance_mm) })];
    if (r && r.reject_rate > 0) bits.push(fill(S.reject, { pct: n(r.reject_rate * 100) }));
    if (r) bits.push(r.finish_day > year ? S.late : fill(S.finish, { n: n(r.finish_day) }));
    h += `<li class="${bad ? "bad" : ""}" data-part="${esc(p.id)}"><span class="grow"><b>${esc(p.name)}</b> <span class="small muted num">${esc(bits.join(" · "))}</span></span>`;
    h += `<button type="button" data-act="up:${esc(p.id)}" aria-label="${esc(fill(S.upLabel, { name: p.name }))}"${i === 0 ? " disabled" : ""}>${S.up}</button>`;
    h += `<button type="button" data-act="down:${esc(p.id)}" aria-label="${esc(fill(S.downLabel, { name: p.name }))}"${i === parts.length - 1 ? " disabled" : ""}>${S.down}</button></li>`;
  });
  return h + `</ol>`;
}

registerWorkshop(SHOP, (el, game) => {
  const sys = workshopSystem<ShopData & JsonValue>(game, SHOP);
  if (!sys) return;
  return mountScreen(el, game, {
    dials: () => shopDials(game),
    values: () => sys.data.dials as Record<string, DialValue>,
    setValue: (id, v) => void (sys.data.dials = { ...sys.data.dials, [id]: v as JsonValue }),
    body: () => {
      const d = sys.data;
      const year = playNum(game, SHOP, "queue_year_days");
      const parts = queuedParts(game, d.order);
      const setup = shopSetup(game, d.dials);
      const hours = shopHours(game, setup);
      const q = runQueue(game, parts, setup.tolerance_mm, hours);
      let h = d.retool ? progressHTML(S.retooling, game.engine.day - d.retool.start, d.retool.done - d.retool.start) : "";
      h += outputsBlock(setupRows(game, setup, hours, q, year), S.setup);
      if (!(hours > 0)) h += noteHTML(S.noMachinists, true);
      h += actionHTML("retool", fill(S.retool, { days: playNum(game, SHOP, "retool_days") }), d.retool ? S.retooling : null);
      const curHours = shopHours(game, d.current);
      const curTol = d.current?.tolerance_mm ?? num(game, "tolerance_mm");
      h += outputsBlock(
        [
          { label: S.tolerance, value: n(curTol, "mm") },
          { label: S.hours, value: n(curHours) },
          { label: S.balance, value: n(shopBalance(game, d)), tone: shopBalance(game, d) < 0 ? "bad" : "good" },
        ],
        S.current,
      );
      h += queueHTML(game, parts, runQueue(game, parts, curTol, curHours), year);
      return h;
    },
    act: (a) => {
      if (a === "retool") startRetool(game);
      else if (a.startsWith("up:")) movePart(game, a.slice(3), -1);
      else if (a.startsWith("down:")) movePart(game, a.slice(5), 1);
    },
    history: () => sys.data.history,
  });
});
