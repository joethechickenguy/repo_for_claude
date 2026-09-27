# 2026-09-27, Stage 0-1, owner's first playthrough

Build at `c584957` (Waves 1-2 plus speeds 0.5×/1×/2×). Notes from the owner, not measured timings.
Each item names the package that should pick it up. These are fixes for later, not yet scheduled.

## Findings

1. **Draft: ± in blocks of 100 is tedious** (package I, plus the shared control in D).
   Double-clicking a number should turn it into a field where the player types any value in the
   allowed range: with 100 spare workers, 98, 99 or 100 must all be accepted. Keep the ± buttons.
   The same control is the people panel in every stage, so the edit belongs in
   `src/ui/controls/peopleTree`, and every screen gets it. The rules decide what "allowed" means per
   row (the draft's totals and budget, and idle people in the colony).

2. **Stage 1 has long stretches of just running forward** (packages F, G1 and J).
   By year 3 the player is still only balancing resources, with no route out of problems like
   deforestation. Wanted:
   - A hint whenever a problem appears, pointing toward how it gets solved, even if that project
     isn't reachable yet. Red bars already carry `answers`; a bar whose answers aren't visible yet
     needs to say what they are.
   - Interesting, substantive decisions from the start. Target: **at least one semi-big decision
     per in-game year**. Stage 1 currently takes about 3 years to gate, so it needs 3 or more,
     spread out.

3. **Choices don't read as choices** (packages D, F and G1).
   The player just clicks "Start building" on whatever appears. Wanted: when two nodes are
   alternatives (routes, `any_of`, a node that answers the same bar as another), the cards show
   that they are an either/or and what each trades off, instead of being two more items in a list.

4. **Pacing and speeds** (package J; owner's call).
   The owner may drop 0.5×, default to 1× and bring back 5×. Decide after tuning. See open
   question 50 on 2× vs "10 hours, 100-200 years".

5. **"Idle people train as…" is unclear** (packages D and F).
   It works (365 idle person-days train one person; the counts gate later nodes), but in Stage 1
   nobody is idle, nothing visible reads the counts, and the screen shows no trained counts or
   progress. It needs an introduction card, visible trained counts and progress, and it should
   perhaps only appear once a trade matters (beat gating).

6. **No big picture of the tech progression** (new package, proposed as K: tech map).
   A simple graphic, perhaps a tree, showing where the player is, where they have been, and how
   the stages fit together, instead of only the list in the log and notebook. The data exists:
   nodes, requires, beats, stages and gates in `tree.json`, and routes in
   `tech-tree/generated/routes.md`.
