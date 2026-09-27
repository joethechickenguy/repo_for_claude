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

**Delivers.** A deterministic tick loop (one tick = one day; 0.5×/1×/2×, never stops, drops to 0.5× when a decision is needed), the state
store (every variable in `state-variables.yaml`, typed), jobs (assign people in blocks; each job has
inputs, outputs, tool use, skill), the three labor tiers (`DESIGN.md`, Labor: a works has a target
output and is staffed from the pool in priority order; a department has a priority and staffs its
works; pinned rows are never touched; every assignment the engine makes is recorded so the UI can show
it), pull-based production (consumers set demand; producers fill it;
surplus piles visibly), tool wear, training (idle people accumulate skill in the trade the player
picks; trained counts are state), spoilage for wood/charcoal/clay only, save/load.

**Done when.** Unit tests: a 1,000-day run of Stage 1's starting jobs reproduces the prototype's
numbers within 10%; saving and loading mid-run gives identical subsequent ticks; production never
exceeds demand plus a small buffer.

## B. Stage loader

**Delivers.** Load `tech-tree/stages/*.yaml`, `state-variables.yaml`, `draft.yaml`,
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
log, the notebook screen (entries fill as nodes complete), the pressure bars strip (heartbeat
always visible; others appear at their `introduced_in_beat`). Slow to 0.5× with a one-line reason when
a bar goes red, a project completes, or a new node appears. The people panel is **one recursive
control** used at every tier and in the draft: a row with name, number, ±, an expander, and a pin;
children spread the parent's allocation by size unless pinned. Phone width works.

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
and never shows more than two new controls in one slowdown.

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
20-25 substantive decisions per stage, no lull over 3 minutes, no slowdown with more than two new
controls. Levers: labor costs, rates, pressure slopes, beat thresholds. Record each pass in
`docs/playtests/`.

## Owner feedback backlog

Not yet scheduled. Before starting a package, read `docs/playtests/2026-09-27-stage1-owner.md` and
pick up any item that names your package: typed values in the people control (I/D), hints and a
decision every in-game year (F/G1/J), either/or project cards (D/F/G1), explaining training (D/F),
speeds (J), and a proposed **K. Tech map**, a simple tree graphic of where the player is and has been.

---

## Status

Tick when done; add 3-5 lines of what shipped and what was left open.

- [x] A engine core
  - `src/engine` (interface documented in `index.ts`): deterministic day tick, `Clock` (0.5×/1×/2×,
    never stops; drops to 0.5× on structured `PauseReason`s), typed `StateStore` for every declared variable, jobs
    with tools/wear, rate/yield/toolLife/training modifiers, people/works/departments staffing with
    pins and a record per row, pull works capped at demand + claims + buffer, spoilage, training, save/load.
  - Glue for other packages: the engine implements B's `StateView` and `applyWrites`; `ProjectsSystem`
    owns B's NodeBook in the save; `EnergySystem` feeds `report.burned` to C's `energyPerPerson`;
    `contentFromTree` builds the engine input from B's tree plus job rates.
  - 61 tests: 1,000 days within 10% of the prototype (3 allocations), save/load replays identically,
    pull never exceeds demand + buffer, headless Stage 1 on the real tree reaches the gate (~3.6 years).
  - Open: questions 25-30 (job rates, tool lifetimes and spoilage rates exist only as comments or
    prose, so Stage 1's rates live in a test fixture; works aren't content). Stage 2+ jobs have no rates.
- [x] B stage loader
  - `npm run content` compiles tech-tree/ (stages, state-variables, resources, draft) into typed
    `src/content/tree.json`; import `tree` and the types from `src/content`. Workshops come with
    `extends` merged, gate numbers become conditions, and conditions are pre-parsed.
  - `requires.state` parser/evaluator (`expr.ts`, `evaluate.ts`) with seeded property tests. Node
    logic in `nodes.ts` is pure functions over `StateView` + `NodeBook`: visibility, affordability,
    Build labor, milestones, writes_state, page tiers, jobs, dials, gates.
  - Agrees with `tools/validate_tree.py`: same references and 30 mutations that both reject.
    Stage 1 completes headless on A's engine (tests/loader-engine.test.ts).
  - Open: open-questions 18-24 (undeclared condition names, `geological_survey`, enum writes
    and state defaults missing from YAML). Job rates are still only YAML comments (`Job.rateNote`).
    Nothing wires the node logic into the running engine yet (D or F).
