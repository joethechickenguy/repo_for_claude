// Helpers the six workshop screens (packages E1-E6) share on top of D's kit: reading state and the
// stage files' `play:` values, locking options until their node is built, a "results are in" pause,
// and one screen frame (dials on the left; outputs, actions, the running loop and history on the right)
// that redraws live as dials move and days pass.
import type { PlayValue, WorkshopPlay } from "../../content";
import type { JsonValue, PauseReason } from "../../engine";
import { fmtSmart } from "../shellFormat";
import type { Game } from "../shellGame";
import { fill } from "../strings";
import { type DialValue, type DialView, type HistoryEntry, historyHTML, mountDials, outputsHTML, type OutputRow, workshopDials } from "./kit";
import { WS } from "./strings";

/** Pause kind when a workshop's run, build or firing finishes; subject is the workshop id. */
export const WORKSHOP_DONE = "workshop_done";

/** History entries kept per workshop (oldest dropped). */
export const HISTORY_KEEP = 60;

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A workshop's `play:` values (from the stage files). */
export function playOf(game: Game, workshop: string): WorkshopPlay {
  return game.tree.workshops[workshop]?.play ?? {};
}

/** A number from `play:`; a missing one is a content error, so it throws with the key's name. */
export function playNum(game: Game, workshop: string, key: string): number {
  const v = playOf(game, workshop)[key];
  if (typeof v !== "number") throw new Error(`${workshop}: play.${key} is missing from the stage files`);
  return v;
}

export function playList(game: Game, workshop: string, key: string): PlayValue[] {
  const v = playOf(game, workshop)[key];
  return Array.isArray(v) ? v : [];
}

/** A state variable or metric as a number (0 when unset). */
export function num(game: Game, id: string): number {
  const v = game.engine.get(id);
  return typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : 0;
}

export function flag(game: Game, id: string): boolean {
  return game.engine.get(id) === true;
}

export function str(game: Game, id: string): string {
  const v = game.engine.get(id);
  return typeof v === "string" ? v : "";
}

export function isDone(game: Game, node: string): boolean {
  return game.book.completed.includes(node);
}

export function nodeName(game: Game, node: string): string {
  return game.tree.nodes[node]?.name ?? node;
}

/** Set a declared state variable (a workshop result the nodes left to the simulation). */
export function setState(game: Game, id: string, value: number | string | boolean): void {
  game.engine.state.setIfDeclared(id, value);
}

/** Options locked until a node is complete: `{option: node}` -> `{option: "needs <node name>"}`. */
export function lockUntil(game: Game, needs: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [opt, node] of Object.entries(needs)) if (node && !isDone(game, node)) out[opt] = fill(WS.frame.needs, { name: nodeName(game, node) });
  return out;
}

/** The earned dials with locks applied. */
export function dialsWithLocks(game: Game, workshop: string, locks: Record<string, Record<string, string>>): DialView[] {
  return workshopDials(game, workshop).map((d) => (locks[d.id] && Object.keys(locks[d.id]!).length ? { ...d, locked: locks[d.id] } : d));
}

/** A dial's current value from saved values, falling back to the kit default; locked options fall back to the first open one. */
export function dialNumber(values: Record<string, JsonValue>, d: DialView | undefined, fallback: number): number {
  const v = d ? values[d.id] : undefined;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && !Array.isArray(v) && typeof v.value === "number") return v.value;
  if (d?.range) return Math.round(((d.range[0] + d.range[1]) / 2) * 10) / 10;
  return fallback;
}

export function dialOption<T extends string>(values: Record<string, JsonValue>, d: DialView | undefined, fallback: T): T {
  if (!d?.options) return fallback;
  const v = values[d.id];
  const raw = typeof v === "string" ? v : v && typeof v === "object" && !Array.isArray(v) && typeof v.option === "string" ? v.option : undefined;
  const open = d.options.filter((o) => !d.locked?.[o]);
  if (raw && open.includes(raw)) return raw as T;
  return (open[0] ?? fallback) as T;
}

/** Keep a history list bounded. */
export function pushHistory(list: HistoryEntry[], e: HistoryEntry): void {
  list.push(e);
  if (list.length > HISTORY_KEEP) list.splice(0, list.length - HISTORY_KEEP);
}

export function doneReason(workshop: string): PauseReason {
  return { kind: WORKSHOP_DONE, subject: workshop };
}

/** A number for an output row. */
export const n = (x: number, unit = ""): string => (unit ? `${fmtSmart(x)} ${unit}` : fmtSmart(x));

/** What a screen shows besides the dials; everything here redraws on every change and every day. */
export interface ScreenSpec {
  dials(): DialView[];
  values(): Record<string, DialValue>;
  setValue(id: string, v: DialValue): void;
  /** Outputs, status and actions as HTML (buttons carry `data-act`). */
  body(): string;
  /** A click on a `[data-act]` button inside the body. */
  act(action: string, button: HTMLElement): void;
  history(): readonly HistoryEntry[];
  /** Optional widget above the dials (e.g. the rocket's stage tabs); redraws with the body. */
  top?(): string;
}

/**
 * Mount a workshop screen: the dials (redrawn only when the earned set changes), and the body and
 * history (redrawn on every change and every simulated day). Returns the unmount function.
 */
