// Test helper: read tech-tree/ the way scripts/build-content.mjs does.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { RawContent } from "../src/content/compile";

export const TREE_DIR = join(__dirname, "..", "tech-tree");

export function loadRaw(): RawContent {
  const files = readdirSync(join(TREE_DIR, "stages")).filter((f) => /^stage.*\.yaml$/.test(f)).sort();
  const read = (p: string) => readFileSync(p, "utf8");
  return {
    stages: files.map((file) => {
      const text = read(join(TREE_DIR, "stages", file));
      return { file, data: yaml.load(text), text };
    }),
    stateVariables: yaml.load(read(join(TREE_DIR, "state-variables.yaml"))),
    resources: yaml.load(read(join(TREE_DIR, "resources.yaml"))),
    draft: yaml.load(read(join(TREE_DIR, "draft.yaml"))),
  };
}
