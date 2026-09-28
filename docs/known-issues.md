# Known issues

Problems found so far, from the owner's playtests, the bot playtests (`docs/playtests/`) and
`tech-tree/open-questions.md`. Not yet scheduled. Last updated 2026-09-28.

## Pacing and length

1. **The game is much shorter than designed.** A full run is about 2.5 hours at 1x (roughly 20-30
   minutes per stage); the design says 10 hours. Reaching 10 would mean about 4x the build effort
   everywhere, which undoes the Stage 1-2 trims from the owner's playtest (question 59).
2. **Too few real decisions.** Stages 1-5 give 9-15 meaningful choices each against a target of
   20-25. Adding labor or slowing rates won't fix it; it needs more either/or choices or recurring
   decisions in the stage content (question 64).
3. **Long gaps between decisions.** Every stage has a stretch of 290-380 in-game days (5-6 minutes
   at 1x) with no new decision. Something happens more often (the longest quiet stretch is ~220
   days), but it isn't a choice.
4. **Speeds are undecided.** 0.5x/1x/2x with no pause; the owner floated dropping 0.5x and bringing
   back 5x (question 50).
5. **Stage 6 keeps slowing the game down.** Every test result drops the clock to 0.5x, about 20
   times in one campaign.
6. **Stage 4's Claude-expander route is very slow.** A 1,169-day gap without a decision, because the
   default draft carries no cryogenics pages. Slow by design, but it may feel broken.

## Things that don't do anything

7. **Most trades do nothing.** Trained miners, smiths, glassblowers and electrical engineers count
   up but nothing reads them. Only machinists (machine shop), welders and rocket engineers (Stage 6
   flaws) matter, and the training picker doesn't say which is which.
8. **Card text promises effects that aren't built.** For example, rails say "repeatable per route;
   locomotives remove the rest" (they're one-off), and a missing-pages route says it "needs 2x
   calc_hours".
9. **Computing does nothing.** The differential analyzer and the computing office produce
   `calc_hours`; nothing spends them.
10. **Test flights can't fail.** Orbital, impactor and landing tests never lose a vehicle.
11. **Stockpiles grow without limit.** By Stage 4 the bot holds ~10 million kg of wood and ~180
    million kg of coal, with nothing to spend them on.

## Oddities in play

12. **Old dead-end projects are still offered.** The Savery fire engine (a Stage 2 trap) and the
    permanent-magnet generator (a Stage 3 trap) are still on the project list in Stage 4.
13. **A stage can end with its chosen option unbuilt.** At the start of Stage 6, the gas-generator
    turbopump chosen in Stage 5 was still waiting as a project.
14. **The test campaign's rules are readings, not decisions.** A known fatal flaw always strikes if
    you launch anyway; the escape tower counts only with solid motors; every other flaw strikes on a
    50% roll from a seed fixed at the draft (question 61).
15. **Foremen and departments are untested in real play, and now overlap with supply groups.** The
    bot never uses them; only unit tests cover them. Since supply groups (2026-09-28) already fold
    earlier jobs, Foremen's per-facility targets may no longer be worth a project (question 65).

## Interface

16. **Locked workshop options look clickable.** A dial option that needs a project first (Air
    supply's "bellows crews" and "wind site" before Pot bellows or Wind-draft furnaces) is disabled,
    but it looks almost the same as an enabled one, especially in dark mode. The reason is only in a
    grey line under the buttons. (Owner, 2026-09-27.)

## Numbers and realism (estimates to check)

17. **Engine efficiency is optimistic.** Play Isp (280/310 s) is above both the model's own and the
    real V-2's (~200-239 s) (question 12).
18. **Oxygen is too cheap to make.** The LOX plant's ~1 kWh/kg is below the physics for a 1900s
    plant (questions 11, 33).
19. **Launch details are simplified.** The delta-v needed doesn't depend enough on the route
    (direct vs parking orbit); tracking coverage is undecided; "alive at landing" has no survival
    window (questions 13-15, 37).
20. **Geology and materials are open.** Platinum, cryolite, rubber and tungsten sources, and which
    minerals are found where (questions 5-9).

## Draft screen

21. **Some draft rows are missing text.** Crew groups and page categories have no one-line
    description of their own, and which crew group absorbs the leftover people isn't declared in
    the content (questions 47-49).

## Not written yet

22. **Variants.** Mortal colonists, a 1 AD start and politics aren't written; a zero-page run's
    length is unknown (questions 16-17).
23. **Draft animals.** They don't exist, and muscle power doesn't count toward watts (questions 1-2).

## Setup and technical

24. **The game isn't on the repo's default branch.** It lives on `claude/wave-3-tasks-717r1d`; the
    default branch stops at the draft. Needs a merge or a pull request.
25. **An update can silently erase a run.** If a new version can't read an old save, the game
    discards it and starts a new run without warning (`src/main.ts`).
