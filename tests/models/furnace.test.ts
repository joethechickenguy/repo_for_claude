// Furnace workshop model. Worked examples from tech-tree/stages/stage1-fire-and-stone.yaml
// ("stage1 L"), stage2-iron.yaml ("stage2 L"), stage3-steam-and-steel.yaml ("stage3 L"),
// state-variables.yaml, tech-tree/energy.md and the Stage 1 prototype
// (https://claude.ai/artifact/Tb1R1RLPBZTLbHteuF3ZKz: smelt job "2.5 kg ore, 5 kg charcoal -> 0.5 kg copper").
import { describe, expect, it } from "vitest";
import {
  COAL_PER_KG_COKE,
  airOutputMultiplier,
  bessemerBlow,
  blastFurnace,
  bloomYield,
  furnaceTemperatureC,
  hotBlastFuelFactor,
  smeltBloom,
  smeltCopper,
} from "../../src/models/furnace";
import { energyPerPerson } from "../../src/models/energy";
import { expectBetween, expectNear } from "./helpers";

const perPerson = (fuel: Parameters<typeof energyPerPerson>[0]["fuel_kg_per_day"]) =>
  energyPerPerson({ population: 10_000, fuel_kg_per_day: fuel, baseline_w_per_person: 0 }).energy_w_per_person;

describe("copper campaign (stage1 L51-57, L207, L290, L317)", () => {
  it("prototype: 2.5 kg ore + 5 kg charcoal -> 0.5 kg copper, i.e. 10 kg charcoal per kg copper (stage1 L56) at 20% yield (L207)", () => {
    const r = smeltCopper({ air_supply: "blowpipes", fuel_ratio: 2 }, 2.5);
    expect(r.metal_kg).toBeCloseTo(0.5, 12);
    expect(r.fuel_kg).toBeCloseTo(5, 12);
    expect(r.fuel_kg / r.metal_kg).toBeCloseTo(10, 12);
    expect(r.failed_campaigns).toBe(0);
  });
  it("blowpipes reach copper's 1,085 C melting point barely (stage1 L52, L56)", () => {
    const t = furnaceTemperatureC("blowpipes", 2, "copper");
    expectBetween(t, 1_085, 1_120);
  });
  it("forced draft lifts a charcoal fire from ~900 C to 1,200 C+ (stage1 L53)", () => {
    expect(furnaceTemperatureC("bellows_crews", 0, "copper")).toBe(900);
    expect(furnaceTemperatureC("bellows_crews", 2, "copper")).toBeGreaterThanOrEqual(1_200);
    expect(furnaceTemperatureC("wind_site", 2, "copper")).toBeGreaterThanOrEqual(1_200);
  });
  it("an open fire (no fuel margin) rarely gets past 900 C: can't melt copper (stage1 L142)", () => {
    expect(smeltCopper({ air_supply: "blowpipes", fuel_ratio: 0 }, 10).failure).toBe("too_cold");
  });
  it("too little charcoal: the charge never reaches temperature and the campaign fails, fuel still burned (stage1 L55)", () => {
    const r = smeltCopper({ air_supply: "blowpipes", fuel_ratio: 1.5 }, 10);
    expect(r.failure).toBe("too_cold");
    expect(r.failed_campaigns).toBe(1);
    expect(r.metal_kg).toBe(0);
    expect(r.fuel_kg).toBe(15);
  });
  it("more than needed is just fuel burned: same copper, more charcoal (stage1 L55)", () => {
    const a = smeltCopper({ air_supply: "blowpipes", fuel_ratio: 2 }, 10);
    const b = smeltCopper({ air_supply: "blowpipes", fuel_ratio: 8 }, 10);
    expect(b.metal_kg).toBe(a.metal_kg);
    expect(b.fuel_kg).toBeGreaterThan(a.fuel_kg);
  });
  it("a stronger draft tolerates a leaner charge", () => {
    expect(smeltCopper({ air_supply: "blowpipes", fuel_ratio: 1.7 }, 10).failure).toBe("too_cold");
    expect(smeltCopper({ air_supply: "bellows_crews", fuel_ratio: 1.7 }, 10).failure).toBeNull();
  });
  it("bellows double and a wind site triples output per crucible; wind drops 60% in the calm season", () => {
    expect(airOutputMultiplier("blowpipes")).toBe(1);
    expect(airOutputMultiplier("bellows_crews")).toBe(2);
    expect(airOutputMultiplier("wind_site")).toBe(3);
    expectNear(airOutputMultiplier("wind_site", true), 1.2, 1e-12);
    expect(airOutputMultiplier("bellows_crews", true)).toBe(2);
  });
  it("energy.md L99-100: a blowpipe smelter's 5 kg charcoal/day ≈ 0.4 W; a wind smelter at 3x ≈ 1.3 W", () => {
    const blow = smeltCopper({ air_supply: "blowpipes", fuel_ratio: 2 }, 2.5);
    const wind = smeltCopper({ air_supply: "wind_site", fuel_ratio: 2 }, 2.5 * airOutputMultiplier("wind_site"));
    expectNear(perPerson({ charcoal: blow.fuel_kg }), 0.43, 0.02);
    expectNear(perPerson({ charcoal: wind.fuel_kg }), 1.3, 0.01);
  });
});