- [x] C simulation models
  - `src/models` (import from `src/models`), pure and deterministic, dial and output names from the
    YAML: `energy` (energy.md rules; A's EnergySystem calls it), `furnace` (copper, bloomery, blast
    furnace with hot blast and flux, Bessemer), `engine` (Savery, Newcomen/Watt/high-pressure, hoop
    stress and burst date, generator, transmission, prime mover), `machineShop` (tolerance ladder,
    shop hours, parts queue with rejects), `liquefier`, `rocketEngine` (Isp SL/vac, feed caps, burn
    time, margins for H), `rocket` (per-stage rocket equation, budget by route, margin, optimal staging).
  - 195 tests pin the worked examples with file:line citations: 0.5 m Newcomen 3.93 kW and 2.5 t
    coal/day; the mockup's 4-stage rocket 13.64 km/s at 614 t; V-2 settings 198/238 s, 251 kN, 60 s;
    every energy.md number; Neilson's hot blast; 30 trays → 99% O2.
  - Didn't match, pinned as physics gives and logged as open questions 31-40: Linde ~1 kWh/kg (model
    2.35; Claude 1.18), single steel stage "5.8" (5.70 by its own arithmetic; 5.76/6.38 in the
    workshop), steel vs aluminum "nearly twice" (2.5x), coke "1.5-2 t/t" (Neilson ~5).
  - Open: `flaws_expected`/`flaws_found` are H's; play Isp (280/310 s) sits above the engine model,
    so E6 can pass `isp_s` per stage; engine size, boiler radius and plant size have no dial (38).
