// Introduction cards (package F). A control is anything the player can newly see or touch: a job row
// in the people panel, a pressure bar, a workshop. The first time one appears it is introduced with
// one line on what it is and one on why, both from content. DESIGN.md: "Never more than two new
// controls at once": at most two controls are introduced per pause; the rest wait (hidden) for the
// next tick's pause. So every auto-pause carries at most two new controls by construction.
import { openWorkshops, type NodeBook, type Tree } from "../../content";
import type { Engine, EngineSystem, JsonValue, TickContext } from "../../engine";
import { openPressures, pressureArrived, pressureControl } from "./pressures";

/** DESIGN.md, Goals: "Never more than two new controls at once." */
export const MAX_NEW_CONTROLS_PER_PAUSE = 2;

/** Pause kind for an introduction; `subject` is the control ids, space-separated. */
export const INTRO_PAUSE = "intro";

export const jobControl = (id: string): string => `job:${id}`;
export const workshopControl = (id: string): string => `workshop:${id}`;

export interface IntroCard {
  control: string;
  name: string;
  what: string;
  why: string;
}

/** Controls present right now, in a stable order (jobs in content order, then bars, then workshops). */
export function presentControls(tree: Tree, engine: Engine, book: Readonly<NodeBook>): string[] {
  const out: string[] = [];
  for (const j of engine.unlockedJobs()) if (tree.jobs[j.id]?.rates) out.push(jobControl(j.id));
  for (const p of openPressures(tree, book)) if (pressureArrived(tree, p, book)) out.push(pressureControl(p.id));
  for (const w of openWorkshops(tree, book as NodeBook)) out.push(workshopControl(w));
  return out;
}

/** The card for a control, all text from content. */
export function introCard(tree: Tree, control: string): IntroCard {
  const [kind, id = ""] = control.split(":", 2) as [string, string?];
  if (kind === "job") {
    const j = tree.jobs[id];
    const by = j?.unlockedBy[0] ? tree.nodes[j.unlockedBy[0]] : undefined;
    const stage = tree.stages.find((s) => s.startingJobs.includes(id));
    return {
      control,
      name: j?.name ?? id,
      what: j?.what ?? j?.rateNote ?? "",
      why: j?.why ?? by?.problem ?? stage?.openingProblem ?? "",
    };
  }
  if (kind === "pressure") {
    for (const s of tree.stages)
      for (const p of s.pressures)
        if (p.id === id) return { control, name: p.name, what: p.risesWith[0] ?? "", why: p.effectWhenRed };
  }
  if (kind === "workshop") {
    const w = tree.workshops[id];
    const by = w ? tree.nodes[w.opensWith] : undefined;
    return { control, name: w?.name ?? id, what: w?.loop ?? "", why: by?.problem ?? "" };
  }
  return { control, name: id, what: "", why: "" };
}

export class IntroSystem implements EngineSystem {
  readonly id = "intro";
  private introducedList: string[] = [];
  private queue: string[] = [];

  constructor(
    private readonly tree: Tree,
    private readonly book: () => Readonly<NodeBook>,
    private readonly maxPerPause = MAX_NEW_CONTROLS_PER_PAUSE,
  ) {}

  isIntroduced(control: string): boolean {
    return this.introducedList.includes(control);
  }

  introduced(): readonly string[] {
    return this.introducedList;
  }

  /** Controls waiting for a pause to be introduced. */
  waiting(): readonly string[] {
    return this.queue;
  }

  /** Queue newly present controls and release up to the limit. Returns the released ones. */
  collectAndRelease(engine: Engine): string[] {
    for (const c of presentControls(this.tree, engine, this.book()))
      if (!this.introducedList.includes(c) && !this.queue.includes(c)) this.queue.push(c);
    const released = this.queue.splice(0, this.maxPerPause);
    this.introducedList.push(...released);
    return released;
  }

  tick(ctx: TickContext): void {
    const released = this.collectAndRelease(ctx.engine);
    if (released.length) ctx.pause({ kind: INTRO_PAUSE, subject: released.join(" ") });
  }

  save(): JsonValue {
    return { introduced: [...this.introducedList], queue: [...this.queue] };
  }

  load(data: JsonValue): void {
    const d = data as { introduced?: string[]; queue?: string[] } | null;
    this.introducedList = Array.isArray(d?.introduced) ? [...d!.introduced] : [];
    this.queue = Array.isArray(d?.queue) ? [...d!.queue] : [];
  }
}

/** Controls an intro pause reason carries. */
export function introControls(subject: string | undefined): string[] {
  return (subject ?? "").split(" ").filter(Boolean);
}