describe("bloomery (stage2 L79-84, L189-211; state-variables L47)", () => {
  const hill = { air_supply: "bellows_crews" as const, fuel_ratio: 1, ore_choice: "hillside_ore" as const };

  it("charcoal:ore near 1:1 with bellows works; ore-to-bloom ≈ 0.17 on good ore (L202, L211: 'a sixth')", () => {
    const r = smeltBloom(hill, 1_000);
    expect(r.failure).toBeNull();
    expectNear(r.metal_kg / 1_000, 0.17, 1e-9);
    expectNear(r.metal_kg / 1_000, 1 / 6, 0.03);
  });
  it("below ~0.8 the ore doesn't reduce (L83)", () => {
    expect(smeltBloom({ ...hill, fuel_ratio: 0.8 }, 1_000).failure).toBe("too_cold");
    expect(smeltBloom({ ...hill, fuel_ratio: 0.9 }, 1_000).failure).toBeNull();
  });
  it("above ~1.3 the iron comes out as brittle cast lumps (L83)", () => {
    expect(smeltBloom({ ...hill, fuel_ratio: 1.3 }, 1_000).failure).toBeNull();
    expect(smeltBloom({ ...hill, fuel_ratio: 1.4 }, 1_000).failure).toBe("cast_lumps");
  });
  it("blowpipes never reach the ~1,200 C a bloom needs: the bloomery needs bellows or wind (L192, L208)", () => {
    expect(smeltBloom({ ...hill, air_supply: "blowpipes" }, 1_000).failure).toBe("too_cold");
    expect(smeltBloom({ ...hill, air_supply: "wind_site" }, 1_000).failure).toBeNull();
  });
  it("grade sets yield (bog ~40% Fe, hillside ~60%), and yields collapse below ~50% Fe (L80; state-variables L47)", () => {
    const bog = smeltBloom({ ...hill, ore_choice: "bog_iron" }, 1_000);
    expect(bog.metal_kg).toBeLessThan(smeltBloom(hill, 1_000).metal_kg / 2);
    expect(bloomYield(0.5) / bloomYield(0.6)).toBeLessThan(0.75);
    expect(bloomYield(0.25)).toBe(0);
  });
  it("bog iron carries phosphorus: iron_quality -1 (L80, L165)", () => {
    expect(smeltBloom({ ...hill, ore_choice: "bog_iron" }, 1_000).iron_quality).toBe(2);
    expect(smeltBloom(hill, 1_000).iron_quality).toBe(3);
  });
  it("energy.md L101: a bloomery crew burning 10 kg charcoal a day ≈ 0.9 W", () => {
    expectNear(perPerson({ charcoal: smeltBloom(hill, 10).fuel_kg }), 0.87, 0.01);
  });
});

