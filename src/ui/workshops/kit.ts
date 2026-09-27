// Shared kit for the workshop screens (packages E1-E6), so six screens look and behave alike: the dial
// list the player has earned (base + extensions, only dials whose `added_by` node is complete, in the
// order the stage files add them), dial controls in the house style, an outputs table, a history list,
// and a saved per-workshop state that ticks with the run. Pure view helpers plus one engine system
// shape; no game rules here. Extend additively; each workshop keeps its own logic in its own file.
//
// A workshop file (`src/ui/workshops/<name>.ts`) is imported by `src/main.ts` before any Game exists.
// It calls `registerWorkshop(id, mount)` (the screen) and, if it needs to keep state or act on the run
// over time, `registerGameSystem(game => system)` (e.g. a 30-day campaign, a build that takes months).
import { availableDials, type Dial, type NodeBook } from "../../content";
import type { EngineSystem, JsonValue, TickContext } from "../../engine";
import type { Game } from "../shellGame";
import { fill, STRINGS } from "../strings";

/** A dial as the screen shows it. */
export interface DialView {
  id: string;
  name: string;
  effect: string;
  basis: string;
  kind: "range" | "options" | "both";
  range?: [number, number];
  options?: string[];
}

/** The dials the player has earned in a workshop, in the order the stage files add them. */
export function workshopDials(game: Game, workshop: string): DialView[] {
  const w = game.tree.workshops[workshop];
  if (!w) return [];
  const open = new Set(availableDials(game.tree, workshop, game.projects.book as NodeBook));
  return w.dials.filter((d) => open.has(d.id)).map(dialView);
}

export function dialView(d: Dial): DialView {
  const kind = d.range && d.options ? "both" : d.range ? "range" : "options";
  return {
    id: d.id,
    name: d.name,
    effect: d.effect,
    basis: d.basis,
    kind,
    ...(d.range ? { range: d.range } : {}),
    ...(d.options ? { options: d.options } : {}),
  };
}

/** A dial's value: a number for a range, an option id for options (a "both" dial keeps both). */
export type DialValue = number | string | { value: number; option: string };

/** A sensible starting value: the middle of a range, the first option. */
export function defaultDialValue(d: DialView): DialValue {
  const mid = d.range ? roundNice((d.range[0] + d.range[1]) / 2) : 0;
  const first = d.options?.[0] ?? "";
  return d.kind === "range" ? mid : d.kind === "options" ? first : { value: mid, option: first };
}

function roundNice(x: number): number {
  return Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** An option id as words (`bellows_crews` -> "bellows crews"). */
export const optionWords = (id: string): string => id.replace(/_/g, " ");

/**
 * Draw the dials into `el`: a range is a slider with the number beside it (typed values allowed), an
 * options dial is a row of square buttons; each shows its `effect` and, under "Why", its `basis`.
 * `onChange` fires on every change. Returns a function that redraws with new values.
 */
export function mountDials(
  el: HTMLElement,
  dials: readonly DialView[],
  values: Record<string, DialValue>,
  onChange: (id: string, value: DialValue) => void,
): (next: Record<string, DialValue>) => void {
  const doc = el.ownerDocument;
  const root = doc.createElement("div");
  root.className = "wk-dials";
  el.appendChild(root);
  let cur = { ...values };
  const draw = (): void => {
    let h = "";
    for (const d of dials) {
      const v = cur[d.id] ?? defaultDialValue(d);
      const num = typeof v === "number" ? v : typeof v === "object" ? v.value : null;
      const opt = typeof v === "string" ? v : typeof v === "object" ? v.option : null;
      h += `<div class="wk-dial" data-dial="${esc(d.id)}"><div class="wk-dial-head"><b>${esc(d.name)}</b>`;
      if (num !== null && d.range) h += ` <input class="wk-num num" type="text" inputmode="decimal" value="${num}" aria-label="${esc(d.name)}">`;
      h += `</div>`;
      if (num !== null && d.range) {
        const step = (d.range[1] - d.range[0]) / 100;
        h += `<input class="wk-range" type="range" min="${d.range[0]}" max="${d.range[1]}" step="${step}" value="${num}" aria-label="${esc(d.name)}">`;
      }
      if (opt !== null && d.options) {
        h += `<div class="wk-opts" role="group" aria-label="${esc(d.name)}">`;
        for (const o of d.options)
          h += `<button type="button" data-opt="${esc(o)}" class="${o === opt ? "on" : ""}" aria-pressed="${o === opt}">${esc(optionWords(o))}</button>`;
        h += `</div>`;
      }
      h += `<p class="small muted">${esc(d.effect)}</p><details class="small"><summary>${esc(STRINGS.workshop.why)}</summary><p>${esc(d.basis)}</p></details></div>`;
    }
    root.innerHTML = h;
  };
  const set = (id: string, v: DialValue): void => {
    cur = { ...cur, [id]: v };
    onChange(id, v);
    draw();
  };
  const withNumber = (d: DialView, n: number): DialValue => {
    const [lo, hi] = d.range!;
    const x = Math.max(lo, Math.min(hi, n));
    const v = cur[d.id] ?? defaultDialValue(d);
    return typeof v === "object" ? { ...v, value: x } : x;
  };
  root.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button[data-opt]") as HTMLButtonElement | null;
    if (!b) return;
    const id = (b.closest("[data-dial]") as HTMLElement).dataset.dial!;
    const d = dials.find((x) => x.id === id)!;
    const v = cur[id] ?? defaultDialValue(d);
    set(id, typeof v === "object" ? { ...v, option: b.dataset.opt! } : b.dataset.opt!);
  });
  root.addEventListener("change", (ev) => {
    const t = ev.target as HTMLInputElement;
    const id = (t.closest("[data-dial]") as HTMLElement | null)?.dataset.dial;
    if (!id) return;
    const d = dials.find((x) => x.id === id)!;
    const n = Number(t.value.replace(/[\s,]/g, ""));
    if (Number.isFinite(n)) set(id, withNumber(d, n));
    else draw();
  });
  draw();
  return (next) => {
    cur = { ...next };
    draw();
  };
}

