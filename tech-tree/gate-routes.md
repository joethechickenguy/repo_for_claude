# Gate route maps

Each stage offers 3-4 routes to its gate. Every route passes; they differ in time, cost and the
state they leave behind. Routes marked **T** are traps: buildable, historically real, and they
teach something by falling short. A trap never blocks the run; the player backs out and takes
another route, having lost time.

Later nodes read the state variables named here (see
[generated/state-index.md](generated/state-index.md) for every reader and writer).

---

## Stage 1 → Reliable smelting

Shared spine: digging sticks → pit kiln → charcoal clamps → trail to the green stones →
crucibles and blowpipes → stone molds.

| Route | Adds | Speed | Leaves behind |
| --- | --- | --- | --- |
| **A. Wind** | `wind_furnaces` | Fastest to the gate if you have a ridge; 3× smelting | `has_wind_furnaces`. No portable forced draft, so Stage 2's bloomery must be built on the ridge too, far from the iron ore unless the survey found both together. |
| **B. Bellows** | `pot_bellows` (+ hunting for hides) | Medium; 2× smelting anywhere | `has_bellows`. Bloomeries can go next to the iron ore; slightly faster start in Stage 2. A standing hunting job that later feeds pump leather. |
| **C. Arsenic** | `arsenical_copper` | Fast; tools last 1.6× | `arsenic_exposure` scar (some smelters die at fixed thresholds). Fewer toolmakers needed, so more builders early. No forced-draft upgrade: Stage 2 must build bellows first. |
| **D. Tin** | `tin_survey_kestel` → `tin_bronze` | Slowest (a long expedition, a big labor sink); tools last 2× | `has_bronze`, `has_tin_source`, `trained_miners` from the expedition. Needs the geological survey bundle. Best tools going into Stage 2, and bronze stays useful for bearings and bellows fittings. |

Also carried forward from every route: `forest_cover` (charcoal eats forest), `ore_type` (if the
malachite ran out and roasting began), and trained smiths.

---

## Stage 2 → A working steam engine

Shared spine: iron prospecting → bloomery → smithing → charcoal blast furnace → coal → sand
casting. The flooding mine (`mine_depth_m` rising, pumpers growing) is the visible problem.

| Route | Adds | Speed | Leaves behind |
| --- | --- | --- | --- |
| **A. Newcomen** | `newcomen_engine` | Fast; works with loose pistons | `engine_type: newcomen`, high `coal_per_engine_kw`. Every engine must be replaced or rebuilt in Stage 3 for factory power; machinists unchanged. Sensible only on a coalfield. |
| **B. Watt** | `boring_mill` → `watt_engine` | Slow (two big projects) | `engine_type: watt`, `has_boring_mill`, `machinists_trained` up sharply. Stage 3 machine tools start cheaper, and rotative engines are one step away. |
| **C. High pressure** | `plate_rolling` → `high_pressure_engine` | Medium | `engine_type: high_pressure`, `has_rolling_mill`, `plate_quality: rolled`, `boiler_explosions` scar (fixed number of risky years). Locomotives in Stage 3 need no extra plate work. |
| **T. Savery** | `savery_pump` | Quick to build, then fails | Drains only the top ~10 m of lift; pushing harder bursts boilers. Teaches the suction limit. Leaves `boiler_explosions` if pushed. The player then takes A, B or C. |

Also carried forward: `coal_sulfur` (which seam was found), `forest_cover` and `coppice_area`,
`has_coke`, `has_nitrate` if niter beds were started (they pay off slowly), water wheels.

---

## Stage 3 → Electric power

Shared spine: rotative engines → surface plates → lathe → gauges → glass → sulfuric acid →
Bessemer → wire → insulation → batteries → electromagnets.

| Route | Adds | Speed | Leaves behind |
| --- | --- | --- | --- |
| **A. Steam dynamo** | `dynamo` on rotative engines | Default | Power tied to coal; `factory_power_kw` high. Stage 4 power station grows from this. |
| **B. Water turbine** | `water_turbine` → `dynamo` | Slower (turbine first), then free power | `hydro_kw`. Cheaper electricity in Stage 4, which makes the Birkeland-Eyde nitrogen route and aluminum attractive. Requires `river_sites`. |
| **T. Magneto** | `magneto_generator` | Quick | Caps at a few hundred watts; can't reach 50 kW. Teaches why self-excitation mattered. |

