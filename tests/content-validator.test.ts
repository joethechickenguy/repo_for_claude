// The loader must agree with tools/validate_tree.py on every reference: same nodes, prerequisites,
// state variables, resources, bundles, workshops and pressures; and every tree the validator
// rejects, the loader rejects too (and the unmodified tree passes both).

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { compileTree, type RawContent } from "../src/content/compile";
import * as exprLib from "../src/content/expr";
import { tree } from "../src/content";
import { loadRaw } from "./content-raw";

type Key = string | number;
interface Op {
  op: "set" | "append" | "delete" | "dupe" | "add";
  path: Key[];
  value?: unknown;
}
interface Mutation {
  name: string;
  ops: Op[];
}

const N = (id: string) => `#${id}`;
const mutations: Mutation[] = [
  { name: "unknown prerequisite", ops: [{ op: "append", path: ["stage1", "nodes", N("pit_kiln"), "requires", "nodes"], value: "no_such_node" }] },
  { name: "unknown any_of member", ops: [{ op: "append", path: ["stage1", "nodes", N("gate_reliable_smelting"), "requires", "any_of"], value: ["no_such_node"] }] },
  { name: "prerequisite from a later stage", ops: [{ op: "append", path: ["stage1", "nodes", N("pit_kiln"), "requires", "nodes"], value: "deposit_choice" }] },
  { name: "cycle", ops: [{ op: "set", path: ["stage1", "nodes", N("digging_sticks"), "requires", "nodes"], value: ["pit_kiln"] }] },
  { name: "undeclared reads_state", ops: [{ op: "append", path: ["stage1", "nodes", N("charcoal_clamps"), "reads_state"], value: "no_such_var" }] },
  { name: "undeclared writes_state", ops: [{ op: "append", path: ["stage1", "nodes", N("charcoal_clamps"), "writes_state"], value: "no_such_var" }] },
  { name: "undeclared resource", ops: [{ op: "set", path: ["stage1", "nodes", N("pit_kiln"), "requires", "resources", "no_such_kg"], value: 1 }] },
  { name: "resource no job produces", ops: [{ op: "set", path: ["resources", "wood_kg", "produced_by"], value: "no_such_job" }] },
  { name: "unknown pages_bundle", ops: [{ op: "set", path: ["stage1", "nodes", N("pit_kiln"), "pages_bundle"], value: "no_such_bundle" }] },
  { name: "duplicate node id", ops: [{ op: "dupe", path: ["stage1", "nodes", N("pit_kiln")] }] },
  { name: "unknown kind", ops: [{ op: "set", path: ["stage1", "nodes", N("pit_kiln"), "kind"], value: "thing" }] },
  { name: "missing required field", ops: [{ op: "delete", path: ["stage1", "nodes", N("pit_kiln"), "notebook"] }] },
  { name: "missing non-gate field", ops: [{ op: "delete", path: ["stage1", "nodes", N("pit_kiln"), "numbers_status"] }] },
  { name: "node stage != file stage", ops: [{ op: "set", path: ["stage1", "nodes", N("pit_kiln"), "stage"], value: 2 }] },
  { name: "source not a URL", ops: [{ op: "set", path: ["stage1", "nodes", N("pit_kiln"), "sources"], value: ["a book"] }] },
  { name: "workshop extends nothing", ops: [{ op: "set", path: ["stage2", "workshops", N("furnace_workshop"), "id"], value: "no_such_workshop" }] },
  { name: "workshop defined twice", ops: [{ op: "delete", path: ["stage2", "workshops", N("furnace_workshop"), "extends"] }] },
  { name: "workshop opens_with unknown node", ops: [{ op: "set", path: ["stage1", "workshops", N("furnace_workshop"), "opens_with"], value: "no_such_node" }] },
  { name: "dial added_by unknown node", ops: [{ op: "set", path: ["stage1", "workshops", N("furnace_workshop"), "dials", 0, "added_by"], value: "no_such_node" }] },
  { name: "workshop node names unknown workshop", ops: [{ op: "set", path: ["stage1", "nodes", N("crucibles_blowpipes"), "workshop"], value: "no_such_workshop" }] },
  { name: "pressure drives undeclared variable", ops: [{ op: "set", path: ["stage1", "pressures", 0, "drives"], value: "no_such_var" }] },
  { name: "pressure answer unknown", ops: [{ op: "append", path: ["stage1", "pressures", 0, "answers"], value: "no_such_node" }] },
  { name: "bad labor_tier", ops: [{ op: "set", path: ["stage1", "labor_tier"], value: "mobs" }] },
  { name: "heartbeat not a pressure", ops: [{ op: "set", path: ["stage1", "heartbeat"], value: "no_such_pressure" }] },
  { name: "gate is not a node", ops: [{ op: "set", path: ["stage1", "gate", "id"], value: "no_such_gate" }] },
  { name: "draft area unknown roster", ops: [{ op: "set", path: ["draft", "areas", 0, "roster"], value: "nobody" }] },
  { name: "draft duplicate specialty", ops: [{ op: "set", path: ["draft", "roster", 1, "specialties", 0, "id"], value: "laborers" }] },
  { name: "draft specialties don't sum", ops: [{ op: "add", path: ["draft", "roster", 1, "specialties", 0, "full"], value: 1 }] },
  { name: "draft roster defaults don't sum", ops: [{ op: "add", path: ["draft", "roster", 0, "default"], value: 100 }] },
  { name: "draft page defaults don't sum", ops: [{ op: "add", path: ["draft", "pages", 0, "default"], value: 100 }] },
];

