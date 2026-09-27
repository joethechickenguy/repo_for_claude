# Tech tree overview

Six stages, each ending at a gate that every run passes. Inside a stage, routes branch; at the gate
they converge, and what carries forward is state (see [gate-routes.md](gate-routes.md)).

## Stage map

| Stage | Name | Gate | Proposed energy gate | In-game years (target) | Nodes |
| --- | --- | --- | --- | --- | --- |
| 0 | Draft | Depart | n/a | 0 | page bundles + roster |
| 1 | Fire and stone | Reliable smelting: 5,000 metal tools | 250 W | ~4 | 18 |
| 2 | Iron | A steam engine keeps a mine dry | 600 W | ~12 | 25 |
| 3 | Steam and steel | A generator delivers 50 kW | 1.5 kW | ~13 | 27 |
| 4 | Electricity and chemistry | 500 kg/day of liquid oxygen | 2.5 kW | ~12 | 24 |
| 5 | Precision and propulsion | A 250 kN engine runs 60 s on the stand | 3.5 kW | ~12 | 23 |
| 6 | The rocket | A living pilot on the Moon | checklist, not watts | ~10 | 22 |

Total: about 63 in-game years, inside the thought experiment's 60-80 year estimate for the
immortal, no-survival, perfect-coordination scenario. The mockup's stage names (Draft, Fire and
stone, Iron, Steam, Electricity, Rocket) had five playable stages; this tree splits "Electricity"
into chemistry/cryogenics (Stage 4) and precision/propulsion (Stage 5) to reach six. Energy gates
are recalibrated from the prototype's 400 W / 1.5 kW / 4 kW / 8 kW; the reasoning is in
[energy.md](energy.md).

**Pacing arithmetic.** At 1× speed one real second is one in-game day, so 63 years is about
6.4 hours at 1×. With players spending much of their time at 5× and some at 20× during long
projects, and pausing to read and plan, 10 hours for a first run is plausible but must be tuned by
playtest. A stage of ~12 years gives 10,000 people about 44 million person-days. Summing every
node in a stage, all routes included, gives 60-130% of the person-days available in that stage; a
typical run builds 60-70% of the nodes, so projects take roughly half the colony's labor and
production jobs the rest. Stages 1 and 6 are the most labor-bound and the likeliest to need
trimming in playtest.

## The minimum industrial path

What a one-way crewed landing actually needs, as a chain of capabilities. Each line is the
critical path of one stage (the validator prints the node-level version in
[generated/dependencies.md](generated/dependencies.md)).

1. **Heat and metal.** Pottery (heat-proof vessels) → charcoal (a fuel above 1,085 °C) → copper ore
   → smelting with forced air → cast tools. Forced air matters most: without bellows or wind
   furnaces there is no iron.
2. **Iron and coal.** Bloomery iron → blast furnace (liquid cast iron) → coal as the forest runs out
   → sand casting of big parts → a steam engine that drains a mine.
3. **Precision and steel.** Rotative power and shafting → flat surfaces → screw-cutting lathe →
   gauges → prospecting for minor minerals → glass, cement and sulfuric acid → cheap steel
   (Bessemer) → wire, insulation, batteries, electromagnets → a self-excited dynamo.
4. **Electrochemistry and cold.** A grid → the arc furnace and alloy steels → high-pressure
   compressors → vacuum technique and Dewar flasks → welding → air liquefaction → a rectifying
   column for pure liquid oxygen.
5. **Engines and electronics.** Precision grinding and bearings → vacuum tubes and radio →
   instrumentation → gyroscopes → a test stand → a first small engine → good injectors →
   regenerative cooling → steering by the exhaust → a booster-class engine.
6. **Vehicle and mission.** The workshop (rocket equation) → staging → a launch complex and a big
   oxygen plant → tracking → a pressure capsule and life support → a lander with a radar altimeter
   → testing → launch.

Not on the minimum path, but usually worth it: aluminum (steel tanks work, at a heavy mass cost),
kerosene (alcohol works; it needs farmland), hypergolic lander propellants (liquid oxygen landers
work, with boil-off and restart risk), synthetic ammonia (the arc process or niter beds substitute),
turbopumps (a pressure-fed booster passes the Stage 5 gate but hurts in the workshop).