- [x] D shell UI
  - `src/ui/shell.ts` + `shell.css` (the prototype's variables, type, square buttons, three columns
    collapsing at 900 px; light, dark and 390 px checked in Chromium) draw `src/ui/shellGame.ts`, a
    DOM-free controller over A + B + C + F: header, slide rule with every energy gate, pressure strip,
    stores (stock, rate, demand, claims), people, projects, workshops (`registerWorkshop` hook for E),
    log, notebook, decision banner with a one-line reason; autosave to localStorage.
  - `src/ui/controls/`: the recursive people control (`PeopleTree`) and pure pin-and-spread
    (`spread.ts`), used at the people, works and departments tiers and by I's draft.
  - Rates, tools, resource names and fuels now live in the YAML (open questions 25, 26); the game
    builds its engine content from the tree only (`shellContent.ts`). `main.ts` shows the draft
    first (hook finds I's `mountDraft`; until then a Depart line) and carries its result into state.
  - Proven by `tests/ui/stage1-play.test.ts`: from an empty run, using only the panel's rows and
    cards, Stage 1 reaches its gate (~day 1,070) and opens Stage 2. Open: 43-46 (campaigns stand-in
    until E1, prose node effects not applied, trade names); stages 2+ have no job rates yet.
- [x] E1 furnace · [x] E2 engine · [x] E3 machine shop · [x] E4 liquefier · [x] E5 rocket engine · [x] E6 rocket
  - One file per workshop in `src/ui/workshops/` on D's kit plus a shared frame (`common.ts`: dials left;
    live outputs, actions, the running loop and history right; redrawn on every change and day) and
    `strings.ts`. Each registers its screen and a saved game system, shows only earned dials in stage
    order (options the colony can't use yet are locked with the node that opens them), and runs C's
    model live. Loop numbers (campaign days, charges, build time, parts list...) live in a new
    workshop `play:` block in the stage YAML (tech-tree/README.md).
  - E1 campaigns take their charge from the stores and deliver metal ~30 days later (or say why not),
    count toward `campaigns_run`, set coke_rate/iron_quality/steel_quality (converter heats). E2 builds
    cost iron and months; the running engine sets engine_type, coal_per_engine_kw, dynamo_output_kw,
    grid and power figures and the tenders' coal-to-work; thin boilers burst on the shown date. E3's
    retool sets tolerance_mm/bearing_quality; the ordered parts queue drives shop_hours_balance. E4 runs
    cool to the first drop, then make LOX daily (`lox_kg_per_day`). E5 firings queue for the stand, burn
    LOX, draw a pressure trace; the best sets the Stage 5 gate metrics. E6 is the mockup's screen 5 and
    sets vehicle_design/dv_margin_km_s.
  - 42 tests in `tests/ui/workshops/` pin the worked examples on screen: 0.5 m Newcomen 3.93 kW / ~2.5 t
    coal, the 1.2 m rotative engine's 50 kW dynamo, Neilson's hot blast, 30 trays -> 99% O2, V-2 settings
    (~200/239 s, ~250 kN for 60 s), the mockup rocket 3.50/3.70/3.66/2.78 = 13.64 km/s at ~614 t; each
    workshop's dials against the YAML order; a loop through the engine, save/load, and the DOM screen.
    Light, dark and 390 px checked in Chromium.
  - Open: questions 53-58 (smelting jobs and campaigns side by side; one running engine; the parts queue
    is standing demand and nothing stalls on a late part yet (G3); plant size and firing LOX are play
    values; flaws are H's, the screens say so). Touched other packages' files additively: B's compile
    (`play`), D's kit (locked options, step), shellSystems (supplied metrics, workshop campaigns),
    a `workshop_done` pause/log line, shell.css.
- [x] F pressures and beats
  - `src/ui/pressures/`: `PressureSystem` moves each bar's `drives` per tick from the day's
    production (new optional pressure `model:`), goes red from `red_when`, applies `red_modifiers`
    via `setModifier` while a shown bar is red, slows the clock once on the way in; red bars' `answers` are
    marked on their project cards and under the bar.
  - Beat gating at reveal (`ProjectsSystem` option `gate`, additive to A): no card or slowdown until a
    node of the previous beat is complete. `IntroSystem` introduces job rows, bars and workshops with
    one line of what and one of why from content, at most two per slowdown (the rest wait a tick).
  - Stage 1 has models for forest and outcrop (estimates) and tool_wear's `red_when` is an expression.
  - Open: the done-criterion's scripted Stage 2 run needs G2 (Stage 2 bars' `red_when` is prose and
    no Stage 2 job has rates); open questions 41, 42, 45.
- [x] G1 · [x] G2 · [x] G3 · [x] G4 · [x] G5 · [x] G6
  - Every stage is playable end to end: a middling bot (`tests/play/bot.ts`, habits in
    `tests/play/workshops.ts`) plays the whole campaign through the shell and lands a pilot in year ~26;
    `tests/play/campaign.test.ts` replays each of Stages 3-6 from the same start with opposite options.
    Every stage reaches its gate with no dead end, at most two new controls per slowdown, and (main
    routes) a new decision at least once a year. Playtest notes: `docs/playtests/2026-09-27-stage*-bot.md`
    (`npx vite-node scripts/playtest.ts`).
  - Stages 3-6 content: job rates for everything a node needs (steel, glass, acid, cement, minerals,
    power, alloy, soda, caustic, crude, kerosene, alcohol); 10 new exclusive choices with new nodes
    (rails/canals, engine house/water turbine, tool/heat-resistant steel, Linde/Claude, computing,
    storable propulsion, turbopumps, guidance) and a rocket society and second test stand; heartbeat bars
    as expressions over what the workshops write (shop hours, kilowatts, stand days, LOX); effects as
    modifiers and values; labor scaled (question 59). Gate banners and 45 log lines for all six stages.
  - Code for it: workshops open by any of their nodes; per-state pressure terms; beat gating skips
    optional-only beats and never holds a gate; bars don't re-slow within 90 days; resources a workshop
    makes (LOX); an engine that burns its own coal and counts as energy; machinists at the lathes; late
    parts slow their jobs; firings burn fuel; a second stand.
  - Open: questions 59-62: the game is ~2.6 hours at 1x (the design says 10), the bot's lulls reach ~290
    days (target 3 minutes), Stage 2's bot run has a 443-day gap, and the hauling bar flickers in Stage 4 (J pass 1 addressed the
    last three).
  - The works and departments tiers have content: 16 works and 5 departments; foremen switch to works
    and each works starts at its crew's output (question 63).
