# Design review: the play experience and the tree

A critical read of the game as designed in the handoff and the tree as written in this repo. The
first part is about gameplay and treats every part of the design as changeable. The second part
reviews the tree itself. Recommendations are ranked; the first three in each part matter most.

## Part 1: the play experience

### 1. The real pacing lever is decisions per hour, not days per second

The design measures pacing in in-game years. That's the wrong unit. At 20× speed, a 12-year
stage passes in under four minutes of real time. Nobody will sit at 1× for six hours. So the
game's actual clock is **how often the player has a decision worth making**, and speed controls
are just how the player skips the gaps.

Target: one meaningful decision every 3-5 minutes, so 20-30 per 90-minute stage. The tree has
about 23 nodes per stage, which sounds right, but a node only counts as a decision if there's
something to decide. Most nodes are "the next thing is now available; build it". That's a
checklist, and checklists are the quiet death of this genre.

**Recommendation:** measure and tune the game by decision density. Every stage should have (a)
recurring allocation decisions that keep changing as the simulation moves, (b) design decisions
with parameters, and (c) a few forks. Sections 2 and 3 are how.

### 2. Give every stage a workshop

The rocket workshop is the best screen in the design: real equations, player-chosen parameters,
a computed result, consequences. It only exists in Stage 6. The other five stages ask the player
to click "Start building".

Every stage has an equation as good as the rocket equation. Put one design screen in each:

| Stage | Workshop | Parameters | Real equation or rule | What goes wrong |
| --- | --- | --- | --- | --- |
| 1 | Furnace | Height, charcoal:ore ratio, air supply (blowpipes / bellows / wind) | Temperature from fuel and air; yield from ratio | Too little air: slag freezes. Too much charcoal: metal too brittle |
| 2 | Steam engine | Cylinder diameter, boiler pressure, plate thickness, condenser yes/no | Power ∝ pressure × area × stroke rate; hoop stress σ = P·r/t; Newcomen vs Watt fuel | Thin plate at high pressure: explosion. No condenser: 4× coal |
| 3 | Steel heat | Ore (phosphorus level), lining, manganese addition, blow time | Phosphorus stays without a basic lining; sulfur stays without Mn | Cold-short or hot-short steel that cracks |
| 4 | Liquefier | Compressor pressure, heat-exchanger length, expansion method | Joule-Thomson ΔT per bar; regenerative gain per pass | Runs for days without reaching -190 °C |
| 5 | Engine | Chamber pressure, mixture ratio, feed system, cooling, injector type | Isp from chamber pressure and expansion; wall heat flux vs coolant | Burn-through, instability, cavitation |
| 6 | Rocket | (existing) | Δv = v_e ln(m₀/m_f) | Falls short, or flaws |

The physics can be simple curves; the point is that the player turns a dial and sees why. This
does more for "learn science by playing" than a hundred notebook entries, because the notebook
explains but the workshop tests. It also converts the 20-odd "just build it" nodes per stage into
a handful of design problems with many possible answers.

### 3. Let problems come from the simulation, not the script

The prototype's best moment is watching the forest bar drop and realizing charcoal is going to
run out. The tree mostly doesn't work like that: only 11 of 139 nodes are triggered by a
simulation state; 128 appear because the previous node completed. The handoff already rejected
"turn-based sliders" because it felt like changing numbers rather than making something. A
scripted unlock sequence has the opposite problem: it feels like reading a book with a progress
bar.

**Recommendation:** every stage needs three to five simulated pressures that get worse on their
own, each with several possible answers. Then nodes are answers to pressures, and the player
chooses which answer.

| Stage | Pressures that grow on their own | Answers the player picks from |
| --- | --- | --- |
| 1 | Tool wear outruns knapping; nearest wood gets farther; ore outcrop depletes | Ground axes, copper, bronze, roads, ore roasting, new surveys |
| 2 | Forest cover falls; mines flood as they deepen; iron sulfur from bad coal | Coppice, coal, pumps, engines, coke, better seams |
| 3 | Machines need parts no one can make to fit; iron too weak for pressure; hauling eats labor | Machine tools, steel, rails |
| 4 | Electricity demand outruns generation; chemicals need feedstocks; forest and coal both strained | Grid, turbines, hydro, oil, electrochemistry |
| 5 | Test-stand time and LOX are scarce; every test burns propellant | Plant expansion, instrumentation (learn more per test) |
| 6 | The calendar: every test month costs score; every skipped test risks the pilot | The test campaign |

This also fixes the "one thing at a time" risk in Stage 4, where the tree currently makes six
chemistry branches available at once. If aluminum only appears once the workshop shows a steel
rocket too heavy to fly, and oil only once alcohol farms are eating too much land, the player
meets them one at a time, each with a reason.

