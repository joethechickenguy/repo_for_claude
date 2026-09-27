// Engine input for the real game, built only from the compiled tree (package B): job rates from the
// stage files' `jobs:` maps, tools from their `tools:` maps, fuels from resources.yaml. No numbers
// here: if one is missing, it belongs in tech-tree/ (open questions 25, 26).
import type { Tree } from "../content";
import { contentFromTree, type EngineContent, type EngineExtras, type JobDef, type ToolDef } from "../engine";
import type { FuelKind } from "../models/energy";

/** Engine jobs for every tree job with structured rates. */
export function jobDefsFromTree(tree: Tree): JobDef[] {
  const out: JobDef[] = [];
  for (const j of Object.values(tree.jobs)) {
    const r = j.rates;
    if (!r) continue;
    const def: JobDef = { id: j.id };
    if (r.inputs) def.inputs = { ...r.inputs };
    if (r.outputs) def.outputs = { ...r.outputs };
    if (r.burns) def.burns = { ...r.burns };
    if (r.tool) def.tool = true;
    if (r.labor) def.labor = r.labor;
    out.push(def);
  }
  return out;
}

export function toolDefsFromTree(tree: Tree): ToolDef[] {
  return Object.values(tree.tools ?? {}).map((t) => ({
    resource: t.resource,
    lifeWorkerDays: t.lifeWorkerDays,
    ...(t.metal ? { metal: true } : {}),
  }));
}

/** resources.yaml `fuel:` -> the energy model's fuel kinds, for the EnergySystem. */
export function fuelsFromTree(tree: Tree): Record<string, FuelKind> {
  const out: Record<string, FuelKind> = {};
  for (const r of Object.values(tree.resources)) if (r.fuel) out[r.id] = r.fuel as FuelKind;
  return out;
}

/** Resources that are delivered shaft work, 1 kWh per unit (resources.yaml `work: true`). */
export function workFromTree(tree: Tree): string[] {
  return Object.values(tree.resources)
    .filter((r) => r.work)
    .map((r) => r.id);
}

export function extrasFromTree(tree: Tree): EngineExtras {
  return { jobs: jobDefsFromTree(tree), tools: toolDefsFromTree(tree) };
}

/** The engine content for a new run from the tree alone. */
export function gameContent(tree: Tree): EngineContent {
  return contentFromTree(tree, extrasFromTree(tree)).content;
}

/** Jobs that have structured rates (the ones worth a row in the people panel). */
export function jobHasRates(tree: Tree, id: string): boolean {
  return !!tree.jobs[id]?.rates;
}
