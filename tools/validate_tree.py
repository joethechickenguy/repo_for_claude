#!/usr/bin/env python3
"""Validate the Bootstrap tech tree and regenerate derived docs.

Checks:
  - every node has the required fields and a known kind
  - node ids are unique
  - every prerequisite (requires.nodes, requires.any_of) names an existing node
  - no prerequisite comes from a later stage
  - the graph has no cycles
  - every state variable read or written is declared in state-variables.yaml
  - every pages_bundle is declared in page-bundles.yaml
  - every source is an http(s) URL
  - every resource a node costs is declared in resources.yaml, and the job producing it is
    unlocked by one of the node's ancestors or by a node in an earlier stage

Writes (unless --check):
  tech-tree/generated/dependencies.md   Mermaid graph per stage + critical path
  tech-tree/generated/bundles.md        page bundles and the nodes each discounts
  tech-tree/generated/state-index.md    which nodes read and write each state variable
  tech-tree/generated/summary.md        node counts per stage and kind

Usage: python3 tools/validate_tree.py [--check]
Exit code 1 if any error is found.
"""

import glob
import os
import sys
from collections import defaultdict

import yaml

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tech-tree")
ROOT = os.path.normpath(ROOT)

KINDS = {"project", "upgrade", "decision_option", "gate", "hub"}
REQUIRED = ["id", "name", "stage", "kind", "critical_path", "problem", "requires", "notebook"]
REQUIRED_NON_GATE = ["unlocks", "pages_bundle", "without_pages", "fallback",
                     "energy_effect", "numbers_status"]
STARTING_JOBS = {"gather_wood", "knap_flint", "build"}


def load():
    stages = []
    for path in sorted(glob.glob(os.path.join(ROOT, "stages", "stage*.yaml"))):
        with open(path) as f:
            stages.append((os.path.basename(path), yaml.safe_load(f)))
    with open(os.path.join(ROOT, "state-variables.yaml")) as f:
        state_vars = yaml.safe_load(f)["variables"]
    with open(os.path.join(ROOT, "page-bundles.yaml")) as f:
        bundles = yaml.safe_load(f)
    with open(os.path.join(ROOT, "resources.yaml")) as f:
        resources = yaml.safe_load(f)["resources"]
    return stages, state_vars, bundles, resources


def prereqs(node):
    req = node.get("requires") or {}
    direct = list(req.get("nodes") or [])
    alts = [list(group) for group in (req.get("any_of") or [])]
    return direct, alts


