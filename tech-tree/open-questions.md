# Open questions

Unresolved points, roughly by how much they affect the design.

## Realism vs fun

1. **Draft animals.** Base rules have none; wild aurochs and horses existed, but domestication is
   generations of breeding. The tree assumes muscle plus machines, which makes roads and rails worth
   more. Decide, or make domestication a long optional project.
2. **Muscle doesn't count toward watts.** Treadwheels and bucket chains do real work but don't move
   the headline number. Intentional; needs one notebook entry so it doesn't feel like a cheat.
3. **Stage 1 length.** Six years and 14 nodes for 90 minutes depends on the furnace campaign loop
   carrying the middle of the stage. If it doesn't, add unlocks, not longer projects.
4. **Launch randomness.** `failure-modes.md` proposes deterministic discovery and a seeded launch.
   Fully deterministic (same choices, same result) or a shown probability at launch?

## Materials the region may not provide

5. **Platinum** (Ostwald catalyst). None confirmed in Anatolia. Fallback in the tree: cobalt oxide
   catalyst, or nitric acid from saltpeter and sulfuric acid. Needs a chemist's check.
6. **Cryolite.** Natural cryolite came from Greenland; the tree synthesizes it from fluorite via HF.
   Real, dangerous, maybe its own milestone.
7. **Rubber.** Not local. Insulation is silk/varnish; suits and solid binders use a polysulfide
   synthetic from chlorine, sulfur and alcohol-derived ethylene. Plausibility at this scale unverified.
8. **Tungsten.** If not found: carbon filaments (short life), chromium-only tool steel. Realistic
   enough for triodes? Early tubes also used tantalum and oxide cathodes.
9. **Which minerals exist where.** Ergani copper, Kestel tin, Guleman chromite, Seydişehir bauxite
   are sourced. Oil (Batman, Baku), iron sites and the minor minerals are a design list. Fix the
   real list before writing the survey bundle's text.

## Numbers to check

10. **Smil's per-capita energy figures** in `energy.md` came from search excerpts, not the book.
11. **Early LOX plant energy** (~1 kWh/kg assumed) may be several times too low for a 1900s plant.
    Affects Stage 6 watts only.
12. **Workshop Isp values** (280/310 s) are play values; real V-2 was ~200 s sea level, 239 s vacuum
    at 15 bar. Package C's model should make Isp depend on chamber pressure and nozzle expansion,
    which the rocket engine workshop already exposes.
13. **Δv budget** of 15.3 km/s should differ by route (direct vs parking orbit) and lander propellant.
14. **Tracking coverage.** One site sees the Moon only part of each day. Accept partial coverage or
    make distant stations a project?
15. **Survival window.** "Alive at landing" needs a time definition; the capsule has four days of air
    and now thermal control. Decide the window the score requires.

## Structure

16. **Variants** (mortal colonists, 1 AD start, politics) are not written. The 1 AD start probably
    begins at the Stage 2 gate with different state.
17. **Zero-page run.** Every node has a `without_pages` route, so it's possible; its length is
    unestimated. Hardest spots: Haber-Bosch (unavailable; arc process instead), the basic lining,
    peroxide.

## Loader (package B)

The loader takes the simplest reading of each and says so in `npm run content` warnings.

18. **Condition names that aren't declared.** `requires.state` and gate conditions read `ore_kg`,
    `campaigns_run`, `energy_w_per_person`, `bloom_kg`, `iron_kg_total`, `terrain_allows_adit`,
    `engine_static_fire_s`, `engine_thrust_kn`, `dv_total_km_s` and `crewed_landing_survived`, which
    are in neither `state-variables.yaml` nor `resources.yaml` (the validator doesn't check
    conditions). Reading: they are engine metrics, answered by the engine's `StateView.get` (or its
    stock, if the engine models one as a resource, as it does `ore_kg`), and listed in
    `tree.identifiers` as `undeclared`. Declare them, or keep them as metrics?
