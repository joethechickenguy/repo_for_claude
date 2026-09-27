// Build the engine's input from package B's compiled tree. The tree has no structured job rates or
// tool lifetimes yet (the stage YAML carries them as comments; see tech-tree/open-questions.md,
// engine section), so the caller supplies those as extras until the YAML does.
import type { Tree } from "../content/types";
import type {
  DepartmentDef,
  EngineContent,
  EngineParams,
  JobDef,
  ResourceAmounts,
  ResourceDef,
  StateBindings,
  StateVarDef,
  ToolDef,
  WorksDef,
} from "./types";

export interface EngineExtras {
  /** Job rates. Jobs in the tree without an entry here run with no inputs or outputs. */
  jobs: JobDef[];
  tools: ToolDef[];
  /** Resources the tree uses but doesn't declare (e.g. ore_kg, copper_tools). */
  resources?: ResourceDef[];
  works?: WorksDef[];
  departments?: DepartmentDef[];
  initialStocks?: ResourceAmounts;
  params?: Partial<EngineParams>;
  bindings?: Partial<StateBindings>;
}

export interface TreeContent {
  content: EngineContent;
  /** Tree jobs with no rates in `extras.jobs` (they can be staffed but make nothing). */
  jobsWithoutRates: string[];
}

/** Count variables people can be trained into: `trained_*` and `*_trained`. */
export const TRADE_PATTERN = /^trained_|_trained$/;

/** Engine content for a run starting at `stage` (default: the first stage in the tree). */
export function contentFromTree(tree: Tree, extras: EngineExtras, stage?: number): TreeContent {
  const start = stage === undefined ? tree.stages[0] : tree.stages.find((s) => s.stage === stage);
  if (!start) throw new Error(`contentFromTree: no stage ${stage}`);

  const stateVars: StateVarDef[] = Object.values(tree.stateVariables).map((v) => ({
    id: v.id,
    type: v.type,
    ...(v.values ? { values: [...v.values] } : {}),
    ...(v.unit ? { unit: v.unit } : {}),
    ...(v.description ? { description: v.description } : {}),
    initial: v.default,
  }));

  const resources: ResourceDef[] = Object.values(tree.resources).map((r) => ({
    id: r.id,
    producedBy: r.producedBy,
    perishable: r.perishable,
  }));
  for (const r of extras.resources ?? []) if (!resources.some((x) => x.id === r.id)) resources.push(r);

  const rates = new Map(extras.jobs.map((j) => [j.id, j]));
  const jobs: JobDef[] = [];
  const jobsWithoutRates: string[] = [];
  for (const id of Object.keys(tree.jobs)) {
    const def = rates.get(id);
    if (def) jobs.push(def);
    else {
      jobs.push({ id });
      jobsWithoutRates.push(id);
    }
  }
  for (const j of extras.jobs) if (!jobs.some((x) => x.id === j.id)) jobs.push(j);

  const content: EngineContent = {
    population: tree.draft.peopleTotal,
    stateVars,
    resources,
    jobs,
    tools: extras.tools,
    startingJobs: [...start.startingJobs],
    trades: stateVars.filter((v) => v.type === "count" && TRADE_PATTERN.test(v.id)).map((v) => v.id),
    ...(extras.works ? { works: extras.works } : {}),
    ...(extras.departments ? { departments: extras.departments } : {}),
    ...(extras.initialStocks ? { initialStocks: extras.initialStocks } : {}),
    ...(extras.params ? { params: extras.params } : {}),
    ...(extras.bindings ? { bindings: extras.bindings } : {}),
  };
  return { content, jobsWithoutRates };
}
