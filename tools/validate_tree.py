#!/usr/bin/env python3
"""Validate the Bootstrap tech tree and regenerate derived docs.

Checks:
  - every node has the required fields and a known kind; ids are unique
  - every prerequisite exists and comes from the same or an earlier stage; no cycles
  - every state variable, page bundle and resource is declared
  - every resource a node costs is producible by an ancestor or an earlier stage
  - pressures drive declared variables and name real nodes as answers
  - workshops open with, and add dials from, real nodes
  - every critical-path node is an ancestor of a gate

Writes (unless --check): tech-tree/generated/{dependencies,routes,bundles,state-index,summary}.md

Usage: python3 tools/validate_tree.py [--check]      Exit 1 on any error.
"""

import glob
import os
import sys
from collections import defaultdict

import yaml

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tech-tree"))

KINDS = {"project", "upgrade", "decision_option", "gate", "hub", "workshop"}
REQUIRED = ["id", "name", "stage", "beat", "kind", "critical_path", "problem", "requires", "notebook"]
REQUIRED_NON_GATE = ["unlocks", "pages_bundle", "without_pages", "numbers_status"]
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
    return list(req.get("nodes") or []), [list(g) for g in (req.get("any_of") or [])]


def all_prereqs(node):
    d, alts = prereqs(node)
    return d + [x for g in alts for x in g]


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
                errors.append(f"{fname}: {nid} stage != file stage")
            for src in n.get("sources") or []:
                if not str(src).startswith(("http://", "https://")):
                    errors.append(f"{fname}: {nid} source is not a URL: {src}")
            if "trap" in (n.get("tags") or []) and "trap_lesson" not in n:
                warnings.append(f"{fname}: trap {nid} has no trap_lesson")
            sentences = str(n.get("notebook", "")).count(". ") + 1
            if sentences < 2 or sentences > 7:
                warnings.append(f"{fname}: {nid} notebook has ~{sentences} sentences (aim for 2-5)")

    declared_vars = set(state_vars)
    bundle_ids = set(bundles["bundles"]) | {"none"}

    # workshops: base definitions once, extensions (`extends: true`) add dials in later stages
    workshops = {}
    for fname, data in stages:
        for w in data.get("workshops") or []:
            if w.get("extends"):
                if w["id"] not in workshops:
                    errors.append(f"{fname}: workshop {w['id']} extends nothing (no earlier base definition)")
                    continue
                workshops[w["id"]]["dials"].extend(w.get("dials") or [])
            else:
                if w["id"] in workshops:
                    errors.append(f"{fname}: workshop {w['id']} defined twice; use extends: true")
                if w.get("opens_with") not in nodes:
                    errors.append(f"{fname}: workshop {w['id']} opens_with unknown node {w.get('opens_with')!r}")
                workshops[w["id"]] = {"name": w["name"], "opens_with": w.get("opens_with"), "dials": list(w.get("dials") or [])}
            for d in w.get("dials") or []:
                if d.get("added_by") not in nodes:
                    errors.append(f"{fname}: dial {w['id']}.{d['id']} added_by unknown node {d.get('added_by')!r}")
    for nid, n in nodes.items():
        if n.get("kind") == "workshop" and n.get("workshop") not in workshops:
            errors.append(f"{nid} names unknown workshop {n.get('workshop')!r}")
    for fname, data in stages:
        for pr in data.get("pressures") or []:
            if pr.get("drives") not in declared_vars:
                errors.append(f"{fname}: pressure {pr['id']} drives undeclared variable {pr.get('drives')!r}")
            for a in pr.get("answers") or []:
                if a not in nodes and a not in workshops:
                    errors.append(f"{fname}: pressure {pr['id']} answer {a!r} is not a node or workshop")
        hb = data.get("heartbeat")
        if hb and hb not in {p["id"] for p in data.get("pressures") or []}:
            errors.append(f"{fname}: heartbeat {hb!r} is not one of the stage's pressures")

    for nid, n in nodes.items():
        for p in all_prereqs(n):
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

    color = {}

    def visit(nid, stack):
        color[nid] = 1
        for p in all_prereqs(nodes[nid]):
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

    def ancestors(start):
        reach, todo = set(), [start]
        while todo:
            cur = todo.pop()
            if cur in reach or cur not in nodes:
                continue
            reach.add(cur)
            todo.extend(all_prereqs(nodes[cur]))
        return reach

    job_unlocked_by = defaultdict(list)
    for nid, n in nodes.items():
        for job in (n.get("unlocks") or {}).get("jobs") or []:
            job_unlocked_by[job].append(nid)
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
            anc = ancestors(nid) - {nid}
            earlier = [p for p in producers if nodes[p]["stage"] < n["stage"]]
            if not anc.intersection(producers) and not earlier:
                warnings.append(f"{nid} costs {res}, but no ancestor unlocks {job} (unlocked by {', '.join(producers)})")

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


def mid(nid):
    return nid.replace("-", "_")


