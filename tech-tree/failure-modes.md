# Hidden failure modes and trap options

Two kinds of teaching failure:

- **Hidden flaws** live in late-stage hardware. The player can't see them in the design; testing
  reveals them, fixing costs time, and launching with them risks the pilot.
- **Traps** are visible options that look reasonable, can be built, and fail for a real reason the
  game shows. They cost time, never the run.

## How the test campaign works

Deterministic and legible; the only chance in the game is at launch, and it's shown.

- Each design carries a set of flaws derived from its choices and the colony's state: `injector_quality: 0`
  guarantees `combustion_instability`; hammered plate or `welders_trained < 50` adds `tank_weld_crack`; a LOX
  lander adds `lox_boiloff` and `engine_restart_failure`; radio command adds `cutoff_signal_delay`; and so on.
- Each flaw has a hidden **exposure** count: how many tests of the right kind reveal it. Instrumentation
  and relevant skills lower it. The *kind* of test that finds each category is public (the notebook says
  "instability shows in static fires"), so a knowledgeable player tests the right way.
- A clean test reports which categories it exercised, so "three clean static fires" means something about
  the engine and nothing about staging.
- At launch each unfixed flaw has a stated severity: **fatal**, **mission loss**, or **survivable with
  margin** (absorbed if `dv_margin_km_s` and midcourse allow). The outcome is resolved from a run seed, so
  the same choices give the same result. A pilot's death costs two years and the run continues.

Fix times are proposals in in-game months before skill modifiers. Implementation: work package H.

## Hidden flaws

