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