19. **`bundles_taken has geological_survey`** (`tin_survey_kestel`) names no topic or category in
    `draft.yaml`, so it is never true and the D_tin route never appears. Probably
    `survey_copper_tin` (the node's own bundle) or the `survey` category.
20. **`has` on a map.** `bundles_taken` is topic → coverage. Reading: `has t` is true when coverage
    of t ≥ the partial threshold (0.5), i.e. the topic isn't absent.
21. **`writes_state` carries no values.** Reading: flags become true; an enum takes the one value its
    node id names (`watt_engine` → `watt`); numbers, counts and sets are the simulation's. Eight enum
    writes name no value: `ore_roasting`, `plate_rolling`, `foremen`, `nitrogen_fixation`,
    `hydrogen_peroxide`, and the choices `deposit_choice`, `coal_seam_choice`, `guidance_choice`.
    The loader accepts an optional node field `writes_values: {var: value}` for the first five; the
    choices are set by the player's pick.
22. **No starting values.** `state-variables.yaml` has no defaults, so every number starts at 0 and
    every enum at its first value. Descriptions imply otherwise for `iron_quality` (3),
    `tolerance_mm` (1.0), `forest_cover`, `malachite_left_kg` and `tool_wear`; at 0,
    `ground_stone_axes` (`tool_wear < 0.8`) shows on day one and `ore_roasting`
    (`malachite_left_kg < 20000`) as soon as crucibles are built. The loader reads an optional
    `default:` per variable.
23. **"Nx labor" without pages.** The loader takes the first "Nx labor" in `without_pages` as the
    labor multiplier when the bundle is absent. `guidance_choice` says "Inertial costs 4x labor",
    which applies only to one option; an optional `without_pages_labor:` number overrides the text.
24. **Build rules the design leaves open.** Readings: resources are consumed when a project starts;
    a node once visible stays visible; a stage opens when the previous gate node completes; Build
    labor is split evenly over active projects; a gate is re-checked when started (it has no labor,
    so it completes at once). `work-packages.md` names `page-bundles.yaml`, which is `draft.yaml`.

## Engine (package A)

25. **Job rates are comments.** Every rate sits in a comment after `unlocks.jobs` (B keeps it as
    `Job.rateNote`), and `knap_flint`'s 3 blades/day is only in the prototype. The engine takes
    structured rates (`inputs`, `outputs`, `burns` per worker-day, `tool`, `labor`); until the YAML
    has them, `tests/engine/fixtures/stage1.ts` transcribes Stage 1's with a citation per number.
    Proposed: a `jobs:` map per stage file, e.g. `fire_pottery: {inputs: {clay_kg: 12, wood_kg: 24},
    outputs: {pots: 2}, burns: {wood_kg: 24}}`, and `build: {labor: build, tool: true}`.
    **Taken (D):** Stage 1's file now has that `jobs:` map (the fixture's nine jobs plus `grind_axes`
    from its comment), each entry with `name`, `what` and `why` for the people panel and its
    introduction card; B's loader carries it as `Job.rates/name/what/why`, and the game builds its
    engine content from it (`src/ui/shellContent.ts`), never from the fixture. A test pins the YAML
    to the fixture. Still without rates: `hammer_native_copper`, `hunt_for_hides`,
    `roast_sulfide_ore`, `mine_arsenical_ore`, `mine_cassiterite`, `smelt_tin`, `cast_bronze_tools`
    and every Stage 2+ job; they don't get a people-panel row until they have rates (G1..G6).
26. **Tools aren't declared.** Tool lifetimes (flint ~20 worker-days, copper ~200, bronze ~400) and
    bare-hand speed (a quarter) are prose in the `tool_wear` pressure; copper/bronze/iron tools and
    axes aren't resources, though `metal_tools` counts them; `ore_kg` is read by a condition but not
    declared. Reading: tools are resources the engine models (`copper_tools`, `ore_kg` in the
    fixture), users take the longest-lived first, `metal_tools` is their stock. Proposed:
    `tool_life_worker_days` and `metal: true` on tool resources in `resources.yaml`, and a
    `bare_hand_efficiency` number; the engine's defaults (`src/engine/params.ts`) are estimates.
    **Taken (D):** a stage file `tools:` map (`blades` 20, `axes` 100, `copper_tools` 200 metal),
    carried as `Tree.tools`; `ore_kg`, `axes` and `copper_tools` are declared in `resources.yaml`,
    which also gains optional `name` and `fuel` per resource. Bare-hand speed stays the engine default.
