# Bootstrap: game design

A browser strategy game about speedrunning civilization. 10,000 immortal people, the Stone Age, a
600-page budget of printed knowledge, and a race to land one person alive on the Moon. Score is the
in-game year of the landing.

This file is the design. `tech-tree/` is the content that implements it. `docs/work-packages.md`
splits the build into chunks.

## Goals

- **10 player hours, 100-200 in-game years** for a beginner. One second is one in-game day at 1×.
  The only speeds are 0.5×, 1× and 2×, and the game never stops: when a decision is needed it drops
  to 0.5× on its own and keeps running until the player picks a speed again.
- **Nothing forces a restart.** Every bad decision costs time; the worst cost a lot of time.
- **A substantive decision every few minutes, hundreds of small ones.** Substantive: coal or charcoal,
  steel or aluminum, which engine, which seam. Small: a furnace campaign's dials, a job allocation,
  a repair. Better decisions make things go faster; they rarely open a different game.
- **Step by step.** Never more than two new controls at once. Every new thing arrives with the problem
  that needs it and a one-line reason it works.
- **Realistic, accurate enough for nerds, and you learn science by playing.** Real equations drive
  the workshops. Missing knowledge slows you down, it never blocks you. Only physics is a hard wall,
  and the game explains it.
- **Charmingly minimalist.** One serif face, ink on paper, blue for on-track, red for bottlenecks,
  square buttons, the slide-rule energy meter as the only decoration.

## The three layers

Every stage is built from the same three kinds of thing.

**Pressures** are bars that move on their own as the simulation runs: forest cover, mine water,
fuel balance, power balance, the test-stand queue. When a bar goes red something visibly stops
working. Pressures are why the player can't fast-forward: a stage left alone gets worse, and they
are what makes each node appear ("the forest bar is red" → coppice, coal). Each stage has one
**heartbeat** pressure that every job pulls on and that's always on screen:

| Stage | Heartbeat | The player balances |
| --- | --- | --- |
| 1 Fire and stone | Tools | Toolmakers vs everyone else |
| 2 Iron | Fuel | Burners and miners vs furnaces |
| 3 Steam and steel | Machine-shop hours | The parts queue: engines, rails, wire, instruments |
| 4 Electricity and chemistry | Kilowatts | Generation vs the loads switched on |
| 5 Precision and propulsion | Test-stand time and oxygen | Tests vs production |
| 6 The rocket | The calendar and Δv margin | Testing vs launching |

**Workshops** are design screens with a few dials each, driven by real equations. The player sets
dials, builds or runs, and reads the result. Dials are added one at a time, each by the node that
makes it necessary. Most of the small decisions live here. Five workshops span the game and grow
across stages:

| Workshop | Opens | Dials, in order of arrival |
| --- | --- | --- |
| Furnace | S1 copper | air supply, fuel ratio → ore, charge mode, stack height, blast source, fuel, flux → blast temperature, converter lining, blow time, manganese |
| Engine | S2 Savery | lift height → cylinder, boiler pressure, plate → condenser → flywheel, generator → transmission, prime mover |
| Machine shop | S3 | reference surface → lead screw → gauging → bearings → shop power |
| Liquefier | S4 | method → pressure → exchanger length → column trays |
| Rocket engine | S5 | mixture ratio, chamber pressure → cooling → injector → feed → nozzle |
| Rocket + test campaign | S6 | stages, propellant, tanks, feed, route; test type, launch |

Each workshop runs a **loop**: a furnace *campaign* (~30 days), an engine *design*, a machine-shop
*queue*, a liquefier *run*, an engine *firing*, a *test*. The loop is where a player who understands
the science converges in two tries and one who doesn't takes ten. Both get there.

**Nodes** are projects, upgrades and forks: the tech tree proper. Each appears because a pressure
or a workshop result asks for it, each introduces at most one new thing, each has a notebook entry.
Nodes come in **beats** (1-8 per stage, ~10 minutes each) that fix the order controls are introduced.

## Stages and gates

| Stage | Gate (checkable) | Energy gate | Years | Routes |
| --- | --- | --- | --- | --- |
| 0 Draft | Depart | | 0 | page bundles, roster |
| 1 Fire and stone | 5,000 metal tools | 250 W | ~6 | wind / bellows / arsenic / tin |
| 2 Iron | An engine keeps a mine dry | 600 W | ~22 | Newcomen / Watt / high-pressure / (Savery) |
| 3 Steam and steel | A dynamo delivers 50 kW | 1.5 kW | ~25 | steam / hydro / (magneto) |
| 4 Electricity and chemistry | 500 kg/day liquid oxygen | 2.5 kW | ~25 | Linde / Claude / (cascade) |
| 5 Precision and propulsion | 250 kN engine, 60 s, on a pad | 3.5 kW | ~25 | peroxide / gas generator / (pressure-fed) |
| 6 The rocket | A living pilot on the Moon | checklist | ~15 | direct / parking orbit / (single stage) |

