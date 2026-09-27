#!/usr/bin/env python3
"""Probe for tests/content-validator.test.ts: what tools/validate_tree.py sees and rejects.

Reads a JSON list of mutations on stdin (same format the test applies to the loader), prints JSON:
  {"baseline": {...the validator's view of the tree...}, "mutations": {name: [errors]}}
"""

import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True  # keep tools/ free of __pycache__
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
import validate_tree as v  # noqa: E402


def roots(stages, state_vars, bundles, resources):
    r = {"vars": state_vars, "resources": resources, "draft": bundles}
    for _, data in stages:
        r[f"stage{data['stage']}"] = data
    return r


def step(cur, key):
    if isinstance(key, str) and key.startswith("#"):
        return next(x for x in cur if isinstance(x, dict) and x.get("id") == key[1:])
    return cur[key]


def apply(mutation, stages, state_vars, bundles, resources):
    for op in mutation["ops"]:
        path = op["path"]
        cur = roots(stages, state_vars, bundles, resources)[path[0]]
        for key in path[1:-1]:
            cur = step(cur, key)
        last = path[-1]
        kind = op["op"]
        if kind == "set":
            if isinstance(last, str) and last.startswith("#"):
                raise ValueError("set needs a key")
            cur[last] = copy.deepcopy(op["value"])
        elif kind == "append":
            step(cur, last).append(copy.deepcopy(op["value"]))
        elif kind == "delete":
            del cur[last]
        elif kind == "dupe":
            cur.append(copy.deepcopy(step(cur, last)))
        elif kind == "add":
            cur[last] = cur[last] + op["value"]
        else:
            raise ValueError(kind)


def baseline(stages, state_vars, bundles, resources, nodes, errors, warnings):
    workshops = {}
    for _, data in stages:
        for w in data.get("workshops") or []:
            if w.get("extends"):
                workshops[w["id"]]["dials"].extend(d["id"] for d in w.get("dials") or [])
            else:
                workshops[w["id"]] = {"opens_with": w.get("opens_with"), "dials": [d["id"] for d in w.get("dials") or []]}
    bundle_ids = {"none"}
    for cat in bundles["pages"]:
        bundle_ids.add(cat["id"])
        bundle_ids.update(t["id"] for t in cat["topics"])
    return {
        "node_order": [n["id"] for _, data in stages for n in data["nodes"]],
        "nodes": {
            nid: {
                "stage": n["stage"],
                "beat": n["beat"],
                "kind": n["kind"],
                "workshop": n.get("workshop"),
                "requires_nodes": v.prereqs(n)[0],
                "any_of": v.prereqs(n)[1],
                "resources": sorted(((n.get("requires") or {}).get("resources") or {}).keys()),
                "reads_state": n.get("reads_state") or [],
                "writes_state": n.get("writes_state") or [],
                "pages_bundle": n.get("pages_bundle"),
                "jobs": (n.get("unlocks") or {}).get("jobs") or [],
            }
            for nid, n in nodes.items()
        },
        "workshops": workshops,
        "pressures": {
            f"stage{data['stage']}": [[p["id"], p["drives"], p.get("answers") or []] for p in data.get("pressures") or []]
            for _, data in stages
        },
        "gates": {f"stage{data['stage']}": data["gate"]["id"] for _, data in stages},
        "state_vars": {k: m["type"] for k, m in state_vars.items()},
        "resources": {k: m["produced_by"] for k, m in resources.items()},
        "bundle_ids": sorted(bundle_ids),
        "starting_jobs": sorted(v.STARTING_JOBS),
        "errors": errors,
        "warnings": warnings,
    }


def main():
    mutations = json.load(sys.stdin)
    stages, state_vars, bundles, resources = v.load()
    nodes, errors, warnings = v.validate(stages, state_vars, bundles, resources)
    out = {"baseline": baseline(stages, state_vars, bundles, resources, nodes, errors, warnings), "mutations": {}}
    for m in mutations:
        s, sv, b, r = (copy.deepcopy(x) for x in (stages, state_vars, bundles, resources))
        apply(m, s, sv, b, r)
        try:
            _, errs, _ = v.validate(s, sv, b, r)
        except Exception as exc:  # the validator crashing counts as rejecting
            errs = [f"validator raised {type(exc).__name__}: {exc}"]
        out["mutations"][m["name"]] = errs
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