27. **Spoilage rate.** `resources.yaml` says which resources are perishable, not how fast.
    Engine estimate: 0.1%/day (half-life ~2 years). Proposed: `spoil_per_day` per resource.
28. **Pull vs "piles up visibly".** Reading: pull-based capping applies to works whose target is
    `pull` (works and departments tiers): they fill consumer demand + claims + 2 days of buffer and
    stop. Jobs the player staffs by hand (people tier) are not capped, so surplus piles up where the
    stores panel shows it. A queued node's cost counts as demand through `engine.setClaim`.
29. **Works aren't content.** A works is a facility (`furnace 2: 1 t/day`): an output, a primary
    job and support jobs. None are defined in the YAML; the engine creates them at runtime
    (`addWorks`). Stage 3 needs them in content or created by the node that builds the facility.
30. **Training.** Reading: idle people train in one trade at a time (a count variable named
    `trained_*` or `*_trained`), one trained person per 365 idle person-days (estimate), sped up by
    a `training` modifier (teachers). Trained counts don't leave the idle pool.

## Simulation models (package C)

31. **Fuel-ratio dial range.** `fuel_ratio` is [2, 15] (stage1 L54) and starts at the prototype's
    working ratio (2 kg charcoal per kg ore = 10 per kg copper), so the copper "too little" failure
    (L55) is out of range; the bloomery window, 0.8-1.3 (stage2 L83), lies below the range entirely
    though L197 says the same dial applies. The model takes any positive ratio (blowpipes fail below
    ~1.8; a bellows bloomery below ~0.86). Proposed range: [0.5, 15].
32. **Blast-furnace coke rate.** stage2 L446 says "1.5-2 t charcoal or coke per t"; energy.md's
    Neilson figure is ~8 t of coal per t cold-blast, ≈5 t of coke at L357's 1.6 kg coal per kg coke.
    The model uses charcoal 1.5 and coke 5.04, which reproduces energy.md's 250 W and 160 W rows.
    Proposed: fix L446 for coke.
33. **Linde at ~1 kWh/kg is below the physics** (stage4 L60, L381; energy.md L111-118; see 11). A
    throttle cycle at 200 atm needs ~1.3 kWh/kg even with an ideal isothermal compressor and
    exchanger. The model (60% compressor) gives ~2.35 for Linde and ~1.2 for Claude, which is half, as
    the YAML says; ~1 kWh/kg is a Claude-cycle figure. So LOX loads are ~2.3x energy.md's (500 kg/day:
    ~49 kW, ~12 W per person; 50 t/day: ~4.9 MW, ~1.2 kW per person). Accept and let J tune, or say
    "~2 kWh/kg" for Linde in the YAML and energy.md.
34. **Single-stage what-if** (stage6 L107: "≈ 5.8 km/s: ln(1/0.14) x 2.9"; failure-modes.md: "ln(7) x
    2.9 ≈ 5.7"). The stated arithmetic gives 5.70 and 5.64; 2.9 km/s (296 s) is none of the play
    Isps; and "structural fraction" there means dry/total, while the mockup, whose convention
    reproduces 13.6 km/s and which the model follows, uses dry/propellant. In the workshop a single
    steel stage tops out at 5.76 km/s on alcohol and 6.38 on kerosene. The lesson holds (both < 9.4).
    Proposed text: "~5.8 km/s on alcohol, ~6.4 on kerosene".
35. **Steel vs aluminum vehicle** (stage4 L454: "nearly twice the mass"). With the play values and
    optimal staging for 15.3 km/s and a 1.6 t capsule: ~2,480 t in steel vs ~1,000 t in aluminum,
    2.5x. Proposed: "two and a half times".
36. **Numbers in prose and comments aren't loadable.** The rocket play values (Isp 280/310/290,
    fractions 0.14/0.09, pressure-fed +0.08/-25 s, budget 9.4 + 3.1 + 2.8), feed caps (20/25/60 bar),
    the tolerance ladder, the 1.5 safe margin, job-rate comments the models need (20% copper yield,
    1.6 kg coal per kg coke) and energy.md's values are copied into `src/models` as named constants
    citing file and line, with tests pinning them. If they should be tunable content, give them
    structured fields (see 25) and pass them in: `designRocket` already takes `play` and `budget`.