Routes in parentheses are **traps**: real historical options that can be built and fail for a
reason the game shows. They cost time, never the run. Every route through a stage passes the gate;
what differs is the **state** it leaves (`engine_type`, `machinists_trained`, `coal_sulfur`,
`boiler_explosions` ...), which later nodes read. That's how a choice in year 20 matters in year 60
without the tree branching into copies.

The **minimum path** is thinner than the tree. A V-2-class vehicle needs steel you can machine to
tolerance, a lot of shaft or electrical power, glass and vacuum work, liquid oxygen, and alcohol.
Aluminum, kerosene, synthetic ammonia, hypergolics, turbopumps and the open hearth are
**accelerants** (`tags: [accelerant]`): a smart player takes the ones that pay and skips the rest.

## Systems that span the game

**Energy per person** is the headline number, on a log slide rule from 100 W to 10 kW with the gates
marked. Heat processes count the fuel burned; engines and electricity count the work delivered × 2.5
(so a better engine is never punished). Muscle isn't counted. Details and calibration in
`tech-tree/energy.md`.

**Labor, in three tiers.** 10,000 people. How the player controls them is itself unlocked, so the
bookkeeping never outgrows the decisions:

| Tier | Stages | The player sets | The engine does |
| --- | --- | --- | --- |
| People | 1-2 | People per job, ± blocks | Nothing |
| Works | 3-4 | A target output per facility ("furnace 2: 1 t/day"; the machine-shop queue order) | Staffs each works from the pool to hit its target and shows the crew it took |
| Departments | 5-6 | A priority per department (metals, power, chemistry, propulsion, testing) plus the test campaign | Staffs works within departments to the priorities |

Each tier arrives as a node when the previous one has become a chore (`foremen`, Stage 3 beat 1;
`departments`, Stage 5 beat 1). The people panel is one recursive control at every tier: a row with
± and an expander, the same pin-and-spread rule as the draft's specialties and topics. Expand a
department to its works, a works to its jobs, pin anything by hand. Auto-staffing is deliberately
dumb (fill targets in priority order, show what it assigned) so cause and effect stay visible. What
never disappears: the heartbeat bar, the pressures, the idle count, and each works' output vs target.

Idle people are always in **training**: anyone can learn any trade (immortality), so idle labor
converts to skill, and trained counts (`machinists_trained`, `welders_trained`, ...) gate later
nodes. Big projects have **milestones** so a long build unlocks something halfway.

**Production is pull-based.** Furnaces consume at the rate they run; mining beyond that piles up
visibly. Only wood, charcoal and clay spoil. No storage caps.

**Tools** wear with use (Stage 1's heartbeat) and keep mattering: iron 3× bronze, quenched 6×.

**People carry principles, paper carries data.** Specialists make an area's workshops converge fast
and its research loops short. Pages hold what nobody remembers: where deposits are, tables, and the
few recipes that took years of trials (basic lining, Haber catalyst, peroxide, self-excitation).
Without pages a node is *different*, not just slower: a research loop with visible dead ends, a
historical substitute with a scar, or a discovery that can't be conceived until its precursor has
been used (no separate condenser until a Newcomen engine has run two years). See Stage 0 below.

**Failure is deterministic and legible.** Boilers burst on a date shown before you build them. Wind
furnaces lose output in a fixed calm season. Test-campaign flaws are fixed by the design and state,
hidden until the right test type exposes them, with stated severities. A pilot's death costs two years
and the run continues. See `tech-tree/failure-modes.md`.

**The notebook** fills as you play: 2-5 sentences of real science per node. The notebook explains,
the workshop tests.

## Stage 0: the draft

One screen, two columns, two to ten minutes. It loads with a default allocation that is workable
but not good, and the player can depart at once.

- **Who goes.** 10,000 people across nine pools (builders, primitive skills, prospectors,
  metallurgists, mechanics, chemists, electrical, rocket engineers, teachers), each with + / − in
  blocks. Each pool expands to two or three specialties (smelters / smiths / steelmakers; machinists /
  engine builders / millwrights) for players who want to go finer; otherwise people spread over them
  automatically. Each card says in one line what it speeds up and what its absence costs. Any
  allocation is allowed; builders are the remainder.
- **What they carry.** 10,000 pages across eight categories (survey, first-year guide, metallurgy,
  engines and machine tools, chemistry, electricity, cryogenics, rocketry), each with + / −. A
  category expands to its topics for players who want to allocate finer (Haber process, petroleum,
  lunar tables); otherwise pages spread over topics automatically. Full coverage of everything would
  take ~20,000 pages. Coverage of a topic sets how its nodes behave: known, partial (half-length
  discovery loops), or absent (the `without_pages` route).
- **One hint.** A single line, "Weakest area: metallurgy", recomputed on every change from the lower
  of roster fill and page coverage per area. No numbers, no run-length estimate. Nothing is blocked.

Data: `tech-tree/draft.yaml`.

## What was rejected

Short roguelike runs (not deep enough). Pure branching narrative (combinatorial). Yearly sector
sliders (changing numbers, not making things). Unlimited paper. Hard failure for missing knowledge.
Storage caps and spoilage as the fix for stockpiles (replaced by pull-based production). A linear
build list as the stage structure (replaced by pressures, workshops and beats).
