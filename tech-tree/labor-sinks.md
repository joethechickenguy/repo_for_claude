# Labor sinks

The prototype's biggest gap is idle labor: real Stone Age crafts need few hands, and realistic
ancient yields don't employ thousands. These jobs and projects absorb large numbers of people
meaningfully, each tied to a problem the player can see. Nodes carry `tags: [labor_sink]`.

Rule of thumb for tuning: with 10,000 people, a project of 1 million person-days is about three
months for a crew of 1,000 at full speed; 10 million is a multi-year undertaking.

## Construction projects (one-off, large)

| Node | Stage | Person-days | Why it's meaningful |
| --- | --- | --- | --- |
| `trail_green_stones` | 1 | 1.2M | Opens the ore; mid-way find of native copper keeps it lively |
| `ore_road` | 1 | 2.0M | Halves porter labor forever; teaches the hidden cost of hauling |
| `wind_furnaces` | 1 | 2.4M | Triples smelting |
| `tin_survey_kestel` | 1 | 2.5M | Weeks-long expedition; trains miners on the way |
| `coppicing` | 2 | 1.5M, repeatable | Plants a sustainable fuel supply |
| `blast_furnace` | 2 | 2.5M | The big masonry furnace |
| `drainage_adit` | 2 | 3.0M | Drains the mine by gravity, forever |
| `surface_plates` | 3 | 0.6M | Hours of scraping per plate, but trains machinists |
| `rails_wagonways` | 3 | 5.0M, repeatable | Each route permanently frees haul labor |
| `mineral_prospecting` | 3 | 1.5M | Survey parties across the region |
| `portland_cement` | 3 | 1.2M | Kilns and quarries for every foundation to come |
| `distribution_grid` | 4 | 3.0M | Poles, wire, substations across the colony |
| `oil_drilling` | 4 | 2.5M | Rigs, pipelines, a rail spur |
| `haber_bosch` | 4 | 3.5M | The largest chemical plant in the tree |
| `test_stand` | 5 | 3.0M | Concrete bunker and flame deflector |
| `launch_complex` | 6 | 12.0M | The biggest single project in the game |
| `lox_plant_scaleup` | 6 | 3.0M, repeatable | Every expansion shortens the test campaign |
| `tracking_network` | 6 | 2.5M | Dishes and relay stations |

## Standing jobs (ongoing, scale with need)

| Job | Unlocked by | Scales with | Notes |
| --- | --- | --- | --- |
| `grind_axes` | `ground_stone_axes` | Wood demand | Grinding is slow; a real Neolithic labor sink |
| `hunt_for_hides` | `pot_bellows` | Number of bellows | Upkeep for leather diaphragms |
| `bail_mine` | `mine_drainage_manual` | `mine_water_m` | Grows as mines deepen, which makes the steam engine's value visible as freed people |
| `walk_treadwheel` | `blast_furnace` (blast_source dial) | Furnace count | ~60 walkers per furnace; one water wheel replaces them |
| `tend_niter_beds` | `niter_beds` (Stage 3) | Nitrate demand | A year or more before the first harvest |
| `puddle_iron` | `puddling` | Wrought iron demand | Brutal, skilled; replaced by steel later |
| `mine_mineral` | `mineral_prospecting` | Number of sites | One crew per mineral |
| `compute` | `human_computers` | Design and tracking work | Hundreds of human computers; the orbital mechanics pages replace much of it |
| `farm_fuel_crops` | `fuel_alcohol` | Alcohol demand | Only if you lack oil: a V-2 burned about four tons of alcohol per flight |
| `teach` | `apprentice_system` | Trained specialists wanted | Immortal colonists can learn several trades; teaching is how you convert idle labor into skill |

## Design notes

- **Tie sinks to visible problems.** `bail_mine` is the best example: the crowd of pumpers is the
  visible cost that a steam engine removes. Players feel the engine's value as people returned to
  the idle pool.
- **Repeatable projects** (`rails_wagonways`, `lox_plant_scaleup`, `covered_stores`) are the pressure
  valve for late-game idle labor. Each repeat should give a smaller but real gain.
- **Training as a sink.** Because colonists are immortal, cross-training is permanent value. The
  apprenticeship system can soak up idle people in every stage.
- **Muscle vs machines.** Several sinks (treadwheels, bucket chains, blowpipes) exist so a later
  machine can replace them. The game should show the people freed when that happens, since freed
  labor is the real payoff of energy.
