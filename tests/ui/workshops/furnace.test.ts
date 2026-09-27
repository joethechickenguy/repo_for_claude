// @vitest-environment happy-dom
// E1: the furnace workshop. Dials arrive in the stage files' order, C's worked examples render,
// a campaign runs through the engine (charge out, metal in ~30 days later), saves mid-run.
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../../src/content";
import type { JsonValue } from "../../../src/engine";
import { COLD_BLAST_FUEL_T_PER_T } from "../../../src/models";
import { mountShell } from "../../../src/ui/shell";
import { Game } from "../../../src/ui/shellGame";
import { converterPlan, FURNACE, furnaceDials, furnacePlan, startFurnace } from "../../../src/ui/workshops/furnace";
import { workshopSystem } from "../../../src/ui/workshops/kit";
import { WS } from "../../../src/ui/workshops/strings";

const frame = () => new Promise((r) => setTimeout(r, 30));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });
const sys = (g: Game) => workshopSystem<JsonValue>(g, FURNACE)! as unknown as { data: { dials: Record<string, JsonValue>; history: unknown[]; campaigns: number } };

const IRON = ["crucibles_blowpipes", "iron_prospecting", "hillside_ore", "bloomery"];

describe("E1 furnace workshop", () => {
  it("offers dials in the order the stage files add them, as their nodes complete", () => {
    const g = new Game(tree);
    const all = tree.workshops[FURNACE]!.dials.map((d) => d.id);
    setBook(g, ["crucibles_blowpipes"]);
    expect(furnaceDials(g).map((d) => d.id)).toEqual(["air_supply", "fuel_ratio"]);
    setBook(g, [...IRON, "blast_furnace", "coal_mining", "lime_burning", "hot_blast", "bessemer_converter"]);
    const ids = furnaceDials(g).map((d) => d.id);
    expect(ids).toEqual(all);
    expect(ids.indexOf("blast_temperature")).toBeGreaterThan(ids.indexOf("flux"));
  });

  it("locks bellows and the wind site until they're built", () => {
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    const air = furnaceDials(g)[0]!;
    expect(Object.keys(air.locked ?? {})).toEqual(["bellows_crews", "wind_site"]);
    g.engine.state.set("has_bellows", true);
    expect(Object.keys(furnaceDials(g)[0]!.locked ?? {})).toEqual(["wind_site"]);
  });

  it("copper: blowpipes need ~2 kg charcoal per kg ore; below that the charge stays cold (worked example)", () => {
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    g.engine.addStock("ore_kg", 1000);
    g.engine.addStock("charcoal_kg", 5000);
    const ok = furnacePlan(g, { air_supply: "blowpipes", fuel_ratio: 2 });
    expect(ok.failure).toBeNull();
    expect(ok.metal_kg).toBeCloseTo(150 * 0.2, 6); // 20% of the 150 kg charge
    expect(ok.charge).toEqual({ ore_kg: 150, charcoal_kg: 300 });
    const cold = furnacePlan(g, { air_supply: "blowpipes", fuel_ratio: 1 });
    expect(cold.failure).toBe("too_cold");
    expect(cold.metal_kg).toBe(0);
    g.engine.state.set("has_bellows", true);
    expect(furnacePlan(g, { air_supply: "bellows_crews", fuel_ratio: 2 }).charge.ore_kg).toBe(300); // bellows double the charge
  });

  it("blast furnace: a 6 m stack on a water wheel makes ~1 t a day; hot blast at 149 C cuts fuel to Neilson's 5.16/8.06", () => {
    const g = new Game(tree);
    setBook(g, [...IRON, "blast_furnace", "water_wheels", "coal_mining", "far_seam", "lime_burning", "hot_blast"]);
    g.engine.state.set("has_coke", true);
    for (const r of ["iron_ore_kg", "charcoal_kg", "coke_kg", "lime_kg"]) g.engine.addStock(r, 1e7);
    const base = { charge_mode: "iron_blast", ore_choice: "hillside_ore", stack_height: 6, blast_source: "water_wheel", furnace_fuel: "coke", flux: 150 };
    const cold = furnacePlan(g, { ...base, blast_temperature: 20 });
    expect(cold.failure).toBeNull();
    expect(cold.metal_kg).toBeCloseTo(30 * 1000, 0);
    const hot = furnacePlan(g, { ...base, blast_temperature: 149 });
    expect(hot.writes.coke_rate! / COLD_BLAST_FUEL_T_PER_T.coke).toBeCloseTo(5.16 / 8.06, 6);
    const short = furnacePlan(g, { ...base, stack_height: 4 });
    expect(short.failure).toBe("frozen_short_stack");
    expect(short.metal_kg).toBe(0);
  });

  it("a campaign spends its charge at once and delivers the metal after 30 days; campaigns_run counts it", () => {
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    g.engine.addStock("ore_kg", 400);
    g.engine.addStock("charcoal_kg", 1000);
    sys(g).data.dials = { air_supply: "blowpipes", fuel_ratio: 2 };
    const copper0 = g.engine.stock("copper_kg");
    expect(startFurnace(g, "campaign")).toBe(true);
    expect(g.engine.stock("ore_kg")).toBeCloseTo(250, 6);
    expect(startFurnace(g, "campaign")).toBe(false); // one at a time
    let done = false;
    for (let i = 0; i < 30; i++) done = g.step().pauseReasons.some((r) => r.kind === "workshop_done") || done;
    expect(done).toBe(true);
    expect(g.engine.stock("copper_kg") - copper0).toBeGreaterThanOrEqual(30 - 1e-6);
    expect(sys(g).data.campaigns).toBe(1);
    g.step();
    expect(g.engine.get("campaigns_run")).toBeGreaterThanOrEqual(1);
    expect(sys(g).data.history).toHaveLength(1);
  });

  it("a failed campaign burns the fuel, makes nothing and says why", () => {
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    g.engine.addStock("ore_kg", 400);
    g.engine.addStock("charcoal_kg", 1000);
    sys(g).data.dials = { air_supply: "blowpipes", fuel_ratio: 0.5 };
    startFurnace(g, "campaign");
    for (let i = 0; i < 30; i++) g.step();
    const h = sys(g).data.history[0] as { detail: string; tone: string };
    expect(h.tone).toBe("bad");
    expect(h.detail).toBe(WS.furnace.failures.too_cold);
  });

  it("a campaign in progress survives save and load", () => {
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    g.engine.addStock("ore_kg", 400);
    g.engine.addStock("charcoal_kg", 1000);
    sys(g).data.dials = { air_supply: "blowpipes", fuel_ratio: 2 };
    startFurnace(g, "campaign");
    for (let i = 0; i < 10; i++) g.step();
    const back = new Game(tree, { save: g.engine.save() });
    for (let i = 0; i < 20; i++) {
      g.step();
      back.step();
    }
    expect(back.engine.stock("copper_kg")).toBeCloseTo(g.engine.stock("copper_kg"), 9);
    expect(sys(back).data.campaigns).toBe(1);
  });

  it("converter: a 20-minute blow with manganese and a basic lining makes steel_quality 2; acid lining on phosphoric pig is cold-short", () => {
    const g = new Game(tree);
    setBook(g, [...IRON, "blast_furnace", "bessemer_converter", "mineral_prospecting"]);
    g.engine.addStock("iron_kg", 20000);
    const good = converterPlan(g, { converter_lining: "basic_dolomite", blow_time: 20, manganese: "spiegeleisen" })!;
    expect(good.failure).toBeNull();
    expect(good.writes.steel_quality).toBe(2);
    g.engine.state.set("iron_ore_phosphorus", "high");
    const acid = converterPlan(g, { converter_lining: "acid_silica", blow_time: 20, manganese: "spiegeleisen" })!;
    expect(acid.writes.steel_quality).toBe(1);
    expect(acid.notes).toContain(WS.furnace.coldShort);
    expect(converterPlan(g, { converter_lining: "acid_silica", blow_time: 10, manganese: "none" })!.failure).toBe("under_blown");
  });

  it("the screen shows the live outputs, and Run starts a campaign", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    g.engine.addStock("ore_kg", 400);
    g.engine.addStock("charcoal_kg", 1000);
    const unmount = mountShell(root, g, { autoStart: false });
    for (let d = 0; d < 6 && !root.querySelector(`button[data-open-ws="${FURNACE}"]`); d++) {
      g.step();
      await frame();
    }
    (root.querySelector(`button[data-open-ws="${FURNACE}"]`) as HTMLButtonElement).click();
    await frame();
    const view = root.querySelector(".wsview") as HTMLElement;
    expect(view.querySelectorAll(".wk-dial").length).toBe(2);
    expect(view.textContent).toContain(WS.furnace.temperature);
    const num = view.querySelector('[data-dial="fuel_ratio"] .wk-num') as HTMLInputElement;
    num.value = "0.5";
    num.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.querySelector(".wk-body")!.textContent).toContain(WS.furnace.failures.too_cold);
    num.value = "2";
    num.dispatchEvent(new Event("change", { bubbles: true }));
    (view.querySelector('button[data-act="campaign"]') as HTMLButtonElement).click();
    expect(sys(g).data.history).toHaveLength(0);
    expect(g.engine.stock("ore_kg")).toBeLessThan(400);
    g.step();
    await frame();
    expect(view.querySelector(".wk-prog")).not.toBeNull();
    unmount();
  });
});
