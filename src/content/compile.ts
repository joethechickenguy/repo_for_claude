// Compile the parsed tech-tree YAML into a Tree. Runs at build time (scripts/build-content.mjs)
// and in tests. It reports every error tools/validate_tree.py reports, plus one more: a
// `requires.state` or gate condition that does not parse.
//
// Only type imports here: the build script loads this file with Node's type stripping, which can't
// resolve extensionless relative imports, so the expression library is passed in.

import type * as ExprLib from "./expr";
import type { Expr } from "./expr";
import type {
  Choice,
  Condition,
  Dial,
  Draft,
  IdentifierKind,
  Job,
  JobRates,
  LaborTier,
  NodeKind,
  Pressure,
  PressureModifier,
  PressureModel,
  Resource,
  Stage,
  StateValue,
  StateVariable,
  StateVarType,
  StateWrite,
  ToolSpec,
  Tree,
  TreeNode,
  Workshop,
  WorkshopPlay,
  WorksSpec,
  DepartmentSpec,
} from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Y = any; // raw YAML

export interface RawStageFile {
  /** Basename, e.g. stage1-fire-and-stone.yaml. Files are compiled in the order given. */
  file: string;
  data: Y;
  /** Source text, used only to keep the per-job rate comments. */
  text?: string;
}

export interface RawContent {
  stages: RawStageFile[];
  /** Parsed state-variables.yaml (the whole document). */
  stateVariables: Y;
  /** Parsed resources.yaml. */
  resources: Y;
  /** Parsed draft.yaml. */
  draft: Y;
}

export interface CompileResult {
  tree: Tree;
  errors: string[];
  warnings: string[];
}

export type ExprLibrary = Pick<typeof ExprLib, "parseExpr" | "exprRefs" | "exprLeaves">;

// Mirrors tools/validate_tree.py.
const KINDS: readonly NodeKind[] = ["project", "upgrade", "decision_option", "gate", "hub", "workshop"];
const REQUIRED = ["id", "name", "stage", "beat", "kind", "critical_path", "problem", "requires", "notebook"];
const REQUIRED_NON_GATE = ["unlocks", "pages_bundle", "without_pages", "numbers_status"];
const LABOR_TIERS: readonly LaborTier[] = ["people", "works", "departments"];
const VAR_TYPES: readonly StateVarType[] = ["flag", "number", "count", "enum", "set"];

// Page coverage tiers documented in the comments of draft.yaml ("coverage >= 1.0: known;
// 0.5 <= c < 1.0: partial"). Used only when draft.yaml has no `coverage_tiers` map.
const DOC_COVERAGE_KNOWN = 1.0;
const DOC_COVERAGE_PARTIAL = 0.5;

const LABOR_FACTOR_RE = /(\d+(?:\.\d+)?)x labor/;
const TRAILING_NOTE_RE = /\s*\([^()]*\)\s*$/;

const arr = <T = Y>(v: Y): T[] => (Array.isArray(v) ? v : []);
const obj = (v: Y): Record<string, Y> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const str = (v: Y): string | undefined => (typeof v === "string" ? v : v === undefined || v === null ? undefined : String(v));

