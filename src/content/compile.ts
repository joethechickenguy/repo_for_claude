// Compile the parsed tech-tree YAML into a Tree. Runs at build time (scripts/build-content.mjs)
// and in tests. It reports every error tools/validate_tree.py reports, plus one more: a
// `requires.state` or gate condition that does not parse.
//
// Only type imports here: the build script loads this file with Node's type stripping, which can't
// resolve extensionless relative imports, so the expression library is passed in.

import type * as ExprLib from "./expr";
import type { Expr } from "./expr";
import type {
  Condition,
  Dial,
  Draft,
  IdentifierKind,
  Job,
  LaborTier,
  NodeKind,
  Pressure,
  Resource,
  Stage,
  StateValue,
  StateVariable,
  StateVarType,
  StateWrite,
  Tree,
  TreeNode,
  Workshop,
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
  for (const r of Object.values(resources)) {
    const j = jobs[r.producedBy];
    if (j) j.produces.push(r.id);
    else if (nodeOrder.some((nid) => r.id in nodes[nid]!.requires.resources)) {
      errors.push(`resources.yaml: ${r.id} produced by '${r.producedBy}', which no node unlocks`);
    }
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
  };
  return { tree, errors, warnings };
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
