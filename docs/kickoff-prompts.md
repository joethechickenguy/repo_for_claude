# Kickoff prompts

One fresh session per package. Paste the prompt; the agent reads the rest from the repo. Run waves
in order; never more than three sessions at once. Check the Status list in `work-packages.md`
before starting a wave.

Common preamble for every prompt:

> Read `CLAUDE.md`, then `DESIGN.md`, then your package in `docs/work-packages.md`. Work only in the
> files your package owns. Commit small with `[X]` in the message and push to
> `claude/new-session-vd0f1w` after every green test run: commit as soon as a piece works, never
> hold more than ~15 minutes uncommitted, and push a green slice at least every ~30 minutes rather
> than at the end. When done, tick your box in the Status
> list and add 3-5 lines of what shipped and what's open. If the design blocks you, add a line to
> `tech-tree/open-questions.md` and take the simplest reading rather than redesigning.

## Wave 1 (3 × Opus, parallel)

**A. Engine core**
> Package A. First run `npm install` and confirm `npm run build` and `npm test` work with the
> skeleton; fix versions if not and commit that first. Then build `src/engine/`: the tick loop, typed
> state store from `tech-tree/state-variables.yaml`, jobs, pull-based production, tool wear, training,
> the three labor tiers, spoilage for wood/charcoal/clay, save/load. Define the engine's public
> interface in `src/engine/index.ts` with doc comments; packages B, C and D will code against it.
> Done-criteria are in the package.

**B. Stage loader**
> Package B. Build `scripts/build-content.mjs` (YAML → `src/content/tree.json`) and the typed loader
> in `src/content/`, including the `requires.state` expression parser (grammar in
> `tech-tree/README.md`) and workshop `extends` merging. Node visibility/affordability/building
> logic goes here too. Property-test the parser. Your output must agree with
> `tools/validate_tree.py` on every reference.

**C. Simulation models**
> Package C. Pure functions in `src/models/`, one file per workshop plus `energy.ts`, no UI, no engine
> imports. Each function's inputs are the dial values named in the stage YAML and its outputs are the
> listed `outputs`. Pin every worked example from the stage files and `tech-tree/energy.md` in
> tests (Newcomen ≈ 4 kW and 2-3 t coal/day; Linde ≈ 1 kWh/kg; the mockup's 4-stage rocket ≈ 13.6 km/s;
> hoop stress; single steel stage ≈ 5.8 km/s). Every estimate is a named constant with a comment.

## Wave 2 (1 Opus + 1 Sonnet)

**D + F. Shell UI and pressures/beats** (Opus)
> Packages D and F together. Build the shell in `src/ui/`: header, slide-rule meter, stores, the
> recursive people panel (one control for jobs, works, departments and the draft), projects, log,
> notebook, pressure bars, auto-pause. Then F: pressures driven from engine state, red effects, beat
> gating, introduction cards. Copy the CSS variables and layout from the Stage 1 prototype linked in
> `README.md`. Done when Stage 1 plays end to end using A, B and C.

**I. Draft** (Sonnet)
> Package I. Build the Stage 0 screen from `tech-tree/draft.yaml` using the recursive people-panel
> control from D (coordinate: if D's control isn't merged yet, build it in `src/ui/controls/` and
> D will adopt it). Pin-and-spread for specialties and topics, the weakest-area line, defaults, Depart.
> Writes `draft_roster` and `bundles_taken` as the package specifies.

## Wave 3 (3 × Sonnet)

**E1 + E2** · **E3 + E4** · **E5 + E6**
> Packages E<n> and E<m>. Each workshop is a screen in `src/ui/workshops/` that reads its dial list
> from the loaded tree (base + extensions), shows only dials whose `added_by` node is complete, calls
> the model from `src/models/`, shows outputs live, and commits a build or run to the engine. Keep a
> history list per workshop. Done when the worked examples render and dials appear in stage order.

## Wave 4 (3 × Sonnet)

**G1 + G2** · **G3 + G4** · **G5 + G6**
> Packages G<n> and G<m>. Wire the stage YAML through D/E/F, write the stage's log lines and gate
> banner, and play it at a middling strategy. Deliver the playtest note in `docs/playtests/`. Fix
> content problems in the YAML (run `npm run validate`); report code problems as issues in your
> status lines rather than editing other packages' files.

## Wave 5 (1 Opus, then 1 Sonnet)

**H. Test campaign** (Opus)
> Package H. Flaw generation from design and state per `tech-tree/failure-modes.md`, exposure counts,
> test types, fixes, the launch screen and seeded resolution, the two-year death penalty, the score.
> Deterministic: same choices and seed, same result. Done-criteria are in the package.

**J. Tuning** (Sonnet, repeatable)
> Package J. Read every note in `docs/playtests/` and the targets in `DESIGN.md`. Adjust labor costs,
> rates, pressure slopes and beat thresholds in the YAML only. Re-play the worst stage, write a new
> playtest note, repeat while usage allows.

## Minimum viable order if usage is tight

A + B + C → D+F → E1+E2 → G1+G2. That's a playable Stages 1-2 that proves the design; everything
after is repetition of the same patterns.
