// Projects: the engine side of package B's node logic. B's functions in src/content/nodes.ts are pure;
// this system owns their NodeBook inside the save and applies what they return each tick: Build labor
// spent, milestones, writes_state, unlocked jobs, newly visible nodes (each a pause reason).
import {
  advanceBuilds,
  emptyBook,
  nodeStatus,
  revealNodes,
  startBuild,
  visibleNodes,
  type BuildEvent,
  type NodeBook,
  type NodeStatus,
  type StartResult,
} from "../content/nodes";
import type { Tree } from "../content/types";
import type { Engine, EngineSystem, TickContext } from "./engine";
import type { JsonValue, PauseReason } from "./types";

/** Labor pool the Build job feeds (JobDef.labor). */
export const BUILD_POOL = "build";

/**
 * Options for the projects system. `gate` (package F's beat gating, added additively): a node whose
 * requirements hold is revealed only when the gate also passes; until then it stays hidden and makes
 * no pause. Without a gate every node is revealed as soon as its requirements hold.
 */
export interface ProjectsOptions {
  gate?: (id: string, book: Readonly<NodeBook>) => boolean;
}

export class ProjectsSystem implements EngineSystem {
  readonly id = "projects";
  private bookValue: NodeBook = emptyBook();

  constructor(
    private readonly tree: Tree,
    private readonly engine: Engine,
    private readonly options: ProjectsOptions = {},
  ) {}

  /** The node part of the save (completed, building, revealed). */
  get book(): Readonly<NodeBook> {
    return this.bookValue;
  }

  status(id: string): NodeStatus {
    return nodeStatus(this.tree, id, this.engine, this.bookValue);
  }

  /** Nodes available or building, in tree order (optionally one stage). */
  visible(stage?: number): string[] {
    return visibleNodes(this.tree, this.engine, this.bookValue, stage);
  }

  /**
   * What the projects panel shows: nodes building, or available and revealed (so they passed the
   * gate, if there is one). Without a gate this equals `visible` after the tick that reveals them.
   */
  shown(stage?: number): string[] {
    const b = this.bookValue;
    return this.visible(stage).filter((id) => id in b.building || b.revealed.includes(id));
  }

  isComplete(id: string): boolean {
    return this.bookValue.completed.includes(id);
  }

  /**
   * Start building a node: spends its resources and clears its claim. A node with no labor completes
   * at once; the events are applied and returned with pause reasons for the caller to show.
   */
  start(id: string): StartResult & { pauses?: PauseReason[] } {
    const r = startBuild(this.tree, id, this.engine, this.bookValue);
    if (!r.ok) return r;
    if (!this.engine.spend(r.consume)) {
      return { ok: false, reason: "unaffordable", missing: {} };
    }
    this.engine.setClaim(id, null);
    this.bookValue = r.book;
    const pauses = this.apply(r.events);
    return { ...r, pauses };
  }

  tick(ctx: TickContext): void {
    if (Object.keys(this.bookValue.building).length > 0) {
      const labor = ctx.laborAvailable(BUILD_POOL);
      if (labor > 0) {
        const r = advanceBuilds(this.tree, this.bookValue, labor);
        ctx.takeLabor(BUILD_POOL, labor - r.unused);
        this.bookValue = r.book;
        for (const p of this.apply(r.events)) ctx.pause(p);
      }
    }
    const rev = revealNodes(this.tree, this.engine, this.bookValue);
    const gate = this.options.gate;
    const fresh = gate ? rev.revealed.filter((id) => gate(id, this.bookValue)) : rev.revealed;
    if (fresh.length) this.bookValue = { ...this.bookValue, revealed: [...this.bookValue.revealed, ...fresh] };
    for (const id of fresh) ctx.pause({ kind: "node_revealed", subject: id });
  }

  save(): JsonValue {
    return this.bookValue as unknown as JsonValue;
  }

  load(data: JsonValue): void {
    this.bookValue = JSON.parse(JSON.stringify(data)) as NodeBook;
  }

  private apply(events: BuildEvent[]): PauseReason[] {
    const pauses: PauseReason[] = [];
    for (const ev of events) {
      if (ev.type === "milestone") {
        pauses.push({ kind: "milestone", subject: ev.milestone.id });
        continue;
      }
      this.engine.applyWrites(ev.writes);
      for (const job of ev.jobs) if (this.engine.jobDef(job)) this.engine.unlockJob(job);
      // Node `modifiers:` apply for good (they live in the engine's save like any modifier).
      for (const m of this.tree.nodes[ev.node]?.modifiers ?? []) this.engine.setModifier(m.kind, m.target, `node:${ev.node}`, m.factor);
      pauses.push({ kind: "node_complete", subject: ev.node });
      if (ev.opensWorkshop) pauses.push({ kind: "workshop_open", subject: ev.opensWorkshop });
    }
    return pauses;
  }
}