describe("blast furnace (stage2 L85-96, L437-459; stage3 L56-58, L363)", () => {
  const base = { stack_height: 6, blast_source: "water_wheel" as const, ore_choice: "hillside_ore" as const };

  it("above ~5 m with a strong blast it runs liquid: ~1 t/day of cast iron instead of 30 kg blooms (L86, L437, L446)", () => {
    const r = blastFurnace(base);
    expect(r.failure).toBeNull();
    expectNear(r.metal_kg_per_day, 1_000, 1e-9);
  });
  it("too short a stack freezes (L86, L451)", () => {
    expect(blastFurnace({ ...base, stack_height: 4 }).failure).toBe("frozen_short_stack");
    expect(blastFurnace({ ...base, stack_height: 4 }).metal_kg_per_day).toBe(0);
  });
  it("too weak a blast freezes: one wheel can't blow a 10 m stack; two can (L451)", () => {
    expect(blastFurnace({ ...base, stack_height: 10 }).failure).toBe("frozen_weak_blast");
    const two = blastFurnace({ ...base, stack_height: 10 }, { water_wheels: 2 });
    expect(two.failure).toBeNull();
    expect(two.metal_kg_per_day).toBeGreaterThan(1_000);
  });
  it("treadwheels need ~60 walkers per furnace to match a water wheel (L89, L417)", () => {
    const tread = blastFurnace({ ...base, blast_source: "treadwheels" });
    expectNear(tread.blast_kw, 3, 1e-9);
    expectNear(tread.metal_kg_per_day, blastFurnace(base).metal_kg_per_day, 1e-9);
    expect(blastFurnace({ ...base, blast_source: "treadwheels" }, { treadwheel_walkers: 30 }).failure).toBe("frozen_weak_blast");
  });
  it("charcoal: ~1.5 t per t of iron (L446), which energy.md L102 counts as ~130 W", () => {
    const r = blastFurnace(base);
    expectNear(r.coke_rate, 1.5, 1e-9);
    expectNear(perPerson({ charcoal: r.fuel_kg_per_day }), 130, 0.01);
  });
  it("cold-blast coke: Neilson's ~8 t of coal per t of iron (energy.md L103, L114) ≈ 250 W", () => {
    const r = blastFurnace({ ...base, furnace_fuel: "coke" });
    expectNear(r.coal_kg_per_day, 8_060, 1e-9);
    expectNear(r.fuel_kg_per_day * COAL_PER_KG_COKE, r.coal_kg_per_day, 1e-12);
    expectNear(perPerson({ coal: r.coal_kg_per_day }), 250, 0.01);
    // stage2 L446 says "1.5-2 t charcoal or coke per t"; for coke the model gives ~5 t (open question 32).
    expectNear(r.coke_rate, 5.04, 0.001);
  });
  it("hot blast at 149 C: Neilson's 8.06 -> 5.16 t of coal per t (stage3 L363), ≈ 160 W (energy.md L104)", () => {
    const r = blastFurnace({ ...base, furnace_fuel: "coke", blast_temperature: 149 });
    expectNear(r.coal_kg_per_day, 5_160, 1e-9);
    expectNear(perPerson({ coal: r.coal_kg_per_day }), 160, 0.01);
  });
  it("fuel per ton falls by a third at 150 C and by two thirds at 300 C+ (stage3 L57)", () => {
    expectNear(1 - hotBlastFuelFactor(150), 1 / 3, 0.1);
    expectNear(1 - hotBlastFuelFactor(300), 2 / 3, 1e-9);
    expectNear(1 - hotBlastFuelFactor(600), 2 / 3, 1e-9);
    expect(hotBlastFuelFactor(20)).toBe(1);
  });
  it("lime: yield +25% at the right amount; too much thickens the slag (stage2 L95)", () => {
    const none = blastFurnace(base);
    const good = blastFurnace({ ...base, flux: 150 });
    const much = blastFurnace({ ...base, flux: 300 });
    expectNear(none.ore_kg_per_day / good.ore_kg_per_day, 1.25, 1e-9);
    expect(much.metal_kg_per_day).toBeLessThan(good.metal_kg_per_day);
    expect(good.lime_kg_per_day).toBeCloseTo((good.ore_kg_per_day / 1_000) * 150, 6);
  });
  it("coke from the high-sulfur seam carries sulfur: iron_quality -1; charcoal doesn't (stage2 L92)", () => {
    expect(blastFurnace({ ...base, furnace_fuel: "coke" }, { coal_sulfur: "high" }).iron_quality).toBe(2);
    expect(blastFurnace({ ...base, furnace_fuel: "charcoal" }, { coal_sulfur: "high" }).iron_quality).toBe(3);
    expect(blastFurnace({ ...base, furnace_fuel: "coke" }, { coal_sulfur: "low" }).iron_quality).toBe(3);
  });
  it("phosphorus carries through the blast furnace too; with bog ore and sulfurous coke, iron_quality 1 (red below 2)", () => {
    const r = blastFurnace({ ...base, ore_choice: "bog_iron", furnace_fuel: "coke" }, { coal_sulfur: "high" });
    expect(r.carries_phosphorus && r.carries_sulfur).toBe(true);
    expect(r.iron_quality).toBe(1);
  });
});

