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
    conditions). Reading: they are engine metrics, answered by the engine's `StateView.get`, and
    listed in `tree.identifiers` as `undeclared`. Declare them, or keep them as metrics?
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
