# Bootstrap

A browser strategy game about speedrunning civilization: 10,000 people, the Stone Age, a page budget
of printed knowledge, and a race to land one person alive on the Moon.

| | |
| --- | --- |
| [`DESIGN.md`](DESIGN.md) | The game design: goals, the three layers (pressures, workshops, nodes), stages and gates, cross-cutting systems |
| [`tech-tree/`](tech-tree/README.md) | The content as data: one YAML per stage, state variables, page bundles, resources, energy rules, failure modes, open questions |
| [`docs/work-packages.md`](docs/work-packages.md) | The build split into chunks with dependencies and done-criteria |
| [`docs/kickoff-prompts.md`](docs/kickoff-prompts.md) | Copy-paste prompts, one per package, in wave order |
| [`tools/validate_tree.py`](tools/validate_tree.py) | Validates the tree and regenerates `tech-tree/generated/` |

```sh
pip install pyyaml && python3 tools/validate_tree.py
```

## Play it

Needs Node 20 or newer.

```sh
npm install
npm run dev          # then open http://localhost:5173
```

- A new run starts at the draft (who goes, what they carry); Depart starts Stage 1. The run saves
  itself in the browser every 30 in-game days and when the tab closes; reopening the page resumes it.
  **New run** erases it.
- Speeds are 0.5x, 1x and 2x (one in-game day a second at 1x). Anything that needs you (a new
  project, a red bar, a finished workshop run) drops the clock to 0.5x until you pick a speed again.
- To test a later stage without playing up to it: open `http://localhost:5173/?stage=4` (2-6). The
  headless playtest bot plays the default draft up to that stage's start in a few seconds, then hands
  over. This replaces the saved run, and it only works on the dev server.
- `npm run build` makes a static copy in `dist/` (`npx vite preview` serves it).

`npm test` runs the tests (about 2.5 minutes; most of it is the bot playing the campaign) and
`npx vite-node scripts/playtest.ts` writes the bot's playtest notes to `docs/playtests/`.

Prototypes (single HTML files): the [interface mockup](https://claude.ai/artifact/UJnA6qpmNJKpMwq957QaBJ)
and the playable [Stage 1 prototype](https://claude.ai/artifact/Tb1R1RLPBZTLbHteuF3ZKz).