def validate(stages, state_vars, bundles, resources):
    errors, warnings = [], []
    nodes = {}
    for fname, data in stages:
        for n in data["nodes"]:
            nid = n.get("id", "<missing id>")
            if nid in nodes:
                errors.append(f"{fname}: duplicate id {nid}")
            nodes[nid] = n
            fields = REQUIRED + ([] if n.get("kind") in ("gate", "hub") else REQUIRED_NON_GATE)
            for field in fields:
                if field not in n:
                    errors.append(f"{fname}: {nid} missing field '{field}'")
            if n.get("kind") not in KINDS:
                errors.append(f"{fname}: {nid} has unknown kind {n.get('kind')!r}")
            if n.get("stage") != data["stage"]:
                errors.append(f"{fname}: {nid} stage {n.get('stage')} != file stage {data['stage']}")
            for src in n.get("sources") or []:
                if not str(src).startswith(("http://", "https://")):
                    errors.append(f"{fname}: {nid} source is not a URL: {src}")
            if "trap" in (n.get("tags") or []) and "trap_lesson" not in n:
                warnings.append(f"{fname}: trap {nid} has no trap_lesson")
            sentences = str(n.get("notebook", "")).count(". ") + 1
            if sentences < 3 or sentences > 7:
                warnings.append(f"{fname}: {nid} notebook has ~{sentences} sentences (aim for 3-6)")

    declared_vars = set(state_vars)
    bundle_ids = set(bundles["bundles"]) | {"none"}
    for nid, n in nodes.items():
        direct, alts = prereqs(n)
        for p in direct + [x for g in alts for x in g]:
            if p not in nodes:
                errors.append(f"{nid}: unknown prerequisite {p}")
            elif nodes[p]["stage"] > n["stage"]:
                errors.append(f"{nid} (stage {n['stage']}) requires {p} from later stage {nodes[p]['stage']}")
        for var in (n.get("reads_state") or []) + (n.get("writes_state") or []):
            if var not in declared_vars:
                errors.append(f"{nid}: state variable '{var}' not declared in state-variables.yaml")
        b = n.get("pages_bundle")
        if b is not None and b not in bundle_ids:
            errors.append(f"{nid}: unknown pages_bundle '{b}'")

    # cycle check (treat any_of members as edges too; a cycle through an alternative is still a bug)
    color = {}

    def visit(nid, stack):
        color[nid] = 1
        direct, alts = prereqs(nodes[nid])
        for p in direct + [x for g in alts for x in g]:
            if p not in nodes:
                continue
            if color.get(p) == 1:
                errors.append("cycle: " + " -> ".join(stack + [p]))
            elif color.get(p) is None:
                visit(p, stack + [p])
        color[nid] = 2

    for nid in nodes:
        if color.get(nid) is None:
            visit(nid, [nid])

    # every critical node should be an ancestor of its own stage gate or of the final gate
    def ancestors(start):
        reach, todo = set(), [start]
        while todo:
            cur = todo.pop()
            if cur in reach or cur not in nodes:
                continue
            reach.add(cur)
            direct, alts = prereqs(nodes[cur])
            todo.extend(direct + [x for g in alts for x in g])
        return reach

    # every consumed resource must have a producing job the player can already have unlocked
    job_unlocked_by = {}
    for nid, n in nodes.items():
        for job in (n.get("unlocks") or {}).get("jobs") or []:
            job_unlocked_by.setdefault(job, []).append(nid)
    for nid, n in nodes.items():
        for res in ((n.get("requires") or {}).get("resources") or {}):
            if res not in resources:
                errors.append(f"{nid}: resource '{res}' not declared in resources.yaml")
                continue
            job = resources[res]["produced_by"]
            if job in STARTING_JOBS:
                continue
            producers = job_unlocked_by.get(job)
            if not producers:
                errors.append(f"resources.yaml: {res} produced by '{job}', which no node unlocks")
                continue
            # fine if an ancestor unlocks it, or an earlier stage offers it (earlier optional
            # nodes stay buildable, so the player can always go back for them)
            anc = ancestors(nid) - {nid}
            earlier = [p for p in producers if nodes[p]["stage"] < n["stage"]]
            if not anc.intersection(producers) and not earlier:
                warnings.append(f"{nid} costs {res}, but no ancestor unlocks {job} "
                                f"(unlocked by {', '.join(producers)})")

    final_gate = stages[-1][1]["gate"]["id"]
    final_reach = ancestors(final_gate)
    for fname, data in stages:
        gate = data["gate"]["id"]
        if gate not in nodes:
            errors.append(f"{fname}: gate {gate} is not a node")
            continue
        reach = ancestors(gate)
        for n in data["nodes"]:
            if n.get("critical_path") and n["id"] not in reach and n["id"] not in final_reach:
                warnings.append(f"{fname}: critical node {n['id']} is not an ancestor of {gate} or {final_gate}")

    return nodes, errors, warnings


def mermaid_id(nid):
    return nid.replace("-", "_")


