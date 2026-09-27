# Energy per person: accounting and calibration

The headline number is watts per person on a log slide rule, 100 W to 10 kW. This file proposes
accounting rules, recalibrated gates, per-source impacts, and a bottom-up estimate for the launch.
Everything marked *estimate* is arithmetic on assumed rates, not sourced data.

Conversion used throughout: **1 W per person = 10 kW for the colony = 864 MJ per day.**

## 1. A problem with counting raw fuel

The prototype counts fuel burned for real work. That works for Stage 1, but it breaks at the steam
engine, because it rewards waste:

- A Newcomen engine delivering 10 kW of pumping work at roughly 0.5% efficiency burns about 2 MW of
  coal heat (about 6 t of coal a day). That alone adds **~200 W per person**.
- A Watt engine doing the same work burns about a quarter of that, adding ~50 W per person.

So under raw accounting, the worse engine races you toward the gate, and every efficiency
improvement (Watt, hot blast, turbines, the Claude cycle) makes the number fall. That fights pillar
3: understanding should save years, not cost watts.

Early Newcomen efficiency of about a third of a percent and Watt's ~75% fuel saving are sourced
([Newcomen atmospheric engine](https://en.wikipedia.org/wiki/Newcomen_atmospheric_engine),
[Steam engine](https://en.wikipedia.org/wiki/Steam_engine)); the 10 kW engine is an estimate.

## 2. Proposed accounting rules

Keep the designer's four rules, and add a fifth for engines:

1. Per person, not total.
2. Only energy used for real work counts; stockpiles don't.
3. Sources are gated by technology.
4. Quality may need weighting.
5. **Heat processes count the fuel. Engines and electricity count the work they deliver, times a
   fixed factor of 2.5.**

Rule 5 is how energy statisticians already compare electricity with fuel (the "primary energy
equivalent" or substitution method): a unit of work or electricity is counted as the fuel a
reference plant would need to make it. A fixed factor, rather than the colony's actual efficiency,
means a better engine is never penalized: the same work shows the same watts, and the coal saved
can go to furnaces that raise the number.

| Energy | Counted as | Value |
| --- | --- | --- |
| Wood burned in a kiln or furnace | fuel heat | 15 MJ/kg (prototype) |
| Charcoal burned for smelting | fuel heat including clamp losses | ~75 MJ/kg (29 MJ + ~46 MJ of wood lost; prototype) |
| Coal or coke burned for heat | fuel heat | ~27 MJ/kg (estimate; coals range roughly 24-33) |
| Oil or kerosene burned for heat | fuel heat | ~43 MJ/kg |
| Water wheel, turbine, steam or electric motor work | delivered work × 2.5 | |
| Electricity used | delivered electricity × 2.5 | |
| Muscle, including treadwheels | not counted beyond the 120 W baseline | |

Charcoal heating value (27-33 MJ/kg) and traditional kiln yields (20-30%) are sourced
([energypedia](https://energypedia.info/wiki/Charcoal_Production)).

This also answers the designer's rule 4 without a separate "quality" multiplier: mechanical and
electrical energy already count 2.5× per joule, so a civilization that turns heat into work and
electricity climbs faster than one that only burns wood.

## 3. Historical reference points

These are whole-society figures (Smil's numbers were found via search snippets of the linked article and a [review of *Energy and Civilization*](https://www.strataoftheworld.com/2018/10/review-energy-and-civilization-history.html); verify against the book before quoting them in-game), including food, cooking and heating, which the game doesn't count
beyond its 120 W baseline. They bracket where the gates should sit rather than set them.

| Society | Energy per person | Source |
| --- | --- | --- |
| Foragers | ~10 GJ/year ≈ 320 W, split between food and open fires | [Smil, *Science, energy, ethics, and civilization*](https://vaclavsmil.com/wp-content/uploads/2024/10/smil-articles-science-energy-ethics-civilization.pdf) |
| Han China, wood and charcoal economy | approaching 20 GJ/year ≈ 630 W | same |
| Industrial England, late 1800s | ~100 GJ/year ≈ 3.2 kW | same |
| United States, 1960 | ~44 quadrillion BTU / ~180 million people ≈ 8 kW | [EIA Monthly Energy Review, sec. 1](https://www.eia.gov/totalenergy/data/monthly/pdf/sec1.pdf) (population estimate ours) |

Most pre-industrial energy went into heating homes and cooking, which this colony skips. A lean
colony that spends everything on production should therefore reach each capability at a lower
figure than the historical society that first had it.

## 4. Proposed gates

| Gate | Prototype | Proposed | What it takes, roughly (estimate) |
| --- | --- | --- | --- |
| Start | 120 W | 120 W | Metabolism plus cooking fires (game convention) |
| 1. Reliable smelting | 400 W | **250 W** | ~1,500 kg of charcoal burned per day: about 300 blowpipe smelters, or 100 at wind furnaces, fed by ~75 charcoal burners |
| 2. Steam engine | 1.5 kW | **600 W** | Three to four blast furnaces' worth of fuel, or the equivalent in coke and forges. Near the Han China figure, reached with no home heating |
| 3. Generator | 4 kW | **1.5 kW** | ~45 t of coal a day: about 6 t of iron a day at hot-blast fuel rates plus factory engines and kilns |
| 4. Liquid oxygen | (none) | **2.5 kW** | Steel and chemicals at scale plus ~2 MW of electricity (counts ×2.5, ~500 W) |
| 5. Engine | (none) | **3.5 kW** | Aluminum, alloy steel, refinery and test-stand loads on top |
| 6. Landing | 8 kW | **checklist** | Energy isn't the limit here; see section 6 |

These keep the slide rule's log scale busy: the jumps are ×2.1, ×2.4, ×2.5, ×1.7, ×1.4. The last
two are smaller, which fits the story that late stages are about capability more than raw power.

## 5. Energy impact by source

Watts per person for a typical installation, under the rules above. All installation sizes are
estimates chosen to be plausible for a 10,000-person colony.

| Source or load | Typical unit | Counted | Watts per person per unit |
| --- | --- | --- | --- |
| Pit kiln pottery | 100 potters (2,400 kg wood/day) | fuel | ~40 W |
| Blowpipe copper smelter | 1 smelter (5 kg charcoal/day) | fuel | ~0.4 W |
| Wind-furnace smelter | 1 smelter (15 kg charcoal/day) | fuel | ~1.3 W |
| Bloomery | 1 furnace crew (10 kg charcoal/day) | fuel | ~0.9 W |
| Charcoal blast furnace | 1 t iron/day at ~1.5 t charcoal/t | fuel | ~130 W |
| Cold-blast coke furnace | 1 t iron/day at ~8 t coal/t | fuel | ~250 W |
| Hot-blast coke furnace | 1 t iron/day at ~5 t coal/t | fuel | ~160 W |
| Water wheel | 3 kW delivered | work × 2.5 | ~0.75 W |
| Newcomen or Watt engine | 10 kW delivered | work × 2.5 | ~2.5 W (either one) |
| Factory steam plant | 500 kW delivered | work × 2.5 | ~125 W |
| Dynamo at the gate | 50 kW electric | × 2.5 | ~12.5 W |
| Grid, mid Stage 4 | 2 MW electric | × 2.5 | ~500 W |
| Aluminum smelter | 1 t/day at ~20 kWh/kg | × 2.5 | ~210 W |
| Liquid oxygen plant | 500 kg/day at ~1 kWh/kg | × 2.5 | ~5 W |
| Liquid oxygen plant, Stage 6 | 50 t/day | × 2.5 | ~520 W |

Hot-blast figures come from Neilson's 8.06 → 5.16 long tons of coal per ton of iron
([Hot blast](https://en.wikipedia.org/wiki/Hot_blast)). Aluminum's theoretical minimum of
6.23 kWh/kg and ~15 kWh/kg in 2003 are sourced
([Hall-Héroult process](https://en.wikipedia.org/wiki/Hall%E2%80%93H%C3%A9roult_process)); the 20 kWh/kg
for an early plant is an estimate. Liquid oxygen at ~1 kWh/kg for an early plant is an estimate.

Visible surges, in order: charcoal smelting, blast furnaces, coal, factory steam, the grid, the arc
furnace and aluminum, and the Stage 6 oxygen plant. The Newcomen-to-Watt switch is deliberately
flat.

## 6. Bottom-up launch estimate

What does the rocket itself cost in energy? Much less than the handoff's 8 kW suggests.

**Propellant (estimate).** The mockup's four-stage vehicle carries about 540 t of propellant; with
kerosene and liquid oxygen at a mixture ratio of about 2.3, that's roughly 375 t of oxygen per
launch. Suppose the whole campaign, static fires and test flights included, burns ten vehicles'
worth: 3,750 t of oxygen. At ~1 kWh/kg that's 3.75 GWh over about five years, an average of
~85 kW, which counts as **about 20 W per person**. The fuel itself, ~1,650 t of kerosene at 43 MJ/kg
over the same five years, adds **~45 W per person**.

**Industrial base (estimate).** The real load is keeping the factories running:

| Load | Assumption | Watts per person |
| --- | --- | --- |
| Iron and steel | ~20,000 t/year at ~25 GJ/t | ~1.6 kW |
| Electricity | 3-5 MW for grid, arc furnaces, aluminum, oxygen, machine shops (× 2.5) | ~0.8-1.3 kW |
| Chemicals, cement, refinery heat | | ~0.5-1 kW |
| Propellant (above) | | ~0.07 kW |
| Total | | **~3-4 kW** |

So a lean colony can plausibly be launch-ready around 3.5-4 kW per person, about half the 1960 US
figure, which included cars, homes and a whole consumer economy. That is why this tree ends Stage 5
at 3.5 kW and gates Stage 6 on a capability checklist instead of watts: cryogenics (`has_lox`,
`lox_kg_per_day`), precision turbomachinery (`feed_system`, `tolerance_mm`), guidance
(`guidance_mode`, `has_tracking`), and life support (`life_support_days`, capsule). The slide rule
keeps climbing in Stage 6 as the oxygen plant scales, which keeps the dopamine loop alive, but the
checklist decides.

## 7. Open calibration questions

- **The 2.5 factor.** It's close to the inverse of a mid-20th-century thermal plant's efficiency.
  Early plants were much worse (often 10% or less), so the factor understates what the colony
  actually burns. That's intended, but a designer may prefer a factor that rises by stage.
- **Muscle.** The baseline treats all muscle as 120 W. Treadwheels and bucket chains do real work
  that isn't counted. This is deliberate (it keeps the number about fuel and machines) and should
  be explained once in the notebook.
- **Hydro.** Water power counts as work × 2.5 with no fuel. A hydro-heavy colony looks as energetic
  as a coal-heavy one, which seems right for capability.
- **Stage 1.** 250 W is reachable with a few hundred smelters. If the stage needs to be longer, raise
  the tool count, not the watts, so the gate still teaches "fuel for work".