### 4. One scarce currency per stage

Stage 1 works because of tools: everyone wants one, they wear out, and the toolmaker/worker
balance is a constant small decision. Nothing in the later tree plays that role. Give each stage
its own heartbeat resource that every job pulls on:

| Stage | Heartbeat | Balance the player tends |
| --- | --- | --- |
| 1 | Tools | Toolmakers vs everyone else |
| 2 | Fuel (charcoal, then coal) | Burners and miners vs furnaces |
| 3 | Machine-shop hours | What gets machined first: engines, tools, rails, wire |
| 4 | Kilowatts | Generation vs the loads: arc furnace, aluminum, oxygen, electrolysis |
| 5 | Test-stand time and liquid oxygen | Tests vs production; which engine gets stand time |
| 6 | Calendar months and Δv margin | Testing vs launching; margin vs payload |

Each is a visible bar that goes red when overdrawn, in the style the prototype already uses.

### 5. Make the draft qualitative, not a speed bonus

The draft is the most interesting decision in the game and the tree undersells it. In 80 of 139
nodes, not having the pages means "the same thing at 1.5-4× the labor". That's a speed penalty,
not a different game.

**Recommendation:** without pages, a node isn't slower, it's *different*:

- It becomes a **research job**: assign people to experiment, consuming materials, with visible
  partial progress and dead ends (deterministic, not random: "the first three quench trials crack;
  the fourth holds").
- Or it's replaced by a **historical substitute** with different state effects (niter beds instead
  of Haber, arsenic instead of tin, Leblanc instead of Solvay), leaving scars.
- Or it's **locked behind a prerequisite discovery** the pages would have skipped (you must build
  a Newcomen engine before you can conceive a separate condenser; with the pages you can go straight
  to Watt).

Then two players with different drafts play different trees, which is the replayability the
speedrun categories need. Roster synergies (machinists make machine-tool pages worth more) already
point this way; push it further so that pages without people and people without pages both fall
short.

### 6. Reconsider 10,000 people

The colony size causes two of the listed open problems (idle labor, labor slack vs realism) and
much of the "labor sinks" work is patching it. Options, in order of boldness:

1. **Keep 10,000 and make training the sink.** Idle people are always in school. Skill, not
   bodies, is the constraint, which is historically true and matches immortality (everyone can
   learn everything, eventually). Idle labor then has an obvious use and a visible payoff.
2. **Abstract labor after Stage 2.** Once engines exist, stop assigning people to jobs by the
   hundred. Assign crews to *facilities*, and let facilities scale. The player's attention moves
   from people to plants, which is where the decisions are.
3. **Start with 1,000.** Real Stone Age crafts need tens of people, not thousands. A smaller colony
   makes every person matter, and growth (recruiting locals in the 1 AD variant) becomes a real
   reward. The handoff's 10,000 comes from the thought experiment, not from the game.

Option 1 is cheapest; option 2 is what most good management games end up doing; option 3 changes
the fiction. Any of them is better than inventing work.

### 7. Stockpiles: pull, don't cap

Storage limits and spoilage (`covered_stores`) are a patch. The cleaner fix is that most production
is **pull-based**: furnaces consume ore and fuel at the rate they run, and mining beyond that
piles up visibly and pointlessly. Over-producing is then a mistake the player sees (idle stock,
idle people) without a rule punishing it. Keep spoilage only for charcoal and wood, where it's
real and teaches something.

### 8. Lulls

The trail project's several minutes of nothing will recur wherever a project is big. Three
fixes, all cheap:

- Milestones inside long projects (the tree adds a few; every project over ~1M person-days should
  have one).
- The heartbeat resource keeps demanding attention while a project runs.
- A "skip to next event" button, so speed isn't the only way to pass dead time.

### 9. Real time

One second per day is charming but almost every player will run at 20× and pause. Consider
event-driven time: the simulation runs until something needs the player (a bar goes red, a
project finishes, a pressure crosses a threshold) and stops. Players who like watching numbers can
still let it run. This removes the tension between "10 hours of play" and "63 in-game years".

### 10. Fail states and the score

Score is the landing year, so every run is a speedrun, and a run that skips testing and kills the
pilot needs a rule. Suggest: a pilot's death costs a fixed penalty (two in-game years: build a new
vehicle, train a new pilot) and the run continues. It's a realistic consequence, it makes the
test-vs-launch gamble a real expected-value problem, and it avoids the frustration of a 10-hour
run ending in failure.

## Part 2: reviewing the tree

### What holds up

- The stage boundaries are real capability thresholds (forced air, engine, generator, LOX,
  booster engine, landing), and each gate has a clear check.
- The route-and-state structure works. Bellows vs wind, Watt vs Newcomen, Linde vs Claude, turbopump
  type: each leaves state that later nodes genuinely read.