def write_generated(stages, nodes, state_vars, bundles):
    out = os.path.join(ROOT, "generated")
    os.makedirs(out, exist_ok=True)
    header = "<!-- Generated by tools/validate_tree.py. Do not edit by hand. -->\n\n"

    # dependencies.md
    lines = [header, "# Dependency graphs\n\n",
             "Solid arrows are required prerequisites. Dotted arrows are alternatives "
             "(any one group satisfies `any_of`). Thick borders mark the critical path; "
             "nodes from earlier stages appear as rounded boxes.\n\n"]
    for fname, data in stages:
        ids = {n["id"] for n in data["nodes"]}
        lines.append(f"## Stage {data['stage']}: {data['name']}\n\n```mermaid\nflowchart TD\n")
        external = set()
        for n in data["nodes"]:
            label = n["name"].replace('"', "'")
            lines.append(f'  {mermaid_id(n["id"])}["{label}"]\n')
            direct, alts = prereqs(n)
            for p in direct:
                if p not in ids:
                    external.add(p)
                lines.append(f"  {mermaid_id(p)} --> {mermaid_id(n['id'])}\n")
            for group in alts:
                for p in group:
                    if p not in ids:
                        external.add(p)
                    lines.append(f"  {mermaid_id(p)} -.-> {mermaid_id(n['id'])}\n")
        for p in sorted(external):
            label = nodes[p]["name"].replace('"', "'") if p in nodes else p
            lines.append(f'  {mermaid_id(p)}("{label} (S{nodes[p]["stage"] if p in nodes else "?"})")\n')
        crit = [mermaid_id(n["id"]) for n in data["nodes"] if n.get("critical_path")]
        if crit:
            lines.append("  classDef crit stroke-width:3px\n")
            lines.append(f"  class {','.join(crit)} crit\n")
        lines.append("```\n\n")
        lines.append("Critical path: " + " → ".join(
            n["name"] for n in data["nodes"] if n.get("critical_path")) + "\n\n")
    with open(os.path.join(out, "dependencies.md"), "w") as f:
        f.write("".join(lines))

    # bundles.md
    by_bundle = defaultdict(list)
    for n in nodes.values():
        by_bundle[n.get("pages_bundle")].append(n)
    lines = [header, "# Page bundles and the nodes they discount\n\n"]
    total = 0
    for bid, b in bundles["bundles"].items():
        total += b["pages"]
        lines.append(f"## {b['name']} ({b['pages']} pages)\n\n{b['summary']}\n\n")
        for n in sorted(by_bundle.get(bid, []), key=lambda x: (x["stage"], x["id"])):
            lines.append(f"- S{n['stage']} `{n['id']}` {n['name']}: without pages, {n.get('without_pages', '')}\n")
        lines.append("\n")
    lines.append(f"Total if every bundle is taken: {total} pages against a budget of "
                 f"{bundles['page_budget']}.\n")
    with open(os.path.join(out, "bundles.md"), "w") as f:
        f.write("".join(lines))

    # state-index.md
    reads, writes = defaultdict(list), defaultdict(list)
    for n in nodes.values():
        for v in n.get("reads_state") or []:
            reads[v].append(n["id"])
        for v in n.get("writes_state") or []:
            writes[v].append(n["id"])
    lines = [header, "# State variable index\n\n",
             "| Variable | Type | Written by | Read by |\n| --- | --- | --- | --- |\n"]
    for v, meta in state_vars.items():
        w = ", ".join(f"`{x}`" for x in sorted(writes.get(v, []))) or "(starting value / draft)"
        r = ", ".join(f"`{x}`" for x in sorted(reads.get(v, []))) or "(gates or UI only)"
        lines.append(f"| `{v}` | {meta['type']} | {w} | {r} |\n")
    with open(os.path.join(out, "state-index.md"), "w") as f:
        f.write("".join(lines))

    # summary.md
    lines = [header, "# Tree summary\n\n",
             "| Stage | Name | Nodes | Critical | Traps | Labor sinks | Routes to gate |\n",
             "| --- | --- | --- | --- | --- | --- | --- |\n"]
    tot = 0
    for fname, data in stages:
        ns = data["nodes"]
        tot += len(ns)
        lines.append("| {} | {} | {} | {} | {} | {} | {} |\n".format(
            data["stage"], data["name"], len(ns),
            sum(1 for n in ns if n.get("critical_path")),
            sum(1 for n in ns if "trap" in (n.get("tags") or [])),
            sum(1 for n in ns if "labor_sink" in (n.get("tags") or [])),
            ", ".join(data["gate"].get("routes", []))))
    lines.append(f"\nTotal nodes: {tot}\n")
    with open(os.path.join(out, "summary.md"), "w") as f:
        f.write("".join(lines))


def main():
    check_only = "--check" in sys.argv
    stages, state_vars, bundles, resources = load()
    nodes, errors, warnings = validate(stages, state_vars, bundles, resources)
    for w in warnings:
        print("warning:", w)
    for e in errors:
        print("error:", e)
    print(f"{len(nodes)} nodes, {len(errors)} errors, {len(warnings)} warnings")
    if not check_only and not errors:
        write_generated(stages, nodes, state_vars, bundles)
        print("wrote tech-tree/generated/")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
