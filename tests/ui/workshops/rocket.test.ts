// @vitest-environment happy-dom
// E6: the rocket workshop (the mockup's screen 5). Dials in stage order, the mockup's 4-stage vehicle
// renders (13.64 km/s, ~614 t, short of the 15.3 budget), locks follow chemistry, and adopting a design
// sets dv_margin_km_s, which later nodes spend.
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../../src/content";
import type { JsonValue } from "../../../src/engine";
import { mountShell } from "../../../src/ui/shell";
import { Game } from "../../../src/ui/shellGame";
import { workshopSystem } from "../../../src/ui/workshops/kit";
import { adoptRocket, currentRocket, dvTextHTML, ROCKET, rocketAllDials, rocketDials } from "../../../src/ui/workshops/rocket";
import { WS } from "../../../src/ui/workshops/strings";

const frame = () => new Promise((r) => setTimeout(r, 30));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });
type Data = { dials: Record<string, JsonValue>; stages: Record<string, JsonValue>[]; adopted: unknown; history: unknown[] };
const sys = (g: Game) => workshopSystem<JsonValue>(g, ROCKET)! as unknown as { data: Data };
const MOCKUP = [
  { propellant_mass: 420, propellants: "kerosene_lox", tank_material: "steel", feed: "turbopump" },
  { propellant_mass: 95, propellants: "kerosene_lox", tank_material: "aluminum", feed: "turbopump" },
  { propellant_mass: 22, propellants: "kerosene_lox", tank_material: "aluminum", feed: "turbopump" },
  { propellant_mass: 5, propellants: "ethanol_lox", tank_material: "aluminum", feed: "pressure_fed" },
];
const chemistry = (g: Game) => {
  for (const f of ["has_kerosene", "has_ethanol", "has_duralumin"]) g.engine.state.set(f, true);
};

describe("E6 rocket workshop", () => {
  it("offers dials in the order the stage file adds them; per-stage dials are the table's columns", () => {
    const g = new Game(tree);
    setBook(g, ["rocket_workshop"]);
    expect(rocketAllDials(g).map((d) => d.id)).toEqual(["stage_count", "propellant_mass", "propellants", "tank_material", "feed"]);
    expect(rocketDials(g).map((d) => d.id)).toEqual(["stage_count"]);
    setBook(g, ["rocket_workshop", "guidance_choice"]);
    expect(rocketAllDials(g).map((d) => d.id)).toEqual(tree.workshops[ROCKET]!.dials.map((d) => d.id));
    expect(rocketDials(g).map((d) => d.id)).toEqual(["stage_count", "route"]);
  });

  it("the mockup's vehicle: 3.50 / 3.70 / 3.66 / 2.78 km/s, 13.64 in all, ~614 t, and it hits the Moon too fast", () => {
    const g = new Game(tree);
    setBook(g, ["rocket_workshop"]);
    chemistry(g);
    const { design } = currentRocket(g, { dials: {}, stages: MOCKUP, adopted: null, history: [] });
    expect(design.stages.map((s) => s.dv_km_s.toFixed(2))).toEqual(["3.50", "3.70", "3.66", "2.78"]);
    expect(design.dv_total_km_s).toBeCloseTo(13.64, 2);
    expect(design.liftoff_mass_t).toBeGreaterThan(610);
    expect(design.liftoff_mass_t).toBeLessThan(618);
    const text = dvTextHTML(design);
    expect(text).toContain("Short by 1.66 km/s");
    expect(text).toContain(WS.rocket.reach.toward_moon);
  });

  it("with the chemistry in hand, the screen's first design is the mockup's vehicle", () => {
    const g = new Game(tree);
    setBook(g, ["rocket_workshop"]);
    chemistry(g);
    const { stages, design } = currentRocket(g, { dials: {}, stages: [], adopted: null, history: [] });
    expect(stages).toEqual(MOCKUP);
    expect(design.dv_total_km_s).toBeCloseTo(13.64, 2);
  });

  it("the first design uses only the chemistry the colony has", () => {
    const g = new Game(tree);
    setBook(g, ["rocket_workshop"]);
    g.engine.state.set("has_ethanol", true);
    const dials = rocketAllDials(g);
    expect(Object.keys(dials.find((d) => d.id === "propellants")!.locked ?? {})).toEqual(["kerosene_lox", "hypergolic"]);
    expect(Object.keys(dials.find((d) => d.id === "tank_material")!.locked ?? {})).toEqual(["aluminum"]);
    // Asking for kerosene and aluminum without them falls back to what's open.
    const { stages } = currentRocket(g, { dials: {}, stages: MOCKUP, adopted: null, history: [] });
    expect(stages).toHaveLength(4);
    expect(stages.map((s) => s.propellant_mass)).toEqual([420, 95, 22, 5]);
    expect(new Set(stages.map((s) => s.propellants))).toEqual(new Set(["ethanol_lox"]));
    expect(new Set(stages.map((s) => s.tank_material))).toEqual(new Set(["steel"]));
  });

  it("adopting sets dv_margin_km_s and vehicle_design; crew safety spends 0.15 km/s of it later", () => {
    const g = new Game(tree);
    setBook(g, ["rocket_workshop"]);
    chemistry(g);
    sys(g).data.stages = MOCKUP.map((s, i) => (i === 0 ? { ...s, propellant_mass: 1000 } : s));
    const { design } = currentRocket(g, { dials: {}, stages: sys(g).data.stages, adopted: null, history: [] });
    expect(adoptRocket(g)).toBe(true);
    expect(g.engine.get("dv_margin_km_s")).toBeCloseTo(design.dv_margin_km_s, 9);
    expect((g.engine.get("vehicle_design") as string[])[0]).toContain("stage1:1000t");
    setBook(g, ["rocket_workshop", "crew_safety"]);
    g.step();
    expect(g.engine.get("dv_margin_km_s")).toBeCloseTo(design.dv_margin_km_s - 0.15, 9);
  });

  it("the screen: a row per stage, typing a propellant mass moves the Δv, one stage shows the what-if", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = new Game(tree);
    setBook(g, ["rocket_workshop"]);
    chemistry(g);
    const unmount = mountShell(root, g, { autoStart: false });
    for (let d = 0; d < 8 && !root.querySelector(`button[data-open-ws="${ROCKET}"]`); d++) {
      g.step();
      await frame();
    }
    (root.querySelector(`button[data-open-ws="${ROCKET}"]`) as HTMLButtonElement).click();
    await frame();
    const view = root.querySelector(".wsview") as HTMLElement;
    expect(view.querySelectorAll(".wk-table tbody tr").length).toBe(4);
    const dv0 = view.querySelector(".wk-table tbody tr td:last-child")!.textContent;
    const input = view.querySelector('input[data-field="0:propellant_mass"]') as HTMLInputElement;
    input.value = "900";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.querySelector(".wk-table tbody tr td:last-child")!.textContent).not.toBe(dv0);
    const count = view.querySelector('[data-dial="stage_count"] .wk-num') as HTMLInputElement;
    count.value = "1";
    count.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.querySelectorAll(".wk-table tbody tr").length).toBe(1);
    expect(view.textContent).toContain("tops out at");
    (view.querySelector('button[data-act="adopt"]') as HTMLButtonElement).click();
    expect(sys(g).data.adopted).not.toBeNull();
    unmount();
  });
});
