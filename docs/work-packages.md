# Work packages

The build, split into chunks a subagent can take without the rest of the context. Each package
lists what it depends on, what it delivers, and how to know it's done. Read `DESIGN.md` first;
content packages also read `tech-tree/README.md`.

Target platform: a single-page browser game, no backend, saves in localStorage. Style: the Stage 1
prototype's (one serif face, ink on paper, blue on-track / red bottleneck, square buttons). The
existing prototypes are single HTML files; the real build should be a small TypeScript project with
the tree loaded from `tech-tree/` at build time.

## Dependency order

```
A engine core ─┬─ B stage loader ─┬─ D shell UI ─┬─ E1..E6 workshops ─┐
               └─ C simulation ───┘              └─ F pressures/beats ─┼─ G1..G6 stage content ─ H test campaign ─ I draft ─ J tuning
```

A, B, C can run in parallel. D needs A-C. E and F need D. G needs E and F for its stage. H needs
E6. I can start any time after B. J is last and iterative.

---

## A. Engine core

**Delivers.** A deterministic tick loop (one tick = one day; 1×/5×/20× and auto-pause), the state
store (every variable in `state-variables.yaml`, typed), jobs (assign people in blocks; each job has
inputs, outputs, tool use, skill), pull-based production (consumers set demand; producers fill it;
surplus piles visibly), tool wear, training (idle people accumulate skill in the trade the player
picks; trained counts are state), spoilage for wood/charcoal/clay only, save/load.

**Done when.** Unit tests: a 1,000-day run of Stage 1's starting jobs reproduces the prototype's
numbers within 10%; saving and loading mid-run gives identical subsequent ticks; production never
exceeds demand plus a small buffer.

## B. Stage loader

**Delivers.** Load `tech-tree/stages/*.yaml`, `state-variables.yaml`, `page-bundles.yaml`,
`resources.yaml` at build time into typed objects. A parser for `requires.state` expressions
(`var op value`, `var has member`, `NOT flag`, `AND`/`OR`). Node availability: a node is *visible*
when its `requires.nodes`/`any_of`/`state` hold; *affordable* when resources are in stock; *building*
consumes labor from Build; milestones fire at fractions; `writes_state` applies on completion.
Workshop definitions merged across `extends`.

**Done when.** `tools/validate_tree.py` passes and the loader agrees with it on every reference;
property tests on the expression parser; a headless run can complete Stage 1 by scripted choices.

## C. Simulation models

**Delivers.** The equations behind the workshops, as pure functions with tests, no UI:

- Furnace: temperature from air supply and fuel ratio; copper yield; bloomery yield/carbon vs
  ratio; blast furnace tons/day vs stack height and blast; sulfur and phosphorus carry-through;
  hot-blast fuel saving; converter (lining, blow time, manganese) → steel_quality, iron_quality.
- Engine: atmospheric and pressure engines (force = ΔP × area; power; coal/day at fixed efficiency
  per type); hoop stress σ = P·r/t with safe stress per plate type; deterministic years_to_failure
  from margin; condenser fuel factor; generator kW from shaft speed and bearing_quality;
  transmission loss vs voltage; turbine efficiency.
- Machine shop: tolerance_mm from dials; shop hours; queue simulation with reject rate when a part
  needs a tighter fit than available.
- Liquefier: cooling per pass vs pressure and exchanger length; asymptotic temperature; kWh/kg per
  method; column purity vs trays; days to first drop.
- Rocket engine: Isp vs mixture ratio, chamber pressure and nozzle expansion (sea level and vacuum);
  burn time vs cooling; feed system caps on chamber pressure; flaw generation (see H).
- Rocket: the rocket equation per stage; Δv budget by route; structural fractions; margin.
- Energy per person: rules in `tech-tree/energy.md`.

Numbers are estimates chosen to be plausible; each function documents its source or says "play
value". **Done when** each model has tests pinning the worked examples in the stage files (e.g. a
0.5 m Newcomen cylinder ≈ 4 kW, ≈ 2-3 t coal/day; Linde ≈ 1 kWh/kg; the mockup's 4-stage rocket
≈ 13.6 km/s).

## D. Shell UI

**Delivers.** The frame every stage uses: header (stage, year/day, speed, energy number),
slide-rule meter with gates, stores (pull-based: stock, rate, demand), people (jobs, ± blocks, idle,
training), projects (visible nodes with problem, cost, Why-this-works, Start, progress, milestones),
log, the notebook screen (entries fill as nodes complete), and the pressure bars strip (heartbeat
always visible; others appear at their `introduced_in_beat`). Auto-pause with a one-line reason when
a bar goes red, a project completes, or a new node appears. Phone width works.

**Done when.** Stage 1 is playable end to end with content from G1 and looks like the prototype.

## E. Workshops (one package each)