export function compileTree(raw: RawContent, lib: ExprLibrary): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- state variables, resources ------------------------------------------------------------------
  const stateVariables: Record<string, StateVariable> = {};
  for (const [id, m] of Object.entries(obj(obj(raw.stateVariables).variables))) {
    const meta = obj(m);
    const type = meta.type as StateVarType;
    if (!VAR_TYPES.includes(type)) errors.push(`state-variables.yaml: ${id} has unknown type ${JSON.stringify(meta.type)}`);
    const values = type === "enum" ? arr<string>(meta.values).map(String) : undefined;
    if (type === "enum" && !values?.length) errors.push(`state-variables.yaml: enum ${id} lists no values`);
    const v: StateVariable = { id, type, default: typeDefault(type, values) };
    if (values) v.values = values;
    if (meta.unit !== undefined) v.unit = String(meta.unit);
    if (meta.description !== undefined) v.description = String(meta.description);
    if (meta.default !== undefined) {
      if (defaultFits(type, values, meta.default)) v.default = meta.default as StateValue;
      else errors.push(`state-variables.yaml: ${id} default ${JSON.stringify(meta.default)} does not fit type ${type}`);
    }
    stateVariables[id] = v;
  }

  const resources: Record<string, Resource> = {};
  for (const [id, m] of Object.entries(obj(obj(raw.resources).resources))) {
    const meta = obj(m);
    const r: Resource = { id, producedBy: String(meta.produced_by), perishable: meta.perishable === true };
    if (meta.note !== undefined) r.note = String(meta.note);
    if (meta.name !== undefined) r.name = String(meta.name);
    if (meta.fuel !== undefined) r.fuel = String(meta.fuel);
    if (meta.work === true) r.work = true;
    if (meta.workshop !== undefined) r.workshop = String(meta.workshop);
    resources[id] = r;
  }

  // ---- draft --------------------------------------------------------------------------------------------
  const draft = compileDraft(obj(raw.draft), errors);
  const bundleIds = new Set<string>(["none"]);
  for (const c of draft.pages) {
    bundleIds.add(c.id);
    for (const t of c.topics) bundleIds.add(t.id);
  }

  // ---- nodes (first pass: shape) --------------------------------------------------------------------------
  const rawNodes = new Map<string, Y>();
  const nodeFile = new Map<string, string>();
  const nodeOrder: string[] = [];
  for (const { file, data } of raw.stages) {
    for (const n of arr(obj(data).nodes)) {
      const nid = str(n?.id) ?? "<missing id>";
      if (rawNodes.has(nid)) errors.push(`${file}: duplicate id ${nid}`);
      else nodeOrder.push(nid);
      rawNodes.set(nid, n);
      nodeFile.set(nid, file);
      const fields = [...REQUIRED, ...(n?.kind === "gate" || n?.kind === "hub" ? [] : REQUIRED_NON_GATE)];
      for (const f of fields) if (!(f in obj(n))) errors.push(`${file}: ${nid} missing field '${f}'`);
      if (!KINDS.includes(n?.kind)) errors.push(`${file}: ${nid} has unknown kind ${JSON.stringify(n?.kind)}`);
      if (n?.stage !== data?.stage) errors.push(`${file}: ${nid} stage != file stage`);
      for (const s of arr(n?.sources)) {
        if (!/^https?:\/\//.test(String(s))) errors.push(`${file}: ${nid} source is not a URL: ${s}`);
      }
      if (arr(n?.tags).includes("trap") && !("trap_lesson" in obj(n))) warnings.push(`${file}: trap ${nid} has no trap_lesson`);
    }
  }

  // ---- workshops (base + extends) --------------------------------------------------------------------------
  const workshops: Record<string, Workshop> = {};
  const stageWorkshops = new Map<string, string[]>();
  for (const { file, data } of raw.stages) {
    const ids: string[] = [];
    for (const w of arr(obj(data).workshops)) {
      const wid = String(w.id);
      ids.push(wid);
      const dials: Dial[] = arr(w.dials).map((d: Y) => compileDial(d, data.stage));
      if (w.extends) {
        const base = workshops[wid];
        if (!base) {
          errors.push(`${file}: workshop ${wid} extends nothing (no earlier base definition)`);
          continue;
        }
        base.dials.push(...dials);
        for (const o of arr(w.outputs).map(String)) if (!base.outputs.includes(o)) base.outputs.push(o);
        if (w.failure_rule !== undefined) base.failureRule = String(w.failure_rule);
        Object.assign(base.play, playOf(w.play));
        if (w.loop !== undefined) base.loop = String(w.loop);
      } else {
        if (workshops[wid]) errors.push(`${file}: workshop ${wid} defined twice; use extends: true`);
        if (!rawNodes.has(w.opens_with)) errors.push(`${file}: workshop ${wid} opens_with unknown node ${JSON.stringify(w.opens_with ?? null)}`);
        const ws: Workshop = {
          id: wid,
          name: String(w.name ?? wid),
          opensWith: String(w.opens_with),
          loop: String(w.loop ?? ""),
          outputs: arr(w.outputs).map(String),
          stage: data.stage,
          dials,
          play: playOf(w.play),
        };
        if (w.failure_rule !== undefined) ws.failureRule = String(w.failure_rule);
        workshops[wid] = ws;
      }
      for (const d of arr(w.dials)) {
        if (!rawNodes.has(d?.added_by)) errors.push(`${file}: dial ${wid}.${d?.id} added_by unknown node ${JSON.stringify(d?.added_by ?? null)}`);
      }
    }
    stageWorkshops.set(file, ids);
  }
  for (const [nid, n] of rawNodes) {
    if (n?.kind === "workshop" && !workshops[n.workshop]) errors.push(`${nid} names unknown workshop ${JSON.stringify(n.workshop ?? null)}`);
  }

  // ---- expressions --------------------------------------------------------------------------------------------
  const identifiers: Record<string, IdentifierKind> = {};
  const undeclaredUsers = new Map<string, string[]>();
  const classify = (name: string, user: string): IdentifierKind => {
    const kind: IdentifierKind = name in resources ? "resource" : name in stateVariables ? "state" : "undeclared";
    if (name in resources && name in stateVariables) warnings.push(`${name} is both a resource and a state variable; conditions read the stock`);
    identifiers[name] = kind;
    if (kind === "undeclared") {
      const users = undeclaredUsers.get(name) ?? [];
      if (!users.includes(user)) users.push(user);
      undeclaredUsers.set(name, users);
    }
    return kind;
  };
  const checkLeaves = (e: Expr, where: string) => {
    for (const leaf of lib.exprLeaves(e)) {
      if (leaf.kind === "not" || leaf.kind === "and" || leaf.kind === "or") continue;
      const kind = classify(leaf.ref, where);
      const sv = stateVariables[leaf.ref];
      if (kind === "resource") {
        if (leaf.kind !== "cmp" || typeof leaf.value !== "number") warnings.push(`${where}: resource ${leaf.ref} is a stock; compare it with a number`);
        continue;
      }
      if (!sv) continue;
      if (leaf.kind === "has") {
        if (sv.type !== "set") warnings.push(`${where}: '${leaf.ref} has ...' on a ${sv.type}`);
        if (leaf.ref === "bundles_taken" && !bundleIds.has(leaf.member)) {
          warnings.push(`${where}: bundles_taken has ${leaf.member}, which is not a topic or category in draft.yaml (never true)`);
        }
      } else if (leaf.kind === "flag") {
        if (sv.type !== "flag") warnings.push(`${where}: bare ${leaf.ref} tests a ${sv.type} as a flag`);
      } else if (leaf.kind === "cmp") {
        const lit = leaf.value;
        const ok =
          sv.type === "flag"
            ? typeof lit === "boolean" && (leaf.op === "==" || leaf.op === "!=")
            : sv.type === "number" || sv.type === "count"
              ? typeof lit === "number"
              : sv.type === "enum"
                ? typeof lit === "string" && (leaf.op === "==" || leaf.op === "!=") && !!sv.values?.includes(lit)
                : false;
        if (!ok) warnings.push(`${where}: '${leaf.ref} ${leaf.op} ${String(lit)}' does not fit ${sv.type}${sv.values ? ` [${sv.values.join(", ")}]` : ""}`);
      }
    }
  };
  const condition = (text: Y, where: string): Condition | null => {
    const src = String(text);
    try {
      const expr = lib.parseExpr(src);
      checkLeaves(expr, where);
      return { text: src, expr };
    } catch (err) {
      errors.push(`${where}: cannot parse state condition ${JSON.stringify(src)}: ${(err as Error).message}`);
      return null;
    }
  };

  // ---- nodes (second pass: references and compile) --------------------------------------------------------------
  const declared = (v: string) => Object.prototype.hasOwnProperty.call(stateVariables, v);
  const nodes: Record<string, TreeNode> = {};
  for (const nid of nodeOrder) {
    const n = rawNodes.get(nid);
    const req = obj(n.requires);
    const direct = arr(req.nodes).map(String);
    const anyOf = arr(req.any_of).map((g: Y) => arr(g).map(String));
    for (const p of [...direct, ...anyOf.flat()]) {
      const pn = rawNodes.get(p);
      if (!pn) errors.push(`${nid}: unknown prerequisite ${p}`);
      else if (pn.stage > n.stage) errors.push(`${nid} (stage ${n.stage}) requires ${p} from later stage ${pn.stage}`);
    }
    const readsState = arr(n.reads_state).map(String);
    const writesNames = arr(n.writes_state).map(String);
    for (const v of [...readsState, ...writesNames]) {
      if (!declared(v)) errors.push(`${nid}: state variable '${v}' not declared in state-variables.yaml`);
    }
    const bundle = n.pages_bundle;
    if (bundle !== undefined && bundle !== null && !bundleIds.has(String(bundle))) errors.push(`${nid}: unknown pages_bundle '${bundle}'`);

    const resCost: Record<string, number> = {};
    for (const [r, amount] of Object.entries(obj(req.resources))) {
      if (!(r in resources)) errors.push(`${nid}: resource '${r}' not declared in resources.yaml`);
      resCost[r] = Number(amount);
    }
    const state = arr(req.state)
      .map((s: Y) => condition(s, nid))
      .filter((c: Condition | null): c is Condition => c !== null);

    const writesValues = obj(n.writes_values);
    for (const v of Object.keys(writesValues)) {
      if (!writesNames.includes(v)) warnings.push(`${nid}: writes_values names ${v}, which is not in writes_state`);
    }
    const writesState: StateWrite[] = writesNames.map((v) => ({ variable: v, value: writeValue(nid, v, stateVariables[v], writesValues, warnings) }));

    const withoutPages = str(n.without_pages);
    let factor: number | null = null;
    if (typeof n.without_pages_labor === "number") factor = n.without_pages_labor;
    else if (withoutPages) {
      const m = LABOR_FACTOR_RE.exec(withoutPages);
      if (m) factor = Number(m[1]);
    }

    const node: TreeNode = {
      id: nid,
      name: String(n.name ?? nid),
      stage: Number(n.stage),
      beat: Number(n.beat),
      kind: n.kind,
      route: arr(n.route).map(String),
      criticalPath: n.critical_path === true,
      problem: String(n.problem ?? ""),
      requires: {
        nodes: direct,
        anyOf,
        state,
        resources: resCost,
        laborPersonDays: typeof req.labor_person_days === "number" ? req.labor_person_days : 0,
      },
      milestones: arr(n.milestones)
        .map((m: Y) => ({ at: Number(m.at), id: String(m.id), effect: String(m.effect ?? "") }))
        .sort((a, b) => a.at - b.at),
      unlocks: { jobs: arr(obj(n.unlocks).jobs).map(String), effects: arr(obj(n.unlocks).effects).map(String) },
      readsState,
      writesState,
      pagesBundle: bundle === undefined || bundle === null || bundle === "none" ? null : String(bundle),
      withoutPagesLaborFactor: factor,
      sources: arr(n.sources).map(String),
      tags: arr(n.tags).map(String),
      notebook: String(n.notebook ?? "").trim(),
    };
    for (const m of node.milestones) {
      if (!(m.at > 0 && m.at <= 1)) errors.push(`${nid}: milestone ${m.id} at ${m.at} is not a fraction in (0, 1]`);
    }
    if (n.workshop !== undefined) node.workshop = String(n.workshop);
    if (withoutPages !== undefined) node.withoutPages = withoutPages;
    if (n.numbers_status !== undefined) node.numbersStatus = String(n.numbers_status);
    if (n.trap_lesson !== undefined) node.trapLesson = String(n.trap_lesson);
    if (n.tradeoff !== undefined) node.tradeoff = String(n.tradeoff);
    if (n.log !== undefined) node.log = String(n.log);
    if (n.modifiers !== undefined) node.modifiers = parseModifiers(n.modifiers, `${nid}: modifiers`, errors);
    if (n.pressure_per_day !== undefined) {
      const ppd: Record<string, number> = {};
      for (const [pid, v] of Object.entries(obj(n.pressure_per_day))) {
        if (typeof v !== "number") errors.push(`${nid}: pressure_per_day.${pid} must be a number`);
        ppd[pid] = Number(v);
      }
      node.pressurePerDay = ppd;
    }
    if (n.pressure_scale !== undefined) {
      const ps: Record<string, number> = {};
      for (const [pid, v] of Object.entries(obj(n.pressure_scale))) {
        if (typeof v !== "number" || v < 0) errors.push(`${nid}: pressure_scale.${pid} must be a number >= 0`);
        ps[pid] = Number(v);
      }
      node.pressureScale = ps;
    }
    if (n.adjusts_state !== undefined) {
      const adj: Record<string, number> = {};
      for (const [v, d] of Object.entries(obj(n.adjusts_state))) {
        const sv = stateVariables[v];
        if (!sv) errors.push(`${nid}: adjusts_state names undeclared variable ${JSON.stringify(v)}`);
        else if (sv.type !== "number" && sv.type !== "count") errors.push(`${nid}: adjusts_state ${v} is a ${sv.type}, not a number`);
        if (typeof d !== "number") errors.push(`${nid}: adjusts_state.${v} must be a number`);
        adj[v] = Number(d);
      }
      node.adjustsState = adj;
    }
    nodes[nid] = node;
  }

  // cycles (same walk as the validator)
  const color = new Map<string, number>();
  const prereqsOf = (id: string): string[] => {
    const n = nodes[id];
    return n ? [...n.requires.nodes, ...n.requires.anyOf.flat()] : [];
  };
  const visit = (nid: string, stack: string[]) => {
    color.set(nid, 1);
    for (const p of prereqsOf(nid)) {
      if (!nodes[p]) continue;
      if (color.get(p) === 1) errors.push("cycle: " + [...stack, p].join(" -> "));
      else if (color.get(p) === undefined) visit(p, [...stack, p]);
    }
    color.set(nid, 2);
  };
  for (const nid of nodeOrder) if (color.get(nid) === undefined) visit(nid, [nid]);

  // ---- stages, pressures, gates ----------------------------------------------------------------------------------
  const stages: Stage[] = [];
  for (const { file, data } of raw.stages) {
    const d = obj(data);
    const stageNo = Number(d.stage);
    const laborTier = d.labor_tier as LaborTier;
    if (!LABOR_TIERS.includes(laborTier)) errors.push(`${file}: labor_tier must be people | works | departments`);
    const pressures: Pressure[] = arr(d.pressures).map((pr: Y) => {
      if (!declared(pr.drives)) errors.push(`${file}: pressure ${pr.id} drives undeclared variable ${JSON.stringify(pr.drives ?? null)}`);
      for (const a of arr(pr.answers)) {
        if (!rawNodes.has(a) && !workshops[a]) errors.push(`${file}: pressure ${pr.id} answer ${JSON.stringify(a)} is not a node or workshop`);
      }
      return {
        id: String(pr.id),
        stage: stageNo,
        name: String(pr.name ?? pr.id),
        drives: String(pr.drives),
        heartbeat: pr.heartbeat === true || d.heartbeat === pr.id,
        risesWith: arr(pr.rises_with).map(String),
        redWhen: { text: String(pr.red_when ?? ""), expr: proseOrExpr(String(pr.red_when ?? ""), lib, (name) => name in resources || declared(name)) },
        effectWhenRed: String(pr.effect_when_red ?? ""),
        answers: arr(pr.answers).map(String),
        introducedInBeat: Number(pr.introduced_in_beat ?? 1),
        ...pressureExtras(pr, `${file}: pressure ${pr.id}`, errors, stateVariables),
      };
    });
    const hb = d.heartbeat;
    if (hb && !pressures.some((p) => p.id === hb)) errors.push(`${file}: heartbeat ${JSON.stringify(hb)} is not one of the stage's pressures`);

    const g = obj(d.gate);
    const gateConds: Condition[] = [];
    for (const [key, val] of Object.entries(obj(g.condition))) {
      if (key === "state") {
        for (const s of arr(val)) {
          const c = condition(s, `gate ${g.id}`);
          if (c) gateConds.push(c);
        }
      } else if (typeof val === "number") {
        const c = condition(`${key} >= ${val}`, `gate ${g.id}`);
        if (c) gateConds.push(c);
      } else {
        warnings.push(`${file}: gate condition ${key} is not a number or state list; ignored`);
      }
    }
    if (!rawNodes.has(g.id)) errors.push(`${file}: gate ${g.id} is not a node`);
    const gate: Stage["gate"] = { id: String(g.id), name: String(g.name ?? g.id), condition: gateConds, routes: arr(g.routes).map(String) };
    if (g.banner !== undefined) gate.banner = String(g.banner);
    if (g.score !== undefined) gate.score = String(g.score);

    stages.push({
      stage: stageNo,
      file,
      name: String(d.name ?? ""),
      openingProblem: String(d.opening_problem ?? ""),
      heartbeat: typeof hb === "string" ? hb : null,
      laborTier,
      startingJobs: arr(d.starting_jobs).map(String),
      gate,
      pressures,
      workshops: stageWorkshops.get(file) ?? [],
      nodes: arr(d.nodes).map((n: Y) => String(n?.id)),
    });
  }

  for (const [name, users] of undeclaredUsers) {
    warnings.push(`'${name}' is used in conditions (${users.join(", ")}) but is neither a state variable nor a resource; the engine must provide it`);
  }

  // ---- jobs ------------------------------------------------------------------------------------------------------------
  const rateNotes = new Map<string, string>();
  for (const { text } of raw.stages) {
    for (const line of (text ?? "").split("\n")) {
      const m = /^\s*jobs:\s*\[([^\]]*)\]\s*#\s*(.+?)\s*$/.exec(line);
      if (!m) continue;
      for (const j of m[1]!.split(",").map((s) => s.trim()).filter(Boolean)) if (!rateNotes.has(j)) rateNotes.set(j, m[2]!);
    }
  }
  const jobs: Record<string, Job> = {};
  const job = (id: string, stage: number): Job => {
    let j = jobs[id];
    if (!j) {
      j = { id, startingInStage: null, unlockedBy: [], stage, produces: [] };
      const note = rateNotes.get(id);
      if (note) j.rateNote = note;
      jobs[id] = j;
    }
    j.stage = Math.min(j.stage, stage);
    return j;
  };
  for (const s of stages) {
    for (const id of s.startingJobs) {
      const j = job(id, s.stage);
      j.startingInStage = j.startingInStage === null ? s.stage : Math.min(j.startingInStage, s.stage);
    }
  }
  for (const nid of nodeOrder) {
    const n = nodes[nid]!;
    for (const id of n.unlocks.jobs) job(id, n.stage).unlockedBy.push(nid);
  }
  // Structured rates and texts: each stage file's `jobs:` map (open question 25) and `tools:` map (26).
  const tools: Record<string, ToolSpec> = {};
  for (const { file, data } of raw.stages) {
    const d = obj(data);
    for (const [id, m] of Object.entries(obj(d.jobs))) {
      const meta = obj(m);
      const j = jobs[id];
      if (!j) {
        errors.push(`${file}: jobs.${id} is not a starting job or unlocked by any node`);
        continue;
      }
      if (meta.name !== undefined) j.name = String(meta.name);
      if (meta.what !== undefined) j.what = String(meta.what);
      if (meta.why !== undefined) j.why = String(meta.why);
      const rates: JobRates = {};
      for (const part of ["inputs", "outputs", "burns"] as const) {
        const amounts = obj(meta[part]);
        if (!Object.keys(amounts).length) continue;
        const out: Record<string, number> = {};
        for (const [r, v] of Object.entries(amounts)) {
          if (!(r in resources)) errors.push(`${file}: jobs.${id}.${part} names ${JSON.stringify(r)}, not in resources.yaml`);
          if (typeof v !== "number" || !(v >= 0)) errors.push(`${file}: jobs.${id}.${part}.${r} must be a number >= 0`);
          out[r] = Number(v);
        }
        rates[part] = out;
      }
      if (meta.tool === true) rates.tool = true;
      if (meta.labor !== undefined) rates.labor = String(meta.labor);
      if (Object.keys(rates).length) j.rates = rates;
    }
    for (const [res, m] of Object.entries(obj(d.tools))) {
      const meta = obj(m);
      if (!(res in resources)) errors.push(`${file}: tools.${res} is not in resources.yaml`);
      const life = Number(meta.life_worker_days);
      if (!(life > 0)) errors.push(`${file}: tools.${res}.life_worker_days must be > 0`);
      tools[res] = { resource: res, lifeWorkerDays: life, metal: meta.metal === true };
    }
  }
  for (const s of stages)
    for (const p of s.pressures)
      for (const j of Object.keys(p.model?.perWorker ?? {}))
        if (!jobs[j]) errors.push(`${s.file}: pressure ${p.id} model.per_worker names unknown job ${JSON.stringify(j)}`);
  for (const s of stages)
    for (const p of s.pressures)
      for (const m of p.redModifiers ?? [])
        if ((m.kind === "rate" || m.kind === "yield") && !jobs[m.target] && m.target !== "*")
          errors.push(`${s.file}: pressure ${p.id} red_modifiers names unknown job ${JSON.stringify(m.target)}`);

  for (const r of Object.values(resources)) {
    const j = jobs[r.producedBy];
    if (j) j.produces.push(r.id);
    else if (nodeOrder.some((nid) => r.id in nodes[nid]!.requires.resources)) {
      errors.push(`resources.yaml: ${r.id} produced by '${r.producedBy}', which no node unlocks`);
    }
  }

  // Exclusive choices (stage `choices:`), and the references in node modifiers / pressure_per_day / pressure_scale.
  const choices: Record<string, Choice> = {};
  for (const { file, data } of raw.stages) {
    const d = obj(data);
    for (const c of arr(d.choices)) {
      const id = String(c?.id ?? "");
      if (!id) {
        errors.push(`${file}: a choice has no id`);
        continue;
      }
      if (choices[id]) errors.push(`${file}: duplicate choice ${id}`);
      const options = arr(c.options).map(String);
      if (options.length < 2) errors.push(`${file}: choice ${id} needs at least two options`);
      for (const o of options) {
        const n = nodes[o];
        if (!n) errors.push(`${file}: choice ${id} names unknown node ${JSON.stringify(o)}`);
        else if (n.choice) errors.push(`${file}: node ${o} is an option of two choices (${n.choice}, ${id})`);
        else if (n.stage !== Number(d.stage)) errors.push(`${file}: choice ${id} option ${o} is in another stage`);
        else n.choice = id;
      }
      choices[id] = { id, stage: Number(d.stage), prompt: String(c.prompt ?? ""), options };
    }
  }
  // Works and departments (stage `works:` / `departments:`): the labor tiers' facilities.
  const works: WorksSpec[] = [];
  const departments: DepartmentSpec[] = [];
  for (const { file, data } of raw.stages) {
    const d = obj(data);
    for (const w of arr(d.works)) {
      const id = String(w?.id ?? "");
      const spec: WorksSpec = {
        id,
        name: String(w?.name ?? id),
        output: String(w?.output ?? ""),
        primaryJob: String(w?.primary_job ?? ""),
        supportJobs: arr(w?.support_jobs).map(String),
        stage: Number(d.stage),
      };
      if (w?.department !== undefined) spec.department = String(w.department);
      if (!id || works.some((x) => x.id === id)) errors.push(`${file}: works ${JSON.stringify(id)} has no id or is defined twice`);
      if (!(spec.output in resources)) errors.push(`${file}: works ${id} output ${JSON.stringify(spec.output)} is not a resource`);
      for (const j of [spec.primaryJob, ...spec.supportJobs]) if (!jobs[j]?.rates) errors.push(`${file}: works ${id} job ${JSON.stringify(j)} has no rates`);
      if (!jobs[spec.primaryJob]?.rates?.outputs?.[spec.output]) errors.push(`${file}: works ${id}: ${spec.primaryJob} doesn't make ${spec.output}`);
      works.push(spec);
    }
    for (const dp of arr(d.departments)) {
      const id = String(dp?.id ?? "");
      if (!id || departments.some((x) => x.id === id)) errors.push(`${file}: department ${JSON.stringify(id)} has no id or is defined twice`);
      departments.push({ id, name: String(dp?.name ?? id), priority: Number(dp?.priority ?? 0) });
    }
  }
  for (const w of works) if (w.department && !departments.some((x) => x.id === w.department)) errors.push(`works ${w.id}: unknown department ${w.department}`);

  const pressureIds = new Set(stages.flatMap((s) => s.pressures.map((p) => p.id)));
  for (const nid of nodeOrder) {
    const n = nodes[nid]!;
    for (const m of n.modifiers ?? []) {
      if ((m.kind === "rate" || m.kind === "yield") && !jobs[m.target] && m.target !== "*")
        errors.push(`${nid}: modifiers.${m.kind} names unknown job ${JSON.stringify(m.target)}`);
      if (m.kind === "toolLife" && !tools[m.target]) errors.push(`${nid}: modifiers.toolLife names ${JSON.stringify(m.target)}, not a tool`);
    }
    for (const pid of Object.keys(n.pressurePerDay ?? {}))
      if (!pressureIds.has(pid)) errors.push(`${nid}: pressure_per_day names unknown pressure ${JSON.stringify(pid)}`);
    for (const pid of Object.keys(n.pressureScale ?? {}))
      if (!pressureIds.has(pid)) errors.push(`${nid}: pressure_scale names unknown pressure ${JSON.stringify(pid)}`);
  }

  const tree: Tree = {
    version: 1,
    stages,
    nodes,
    nodeOrder,
    stateVariables,
    resources,
    jobs,
    workshops,
    draft,
    identifiers: Object.fromEntries(Object.entries(identifiers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    warnings,
    tools,
    choices,
    ...(works.length ? { works } : {}),
    ...(departments.length ? { departments } : {}),
  };
  return { tree, errors, warnings };
}

const MODIFIER_KINDS: readonly PressureModifier["kind"][] = ["rate", "yield", "toolLife", "training"];

/** A pressure's optional `model:` and `red_modifiers:` (package F; see PressureModel). */
function pressureExtras(pr: Y, where: string, errors: string[], stateVariables: Record<string, StateVariable>): { model?: PressureModel; redModifiers?: PressureModifier[] } {
  const out: { model?: PressureModel; redModifiers?: PressureModifier[] } = {};
  const nums = (v: Y, what: string): Record<string, number> => {
    const r: Record<string, number> = {};
    for (const [k, x] of Object.entries(obj(v))) {
      if (typeof x !== "number") errors.push(`${where}: ${what}.${k} must be a number`);
      r[k] = Number(x);
    }
    return r;
  };
  if (pr.model !== undefined) {
    const m = obj(pr.model);
    const model: PressureModel = {
      perUnitProduced: nums(m.per_unit_produced, "model.per_unit_produced"),
      perUnitConsumed: nums(m.per_unit_consumed, "model.per_unit_consumed"),
      perDay: typeof m.per_day === "number" ? m.per_day : 0,
    };
    if (m.per_worker !== undefined) model.perWorker = nums(m.per_worker, "model.per_worker");
    if (m.per_state !== undefined) {
      model.perState = nums(m.per_state, "model.per_state");
      for (const k of Object.keys(model.perState)) if (!(k in stateVariables)) errors.push(`${where}: model.per_state.${k} is not a declared state variable`);
    }
    if (typeof m.min === "number") model.min = m.min;
    if (typeof m.max === "number") model.max = m.max;
    if (m.flow === true) model.flow = true;
    out.model = model;
  }
  if (pr.red_modifiers !== undefined) out.redModifiers = parseModifiers(pr.red_modifiers, `${where}: red_modifiers`, errors);
  return out;
}

/** `{rate: {job: 0.5}, toolLife: {blades: 2.5}}` -> modifiers (pressure `red_modifiers`, node `modifiers`). */
function parseModifiers(v: Y, where: string, errors: string[]): PressureModifier[] {
  const mods: PressureModifier[] = [];
  for (const [kind, targets] of Object.entries(obj(v))) {
    if (!MODIFIER_KINDS.includes(kind as PressureModifier["kind"])) {
      errors.push(`${where} kind ${JSON.stringify(kind)} is not one of ${MODIFIER_KINDS.join(", ")}`);
      continue;
    }
    for (const [target, f] of Object.entries(obj(targets))) {
      if (typeof f !== "number" || !(f >= 0)) errors.push(`${where}.${kind}.${target} must be a number >= 0`);
      mods.push({ kind: kind as PressureModifier["kind"], target, factor: Number(f) });
    }
  }
  return mods;
}

function typeDefault(type: StateVarType, values: string[] | undefined): StateValue {
  switch (type) {
    case "flag":
      return false;
    case "number":
    case "count":
      return 0;
    case "enum":
      return values?.[0] ?? "";
    case "set":
      return [];
  }
}

function defaultFits(type: StateVarType, values: string[] | undefined, v: Y): boolean {
  switch (type) {
    case "flag":
      return typeof v === "boolean";
    case "number":
    case "count":
      return typeof v === "number";
    case "enum":
      return typeof v === "string" && !!values?.includes(v);
    case "set":
      return Array.isArray(v) || (typeof v === "object" && v !== null);
  }
}

function writeValue(nid: string, v: string, sv: StateVariable | undefined, explicit: Record<string, Y>, warnings: string[]): StateValue | null {
  if (!sv) return null;
  if (v in explicit) {
    const val = explicit[v];
    if (defaultFits(sv.type, sv.values, val)) return val as StateValue;
    warnings.push(`${nid}: writes_values ${v}: ${JSON.stringify(val)} does not fit ${sv.type}`);
    return null;
  }
  if (sv.type === "flag") return true;
  if (sv.type === "enum") {
    const hits = (sv.values ?? []).filter((val) => `_${nid}_`.includes(`_${val}_`));
    if (hits.length === 1) return hits[0]!;
    warnings.push(`${nid}: writes enum ${v} but names none of [${(sv.values ?? []).join(", ")}]; the engine or the player's choice sets it`);
  }
  return null;
}

/** Parse `red_when` when it is an expression over known names; prose (and a trailing "(note)") gives null. */
function proseOrExpr(text: string, lib: ExprLibrary, known: (name: string) => boolean): Expr | null {
  for (const candidate of [text, text.replace(TRAILING_NOTE_RE, "")]) {
    try {
      const e = lib.parseExpr(candidate);
      if (lib.exprRefs(e).every(known)) return e;
    } catch {
      // prose
    }
  }
  return null;
}

/** A workshop's `play:` block as plain JSON (dropping anything YAML-only, like dates or nulls). */
function playOf(v: Y): WorkshopPlay {
  return JSON.parse(JSON.stringify(obj(v), (_k, x) => (x === null ? undefined : x))) as WorkshopPlay;
}

function compileDial(d: Y, stage: number): Dial {
  const dial: Dial = {
    id: String(d.id),
    name: String(d.name ?? d.id),
    addedBy: String(d.added_by),
    effect: String(d.effect ?? ""),
    basis: String(d.basis ?? ""),
    stage,
  };
  if (Array.isArray(d.options)) dial.options = d.options.map(String);
  if (Array.isArray(d.range) && d.range.length === 2) dial.range = [Number(d.range[0]), Number(d.range[1])];
  return dial;
}

function compileDraft(d: Record<string, Y>, errors: string[]): Draft {
  const tiers = obj(d.coverage_tiers);
  const draft: Draft = {
    peopleTotal: Number(d.people_total),
    pageBudget: Number(d.page_budget),
    roster: arr(d.roster).map((r: Y) => {
      const pool = {
        id: String(r.id),
        name: String(r.name),
        default: Number(r.default),
        thin: Number(r.thin ?? 0),
        full: Number(r.full),
        absent: String(r.absent ?? ""),
        specialties: arr(r.specialties).map((s: Y) => ({ id: String(s.id), name: String(s.name), full: Number(s.full), speeds: String(s.speeds ?? "") })),
      };
      return r.note !== undefined ? { ...pool, note: String(r.note) } : pool;
    }),
    pages: arr(d.pages).map((c: Y) => ({
      id: String(c.id),
      name: String(c.name),
      default: Number(c.default),
      topics: arr(c.topics).map((t: Y) => ({ id: String(t.id), name: String(t.name), full: Number(t.full), skips: String(t.skips ?? "") })),
    })),
    areas: arr(d.areas).map((a: Y) => ({ id: String(a.id), name: String(a.name), roster: String(a.roster), pages: String(a.pages) })),
    coverageTiers: {
      known: typeof tiers.known === "number" ? tiers.known : DOC_COVERAGE_KNOWN,
      partial: typeof tiers.partial === "number" ? tiers.partial : DOC_COVERAGE_PARTIAL,
    },
  };
  // Mirrors the validator's draft checks.
  const rosterIds = new Set(draft.roster.map((r) => r.id));
  const catIds = new Set(draft.pages.map((c) => c.id));
  for (const a of draft.areas) {
    if (!rosterIds.has(a.roster) || !catIds.has(a.pages)) errors.push(`draft.yaml: area ${a.id} references unknown roster or pages category`);
  }
  const specIds = new Set<string>();
  for (const r of draft.roster) {
    for (const s of r.specialties) {
      if (specIds.has(s.id)) errors.push(`draft.yaml: duplicate specialty id ${s.id}`);
      specIds.add(s.id);
    }
    if (r.specialties.length && r.specialties.reduce((t, s) => t + s.full, 0) !== r.full) {
      errors.push(`draft.yaml: pool ${r.id} specialties' full sizes do not sum to the pool's full`);
    }
  }
  if (draft.roster.reduce((t, r) => t + r.default, 0) !== draft.peopleTotal) errors.push("draft.yaml: roster defaults do not sum to people_total");
  if (draft.pages.reduce((t, c) => t + c.default, 0) !== draft.pageBudget) errors.push("draft.yaml: page defaults do not sum to page_budget");
  return draft;
}