def write_generated(stages, nodes, state_vars, bundles):
    out = os.path.join(ROOT, "generated")
    os.makedirs(out, exist_ok=True)
    header = "<!-- Generated by tools/validate_tree.py. Do not edit by hand. -->\n\n"

    # dependencies.md: per stage, beats table then mermaid graph
    lines = [header, "# Stage structure and dependency graphs\n\n"]
    for fname, data in stages:
        ids = {n["id"] for n in data["nodes"]}
        lines.append(f"## Stage {data['stage']}: {data['name']}\n\n")
        lines.append(f"Heartbeat: `{data.get('heartbeat')}`. Gate: {data['gate']['name']}.\n\n")
        if data.get("pressures"):
            lines.append("| Pressure | Red when | Answers |\n| --- | --- | --- |\n")
            for p in data["pressures"]:
                lines.append(f"| {p['name']} | {p['red_when']} | {', '.join(p.get('answers', []))} |\n")
            lines.append("\n")
        for w in data.get("workshops") or []:
            head = f"**{w['id']}** (extends)" if w.get("extends") else f"**{w['name']}** (opens with `{w['opens_with']}`)"
            lines.append(head + ": " + "; ".join(f"{d['name']} (from `{d['added_by']}`)" for d in w.get("dials") or []) + "\n\n")
        lines.append("| Beat | Node | Kind | Substantive | Problem |\n| --- | --- | --- | --- | --- |\n")
        for n in sorted(data["nodes"], key=lambda x: (x["beat"], x["id"])):
            sub = "yes" if "substantive" in (n.get("tags") or []) else ""
            lines.append(f"| {n['beat']} | `{n['id']}` | {n['kind']} | {sub} | {n['problem']} |\n")
        lines.append("\n```mermaid\nflowchart TD\n")
        external = set()
        for n in data["nodes"]:
            lines.append(f'  {mid(n["id"])}["{n["name"].replace(chr(34), chr(39))}"]\n')
            d, alts = prereqs(n)
            for p in d:
                external.update([p] if p not in ids else [])
                lines.append(f"  {mid(p)} --> {mid(n['id'])}\n")
            for g in alts:
                for p in g:
                    external.update([p] if p not in ids else [])
                    lines.append(f"  {mid(p)} -.-> {mid(n['id'])}\n")
        for p in sorted(external):
            lines.append(f'  {mid(p)}("{nodes[p]["name"]} (S{nodes[p]["stage"]})")\n')
        crit = [mid(n["id"]) for n in data["nodes"] if n.get("critical_path")]
        if crit:
            lines.append("  classDef crit stroke-width:3px\n  class " + ",".join(crit) + " crit\n")
        lines.append("```\n\n")
    with open(os.path.join(out, "dependencies.md"), "w") as f:
        f.write("".join(lines))

    # routes.md
    lines = [header, "# Routes to each gate\n\nEvery route passes. Routes starting with T are traps.\n\n"]
    for fname, data in stages:
        lines.append(f"## Stage {data['stage']}: {data['gate']['name']}\n\n| Route | Nodes | State written |\n| --- | --- | --- |\n")
        for r in data["gate"].get("routes", []):
            ns = [n for n in data["nodes"] if r in (n.get("route") or [])]
            st = sorted({v for n in ns for v in (n.get("writes_state") or [])})
            lines.append(f"| {r} | {', '.join('`'+n['id']+'`' for n in ns)} | {', '.join('`'+v+'`' for v in st)} |\n")
        lines.append("\n")
    with open(os.path.join(out, "routes.md"), "w") as f:
        f.write("".join(lines))

    # bundles.md
    by_bundle = defaultdict(list)
    for n in nodes.values():
        by_bundle[n.get("pages_bundle")].append(n)
    lines = [header, "# Page bundles and the nodes they change\n\n"]
    total = 0
    for bid, b in bundles["bundles"].items():
        total += b["pages"]
        lines.append(f"## {b['name']} ({b['pages']} pages)\n\n{b['summary']}\n\n")
        for n in sorted(by_bundle.get(bid, []), key=lambda x: (x["stage"], x["id"])):
            lines.append(f"- S{n['stage']} `{n['id']}`: without pages, {n.get('without_pages', '')}\n")
        lines.append("\n")
    lines.append(f"Total if every bundle is taken: {total} pages against a budget of {bundles['page_budget']}.\n")
    with open(os.path.join(out, "bundles.md"), "w") as f:
        f.write("".join(lines))

    # state-index.md
    reads, writes = defaultdict(list), defaultdict(list)
    for n in nodes.values():
        for v in n.get("reads_state") or []:
            reads[v].append(n["id"])
        for v in n.get("writes_state") or []:
            writes[v].append(n["id"])
    lines = [header, "# State variable index\n\n| Variable | Type | Written by | Read by |\n| --- | --- | --- | --- |\n"]
    for v, meta in state_vars.items():
        w = ", ".join(f"`{x}`" for x in sorted(writes.get(v, []))) or "(simulation / draft)"
        r = ", ".join(f"`{x}`" for x in sorted(reads.get(v, []))) or "(gates, pressures or UI)"
        lines.append(f"| `{v}` | {meta['type']} | {w} | {r} |\n")
    with open(os.path.join(out, "state-index.md"), "w") as f:
        f.write("".join(lines))

    # summary.md
    lines = [header, "# Tree summary\n\n",
             "| Stage | Name | Nodes | Substantive | Accelerants | Pressures | Workshops | Traps | Routes |\n",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"]
    tot = 0
    for fname, data in stages:
        ns = data["nodes"]
        tot += len(ns)
        tag = lambda t: sum(1 for n in ns if t in (n.get("tags") or []))
        lines.append(f"| {data['stage']} | {data['name']} | {len(ns)} | {tag('substantive')} | {tag('accelerant')} | "
                     f"{len(data.get('pressures') or [])} | {len(data.get('workshops') or [])} | {tag('trap')} | "
                     f"{', '.join(data['gate'].get('routes', []))} |\n")
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
