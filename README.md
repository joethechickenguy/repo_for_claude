# Bootstrap

A browser strategy game about speedrunning civilization: 10,000 people, the Stone Age, a page budget
of printed knowledge, and a race to land one person alive on the Moon.

| | |
| --- | --- |
| [`DESIGN.md`](DESIGN.md) | The game design: goals, the three layers (pressures, workshops, nodes), stages and gates, cross-cutting systems |
| [`tech-tree/`](tech-tree/README.md) | The content as data: one YAML per stage, state variables, page bundles, resources, energy rules, failure modes, open questions |
| [`docs/work-packages.md`](docs/work-packages.md) | The build split into chunks with dependencies and done-criteria |
| [`tools/validate_tree.py`](tools/validate_tree.py) | Validates the tree and regenerates `tech-tree/generated/` |

```sh
pip install pyyaml && python3 tools/validate_tree.py
```

Prototypes (single HTML files): the [interface mockup](https://claude.ai/artifact/UJnA6qpmNJKpMwq957QaBJ)
and the playable [Stage 1 prototype](https://claude.ai/artifact/Tb1R1RLPBZTLbHteuF3ZKz).
