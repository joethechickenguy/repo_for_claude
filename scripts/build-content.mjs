// Package B: read tech-tree/*.yaml and write src/content/tree.json (typed by src/content/types.ts).
// Loads the same files tools/validate_tree.py treats as canonical: stages/stage*.yaml (sorted by
// file name), state-variables.yaml, resources.yaml, draft.yaml. Exits 1 on any error.
//
// The compiler and parser are TypeScript, loaded with Node's built-in type stripping (Node >= 22.18).
//
// Usage: node scripts/build-content.mjs [--quiet]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const treeDir = join(root, "tech-tree");
const out = join(root, "src", "content", "tree.json");
const quiet = process.argv.includes("--quiet");

const lib = await import("../src/content/expr.ts");
const { compileTree } = await import("../src/content/compile.ts");

const read = (p) => readFileSync(p, "utf8");
const load = (p) => yaml.load(read(p));

const stageFiles = readdirSync(join(treeDir, "stages"))
  .filter((f) => /^stage.*\.yaml$/.test(f))
  .sort();
const raw = {
  stages: stageFiles.map((file) => {
    const text = read(join(treeDir, "stages", file));
    return { file, data: yaml.load(text), text };
  }),
  stateVariables: load(join(treeDir, "state-variables.yaml")),
  resources: load(join(treeDir, "resources.yaml")),
  draft: load(join(treeDir, "draft.yaml")),
};

const { tree, errors, warnings } = compileTree(raw, lib);
if (!quiet) for (const w of warnings) console.log("warning:", w);
for (const e of errors) console.error("error:", e);
if (errors.length) {
  console.error(`build-content: ${errors.length} errors; tree.json not written`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(tree, null, 1) + "\n");
console.log(
  `build-content: ${tree.nodeOrder.length} nodes, ${tree.stages.length} stages, ${Object.keys(tree.workshops).length} workshops, ` +
    `${Object.keys(tree.jobs).length} jobs, ${warnings.length} warnings -> src/content/tree.json`,
);