- [x] H test campaign
  - `src/models/flaws.ts` (pure: exposure, severity with escape tower/suit/margin, seeded launch) and
    `src/ui/workshops/campaign.ts` (screen and system: tests with months and LOX, reveals by kind,
    fixes, the launch section with known flaws, severities and untested areas, the two-year penalty,
    the landing year as the score). The flaw table is content (`test_campaign.play.flaws`, 19 flaws).
  - Done criteria pinned: `injector_quality: 0` always carries combustion instability and three
    instrumented static fires reveal it; a known fatal flaw always kills; the same run gives the same
    launch (`tests/models/flaws.test.ts`, `tests/ui/workshops/campaign.test.ts`).
  - Open: question 61 (readings: known fatal flaws always strike; seed from the draft; escape tower
    needs solids). Flight tests don't lose vehicles yet, and nothing spends `calc_hours`.
- [x] I draft
  - `src/ui/draft/` (`mountDraft(el, onDepart)`, found by D's `main.ts` hook): two `PeopleTree` panels
    (D's control) for the 9 roster pools > specialties and 8 page categories > topics, a weakest-area
    line and an always-enabled Depart. `model.ts` is the pure state: `builders` is the roster's only
    unpinned pool (absorbs the remainder), pages are budget-capped rather than forced to sum to it;
    specialty/topic edits reallocate their parent's fixed total and cascade to the parent's own ± when
    no sibling is free to absorb the change (a single-topic category, or every sibling pinned by hand).
  - Built on D's `src/ui/controls/spread.ts` (already on the branch); `buildResult()` returns D's own
    `shellDraft.ts` `DraftOutcome` shape directly (`draft_roster` carries both pool and specialty ids,
    matching `defaultDraftOutcome`'s convention) so Depart needs no translation layer.
  - 16 tests (`tests/ui/draft/model.test.ts`, `tests/ui/draft/dom.test.ts`): defaults + Depart with no
    interaction; a 500-step seeded-PRNG property test (mulberry32) plus a 200-step pin-toggle variant
    keeping totals exact after every action; three hand-computed weakest-area allocations including a
    three-way tie exercising the earliest-area rule; a pinned topic/specialty surviving a category/pool
    change, checked at both the model and the real DOM; `DraftResult` checked against
    `bundleCoverage`/`pagesTier` from `src/content`.
  - Open: open-questions 47-49 (which pool is the remainder isn't a declared flag; pools/categories
    have no one-line text or hover-nodes of their own in draft.yaml, so a pool shows its `absent` text
    and a category shows none; single-topic categories need the cascade rule). No design system data
    for hover-nodes on roster specialties (only pages have a `pages_bundle` link to nodes).
- [x] J tuning (pass 1; repeatable)
  - Pass 1 in `docs/playtests/2026-09-27-j1.md` (before/after tables; notes `*-bot-j1.md`, made by
    `npx vite-node scripts/playtest.ts <date> <label>`). Longest lull per stage now 150-220 days
    (was up to 288); Stage 2's gap 443 → 378 days.
  - Levers used: milestones inside long builds (Stages 1, 2, 4, 5), Stage 2 labor trims, trade-off
    lines on three Stage 2 nodes, and `pressure_scale:` (new node field) so rails and canals cut
    hauling by the fraction their cards say; the hauling bar no longer flickers in Stages 4-6.
  - Open: question 64 (9-15 decisions per stage against 20-25 needs content, not tuning) and 59
    (length ~2.6 h at 1x against 10 h).

## Conventions for all packages

- Everything the player reads comes from the YAML or a small strings file; no prose in code.
- Numbers from `tech-tree/` are loaded, not copied. If a value must change, change the YAML.
- Deterministic: no `Math.random()` outside the seeded launch resolution.
- Every "estimate" the model uses is a named constant with a comment saying so.
- Keep the look: no gradients, no rounded cards, one typeface, tabular numbers.
