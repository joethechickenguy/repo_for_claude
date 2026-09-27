# Stage 2 redesigned: Iron

The template for restructuring every stage. Read this first; `stages/stage2-iron.yaml` encodes it.

**Targets.** About 90 minutes of play, 20-25 in-game years. A substantive decision every 3-5
minutes (about 25 in the stage), a small one every 30-60 seconds (several hundred), nothing that
forces a restart, and never more than two new controls introduced at once.

## The three layers

Every stage now has the same three layers, in the same visual style as the prototype.

1. **Pressures.** Bars that move on their own as the simulation runs. When one goes red, something
   stops working. They are why the player can't fast-forward: a stage left alone gets worse.
2. **Workshops.** Design screens with a few dials each, driven by real equations, where the
   player builds a thing and sees the consequences. Dials are added one at a time, each when a
   problem makes it necessary. Most of the small decisions live here.
3. **Nodes.** Projects, upgrades and forks, as before, but each appears because a pressure or a
   workshop result asks for it, not because the previous one finished.

The stage also has one **heartbeat resource**: fuel. Every furnace, kiln and engine draws on it,
and the fuel bar is always on screen. In Stage 1 the heartbeat was tools; fuel takes over here.

## Pressures in Stage 2

| Pressure | What makes it worse | What happens when red | Answers |
| --- | --- | --- | --- |
| **Fuel balance** (heartbeat) | Every furnace and engine burns it | Furnaces run short and stop; output falls | More burners, coppice, coal, hot blast, better engine |
| **Forest cover** | Charcoal burning, construction | Wood per burner falls; haul labor rises | Coppice, coal, move kilns |
| **Mine water** | Rises with cumulative ore and coal dug | Below the waterline, ore output falls unless people bail | Bucket chains, drainage adit, new shallow pits, engine |
| **Tool wear** (from Stage 1) | Every tool user | Workers drop to quarter speed | Toolmakers, iron tools, quenching |
| **Iron quality** | High-sulfur coke, high-phosphorus ore | Tool life and plate strength fall by a third | Low-sulfur seam, charcoal for the furnace, manganese (Stage 3) |

Forest and mine water grow slowly and predictably; a player watching the bars sees them coming.
Neither ends the run. A flooded mine still gives some ore from the upper galleries; a stripped
forest still gives wood from far away at high labor cost.

## Workshops in Stage 2

### Furnace workshop

Opens at the bloomery. Starts with two dials; gains three more during the stage.

