// Done-criterion: saving and loading mid-run gives identical subsequent ticks.
import { describe, expect, it } from "vitest";
import {
  Engine,
  deserialize,
  loadFromStorage,
  saveToStorage,
  serialize,
  type EngineSystem,
  type JsonValue,
  type SaveStorage,
  type TickContext,
} from "../../src/engine";
import { stage1Content, STAGE1_JOBS } from "./fixtures/stage1";

/** A stand-in for B's project system: spends Build labor on a queue of projects and pauses on completion. */
class TestProjects implements EngineSystem {
  readonly id = "test_projects";
  done: string[] = [];
  started = false;
  progress = 0;
  constructor(private readonly queue: { id: string; laborPersonDays: number; cost: Record<string, number> }[]) {}
  tick(ctx: TickContext): void {
    const next = this.queue.find((p) => !this.done.includes(p.id));
    if (!next) return;
    if (!this.started) {
      if (!ctx.engine.spend(next.cost)) return;
      this.started = true;
    }
    this.progress += ctx.takeLabor("build", next.laborPersonDays - this.progress);
    if (this.progress >= next.laborPersonDays) {
      this.done.push(next.id);
      this.started = false;
      this.progress = 0;
      ctx.pause({ kind: "node_complete", subject: next.id });
    }
  }
  save(): JsonValue {
    return { done: this.done, started: this.started, progress: this.progress };
  }
  load(data: JsonValue): void {
    const d = data as { done: string[]; started: boolean; progress: number };
    this.done = [...d.done];
    this.started = d.started;
    this.progress = d.progress;
  }
}

const QUEUE: { id: string; laborPersonDays: number; cost: Record<string, number> }[] = [
  { id: "digging_sticks", laborPersonDays: 120000, cost: { wood_kg: 1000 } },
  { id: "pit_kiln", laborPersonDays: 400000, cost: { wood_kg: 5000, clay_kg: 4000 } },
  { id: "charcoal_clamps", laborPersonDays: 600000, cost: { wood_kg: 20000, clay_kg: 30000 } },
];

function setup(): Engine {
  const e = new Engine(stage1Content());
  for (const j of STAGE1_JOBS) e.unlockJob(j.id);
  e.assign("gather_wood", 2500);
  e.assign("knap_flint", 300);
  e.assign("build", 2500);
  e.assign("dig_clay", 600);
  e.assign("fire_pottery", 100);
  e.assign("burn_charcoal", 300);
  e.assign("mine_malachite", 400);
  e.assign("smelt_copper", 200);
  e.assign("cast_copper_tools", 40);
  e.setTrainingTrade("trained_smiths");
  e.setModifier("rate", "smelt_copper", "wind_furnaces", 3);
  e.setModifier("toolLife", "copper_tools", "hardening", 1.5);
  e.setClaim("pot_bellows", { pots: 300, wood_kg: 5000 });
  e.addSystem(new TestProjects(QUEUE));
  return e;
}

function runAndRecord(e: Engine, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(JSON.stringify(e.tick()));
  return out;
}

describe("save and load", () => {
  it("a run loaded mid-way ticks identically to the original", () => {
    const a = setup();
    a.run(400);
    const text = serialize(a);

    const b = deserialize(stage1Content(), text);
    b.addSystem(new TestProjects(QUEUE));
    expect(serialize(b)).toBe(text);

    const ra = runAndRecord(a, 600);
    const rb = runAndRecord(b, 600);
    expect(rb).toEqual(ra);
    expect(serialize(b)).toBe(serialize(a));
    // The run did something worth checking.
    expect(a.state.getNumber("trained_smiths")).toBeGreaterThan(0);
    expect((a.save().systems.test_projects as { done: string[] }).done.length).toBeGreaterThan(0);
  });

  it("works-tier staffing, pins and department priorities survive a save", () => {
    const a = setup();
    a.addWorks({ id: "charcoal_1", output: "charcoal_kg", primaryJob: "burn_charcoal", supportJobs: ["gather_wood"], department: "metals" }, "pull");
    a.addWorks({ id: "smelter_1", output: "copper_kg", primaryJob: "smelt_copper", department: "metals" }, 50);
    a.pin("smelter_1", "smelt_copper", 20);
    a.setDepartmentPriority("metals", 2);
    a.setLaborTier("works");
    a.run(123);
    const b = Engine.load(stage1Content(), JSON.parse(JSON.stringify(a.save())));
    b.addSystem(new TestProjects(QUEUE));
    expect(runAndRecord(b, 300)).toEqual(runAndRecord(a, 300));
  });

  it("the save is a copy: running on doesn't change it", () => {
    const a = setup();
    a.run(10);
    const save = a.save();
    const before = JSON.stringify(save);
    a.run(10);
    expect(JSON.stringify(save)).toBe(before);
  });

  it("saves to and loads from storage", () => {
    const mem = new Map<string, string>();
    const storage: SaveStorage = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
    expect(loadFromStorage(stage1Content(), storage)).toBeNull();
    const a = setup();
    a.run(50);
    saveToStorage(a, storage);
    const b = loadFromStorage(stage1Content(), storage)!;
    expect(b.day).toBe(50);
    expect(b.stock("wood_kg")).toBe(a.stock("wood_kg"));
  });

  it("refuses an unknown save version", () => {
    const save = { ...setup().save(), saveVersion: 99 } as unknown as ReturnType<Engine["save"]>;
    expect(() => Engine.load(stage1Content(), save)).toThrow(/save version/);
  });
});