Steel side-branches carry forward as `steel_quality` (0-3): Bessemer alone gives 1; manganese,
the basic lining (only needed if `iron_ore_phosphorus: high`) and open hearth each add one.
Pressure vessels and turbines in Stage 4 read it. Also carried: `rail_km`, `has_locomotive`,
`hcl_pollution` if Leblanc soda was used, `has_ammonia_byproduct`.

---

## Stage 4 → Liquid oxygen on tap

Shared spine: grid → arc furnace → alloy steels → compressors → vacuum pumps → Dewar flasks →
welding.

| Route | Adds | Speed | Leaves behind |
| --- | --- | --- | --- |
| **A. Linde** | `linde_liquefier` → `air_separation` | Default | `cryo_process: linde`, higher electricity per kg LOX. Stage 6 oxygen plant expansions cost more power. |
| **B. Claude** | `claude_expander` → `air_separation` | Slower, harder (precision cold machinery) | `cryo_process: claude`, about half the energy per kg; `machinists_trained` up. Stage 5 turbomachinery benefits. |
| **T. Cascade** | `cascade_liquefier` | Quick | Liters a day; can't reach 500 kg/day. Teaches the difference between proving a thing and producing it. |

Optional branches that matter later: aluminum (`has_aluminum`, `has_duralumin` enable light tanks),
oil (`has_kerosene`), nitrogen route (`nitrate_source`: haber, arc or niter beds, which caps nitric
acid for hypergolics), `has_caustic` (life support), `max_pressure_atm`.

---

## Stage 5 → A booster-class engine

Shared spine: precision grinding → tubes → radio → instrumentation → gyroscopes → test stand →
first small rocket → injectors → regenerative cooling.

| Route | Adds | Speed | Leaves behind |
| --- | --- | --- | --- |
| **A. Peroxide-steam turbopump** | `hydrogen_peroxide` → `steam_turbopump` | Medium; a chemical plant plus a pump | `feed_system: steam_turbopump`. V-2 style. Light booster tanks. Peroxide handling is a standing hazard. |
| **B. Gas-generator turbopump** | `gas_generator_turbopump` | Slowest; hardest machining | `feed_system: gas_generator`, `turbopump_quality` higher, no peroxide plant. Best booster performance in the workshop. |
| **T. Pressure-fed booster** | `pressure_fed_booster_engine` | Fastest to the gate | `feed_system: pressure`. Passes the gate, then in the workshop the first stage carries boiler-thick tanks (+0.08 structural fraction, -25 s). The player can still build a turbopump in Stage 6, paying the time then. Teaches why tank pressure must exceed chamber pressure. |

Also carried: `has_hypergolics` (lander option), `has_solids` (separation and escape motors),
`has_ethanol` or `has_kerosene`, `guidance_quality`, `injector_quality`, `has_weld_xray`,
`has_wind_tunnel`, `calc_hours`.

---

## Stage 6 → A living pilot on the Moon

Shared spine: workshop → staging → launch complex → oxygen plant → tracking → capsule → life
support → lander → radar altimeter → test campaign.

| Route | Adds | Speed | Leaves behind |
| --- | --- | --- | --- |
| **A. Direct ascent, Luna style** | radio command or inertial guidance; `lunar_impactor` as the key test | Faster; no orbital test needed | Straight from launch to the Moon, as Luna 2 and Luna 9 flew. Tight launch windows; guidance errors at cutoff are costly without midcourse correction. |
| **B. Parking orbit** | inertial guidance; `uncrewed_orbital_flight` as the key test | Slower; more flexible | Coast in Earth orbit, then restart the upper stage toward the Moon. Needs an upper-stage restart (ullage motors from `solid_motors`) and inertial guidance, since the burn may be out of radio sight. More launch opportunities. |
| **T. Single stage** | `single_stage_attempt` in the workshop | Instant | The workshop's Δv bar stops far short. Teaches the rocket equation's logarithm. |

Then the final skill decision: how many tests to run before launching with the flaws you haven't
found. The score is the year of a landing the pilot survives.