Each is a screen that reads its dial list from the stage files (base + extensions), shows only
dials whose `added_by` node is complete, runs the model from C, shows outputs live, and commits a
build or a run. Each has a "campaign/design history" list so the player can see what they tried.

- **E1 Furnace** (S1-S3). Campaign loop. Failure states shown as text ("slag froze").
- **E2 Engine** (S2-S4). Design → build (costs iron, months) → running engine. Safety margin bar and
  the burst date. Later: generator and transmission dials.
- **E3 Machine shop** (S3+). The parts queue is the heartbeat UI: drag to reorder, see tolerance
  needed vs available, reject rate.
- **E4 Liquefier** (S4). A run takes in-game days; show the temperature falling toward the asymptote.
- **E5 Rocket engine** (S5). Design → queue for stand → firing → pressure trace, wall temp, flaws.
- **E6 Rocket workshop** (S6). The mockup's screen 5, driven by C's model, plus route dial.

**Done when** each workshop's dials appear in the order the stage file says, and the worked examples
from C render correctly.

## F. Pressures and beats

**Delivers.** Pressure bars driven by the simulation (each `drives` variable computed per tick from
jobs and state), red thresholds, `effect_when_red` applied (production fractions), `answers` surfaced
as suggested nodes when red. Beat gating: nodes of beat N appear only after at least one node of beat
N-1 is complete (in addition to their own requires), so controls arrive in order. Introduction cards:
first appearance of any control shows one line of what it is and one of why.

**Done when** a scripted Stage 2 run shows forest, fuel and mine water going red at plausible times
and never shows more than two new controls in one auto-pause.

## G. Stage content (one package each, G1-G6)

Each: wire the stage's YAML into D/E/F, write any stage-specific text the YAML leaves implicit (log
lines, gate banner), and play it. Deliver a **playtest note**: minutes to gate at a middling
strategy, count of substantive decisions actually taken, the longest lull, any node that appeared
without a visible reason, any moment with more than two new controls.

- **G1 Fire and stone.** Also ports the prototype's rates.
- **G2 Iron.** The template stage; the redesign's arithmetic is in the YAML comments.
- **G3 Steam and steel.** Machine shop queue is the heart; make ordering it feel like a decision.
- **G4 Electricity and chemistry.** Power balance and switching loads on/off; brownout behavior.
- **G5 Precision and propulsion.** Stand queue; launch complex as a long parallel project with
  milestones so the stage never idles.
- **G6 The rocket.** Almost no construction; depends on H.

## H. Test campaign

**Delivers.** Flaw generation from design and state (deterministic; table in
`tech-tree/failure-modes.md`), exposure counts per test type, instrumentation and skill modifiers,
the test screen (choose type, months and oxygen cost, what categories it covers, what it found),
fixes with durations, the launch screen (known unfixed flaws with severity, uncovered categories),
launch resolution (deterministic from a run seed), the two-year death penalty, and the score.

**Done when** a design with `injector_quality: 0` always carries combustion_instability and three
static fires with instrumentation always reveal it; launching with a fatal known flaw always fails;
the same choices and seed always give the same result.

## I. Draft (Stage 0)

**Delivers.** The screen described in `DESIGN.md` § Stage 0, from `tech-tree/draft.yaml`. Two
columns: roster pools with + / − (blocks of 100; builders absorb the remainder so the total is always
10,000), each expandable to its specialties with their own + / − and the same pin-and-spread rule as
topics; and page categories with + / − (blocks of 100 against a 10,000 budget), each category
expandable to its topics with their own + / −; topic edits pin that topic and the category's remaining
pages spread over the unpinned ones. Every pool and topic shows its one-line "speeds" / "skips" text
and, on hover, the nodes it changes (from `generated/bundles.md`). The "Weakest area" line recomputes
on every change per the rule in `draft.yaml`. Loads the defaults; Depart is always enabled. Writes
`draft_roster` and per-topic coverage into `bundles_taken` (a map topic → coverage; the loader's
`without_pages` logic reads it with the three thresholds).

**Done when.** Defaults load and depart works with no interaction; every + / − keeps the totals exact;
the weakest-area line matches a hand computation for three test allocations; a topic pin survives a
category change.

## J. Tuning

Iterative, after G1-G6 exist. Targets from `DESIGN.md`: ~90 minutes and the stated years per stage,
20-25 substantive decisions per stage, no lull over 3 minutes, no auto-pause with more than two new
controls. Levers: labor costs, rates, pressure slopes, beat thresholds. Record each pass in
`docs/playtests/`.

---

## Conventions for all packages

- Everything the player reads comes from the YAML or a small strings file; no prose in code.
- Numbers from `tech-tree/` are loaded, not copied. If a value must change, change the YAML.
- Deterministic: no `Math.random()` outside the seeded launch resolution.
- Every "estimate" the model uses is a named constant with a comment saying so.
- Keep the look: no gradients, no rounded cards, one typeface, tabular numbers.