| Flaw | What it is | Revealed by | Fix | Months | Real history |
| --- | --- | --- | --- | --- | --- |
| `combustion_instability` | Pressure waves in the chamber couple with combustion and grow until the engine shakes apart or burns through | Static fires; far more often with instrumentation. Deliberate "bomb" tests reveal it on purpose | Injector baffles and redesigned injection patterns | 6-12 | The F-1's instability destroyed test engines; engineers set off small bombs in running engines in over 2,000 tests and added baffles. No F-1 had an instability in flight. [NASA](https://www.nasa.gov/history/solving-combustion-instability-and-saving-americas-first-trips-to-the-moon) |
| `hard_start` | Propellant pools in the chamber before ignition, then detonates | Static fires (first few ignitions) | Ignition sequencing: igniter first, then oxidizer lead, then fuel | 2 | Common early engine failure (general engineering knowledge; treat as estimate) |
| `turbopump_cavitation` | Pressure at the pump inlet falls below the propellant's vapor pressure; bubbles form and collapse, thrust drops and the pump erodes | Long static fires at full flow | Raise tank pressure, add an inducer stage, redesign inlet | 4 | Standard turbomachinery problem ([Cavitation](https://en.wikipedia.org/wiki/Cavitation)) |
| `turbine_bearing_seizure` | Bearings overheat at speed, especially with one side cryogenic | Full-duration static fires | Better bearings and cooling; depends on `tolerance_mm` | 4 | Estimate |
| `pogo` | Thrust oscillation couples with the vehicle's structure and the propellant lines, shaking the whole rocket lengthwise | Instrumented test flights only; static fires can't show it | Accumulators in the feed lines; change tank pressure | 4 | Titan II needed accumulators before Gemini; Apollo 13's center engine shut down early from pogo, fixed with a helium accumulator on Apollo 14. [Pogo oscillation](https://en.wikipedia.org/wiki/Pogo_oscillation) |
| `tank_weld_crack` | A hidden void or crack in a tank weld opens under pressure and cold | Proof-pressure tests (destroys a tank) or X-ray inspection (doesn't) | Reweld and re-inspect | 2 | General practice; see [Industrial radiography](https://en.wikipedia.org/wiki/Industrial_radiography) |
| `lox_line_icing` | Moisture in lines freezes when liquid oxygen flows and blocks valves | Tanking tests and static fires | Purge lines with dry nitrogen before loading | 1 | General cryogenic practice (estimate) |
| `slosh` | Propellant sloshing in tanks couples with steering, or uncovers the pump inlet | Test flights | Anti-slosh baffles in tanks | 3 | Estimate |
| `aero_instability` | The rocket becomes unstable passing Mach 1 as the center of pressure shifts | Guided test flights or a supersonic wind tunnel (before any flight) | Change fin size and position | 3 | Estimate |
| `separation_recontact` | The spent stage bumps the next stage after separation | Test flights | Retro motors on the spent stage, ullage motors on the next | 2 | Estimate |
| `gyro_drift` | Guidance errors accumulate; cutoff comes at the wrong speed | Lunar impactor or orbital flights | Better bearings, calibration runs; depends on `guidance_quality` | 3 | General inertial guidance problem |
| `cutoff_signal_delay` | Ground-commanded engine cutoff arrives late | Lunar impactor flights with radio command guidance | Onboard timer backup, faster ground chain | 2 | Luna 1's late cutoff added ~175 m/s and it missed the Moon by ~5,900 km. [Luna 1](https://en.wikipedia.org/wiki/Luna_1) |
| `engine_restart_failure` | The lander engine fails to relight after days of coasting | Vacuum restart tests or uncrewed landings | Hypergolic propellants, ullage motors, redundant igniters | 4 | Estimate; hypergolics were chosen for landers partly for reliable ignition |
| `lox_boiloff` | A liquid-oxygen lander loses too much propellant during the three-day coast | Tanking-and-hold tests | Insulation, larger tanks, or switch to hypergolics | 3 | Physics; oxygen boils at -183 °C |
| `radar_lockon_failure` | The altimeter loses the surface or reads side lobes; braking starts at the wrong height | Uncrewed landings | Antenna redesign, redundant altimeter | 3 | Estimate. Luna 9's altimeter triggered braking at 75 km. [Luna 9](https://en.wikipedia.org/wiki/Luna_9) |
| `landing_boulder_field` | The chosen site is rougher than expected | Uncrewed landings (photos) or a throttleable engine that lets the pilot divert | Throttle and hover capability, better site selection | 3 | Apollo 11 diverted from a boulder field under manual control (commonly cited) |
| `capsule_leak` | The pressure hull loses air over hours | Vacuum chamber tests | Reseal; a pressure suit makes it survivable | 2 | Estimate |
| `co2_scrubber_saturation` | Absorber capacity is too small for the mission length plus margin | Crewed chamber runs of full mission length | Larger or more canisters | 1 | Estimate |
| `peroxide_decomposition` | Contaminated high-test peroxide decomposes in the turbopump gas generator feed | Static fires | Passivation of tanks and lines, cleanliness procedures | 2 | Estimate; peroxide's sensitivity to contamination is well known |

Suggested severities: combustion instability, hard start, weld crack, capsule leak without a suit,
scrubber saturation and radar lock-on failure are *fatal* if they strike in crewed flight; pogo and
slosh are *mission loss* unless severe; gyro drift and cutoff delay are *survivable with margin* if
the vehicle has spare Δv and midcourse correction; a boulder field is *fatal* without a throttle.

A launch escape system turns booster-phase flaws from *fatal* into *vehicle loss*.

## Trap options

| Trap | Stage | Why it fails | What the game shows |
| --- | --- | --- | --- |
| `savery_pump` | 2 | A pump that sucks can't lift water more than ~10 m, because air pressure does the pushing; pushing higher with steam pressure bursts early boilers | The mine drains to 9 m and stops; a boiler bursts if pushed. [Steam power during the Industrial Revolution](https://en.wikipedia.org/wiki/Steam_power_during_the_Industrial_Revolution) |
| Bessemer with phosphorus ore (`bessemer_converter` when `iron_ore_phosphorus: high`) | 3 | The acid lining can't remove phosphorus, so the steel is cold-short | Steel that cracks in cold weather until the basic lining. [Gilchrist-Thomas process](https://en.wikipedia.org/wiki/Gilchrist%E2%80%93Thomas_process) |
| `magneto_generator` | 3 | Permanent magnets of the era were weak; output doesn't scale | A generator stuck at a few hundred watts |
| `cascade_liquefier` | 4 | A laboratory chain of fragile stages, liters per day | LOX output flat far below the gate |
| Black-powder stage (rocket workshop what-if) | 6 | Exhaust speed ~0.8 km/s; orbit needs a mass ratio of ~130,000 | The Δv bar with a black-powder stage selected |
| `pressure_fed_booster_engine` | 5 → 6 | Tank pressure must exceed chamber pressure, so booster tanks are heavy | Passes the Stage 5 gate; in the workshop the first stage's dry mass balloons. [Pressure-fed engine](https://en.wikipedia.org/wiki/Pressure-fed_engine), [Sea Dragon](https://en.wikipedia.org/wiki/Sea_Dragon_(rocket)) |
| Single stage (rocket workshop what-if) | 6 | Best mass ratio of a steel stage is ~7; ln(7) × 2.9 km/s ≈ 5.7 km/s | The Δv bar stops short of orbit even with no payload |
| Steel tanks on every stage (no aluminum) | 6 | Structural fraction 0.14 vs 0.09 | Needs a much larger vehicle; possible, but slower to build and test |
| LOX lander without insulation | 6 | Boil-off over a three-day coast | Adds `lox_boiloff`; shows the case for storable propellants |
| No midcourse correction with radio command guidance | 6 | Small cutoff errors grow over 380,000 km | The impactor misses; teaches why Luna 1 missed |

Pressure-fed upper stages and landers are *not* traps: the Apollo lunar module descent engine was
pressure-fed ([Descent propulsion system](https://en.wikipedia.org/wiki/Descent_propulsion_system)),
and the workshop should reward that choice for the lander.