describe("Bessemer converter (stage3 L59-67, L311-344; state-variables L26, L70)", () => {
  const clean = { iron_ore_phosphorus: "low" as const, coal_sulfur: "low" as const };
  const good = { converter_lining: "acid_silica" as const, blow_time: 20, manganese: "none" as const };

  it("in twenty minutes, pig iron becomes steel: Bessemer steel_quality 1 (L342; state L70)", () => {
    const r = bessemerBlow(good, clean);
    expect(r.failure).toBeNull();
    expectNear(r.carbon_pct, 0.3, 1e-9);
    expect(r.steel_quality).toBe(1);
    expect(r.iron_quality).toBe(3);
  });
  it("too short: carbon left, hard and brittle (L63)", () => {
    const r = bessemerBlow({ ...good, blow_time: 10 }, clean);
    expect(r.failure).toBe("under_blown");
    expect(r.steel_quality).toBe(0);
  });
  it("too long: over-oxidized, weak; over-blown steel costs iron_quality 1 (L63; state L26)", () => {
    const r = bessemerBlow({ ...good, blow_time: 30 }, clean);
    expect(r.failure).toBe("over_blown");
    expect(r.iron_quality).toBe(2);
  });
  it("manganese after the blow removes the oxygen: steel_quality 2, and an over-blown heat is saved (L66; state L70)", () => {
    expect(bessemerBlow({ ...good, manganese: "spiegeleisen" }, clean).steel_quality).toBe(2);
    expect(bessemerBlow({ ...good, blow_time: 30, manganese: "spiegeleisen" }, clean).failure).toBeNull();
  });
  it("acid lining with phosphorus ore: cold-short steel, iron_quality -1 until the basic lining (L60, L328, L339)", () => {
    const phos = { ...clean, iron_ore_phosphorus: "high" as const };
    const acid = bessemerBlow({ ...good, manganese: "spiegeleisen" }, phos);
    expect(acid.cold_short).toBe(true);
    expect(acid.iron_quality).toBe(2);
    expect(acid.steel_quality).toBe(1);
    const basic = bessemerBlow({ ...good, converter_lining: "basic_dolomite", manganese: "spiegeleisen" }, phos);
    expect(basic.cold_short).toBe(false);
    expect(basic.steel_quality).toBe(2);
  });
  it("sulfur coke: hot shortness, iron_quality -1 until manganese (L66, L329)", () => {
    const sulfur = { ...clean, coal_sulfur: "high" as const };
    expect(bessemerBlow(good, sulfur).hot_short).toBe(true);
    expect(bessemerBlow(good, sulfur).iron_quality).toBe(2);
    expect(bessemerBlow({ ...good, manganese: "spiegeleisen" }, sulfur).hot_short).toBe(false);
  });
});
