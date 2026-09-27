# Bootstrap: notes for agents

Read `DESIGN.md` first, then `docs/work-packages.md` and take one package. `tech-tree/README.md` is
the data contract. Do not redesign; if the design blocks you, write the question in
`tech-tree/open-questions.md` and pick the simplest reading.

## Ground rules
- Content lives in `tech-tree/*.yaml`. Code never hardcodes a number or a sentence that belongs there.
  If a value must change, change the YAML and run `python3 tools/validate_tree.py`.
- Deterministic: no `Math.random()` outside the seeded launch resolution (package H).
- Every estimate in a model is a named constant with a comment saying it is an estimate.
- Look: one serif face (Source Serif 4), ink on near-white with dark mode, blue on-track / red
  bottleneck, square buttons, no gradients or rounded cards, tabular numbers. Copy the CSS variables
  from the Stage 1 prototype (linked in README.md).
- Commit small and often to this branch with a message naming the package (e.g. `[C] furnace model`).
  Push after every green test run. Never leave the tree or the build red at the end of a session.
- Sessions run in throwaway containers: only pushed work survives. Commit locally as soon as a piece
  works (a file plus its tests) and never hold more than ~15 minutes of uncommitted work. Push a
  green slice at least every ~30 minutes; keep unfinished parts out of the commit rather than
  waiting for the whole package. Your first push should come early, not at the end.
- Finish a package by ticking its box in `docs/work-packages.md` and writing 3-5 lines under "Status".

## Stack
TypeScript + Vite, no framework, no runtime dependencies beyond `js-yaml` at build time.
```
src/content/   YAML -> typed JSON at build (package B). Nothing else reads YAML.
src/engine/    tick loop, state store, jobs, labor tiers, production, training (A)
src/models/    pure functions: furnace, engine, machine shop, liquefier, rocket engine, rocket, energy (C)
src/ui/        shell, panels, workshops, draft (D, E, F, I, H)
tests/         vitest; each model pins the worked examples in the stage files
```
`npm run validate` runs the tree validator; `npm test` runs vitest; `npm run dev` serves.

## Ownership (to avoid conflicts)
A owns `src/engine`; B owns `src/content` and the state expression parser; C owns `src/models`;
D owns `src/ui/shell*`; each E owns `src/ui/workshops/<name>*`; F owns `src/ui/pressures*` and beat
gating; G edits only its stage's YAML plus `docs/playtests/`; H owns `src/ui/campaign*` and
`src/models/flaws*`; I owns `src/ui/draft*`. Touching another package's files needs a note in the
commit message.