function rootOf(raw: RawContent, name: Key): Record<string, unknown> {
  if (name === "vars") return raw.stateVariables.variables;
  if (name === "resources") return raw.resources.resources;
  if (name === "draft") return raw.draft;
  const m = /^stage(\d+)$/.exec(String(name));
  const s = m && raw.stages.find((x) => x.data.stage === Number(m[1]));
  if (!s) throw new Error(`no root ${name}`);
  return s.data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function step(cur: any, key: Key): any {
  if (typeof key === "string" && key.startsWith("#")) return cur.find((x: { id?: string }) => x?.id === key.slice(1));
  return cur[key];
}

function applyMutation(raw: RawContent, m: Mutation): RawContent {
  for (const { op, path, value } of m.ops) {
    let cur = rootOf(raw, path[0]!);
    for (const k of path.slice(1, -1)) cur = step(cur, k);
    const last = path[path.length - 1]!;
    const v = structuredClone(value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cur as any;
    if (op === "set") c[last] = v;
    else if (op === "append") step(c, last).push(v);
    else if (op === "delete") delete c[last];
    else if (op === "dupe") c.push(structuredClone(step(c, last)));
    else if (op === "add") c[last] = c[last] + (v as number);
  }
  return raw;
}

interface Probe {
  baseline: {
    node_order: string[];
    nodes: Record<
      string,
      {
        stage: number;
        beat: number;
        kind: string;
        workshop: string | null;
        requires_nodes: string[];
        any_of: string[][];
        resources: string[];
        reads_state: string[];
        writes_state: string[];
        pages_bundle: string | null;
        jobs: string[];
      }
    >;
    workshops: Record<string, { opens_with: string; dials: string[] }>;
    pressures: Record<string, [string, string, string[]][]>;
    gates: Record<string, string>;
    state_vars: Record<string, string>;
    resources: Record<string, string>;
    bundle_ids: string[];
    starting_jobs: string[];
    errors: string[];
    warnings: string[];
  };
  mutations: Record<string, string[]>;
}

let probe: Probe;

beforeAll(() => {
  const r = spawnSync("python3", [join(__dirname, "content-validator-probe.py")], { input: JSON.stringify(mutations), encoding: "utf8", timeout: 60000 });
  if (r.status !== 0) throw new Error(`validator probe failed (needs python3 + pyyaml): ${r.stderr || r.error}`);
  probe = JSON.parse(r.stdout) as Probe;
});

describe("loader agrees with tools/validate_tree.py", () => {
  it("both accept the current tree", () => {
    expect(probe.baseline.errors).toEqual([]);
    expect(compileTree(loadRaw(), exprLib).errors).toEqual([]);
  });

  it("has the same nodes in the same order with the same references", () => {
    const b = probe.baseline;
    expect(tree.nodeOrder).toEqual(b.node_order);
    for (const id of tree.nodeOrder) {
      const n = tree.nodes[id]!;
      const p = b.nodes[id]!;
      expect({ id, stage: n.stage, beat: n.beat, kind: n.kind, workshop: n.workshop ?? null }).toEqual({ id, stage: p.stage, beat: p.beat, kind: p.kind, workshop: p.workshop });
      expect(n.requires.nodes, id).toEqual(p.requires_nodes);
      expect(n.requires.anyOf, id).toEqual(p.any_of);
      expect(Object.keys(n.requires.resources).sort(), id).toEqual(p.resources);
      expect(n.readsState, id).toEqual(p.reads_state);
      expect(n.writesState.map((w) => w.variable), id).toEqual(p.writes_state);
      expect(n.pagesBundle, id).toEqual(p.pages_bundle === "none" ? null : p.pages_bundle);
      expect(n.unlocks.jobs, id).toEqual(p.jobs);
    }
  });

  it("merges the same workshops and dials, and sees the same pressures and gates", () => {
    const b = probe.baseline;
    expect(Object.fromEntries(Object.values(tree.workshops).map((w) => [w.id, { opens_with: w.opensWith, dials: w.dials.map((d) => d.id) }]))).toEqual(b.workshops);
    for (const s of tree.stages) {
      expect(s.pressures.map((p) => [p.id, p.drives, p.answers])).toEqual(b.pressures[`stage${s.stage}`]);
      expect(s.gate.id).toBe(b.gates[`stage${s.stage}`]);
    }
  });

  it("declares the same state variables, resources, bundles and starting jobs", () => {
    const b = probe.baseline;
    expect(Object.fromEntries(Object.values(tree.stateVariables).map((v) => [v.id, v.type]))).toEqual(b.state_vars);
    expect(Object.fromEntries(Object.values(tree.resources).map((r) => [r.id, r.producedBy]))).toEqual(b.resources);
    const bundles = [...new Set(["none", ...tree.draft.pages.flatMap((c) => [c.id, ...c.topics.map((t) => t.id)])])].sort();
    expect(bundles).toEqual(b.bundle_ids);
    const starting = tree.stages.flatMap((s) => s.startingJobs).sort();
    expect(starting).toEqual(b.starting_jobs);
  });

  it("classifies every identifier in a condition against the validator's declarations", () => {
    const b = probe.baseline;
    for (const [name, kind] of Object.entries(tree.identifiers)) {
      const expected = name in b.resources ? "resource" : name in b.state_vars ? "state" : "undeclared";
      expect(kind, name).toBe(expected);
    }
  });

  for (const m of mutations) {
    it(`both reject: ${m.name}`, () => {
      const validatorErrors = probe.mutations[m.name]!;
      expect(validatorErrors.length, `validator accepted "${m.name}"`).toBeGreaterThan(0);
      const { errors } = compileTree(applyMutation(loadRaw(), m), exprLib);
      expect(errors.length, `loader accepted "${m.name}"; validator said ${validatorErrors.join("; ")}`).toBeGreaterThan(0);
    });
  }
});