| Dial | Introduced by | What it does | Real basis |
| --- | --- | --- | --- |
| Charcoal : ore ratio (0.5-2) | Bloomery | Too low: ore doesn't reduce, yield collapses. Too high: iron picks up carbon and comes out as brittle cast lumps the smiths can't use | Bloomery yield and carbon content depend on the fuel:ore ratio ([Bloomery](https://en.wikipedia.org/wiki/Bloomery)) |
| Air supply (bellows crews / wind) | Bloomery | Temperature. Below ~1,150 °C the slag freezes and the smelt fails | Forced draft is what raises a charcoal fire from ~900 to 1,200+ °C |
| Ore choice | Second deposit found | Grade sets yield; phosphorus sets quality | Bloomeries want ore above ~50% Fe ([Rom-Bohr](https://donwagner.dk/arch-iron/resources/Rom_Bohr_Bloomery.pdf)) |
| Stack height (3-10 m) + blast source | Blast furnace | Taller and harder-blown: iron absorbs carbon, melts, runs continuously. Needs a water wheel or a lot of treadwheel walkers | Cast iron at ~4% C melts near 1,150 °C |
| Fuel (charcoal / coke) + flux (lime per ton) | Coke ovens, lime burning | Coke frees the forest but carries sulfur; lime lets slag flow without stealing iron | Darby 1709, low-sulfur coal ([Darby](https://en.wikipedia.org/wiki/Abraham_Darby_I)) |

Each **campaign** (a furnace run of about a month) is one small decision: set the dials, run,
read the result (yield, carbon, sulfur, fuel used), adjust. A player who understands why the
result came out that way converges in two or three campaigns; one who doesn't takes ten. Both get
there. Roughly 60-100 campaigns in the stage.

### Engine workshop

Opens when mine water first goes red and sand casting exists. Starts with one option (Savery) and
one dial; gains four more.

| Dial | Introduced by | What it does | Real basis |
| --- | --- | --- | --- |
| Lift height | Savery pump | A suction pump stops at ~10 m however good it is | The atmosphere pushes water up at most ~10 m |
| Cylinder diameter (0.3-1.5 m) | Newcomen | Force = pressure difference × piston area; bigger cylinder, more pumping | Atmospheric engine: ~50 kPa effective × area |
| Boiler pressure (1-6 atm) | Any engine | More power from the same cylinder, more coal, more stress on the boiler | Force ∝ pressure; Trevithick's high-pressure engines |
| Plate thickness (3-20 mm) + plate type | Boiler design | Hoop stress σ = P·r/t must stay under the plate's safe limit; hammered plate has weak spots, rolled plate doesn't | Thin-wall pressure vessel formula |
| Separate condenser (on/off) | Watt option; needs a bored cylinder | Cuts coal by ~¾ | Watt 1765 ([Watt engine](https://en.wikipedia.org/wiki/Watt_steam_engine)) |

Outputs shown live: water lifted per day, coal per day, iron cost, and a **safety margin** bar.
The player can build a boiler with a thin margin. It's cheaper and faster, and in a fixed number
of years (deterministic, from the margin and plate type) it bursts, killing the crew and the
engine. The game says beforehand: "margin 1.2: expect a failure within four years." That's a
decision, not a dice roll.

Worked numbers the workshop should produce (estimates, for tuning): a 0.5 m Newcomen cylinder on a
2 m stroke at 12 strokes a minute delivers about 4 kW, enough to drain a mid-size mine, and burns
roughly 2-3 tons of coal a day at ~0.5% efficiency. The same engine with a separate condenser
burns under a ton.

## The stage, beat by beat

Eight beats of 10-12 minutes. Each introduces at most two new things. "S" is a substantive
decision (a fork or a design with lasting consequences); the small ones are the campaigns, job
allocations and repairs that run underneath.

| # | Beat | Problem the player sees | New controls | Substantive decisions |
| --- | --- | --- | --- | --- |
| 1 | **Finding iron** | "Iron ore is everywhere, but nobody can tell rich ore from red rock" | Prospecting job; deposit list | **S1** Which deposit to open first: near, lean, phosphorus-rich bog iron, or the far, rich hillside ore that needs a road |
| 2 | **The bloomery** | "Iron doesn't melt until 1,538 °C" | Furnace workshop (ratio, air) | **S2** Bellows or wind furnace for the blast (whichever Stage 1 lacked is now a project) |
| 3 | **Smithing and steel edges** | "The bloom is a spongy lump" then "iron edges are soft" | Iron tools in the tool mix; quench trials | **S3** Keep bronze for bearings and fittings, or melt it all into tools. **S4** Run quench trials (materials and smiths for a few months) or accept soft iron |
| 4 | **The forest** | Forest bar turns amber, then red | Fuel balance bar | **S5** Coppice (slow, capped, sustainable) vs coal (needs a seam; sulfur unknown) vs both. **S6** If coal: the near high-sulfur seam or the far low-sulfur one |
| 5 | **The blast furnace** | "A bloomery makes 30 kg a day; you need tons" | Furnace workshop gains height, blast source, fuel, flux | **S7** Blast from a water wheel (needs a river site, builds machining skill) or treadwheels (labor only). **S8** Charcoal or coke in the furnace, seeing the sulfur result. **S9** Finery forge for wrought iron, or keep bloomeries alongside |
| 6 | **Water in the mine** | Mine water bar red; pumpers multiplying | Mine depth bar; drainage options | **S10** Bail by hand, cut a drainage adit (huge project, only if the terrain allows), or open new shallow pits (eats land) |
| 7 | **Fire engines** | Pumpers now a tenth of the colony | Engine workshop: Savery first, then cylinder, pressure, plate, condenser one at a time | **S11** Try Savery (cheap, quick, teaches the 10 m limit). **S12** Boring mill first or not. **S13** Boiler margin: safe and heavy, or thin and fast |
| 8 | **The gate** | "An engine, not people, keeps the mine dry" | — | **S14** Newcomen now / Watt after the boring mill / high-pressure. Every option passes |

Plus recurring ones that don't fit a beat: **rebuild or patch** a furnace lining every few
campaigns; **where the toolmakers go** as iron replaces bronze; **which crew gets the water
wheel** when there's one site and three users.

Count: 14 substantive decisions in the table, plus fuel-vs-forest and mine-water responses that
recur as the bars move, is 20-25 over 90 minutes. Small decisions: 60-100 furnace campaigns,
30-40 job reallocations, 10-20 repairs, 5-10 engine design iterations.

## No restarts

Every bad choice costs time, none ends the run:

| Bad choice | Cost | Recovery |
| --- | --- | --- |
| Opened the phosphorus bog iron first | Tools a third weaker; Stage 3 Bessemer steel will be brittle | Open the hillside deposit later; basic lining in Stage 3 |
| Burned the forest down before coppicing | Charcoal haul labor triples | Coal, or a decade of regrowth |
| High-sulfur coke | Hot-short iron; tools and plate weaker | Switch seam, use charcoal in the furnace, manganese in Stage 3 |
| Thin boiler | Explosion in N years: engine lost, workers killed, `boiler_explosions` scar | Rebuild thicker |
| Savery pump | A few months and some copper | Try the next engine |
| Skipped the boring mill | Newcomen burns 4× coal; Stage 3 machine tools cost more | Build the mill in Stage 3 |
| Ignored mine water | Ore output falls to the upper galleries' rate | Pump, adit or engine, any time |

## Step-by-step introduction

Controls appear in this order, one or two per beat, each with its problem sentence and a
one-line "why this works". Nothing is on screen before it's needed.

1. Prospecting job → deposit list (beat 1)
2. Furnace workshop, two dials (beat 2)
3. Iron in the tool mix; quench trials (beat 3)
4. Fuel balance bar; forest responses (beat 4)
5. Furnace workshop, height and blast; then fuel and flux (beat 5, in two steps)
6. Mine water bar; drainage options (beat 6)
7. Engine workshop, one dial at a time: lift → cylinder → pressure → plate → condenser (beat 7)
8. Gate choice (beat 8)

## What changed from the first draft

- 25 nodes → 22 nodes plus 2 workshops and 5 pressures. Cut: wheelbarrows (now a milestone in the
  ore road), treadwheel bellows (now a blast-source option in the furnace workshop), the
  standalone "coke ovens" and "hot blast" as nodes (coke is a furnace fuel option; hot blast moves
  to Stage 3 where it belongs).
- Added: a deposit choice, a drainage adit, quench trials as a research loop, boiler margin as a
  design decision, and the two workshops.
- Nodes now carry `beat:` and most `requires` are pressures or workshop results rather than "the
  previous node finished". 4 of 25 nodes were state-triggered before; 15 of 22 are now.
- `without_pages` is a different route where it matters: without Metallurgy I, the bloomery's
  right ratio is found by campaigns instead of known (more campaigns, same outcome); without
  Steam Engines, the separate condenser doesn't appear until a Newcomen engine has run for two
  years (you have to see the waste before you can imagine the fix).
- Stage length 12 → ~22 in-game years, for the 100-200 year total.