- The traps are historically honest and each teaches a specific principle.
- Every number is labeled sourced or estimated, and the estimates are tuning knobs, not claims.
- The validator keeps it consistent as it grows.

### What doesn't

**a. Too linear inside stages.** Stage 3 has 15 critical-path nodes in a near-straight chain.
Wire → insulation → batteries → electromagnets → dynamo is five nodes for one idea ("electricity
from scratch"). Surface plates → lathe → gauges → planer is four for "precision". Collapse each
chain into one or two nodes with milestones, and spend the freed slots on choices.

**b. The `without_pages` mechanic is weak.** See Part 1, section 5. Most nodes should be rewritten
so the no-pages path is a different route, not a slower one.

**c. Too few state triggers.** 11 of 139. See Part 1, section 3. Most `requires.nodes` links that
express "you'd naturally want this next" should become `requires.state` conditions on a pressure.

**d. Stage 4 breaks "one thing at a time".** After the grid, the tree offers chlor-alkali, arc
furnace, alumina, oil, compressors, vacuum pumps and three nitrogen routes almost simultaneously.
Each is fine; together they're the sector-slider mockup the designer rejected. Sequence them behind
pressures: aluminum after the workshop preview shows the mass problem, oil after alcohol farming
strains land, nitrogen only when nitric acid is actually demanded (hypergolics, Stage 5).

**e. Some critical-path nodes aren't.** `bayer_alumina`/`hall_heroult` are optional (steel tanks
work), and the tree says so, but `alloy_steels`, `vacuum_pumps` and `instrumentation` are marked
critical mainly because later nodes list them. Revisit: could a colony reach the Moon with carbon
steel, piston vacuum pumps and post-mortem-only testing? Probably yes, slower and riskier. If so
they should be strong optional accelerants, which is more interesting than requirements.

**f. Stage 6 is a checklist with one decision.** Twelve of its 22 nodes are build-this-facility.
The stage's real content is the workshop and the test campaign. Move launch complex, tracking,
and oxygen plant into Stage 5 as pressures ("you have an engine; you have nowhere to fire a whole
vehicle"), and make Stage 6 almost entirely design, test and decide.

**g. Missing nodes worth adding.**
- **Cast bronze bearings and gears** (Stage 1-2): the reason bronze matters after iron arrives.
- **Screw press / coining** or **water-powered sawmill** (Stage 2): cheap, visible mechanical
  power before engines.
- **Explosives beyond black powder** (Stage 4): nitroglycerin/dynamite for mining, from the same
  nitric acid; a real labor multiplier and a hazard.
- **Telegraph** (Stage 3-4): the first use of electricity most players will expect, and the
  natural parent of radio.
- **Parachutes and recovery** (Stage 5): recovering test rockets makes each flight test teach more.
- **Thermal control** (Stage 6): a one-way lander in lunar day or night; the "survives the
  landing" condition needs a time window and this is what sets it.

**h. Nodes to cut or merge.** `cordage_baskets` and `wheelbarrows_carts` are flavor with a small
multiplier; fold them into milestones. `niter_to_fixation` (hub) adds nothing the three options
don't. `single_stage_attempt` and `black_powder_rockets` are workshop tooltips, not nodes; make
them workshop features and drop the nodes.

**i. Realism nits.**
- Hides from hunting for people who don't eat is odd; make leather a by-product of a "hunt for
  materials" job or use woven fiber diaphragms.
- The tree uses steel for the pressure capsule as fallback; a steel one-pilot capsule at 1.6 t is
  tight. Either raise the mass or make duralumin more clearly the intended route.
- Oxy-acetylene welding needs oxygen before the LOX plant exists; the node now says arc welding
  first, but the Stage 4 spine still implies gas welding for tanks. Reorder or clarify.
- `hunt_for_hides`, `farm_fuel_crops` and `tend_niter_beds` are the only nodes touching land use
  other than forest; if land matters, make it a visible resource like forest cover.

### What I'd do next, in order

1. Prototype the Stage 2 engine workshop (pressure, cylinder, plate, condenser). If it's fun, the
   whole-game structure in Part 1 follows; if it isn't, the current build-list model is the fallback.
2. Rewrite Stages 3 and 4 around pressures: fold the linear chains, turn "next node" links into
   state triggers, sequence the chemistry.
3. Rewrite `without_pages` on the 40 or so most important nodes as different routes.
4. Move Stage 6 infrastructure into Stage 5 and make Stage 6 the design-and-test stage.
5. Then re-tune labor and pacing, which will have changed under everything above.

Nothing here requires throwing the tree away. The nodes, sources and notebook entries stay; what
changes is how they're connected and what the player does between them.
