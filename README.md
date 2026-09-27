# Bootstrap: tech tree

Design data for *Bootstrap* (working title), a browser strategy game about speedrunning
civilization: 10,000 people, the Stone Age, a page budget of printed knowledge, and a race to land
one person, alive, on the Moon.

This repository holds the tech tree requested in the design handoff: 139 nodes across six stages,
from bare hands to a one-way crewed lunar landing, in a form a developer can load directly.

## What's here

| Path | What it is |
| --- | --- |
| [`tech-tree/README.md`](tech-tree/README.md) | Start here. Stage map, pacing, node schema, conventions, the minimum critical path |
| [`tech-tree/stages/`](tech-tree/stages/) | The nodes, one YAML file per stage |
| [`tech-tree/gate-routes.md`](tech-tree/gate-routes.md) | 3-4 routes through each stage and the state each leaves behind |
| [`tech-tree/state-variables.yaml`](tech-tree/state-variables.yaml) | Every state variable the tree reads or writes |
| [`tech-tree/page-bundles.yaml`](tech-tree/page-bundles.yaml) | Draft knowledge bundles, page costs, roster synergies |
| [`tech-tree/resources.yaml`](tech-tree/resources.yaml) | Every resource a node costs and the job that produces it |
| [`tech-tree/energy.md`](tech-tree/energy.md) | Energy per person: proposed gate calibration and a bottom-up launch estimate |
| [`tech-tree/failure-modes.md`](tech-tree/failure-modes.md) | Hidden late-stage flaws and trap options that teach |
| [`tech-tree/labor-sinks.md`](tech-tree/labor-sinks.md) | Jobs and projects that absorb thousands of workers |
| [`tech-tree/open-questions.md`](tech-tree/open-questions.md) | Where history, physics or fun are unclear or in conflict |
| [`tech-tree/design-review.md`](tech-tree/design-review.md) | Critical review of the play experience and the tree, with ranked changes |
| [`tech-tree/generated/`](tech-tree/generated/) | Mermaid dependency graphs, bundle discount lists, state index, summary (generated) |
| [`tools/validate_tree.py`](tools/validate_tree.py) | Validator and generator |

## Validating

```sh
pip install pyyaml
python3 tools/validate_tree.py          # validate and regenerate tech-tree/generated/
python3 tools/validate_tree.py --check  # validate only
```

The validator checks that every prerequisite exists and comes from the same or an earlier stage,
that the graph has no cycles, that every state variable, page bundle and resource is declared,
that every resource a node costs can already be produced when the node appears, that sources are
URLs, and that every critical-path node leads to a gate.