export function mountScreen(el: HTMLElement, game: Game, spec: ScreenSpec): () => void {
  const doc = el.ownerDocument;
  const wrap = doc.createElement("div");
  wrap.className = "wk";
  const top = doc.createElement("div");
  top.className = "wk-top";
  const left = doc.createElement("section");
  left.className = "wk-left";
  const right = doc.createElement("section");
  right.className = "wk-right";
  const body = doc.createElement("div");
  body.className = "wk-body";
  const hist = doc.createElement("div");
  hist.className = "wk-hist";
  right.append(body, hist);
  wrap.append(left, right);
  el.append(top, wrap);

  let dialKey = "";
  let redrawDials: ((v: Record<string, DialValue>) => void) | null = null;
  const drawDials = (): void => {
    const dials = spec.dials();
    const key = JSON.stringify(dials.map((d) => [d.id, d.locked ?? null, d.options ?? null, d.range ?? null]));
    if (key === dialKey && redrawDials) return;
    dialKey = key;
    left.replaceChildren();
    redrawDials = mountDials(left, dials, spec.values(), (id, v) => {
      spec.setValue(id, v);
      drawBody();
    });
  };
  const drawBody = (): void => {
    if (spec.top) top.innerHTML = spec.top();
    body.innerHTML = spec.body();
    hist.innerHTML = `<h3>${esc(WS.frame.history)}</h3>` + historyHTML(spec.history());
  };
  const onClick = (ev: Event): void => {
    const b = (ev.target as HTMLElement).closest("[data-act]") as HTMLElement | null;
    if (!b || (b as HTMLButtonElement).disabled) return;
    spec.act(b.dataset.act!, b);
    // A stage tab or similar may change which dial values show.
    dialKey = "";
    drawDials();
    redrawDials?.(spec.values());
    drawBody();
  };
  wrap.addEventListener("click", onClick);
  top.addEventListener("click", onClick);
  drawDials();
  drawBody();
  const off = game.engine.onTick(() => {
    drawDials();
    drawBody();
  });
  return () => {
    off();
    wrap.removeEventListener("click", onClick);
    top.removeEventListener("click", onClick);
    el.replaceChildren();
  };
}

/** Outputs with a heading. */
export function outputsBlock(rows: readonly OutputRow[], heading: string = WS.frame.outputs): string {
  return (heading ? `<h3>${esc(heading)}</h3>` : "") + outputsHTML(rows);
}

/** An action button, disabled with a reason line when it can't run. */
export function actionHTML(act: string, label: string, blocked: string | null): string {
  return `<p class="wk-act"><button type="button" data-act="${esc(act)}"${blocked ? " disabled" : ""}>${esc(label)}</button>${blocked ? ` <span class="small muted">${esc(blocked)}</span>` : ""}</p>`;
}

/** A progress line for a run in progress. */
export function progressHTML(what: string, day: number, days: number): string {
  const pct = Math.max(0, Math.min(100, (100 * day) / Math.max(1, days)));
  return `<div class="wk-prog"><p class="small">${esc(fill(WS.frame.running, { what, day: Math.min(days, Math.floor(day)), days: Math.ceil(days) }))}</p><div class="wk-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
}

/** One line, red when it's a failure. */
export function noteHTML(text: string, bad = false): string {
  return text ? `<p class="small ${bad ? "red" : "muted"}">${esc(text)}</p>` : "";
}

/** A small line chart (the liquefier's cool-down, a firing's pressure trace) as inline SVG. */
export function lineChartSVG(
  points: ReadonlyArray<readonly [number, number]>,
  opts: { title: string; xMax: number; yMin: number; yMax: number; hline?: { y: number; label: string }; now?: number; bad?: boolean },
): string {
  const W = 320;
  const H = 140;
  const L = 34;
  const B = 16;
  const x = (v: number) => L + ((W - L - 6) * Math.max(0, Math.min(opts.xMax, v))) / Math.max(1e-9, opts.xMax);
  const y = (v: number) => 6 + ((H - B - 6) * (opts.yMax - Math.max(opts.yMin, Math.min(opts.yMax, v)))) / Math.max(1e-9, opts.yMax - opts.yMin);
  const path = points.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)} ${y(b).toFixed(1)}`).join(" ");
  let s = `<svg class="wk-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title)}"><title>${esc(opts.title)}</title>`;
  s += `<path class="ax" d="M${L} 6 V${H - B} H${W - 6}"/>`;
  s += `<text x="${L - 4}" y="12" text-anchor="end">${esc(fmtSmart(opts.yMax))}</text><text x="${L - 4}" y="${H - B}" text-anchor="end">${esc(fmtSmart(opts.yMin))}</text>`;
  s += `<text x="${W - 6}" y="${H - 3}" text-anchor="end">${esc(fmtSmart(opts.xMax))}</text><text x="${L}" y="${H - 3}">0</text>`;
  if (opts.hline) s += `<path class="ax" stroke-dasharray="3 3" d="M${L} ${y(opts.hline.y).toFixed(1)} H${W - 6}"/><text x="${W - 8}" y="${(y(opts.hline.y) - 3).toFixed(1)}" text-anchor="end">${esc(opts.hline.label)}</text>`;
  if (points.length) s += `<path class="ln${opts.bad ? " bad" : ""}" d="${path}"/>`;
  if (opts.now !== undefined) s += `<path class="ax" d="M${x(opts.now).toFixed(1)} 6 V${H - B}"/>`;
  return s + `</svg>`;
}