## How the pillars show up in the data

- **Realistic, but doable.** Every non-gate node has a `without_pages` line and a `fallback`. Only
  four hard walls exist, each explained in its notebook: forced air for iron, the ~10 m suction
  lift, the rocket equation (black-powder rockets, single-stage vehicles), and self-excitation for
  a generator that scales.
- **Accurate enough for nerds.** Every node has `numbers_status` saying what is sourced and what
  is a game estimate, and `sources` with links. Anything tagged "estimate" should be treated as a
  tuning knob, not a fact.
- **You learn science by playing.** Traps (`tags: [trap]`) are buildable and fail for a reason the
  game shows (`trap_lesson`). State checks reward understanding: knowing that sulfur ruins iron
  makes you pick the low-sulfur seam or plan for manganese.
- **One thing at a time.** Each node introduces at most one new resource, job or constraint, and
  appears only when its `problem` is visible (often through a `state` condition in `requires`).
- **Minimal randomness.** Failure risks are deterministic where possible (boiler explosions tied
  to plate quality and years at risk; wind furnaces lose output in a fixed calm season). The test
  campaign is the one place with hidden information; see [failure-modes.md](failure-modes.md).

## Node schema

Every node in `stages/*.yaml` follows the handoff's suggested format, with a few additions.

```yaml
- id: bloomery                 # unique snake_case id
  name: Bloomery furnace
  stage: 2
  kind: project                # project | upgrade | decision_option | gate | hub
  critical_path: true          # on the minimum path (for decision options: the default route)
  route: [A_wind]              # optional: which gate routes this node belongs to
  problem: "One plain sentence the player already feels."
  requires:
    nodes: [iron_prospecting]              # all required
    any_of: [[pot_bellows], [wind_furnaces]]  # at least one group fully built
    state: ["forest_cover < 60"]           # conditions that make the problem appear
    resources: {clay_kg: 40000, charcoal_kg: 10000}
    labor_person_days: 900000              # estimate unless stated
  milestones:                  # optional: mid-project unlocks to break up long builds
    - {at: 0.5, id: native_copper_find, effect: "..."}
  unlocks:
    jobs: [smelt_iron_bloom]   # comment gives the per-worker-day rate
    effects: ["..."]
  reads_state: [iron_ore_grade]
  writes_state: [has_iron]
  pages_bundle: metallurgy_1   # or none
  without_pages: "Slower rediscovery route"
  fallback: "Historical substitute, or the hard wall and why"
  energy_effect: "How it moves watts per person"
  numbers_status: "What's sourced vs estimated"
  sources: ["https://..."]
  tags: [labor_sink, trap, scar, skill_builder, new_energy_source, ...]
  trap_lesson: "For traps: the real reason it fails"
  notebook: >
    3 to 6 sentences of real science or history.
```

Conventions:

- Quantities carry units in the key (`_kg`, `_kw`, `_person_days`). Counts of items have none.
- `kind: decision_option` marks mutually exclusive-in-spirit choices at a fork. The engine doesn't
  have to forbid building several; building a second costs time, which is its own lesson.
- `kind: hub` nodes group alternatives or represent a whole screen (the test campaign).
- A node's `energy_effect` describes direction and rough size. [energy.md](energy.md) has the
  accounting rules and per-source watts.
- Gate nodes list the capability checks in `requires.state`. The engine should show the player
  which checks are unmet.
- Resource costs on Stage 6 nodes are for construction and test hardware. The flight vehicle's own
  tank material and propellant are chosen in the rocket workshop.

## Sources for the tree as a whole

Node-level links are in each node's `sources`. The handoff's suggested books (Sutton, *Rocket
Propulsion Elements*; Huzel and Huang; Clark, *Ignition!*; Dartnell, *The Knowledge*) were not
consulted page by page for this draft; they are the right next step for verifying Stage 5 and 6
numbers. Energy history figures come from Vaclav Smil's work, cited in [energy.md](energy.md).
