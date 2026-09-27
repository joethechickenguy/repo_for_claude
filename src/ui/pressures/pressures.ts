// Pressure bars (package F). Each tick: move every modelled `drives` variable from the day's
// production (the pressure's `model:` in the stage YAML), decide red from `red_when`, apply
// `red_modifiers` through the engine's setModifier while red, and pause the first day a shown bar
// goes red. Bars appear at their `introduced_in_beat` (the heartbeat from the stage's start) and only
// once introduced (intro.ts), so an effect never applies to a bar the player can't see.
//
// A `red_when` that is prose (expr null; most heartbeat bars after Stage 1) is never red here: the
// bar still shows its value (open question 42).
import { holds, stageOpen, type NodeBook, type Pressure, type Tree } from "../../content";
import type { Engine, EngineSystem, JsonValue, TickContext } from "../../engine";
import { beatOpen } from "./beats";

/** Modifier source name for a red pressure. */
export const pressureSource = (id: string): string => `pressure:${id}`;

/** Control id of a pressure bar (introductions). */
export const pressureControl = (id: string): string => `pressure:${id}`;

/** The pressures of every open stage, in stage order. */
export function openPressures(tree: Tree, book: Readonly<NodeBook>): Pressure[] {
  const out: Pressure[] = [];
  for (const s of tree.stages) if (stageOpen(tree, s.stage, book as NodeBook)) out.push(...s.pressures);
  return out;
}

/** Has the bar's beat arrived (heartbeat: from the stage's start)? */
export function pressureArrived(tree: Tree, p: Pressure, book: Readonly<NodeBook>): boolean {
  if (!stageOpen(tree, p.stage, book as NodeBook)) return false;
  return p.heartbeat || beatOpen(tree, p.stage, p.introducedInBeat, book);
}

/** The red threshold when `red_when` is `drives < n` or `drives <= n` (for the bar's tick mark). */
export function redThreshold(p: Pressure): number | undefined {
  const e = p.redWhen.expr;
  if (e && e.kind === "cmp" && e.ref === p.drives && (e.op === "<" || e.op === "<=") && typeof e.value === "number") return e.value;
  return undefined;
}

export function isRed(tree: Tree, p: Pressure, engine: Engine): boolean {
  return p.redWhen.expr ? holds(tree, p.redWhen.expr, engine) : false;
}

/** What the shell draws for one bar. */
export interface BarView {
  id: string;
  name: string;
  value: number;
  unit?: string;
  /** 0-1 of the bar filled. */
  fill: number;
  /** 0-1 position of the red threshold, when there is one. */
  mark?: number;
  red: boolean;
  heartbeat: boolean;
  effect: string;
  /** Answer node ids that are currently shown in projects (suggested while red). */
  answers: string[];
}

/** Bar scale: the model's max, else the variable's (positive) start, else the red threshold, else 1. */
export function barScale(tree: Tree, p: Pressure): number {
  if (p.model?.max !== undefined && p.model.max > 0) return p.model.max;
  const d = tree.stateVariables[p.drives]?.default;
  if (typeof d === "number" && d > 0) return d;
  return redThreshold(p) ?? 1;
}

export class PressureSystem implements EngineSystem {
  readonly id = "pressures";
  /** Bars currently red and shown (the pause fires on the way in). */
  private redNow: string[] = [];

  constructor(
    private readonly tree: Tree,
    private readonly book: () => Readonly<NodeBook>,
    private readonly shown: (control: string) => boolean,
  ) {}

  tick(ctx: TickContext): void {
    const e = ctx.engine;
    const book = this.book();
    const next: string[] = [];
    for (const p of openPressures(this.tree, book)) {
      const m = p.model;
      if (m && e.state.has(p.drives)) {
        let v = e.state.getNumber(p.drives);
        for (const [r, k] of Object.entries(m.perUnitProduced)) v += (ctx.report.produced[r] ?? 0) * k;
        for (const [r, k] of Object.entries(m.perUnitConsumed)) v += (ctx.report.consumed[r] ?? 0) * k;
        v += m.perDay;
        if (m.min !== undefined) v = Math.max(m.min, v);
        if (m.max !== undefined) v = Math.min(m.max, v);
        e.state.set(p.drives, v);
      }
      const active = isRed(this.tree, p, e) && this.shown(pressureControl(p.id)) && pressureArrived(this.tree, p, book);
      for (const mod of p.redModifiers ?? []) e.setModifier(mod.kind, mod.target, pressureSource(p.id), active ? mod.factor : null);
      if (active) {
        next.push(p.id);
        if (!this.redNow.includes(p.id)) ctx.pause({ kind: "pressure_red", subject: p.id });
      }
    }
    this.redNow = next;
  }

  /** Bars red right now (shown ones only). */
  red(): readonly string[] {
    return this.redNow;
  }

  save(): JsonValue {
    return { redNow: [...this.redNow] };
  }

  load(data: JsonValue): void {
    const d = data as { redNow?: string[] } | null;
    this.redNow = Array.isArray(d?.redNow) ? [...d!.redNow] : [];
  }
}

/** The bars to draw: introduced bars of open stages, the current stage's heartbeat first. */
export function barViews(
  tree: Tree,
  engine: Engine,
  book: Readonly<NodeBook>,
  shownControl: (control: string) => boolean,
  shownNodes: readonly string[],
  currentStage: number,
): BarView[] {
  // The current stage's bars; an earlier stage's bar only while it is red (it still bites).
  const bars = openPressures(tree, book).filter(
    (p) =>
      pressureArrived(tree, p, book) &&
      shownControl(pressureControl(p.id)) &&
      (p.stage === currentStage || isRed(tree, p, engine)),
  );
  bars.sort((a, b) => rank(b) - rank(a));
  function rank(p: Pressure): number {
    return (p.stage === currentStage ? 2 : 0) + (p.heartbeat ? 1 : 0) + p.stage / 100;
  }
  return bars.map((p) => {
    const raw = engine.get(p.drives);
    const value = typeof raw === "number" ? raw : 0;
    const scale = barScale(tree, p);
    const t = redThreshold(p);
    const red = isRed(tree, p, engine);
    const unit = tree.stateVariables[p.drives]?.unit;
    return {
      id: p.id,
      name: p.name,
      value,
      ...(unit ? { unit } : {}),
      fill: Math.max(0, Math.min(1, value / scale)),
      ...(t !== undefined ? { mark: Math.max(0, Math.min(1, t / scale)) } : {}),
      red,
      heartbeat: p.heartbeat,
      effect: p.effectWhenRed,
      answers: p.answers.filter((a) => shownNodes.includes(a)),
    };
  });
}