/** One output row: a label, a value already formatted, and a tone (red for a failure or bottleneck). */
export interface OutputRow {
  label: string;
  value: string;
  tone?: "normal" | "good" | "bad";
}

/** The outputs table, live as the dials move. */
export function outputsHTML(rows: readonly OutputRow[]): string {
  let h = `<div class="wk-outputs">`;
  for (const r of rows) h += `<div class="wk-out ${r.tone ?? "normal"}"><span>${esc(r.label)}</span><b class="num">${esc(r.value)}</b></div>`;
  return h + `</div>`;
}

/** One entry in a workshop's history: when, what was tried, what came out. */
export interface HistoryEntry {
  day: number;
  title: string;
  detail: string;
  tone?: "normal" | "good" | "bad";
}

/** The history list, newest first ("what did I try?"). */
export function historyHTML(entries: readonly HistoryEntry[]): string {
  if (!entries.length) return `<p class="small muted">${esc(STRINGS.workshop.noHistory)}</p>`;
  let h = `<ol class="wk-history">`;
  for (const e of [...entries].reverse()) {
    const year = Math.floor(e.day / 365);
    const day = Math.floor(e.day % 365);
    h += `<li class="${e.tone ?? "normal"}"><span class="small muted">${esc(fill(STRINGS.workshop.when, { year, day }))}</span> <b>${esc(e.title)}</b> ${esc(e.detail)}</li>`;
  }
  return h + `</ol>`;
}

/**
 * A workshop's saved state as an engine system: `data` is JSON, saved and loaded with the run. Give
 * `tick` to act each day (advance a campaign, finish a build). Register it with `registerGameSystem`.
 */
export class WorkshopSystem<T extends JsonValue> implements EngineSystem {
  readonly id: string;
  data: T;
  constructor(
    workshop: string,
    initial: T,
    private readonly onTick?: (ctx: TickContext, sys: WorkshopSystem<T>) => void,
  ) {
    this.id = `workshop:${workshop}`;
    this.data = JSON.parse(JSON.stringify(initial)) as T;
  }
  tick(ctx: TickContext): void {
    this.onTick?.(ctx, this);
  }
  save(): JsonValue {
    return this.data;
  }
  load(d: JsonValue): void {
    this.data = d as T;
  }
}

/** The workshop's system in a running game (null before the game has it). */
export function workshopSystem<T extends JsonValue>(game: Game, workshop: string): WorkshopSystem<T> | null {
  return (game.engine.systemById(`workshop:${workshop}`) as WorkshopSystem<T> | undefined) ?? null;
}
