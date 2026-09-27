# Open questions

Places where history or physics is unclear, where the tree had to guess, or where realism and fun
pull apart. Roughly in order of how much they affect the design.

## Realism vs fun

1. **Draft animals.** Base rules have no animals. Wild aurochs and horses existed in Anatolia around
   10,000 BCE, but domestication took generations of selective breeding. Should the colony be able to
   domesticate (a long, optional project), or is muscle plus machines the intended flavor? The tree
   assumes no animals, which makes `ore_road`, wheelbarrows and rails more valuable.
2. **The test campaign's randomness.** [failure-modes.md](failure-modes.md) proposes deterministic
   discovery with hidden exposure counts, keeping chance only at launch. Is any randomness acceptable
   at launch, or should outcomes be fully seed-deterministic?
3. **Muscle doesn't count toward watts.** Treadwheels and bucket chains do real work but add nothing
   to the headline number. That keeps the metric about machines, but a player running 2,000 walkers
   may feel cheated. Worth one notebook entry.
4. **Stage 1 length.** At 18 nodes and ~14 million person-days if every route is built, Stage 1 is
   labor-bound at about 4 in-game years. Reaching 90 minutes of play may need more small unlocks
   (the prototype found that slowing existing ones creates lulls).
5. **Gate conditions that require a route.** The Stage 1 gate requires one of four upgrades. A player
   who just keeps using blowpipes could argue they have "reliable smelting". Requiring a route keeps
   state meaningful; is that acceptable?

## Materials the region may not provide

These are the biggest realism risks, because each one is a hard dependency somewhere in the tree.

6. **Platinum** (Ostwald nitric acid catalyst; the peroxide process used platinum electrodes). Anatolia
   has no significant platinum that the tree could confirm. Options: trace platinum from placer gold
   (slow, tiny), cobalt or iron oxide catalysts for ammonia oxidation (less efficient; historically
   explored), or nitric acid by the older saltpeter-and-sulfuric route. The tree currently lists
   `platinum_kg: 5` and flags it.
7. **Cryolite.** Natural cryolite came almost entirely from Greenland. The tree has `synthesize_cryolite`
   from fluorite via hydrofluoric acid, which is real chemistry but adds a dangerous step. Should it be
   its own node?
8. **Rubber and gaskets.** Natural rubber and gutta-percha are tropical. The tree uses cotton/silk and
   varnish for wire insulation and a polysulfide synthetic (Thiokol-type, 1920s) for suits and solid
   propellant binder. Whether a polysulfide made from local chlorine, sulfur and ethanol-derived
   ethylene is realistic at this scale needs a chemist's check.
9. **Tungsten** for filaments and tool steel. If the survey finds none, tubes fall back on carbon or
   oxide-coated filaments (shorter life) and tool steel on chromium alone. Is that fallback realistic
   enough for triodes? Early tubes used tantalum and oxide cathodes too.
10. **Which minerals exist where.** The tree names Ergani (copper), Kestel (tin), Guleman (chromite)
    and Seydişehir (bauxite), which are sourced, plus Batman and Baku (oil), iron ore sites and
    minor minerals, which are not checked against maps. Tungsten, platinum, cryolite and natural
    rubber are the likely gaps. The geological survey bundle is the in-game promise; the designer
    should fix the real list before writing its text.

## History and physics that need checking

11. **Pre-industrial energy figures.** Smil's per-capita numbers were read from search snippets, not
    the book. Verify before quoting in the notebook.
12. **Early LOX plant energy.** The tree assumes ~1 kWh/kg for an early Linde plant. The real figure
    for a 1900s plant could be several times higher. It only matters for Stage 6 watts, not
    feasibility.
13. **Stage 1 rates** (charcoal per smelter, copper tool lifetime, flint wear) are prototype
    placeholders. Experimental archaeology has better numbers for bloomeries than for early copper.
14. **Ethanol vs kerosene Isp in the workshop.** The mockup's 280 s and 310 s are play values. Real
    V-2 performance was ~200 s at sea level and 239 s in vacuum at only 15 bar chamber pressure. A
    better model would make Isp depend on chamber pressure (which the turbopump sets) and nozzle
    expansion (which depends on the stage's altitude). That's a real lesson but adds a factor.
15. **The Δv budget.** 15.3 km/s is the mockup's figure. Luna 9 braked from about 2.6 km/s in a direct
    descent; a parking-orbit route costs slightly more. The budget should probably differ by route
    (direct vs parking orbit) and by lander propellant.
16. **Tracking coverage.** A single site sees the Moon for only part of each day. The Soviets and
    Americans used networks spread across longitudes. With one colony, should tracking stations be
    built far away (a huge project), or is partial coverage an accepted risk?
17. **Radiation, thermal and landing-site limits.** A one-way pilot on the lunar surface faces hours
    of either sun or night. "Survives the landing" is well defined only if there's a time window.
    The mockup's four days of oxygen suggests "alive at landing plus some hours".

## Structure

18. **How late-stage state gets read.** Many Stage 5-6 nodes check capability flags (`has_lox`,
    `feed_system`, `tolerance_mm`). The engine could derive `has_*` flags from completed nodes to
    avoid storing them twice.
19. **Variants.** The mortal-colonists mode needs its own Stage 1 (agriculture, medicine, children).
    The 1 AD start (recruiting locals, Han China's blast furnaces) would skip much of Stages 1-2 and
    should probably start at the Stage 2 gate with a different state. Neither is written here.
20. **Minimum-pages speedrun.** Every node has a `without_pages` path, so a zero-page run is
    possible. Its length hasn't been estimated; the hardest spots are `haber_bosch` (effectively
    unavailable without pages, fallback to arc or niter), `basic_lining` and `hydrogen_peroxide`.