37. **Δv by route** (see 13). The model adds an estimated 0.1 km/s for a parking orbit (restart,
    ullage, coast); direct ascent flies the base 15.3. The Stage 6 gate reads `dv_total_km_s >= 15.3`
    (stage6 L339), which ignores the route and the margin other nodes spend (midcourse, suit and
    tower); `dv_margin_km_s >= 0` may be what's meant.
38. **Sizes with no dial.** Rocket-engine throat area (the model defaults to the V-2's 0.4 m throat,
    ≈250 kN at 15 bar, just the gate), boiler radius (model: twice the cylinder diameter), liquefier
    size (compressor kW, an input) and number of machines per works. Dial, state, or fixed?
39. **Name mismatches.** `feed_system` state values [pressure, steam_turbopump, gas_generator] vs the
    engine dial [pressure_fed, peroxide_turbopump, gas_generator_turbopump] vs the rocket dial
    [pressure_fed, turbopump]; `plate_quality` has `open_hearth`, the plate dial doesn't. The models
    use the dial names; the engine needs a mapping when it writes state.
40. **Newcomen efficiency.** The 4 kW → 2-3 t coal/day example (stage2 L107, L679) needs 0.4-0.5%;
    energy.md §1 also says "about a third of a percent", which would give 3.8 t/day. The model uses
    0.5%, which matches the example and energy.md's own 10 kW → ~6 t/day arithmetic.

## Shell and pressures (packages D, F)

41. **Beat gating reading.** A node of beat N shows only once a node of the nearest *lower beat that
    has nodes* in the same stage is complete (a stage may skip a beat number); the stage's lowest
    beat is always open. The gate is applied at reveal (`ProjectsSystem` option `gate`), so a gated
    node makes no pause and gets no card until its beat opens. A bar's `introduced_in_beat` uses the
    same test; the heartbeat shows from the stage's start.
