# Tech tree data

Content for the design in `../DESIGN.md`, in a form an engine can load. One YAML file per stage in
`stages/`, plus three shared declarations. `tools/validate_tree.py` checks it and writes
`generated/`.

| File | Holds |
| --- | --- |
| `stages/stageN-*.yaml` | The stage: gate, pressures, workshops, nodes (beats 1-8) |
| `state-variables.yaml` | Every variable a node, pressure or gate reads or writes |
| `draft.yaml` | Stage 0: roster pools, page categories and topics, defaults, weakest-area rule |
| `resources.yaml` | Every resource a node costs and the job that produces it |
| `energy.md` | Energy accounting rules, gate calibration, per-source watts |
| `failure-modes.md` | Hidden flaws, test types that reveal them, traps |
| `open-questions.md` | Unresolved history, physics, and realism-vs-fun conflicts |
| `generated/` | dependencies.md (beats, pressures, graphs), routes.md, bundles.md (pages → nodes), state-index.md, summary.md |

## Stage file

```yaml
stage: 2
name: Iron
opening_problem: "One sentence the player reads on entering."
heartbeat: fuel_balance            # id of the pressure that's always on screen
labor_tier: people                 # people | works | departments (DESIGN.md, Labor)
gate:
  id: gate_steam
  name: A working steam engine
  condition: {energy_w_per_person: 600, state: ["mine_drained_by_engine == true"]}
  routes: [A_newcomen, B_watt, C_high_pressure, T_savery]   # T_ = trap

choices:                           # optional: exclusive either/ors; starting one option closes the rest
  - id: air_supply
    prompt: "The question the player is answering, as one sentence."
    options: [wind_furnaces, pot_bellows]    # node ids of this stage; each option should set `tradeoff`

pressures:                         # bars the simulation moves
  - id: mine_water
    name: Water in the mine
    drives: mine_water_m           # a declared state variable
    heartbeat: false
    rises_with: ["what makes it worse"]
    red_when: "mine_water_m > 0"
    effect_when_red: "what visibly stops"
    answers: [node ids]            # nodes that address it; the bar names them, and what they wait on
    introduced_in_beat: 6
    model: {per_unit_produced: {wood_kg: -0.0000006}, per_day: 0.01, min: 0, max: 100}   # optional: how drives moves
    red_modifiers: {rate: {gather_wood: 0.667}}   # optional: effect_when_red as engine modifiers
    # model may also take per_worker: {job: delta per effective worker-day} and flow: true (restarts at 0
    # each day: a bar of today's net, like fuel made minus fuel used)

workshops:                         # design screens; a base definition once, `extends: true` later
  - id: engine_workshop
    name: Engine workshop
    opens_with: savery_pump        # node whose completion opens the screen
    loop: "what one iteration is"
    dials:
      - {id: boiler_pressure, name: "Boiler pressure (atm)", range: [1, 6], added_by: newcomen_engine,
         effect: "what the player sees change", basis: "the real equation or history"}
      - {id: plate, name: "Plate", options: [hammered, rolled], added_by: newcomen_engine, effect: "...", basis: "..."}
    outputs: [water_lifted_per_day, coal_per_day, safety_margin, years_to_failure]
    failure_rule: "optional: deterministic failure statement"
    play: {build_days: 180}        # optional: the screen's loop values (campaign length, batch size, build time,
                                   # the parts queue); an extension's keys add to or replace the base's

nodes:
  - id: newcomen_engine
    name: Atmospheric engine
    stage: 2
    beat: 7                        # introduction order within the stage
    kind: workshop                 # project | upgrade | decision_option | workshop | gate | hub
    workshop: engine_workshop      # for kind: workshop
    route: [A_newcomen]            # optional; which gate routes it belongs to
    critical_path: true            # on the minimum path
    problem: "One plain sentence the player already feels."
    requires:
      nodes: [sand_casting]                    # all required
      any_of: [[pot_bellows], [wind_furnaces]] # one group fully built
      state: ["pump_workers > 500"]            # conditions; a pressure usually
      resources: {iron_kg: 20000}
      labor_person_days: 1500000               # estimate unless stated
    milestones:                                # optional mid-project unlocks
      - {at: 0.5, id: some_id, effect: "..."}
    unlocks:
      jobs: [tend_engine]                      # per-worker-day rate in a comment
      effects: ["..."]
    tradeoff: "One line: what this option gains and gives up (shown on its card)"
    modifiers: {rate: {smelt_copper: 2}, toolLife: {blades: 2.5}}   # optional: applied for good on completion
    pressure_per_day: {wood_distance: 0.07}    # optional: added to that bar's model per_day once complete
    adjusts_state: {iron_quality: -1}          # optional: shifts a number once on completion (sources add up)
    reads_state: [has_coal]
    writes_state: [engine_type, mine_drained_by_engine]
    pages_bundle: steam_engines              # a topic or category id from draft.yaml, or none
    without_pages: "How the node differs without the bundle: a different route, not just slower"
    numbers_status: "What's sourced vs estimated"
    sources: ["https://..."]
    tags: [substantive, accelerant, trap, scar, labor_sink, skill_builder, research_loop, repeatable, safety]
    trap_lesson: "For traps: the real reason it fails"
    notebook: >
      2-5 sentences of real science or history.
```

Conventions:

- Quantities carry units in the key (`_kg`, `_kw`, `_km_s`, `_person_days`). Counts have none.
- `state` conditions are free text the engine parses: `var op value`, `var has member`, `NOT flag`,
  joined by `AND`/`OR`. Variables must be declared.
- `substantive` marks decisions that should count toward the "one every few minutes" target; the
  summary counts them per stage.
- `accelerant` marks optional nodes that speed the run; `critical_path` marks the minimum path.
- A `decision_option` is one of several answers at a fork. Building a second is allowed; it costs time,
  unless the options are listed together in a stage `choices:` entry: then starting one closes the
  others for good (status `closed`), and the projects panel shows them as one "Choose one" box.
- `modifiers` kinds: `rate` and `yield` (target a job), `toolLife` (a tool resource), `training` (a
  trade). A factor multiplies; effects written only in `unlocks.effects` prose change nothing.
- Gates list checks in `requires.state`; the UI shows which are unmet.

## Numbers

Every `numbers_status` says what is sourced (with a link in `sources`) and what is a game estimate.
Labor costs and production rates are all estimates: tuning knobs, not facts. Structural fractions and
Isp in the rocket workshop are play simplifications. Energy figures and their sources are in
`energy.md`.

## Validate

```sh
pip install pyyaml
python3 tools/validate_tree.py          # check and regenerate generated/
python3 tools/validate_tree.py --check  # check only; exit 1 on errors
```