42. **Pressure dynamics aren't in the YAML.** `rises_with` and `effect_when_red` are prose. Reading:
    optional structured fields per pressure, `model: {per_unit_produced, per_unit_consumed, per_day,
    min, max}` moving `drives` each day from the day's production, and `red_modifiers: {rate: {job:
    factor}}` applied while red; a variable's start is its state `default`. Stage 1 has them (all
    estimates: forest −1 point per 1,700 t cut, +0.01/day; outcrop 80 t). `tool_wear`'s `red_when`
    is now the expression `tool_wear < 1` (was "tools < tool users"). Stage 2-6 bars whose
    `red_when` is prose (`fuel_balance`, `shop_hours_balance`, ...) show their value but never go
    red until G2..G6 give an expression and a model.
43. **Campaigns before E1.** `wind_furnaces` and `pot_bellows` read `campaigns_run`, which the
    furnace workshop should count. Until E1, the shell counts every 30 days of copper smelting as
    one campaign (the stage file's "~30 days" loop; `STANDIN_CAMPAIGN_DAYS`), like A's headless test.
44. **Node effects written as prose aren't applied.** "Gather wood with an axe: 60 kg/day instead of
    40" (ground_stone_axes), "air_supply: bellows_crews. 2x output" (pot_bellows, wind_furnaces:
    E1's dial), "Tools last 1.6x copper" (arsenical_copper), milestone effects (native copper,
    sledges). They show on the card and in the log but change nothing yet. Proposed: a structured
    `modifiers:` list on nodes, like `red_modifiers`, applied on completion (G1).
45. **Controls and their intro text.** A control is a job row, a pressure bar or a workshop. A job's
    card text is its stage-file `what`/`why` (new, see 25); `why` falls back to the unlocking node's
    `problem`. A bar's card is its first `rises_with` and its `effect_when_red`; a workshop's is its
    `loop` and its opening node's `problem`. At most two are introduced per pause; the rest are
    hidden until the next tick's pause. At Stage 1's start that means gather wood and knap flint on
    day 0, then Build and the Tools bar the next day.
46. **Trade names.** Trades (`trained_smiths`, `machinists_trained`, ...) have no display name in
    `state-variables.yaml`; the training menu shows the description or the id with spaces.

## Draft (package I)

47. **Which roster pool is the remainder.** DESIGN.md and draft.yaml's comments say builders "are the
    remainder" but nothing in the compiled `Draft` marks which pool that is (no `remainder: true`
    field). Reading: it's `builders` by name (the one pool with `thin: 0` and a note calling it "the
    default pool"); `src/ui/draft/model.ts` hardcodes that id as `BUILDERS_POOL_ID`. If a future
    draft.yaml renames it, this needs updating alongside.
48. **Pool-level "speeds"/"skips" text and hover nodes.** draft.yaml gives a one-line `speeds` per
    *specialty* and `skips` per *topic*, but no one-line text on a *pool* or *category* itself, and no
    node list for roster pools/specialties at all (`generated/bundles.md` only covers pages).
    Readings taken: a pool row shows its `absent` text (what its absence costs; the "what it speeds
    up" half is left to its specialties once expanded); a category row shows no text of its own;
    hover-nodes ("the nodes it changes") are shown for page topics and categories only (from each
    node's `pagesBundle`), since roster has no equivalent link to specific nodes.
49. **Page categories with a single topic.** `primitive` and `cryogenics` each have exactly one topic,
    so editing that topic *is* editing the category (there's no sibling to reallocate against).
    `stepTopic`/`stepSpecialty` cascade to the parent's own ± in that case (and whenever every sibling
    happens to be pinned by hand), rather than leaving a shortfall the spread can't place.
50. **Speeds 0.5×/1×/2×, no pause (owner's decision).** The game never stops; a decision drops it to
    0.5× and the banner stays, collecting newer decisions, until the player picks a speed or presses
    its button (which returns to the speed they had). The engine still calls these `PauseReason`s /
    `ctx.pause`; they now mean "needs the player". Open for J: at 2× top speed, DESIGN.md's "10 hours,
    100-200 years" only fits the 100-year end (100 years = 36,500 days needs an average of ~1×; 200
    years would need 2× throughout with no slowdowns). Either stages get shorter in years, or the
    10-hour target grows.
51. **Choices and real effects (owner playtest 2026-09-27).** Stage files now carry `choices:` and
    nodes `tradeoff`, `modifiers` and `pressure_per_day` (tech-tree/README.md). This settles question
    44 for Stage 1: axes, sledges, roasting, the eastern outcrop, wind, bellows and arsenic change
    the numbers. Stages 2-6 still have prose-only effects; their G packages should convert them. The
    air-supply multipliers (wind x3, bellows x2) are rate modifiers on `smelt_copper` for now; E1's
    furnace workshop should take them over through its `air_supply` dial, not stack on them.
52. **Stage 2 made playable (owner playtest 2026-09-27).** Stage 2 had no job rates, so nothing past
    the bloomery could be made. It now has rates for every job it needs, resources for iron ore,
    bloom, iron tools, coal, coke and engine work, and four exclusive choices (deposit, coal seam,
    mine water, engine path). Several conditions nothing could satisfy were replaced: `bloom_kg`
    (now a resource), `iron_kg_total` (dropped from the blast furnace), `pump_workers` (dropped;
    the engines answer the water bar instead), `terrain_allows_adit` and `river_sites` (declared,
    true and 2). Coal comes after bloom smithing, not after the forest or fuel go bad: a good player
    never met that, and beat gating held beats 5-7 behind it. The gate now needs the mine actually
    below the water line (`mine_water_m < 0`), not only an engine built. Labor costs were trimmed so
    a decision comes at least every 365 days; a middling player reaches the gate in 3.2-4.8 years
    (tests/ui/stage2-decisions.test.ts). Open for J: energy overshoots (a middling colony passes
    600 W in the first year, so the energy half of the gate never binds), the fuel bar rarely goes
    red because Stage 1 leaves huge wood stockpiles, and the engine workshop (E2) should replace the
    fixed engine rates (`tend_engine`) with the designed engine.

## Workshops (packages E1-E6)

53. **Campaigns: the routine and the workshop.** The furnace workshop (E1) runs real campaigns: the
    charge leaves the stores, the metal arrives ~30 days later or the history says why not. The
    smelting jobs keep running beside it, and `campaigns_run` counts both (D's stand-in's 30 smelting
    days per campaign plus the workshop's own), so a player who never opens the workshop isn't
    blocked (DESIGN.md: missing a loop slows, never blocks). The air-supply multipliers stay node
    modifiers on the jobs (question 51); the dial locks bellows and the wind site until they're built.
    A campaign's results the nodes leave to the simulation (`coke_rate`, `iron_quality`,
    `steel_quality`) are written when it finishes. Workshop loop numbers (campaign days, charges,
    heat size) live in a new `play:` block on the workshop (tech-tree/README.md).
54. **The engine workshop's running engine.** One engine at a time: a finished build replaces the
    running one. Its design sets `engine_type`, `coal_per_engine_kw`, `dynamo_output_kw`,
    `factory_power_kw`, `grid_kw` and `power_station_efficiency`, and the `tend_engine` job's yield
    becomes the design's coal-to-work (250 kg -> 10 kWh at the job's rate), replacing the Watt and
    high-pressure nodes' fixed factors while it runs (question 52). A steam turbine has no size dial,
    so it takes the piston design's shaft power at turbine efficiency; a water turbine gives
    `play.water_turbine_kw` per river site (estimate). The prime-mover dial arrives in Stage 4, so in
    Stage 3 a colony that built the water turbine and no rotative engine drives its dynamo with it.
    A burst adds 1 to `boiler_explosions` and loses the engine; "kills the crew" isn't modelled
    (people are immortal and nothing removes them yet). Boiler pressure stays at or below 2 atm until
    the high-pressure engine; the turbine needs steel_quality 2 (the dial's own text).
55. **The parts queue.** The stage files named the queue's contents only in prose ("engines, rails,
    dies, instruments, wire"), so `machine_shop.play.parts` lists a year's standing demand per kind
    of part (hours, tolerance, and the node that creates the need; all estimates). The queue is
    that standing demand in the player's order: `shop_hours_balance` = shop hours a day minus its
    hours (rejects included) over `queue_year_days`, so the bar goes negative exactly when "the queue
    exceeds a year of shop time". Order decides which parts are late; nothing yet stalls a project
    for a late part (G3: make ordering bite, e.g. node labor waiting on its part). Reordering is ↑/↓
    buttons rather than drag (works at phone width and from the keyboard). Retooling (30 days) commits
    `tolerance_mm` and `bearing_quality`; until the player retools, the shop holds hand tolerance.
    Hardened-steel bearings wait for precision_grinding; the without-pages "two plates first" route
    isn't modelled.
56. **Liquefier plant size and the gate.** No dial sets the plant's size (question 38), so the
    compressor is `liquefier_workshop.play.compressor_kw` (100 kW, estimate: a good Linde design
    makes ~1 t/day, twice the gate). A running plant counts oxygen into `lox_kg_per_day` and the
    stores only with a column and air_separation built; without them it makes liquid air
    (`has_liquid_air`, `cryo_process`). The compressor's draw isn't yet a load on the Stage 4 power
    balance (G4/F). A plant that never liquefies is given up after `play.trial_days`.
57. **Rocket engine firings.** The engine burns kerosene and LOX once `has_kerosene`, else alcohol
    and LOX (the two routes into first_liquid_rocket); no dial chooses. Every firing is planned for
    60 s (the gate's number) and takes `play.firing_days` of stand time and the LOX that burn needs
    from the stores; the chamber lasts `min(60, burn_time_s)`. The best firing (longest, then most
    thrust) supplies `engine_static_fire_s` and `engine_thrust_kn`, so a worse later firing never
    loses the gate. `stand_days_balance` = a year minus the queued stand days; `lox_balance` = LOX in
    store minus the next firing's need; one stand (test_stand's "a second stand doubles throughput"
    isn't counted). Roughness on the pressure trace is a picture of the stability margin, not a flaw:
    flaws, their discovery and fixes are package H's; the screen says so.
58. **The rocket workshop's vehicle.** Per-stage dials (propellant mass, propellants, tanks, feed)
    are the columns of the mockup's stage table; `stage_count` and `route` are the vehicle's. The
    first design on the screen is the mockup's (`play.default_stages`, short of the Moon).
    Propellants are locked to what the chemistry has made (`has_ethanol`, `has_kerosene`,
    `has_hypergolics`), aluminum tanks to `has_duralumin`. Adopting a design is instant (Stage 6 is
    "almost no construction"); `vehicle_design` holds it as members `stageN:<t>t:<propellants>:<tank>:<feed>`
    (sets are lists or number maps), and `dv_margin_km_s` is recomputed daily so the capsule's mass and
    the margin midcourse correction (0.1) and crew safety (0.15) spend follow it. Isp stays the play
    values (question 12/36), not the engine the colony fired in E5.

## Stage content and the test campaign (packages G1-G6, H)

59. **Stage length.** Stages 1-2 were trimmed to 3-5 years by the owner's playtest (a decision every
    year). Stages 3-6 follow: labor x0.25 (Stage 3), x0.175 (Stage 4), x0.12 (Stages 5-6), a few
    critical builds trimmed further so no year passes without a decision. A middling bot reaches
    each gate in 3.4-5.8 years, 21-36 minutes at 1x (docs/playtests/2026-09-27-stage*-bot.md): the
    game is ~26 in-game years and ~2.6 hours at 1x, against DESIGN.md's 100-200 years and 10 hours
    (question 50). Owner's call: longer stages with more decisions in them, or a shorter game.
    Mineral prospecting finds every site in reach (the "missing ones use substitutes" mechanic isn't
    modelled). The works and departments tiers now have content (see 63).
60. **Beat gating and optional beats.** A beat waits on the nearest lower beat that has a
    critical-path node, and a gate only on its own requirements: Stage 4's gate waited ~600 days for
    oil (its only beat-7 node, optional, and impossible on the canals route). Nodes moved to the beat
    their prerequisites allow: Stage 5's computing, tracking and storable propulsion (3-4), the
    launch complex (5, "runs alongside engine development"). A bar that goes red again within 90
    days doesn't slow the game again (the brownout flickered daily).
61. **The test campaign's readings.** Flaws, their `when` conditions, exposures and fix times are
    in the Stage 6 file's `test_campaign.play.flaws` (from failure-modes.md; exposures, test costs
    and the vehicle facts `vehicle_stages`, `turbopump_stages`, `lox_stages`, `largest_stage_t`,
    `lox_lander` are estimates). At launch a known flaw whose severity is fatal always strikes (H's
    done criterion; the screen says so); any other unfixed flaw strikes with `strike_chance` (0.5),
    rolled in mission order from a seed fixed by the draft (question 4: shown and seeded, not a free
    roll). An escape tower counts only with solid motors. Guidance errors are survivable with a
    midcourse burn and 0.3 km/s of margin, fatal without. A lost pilot costs two years, a lost
    vehicle one. Launch LOX is each stage's propellant at its oxidizer share: a big steel vehicle
    needs years of LOX, which is the case for aluminum, kerosene and the plant scale-up.
62. **What counts as a decision in the playtests.** Nodes with a `tradeoff` line (every option of a
    choice, and optional nodes that compete for builders), plus, in Stage 6 only, each test-campaign
    result ("test more, fix, or launch?"). The bot is middling on purpose: it never misreads a card,
    builds optional projects only when fewer than two builds are underway, adds people to whatever a
    stalled project lacks, and runs the workshops with fixed habits (tests/play/workshops.ts).
63. **Works and departments in content (question 30).** Stages 3-5 list their works (`works:`: a
    facility's output, primary job, feeder jobs and department) and Stage 5 its five departments with
    starting priorities. Foremen set `labor_tier: works`; each works joins as its primary job unlocks,
    with a first target of what that job's crew made a day, so production holds through the switch
    (tests/ui/worksTier.test.ts). ± on a target moves by the power of ten below it. Jobs outside any
    works (wood, flint, Build, the machine shop's lathes) stay rows of people. Foremen and departments
    are optional: the playtest bot stays on the people tier.
