// @vitest-environment happy-dom
// E2: the engine workshop. Dials in stage order, C's worked examples render, a build becomes the
// running engine (state, the tenders' coal-to-work), and a thin boiler bursts on the date shown.
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../../src/content";
import type { JsonValue } from "../../../src/engine";
import { mountShell } from "../../../src/ui/shell";
import { Game } from "../../../src/ui/shellGame";
import { buildEngine, ENGINE_JOB, ENGINE_WS, engineDesign, engineDials, engineRows, runningEngine } from "../../../src/ui/workshops/engine";
import { workshopSystem } from "../../../src/ui/workshops/kit";
import { WS } from "../../../src/ui/workshops/strings";

const frame = () => new Promise((r) => setTimeout(r, 30));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });
const sys = (g: Game) => workshopSystem<JsonValue>(g, ENGINE_WS)! as unknown as { data: { dials: Record<string, JsonValue>; history: { detail: string; tone: string }[] } };
const days = (g: Game, k: number) => {
  for (let i = 0; i < k; i++) g.step();
};

const NEWCOMEN = ["savery_pump", "newcomen_engine"];
const NEWCOMEN_DIALS = { lift_height: 30, cylinder_diameter: 0.5, boiler_pressure: 1, plate: { value: 10, option: "hammered" } };

describe("E2 engine workshop", () => {
  it("offers dials in the order the stage files add them", () => {
    const g = new Game(tree);
    setBook(g, ["savery_pump"]);
    expect(engineDials(g).map((d) => d.id)).toEqual(["lift_height"]);
    setBook(g, [...NEWCOMEN, "watt_engine", "rotative_engine_shafting", "dynamo", "distribution_grid", "steam_turbine"]);
    expect(engineDials(g).map((d) => d.id)).toEqual(tree.workshops[ENGINE_WS]!.dials.map((d) => d.id));
  });

  it("Savery: past ~9 m the soldered boiler must push, and the screen says it will burst", () => {
    const g = new Game(tree);
    setBook(g, ["savery_pump"]);
    expect(engineDesign(g, { lift_height: 9 }).years_to_failure).toBeNull();
    const deep = engineDesign(g, { lift_height: 20 });
    expect(deep.years_to_failure).toBe(0);
    expect(deep.notes[0]).toContain("9 m");
  });

  it("a 0.5 m atmospheric engine gives ~4 kW on ~2.5 t of coal a day (worked example)", () => {
    const g = new Game(tree);
    setBook(g, NEWCOMEN);
    const e = engineDesign(g, NEWCOMEN_DIALS);
    expect(e.kind).toBe("newcomen");
    expect(e.shaft_kw).toBeCloseTo(3.93, 2);
    expect(e.coal_per_day).toBeGreaterThan(2400);
    expect(e.coal_per_day).toBeLessThan(2600);
    const text = engineRows(g, e).map((r) => `${r.label} ${r.value}`).join(" | ");
    expect(text).toContain(`${WS.engine.shaft} 3.93 kW`);
  });

  it("boiler pressure stays at an atmospheric engine's until the high-pressure engine; rolled plate waits for its mill", () => {
    const g = new Game(tree);
    setBook(g, NEWCOMEN);
    const d = engineDials(g);
    expect(d.find((x) => x.id === "boiler_pressure")!.range).toEqual([1, 2]);
    expect(Object.keys(d.find((x) => x.id === "plate")!.locked ?? {})).toEqual(["rolled"]);
    setBook(g, [...NEWCOMEN, "high_pressure_engine", "plate_rolling"]);
    expect(engineDials(g).find((x) => x.id === "boiler_pressure")!.range).toEqual([1, 6]);
  });

  it("a build spends the iron, takes the build time, then runs: engine type set and the tenders burn coal at the design's rate", () => {
    const g = new Game(tree);
    setBook(g, [...NEWCOMEN, "watt_engine"]);
    g.engine.unlockJob(ENGINE_JOB);
    g.engine.addStock("iron_kg", 50_000);
    sys(g).data.dials = { ...NEWCOMEN_DIALS, condenser: "separate" };
    const e = engineDesign(g, sys(g).data.dials);
    expect(buildEngine(g)).toBe(true);
    expect(g.engine.stock("iron_kg")).toBeCloseTo(50_000 - e.iron_cost_kg, 3);
    days(g, 179);
    expect(runningEngine(g)).toBeNull();
    days(g, 1);
    expect(runningEngine(g)!.design.kind).toBe("watt");
    expect(g.engine.get("engine_type")).toBe("watt");
    expect(g.engine.get("coal_per_engine_kw")).toBeCloseTo(e.coal_per_engine_kw, 9);
    // tend_engine: 250 kg coal -> 10 kWh; the Watt design burns ~a quarter of that per kWh.
    expect(g.engine.modifier("yield", ENGINE_JOB)).toBeCloseTo(25 / e.coal_per_engine_kw, 6);
    expect(sys(g).data.history).toHaveLength(1);
  });

  it("a thin boiler bursts on the date the screen showed: boiler_explosions + 1, the engine is gone", () => {
    const g = new Game(tree);
    setBook(g, [...NEWCOMEN, "high_pressure_engine"]);
    g.engine.addStock("iron_kg", 50_000);
    sys(g).data.dials = { ...NEWCOMEN_DIALS, boiler_pressure: 3, plate: { value: 9, option: "hammered" } };
    const e = engineDesign(g, sys(g).data.dials);
    expect(e.years_to_failure).not.toBeNull();
    expect(e.years_to_failure!).toBeGreaterThan(0);
    buildEngine(g);
    days(g, 180);
    const burst = runningEngine(g)!.burst!;
    expect(burst).toBe(180 + Math.round(e.years_to_failure! * 365));
    days(g, burst - g.engine.day - 1);
    expect(runningEngine(g)).not.toBeNull();
    days(g, 1);
    expect(runningEngine(g)).toBeNull();
    expect(g.engine.get("boiler_explosions")).toBe(1);
    expect(sys(g).data.history.at(-1)!.detail).toBe(WS.engine.burst);
  });

  it("Stage 3: a 1.2 m, 3 atm rotative engine with bronze bearings runs a 50 kW dynamo (the gate's worked example)", () => {
    const g = new Game(tree);
    setBook(g, [...NEWCOMEN, "high_pressure_engine", "plate_rolling", "rotative_engine_shafting", "dynamo"]);
    g.engine.state.set("bearing_quality", 1);
    g.engine.addStock("iron_kg", 100_000);
    g.engine.addStock("coal_kg", 1e6);
    sys(g).data.dials = { ...NEWCOMEN_DIALS, cylinder_diameter: 1.2, boiler_pressure: 3, plate: { value: 20, option: "rolled" }, flywheel: "rotative", generator: "self_excited" };
    expect(engineDesign(g, { ...sys(g).data.dials, flywheel: "beam_pump" }).needsRotative).toBe(true);
    const e = engineDesign(g, sys(g).data.dials);
    expect(e.dynamo!.dynamo_output_kw).toBeGreaterThanOrEqual(50);
    buildEngine(g);
    days(g, 180);
    expect(g.engine.get("dynamo_output_kw")).toBeGreaterThanOrEqual(50);
    expect(g.engine.get("factory_power_kw")).toBeCloseTo(e.shaft_kw, 6);
    // It burns its design's coal from the stores, and its electricity counts toward energy.
    const coal = g.engine.stock("coal_kg");
    days(g, 1);
    expect(coal - g.engine.stock("coal_kg")).toBeCloseTo(e.coal_per_day, 3);
    expect(g.engine.metric("electricity_kw")).toBeCloseTo(e.dynamo!.dynamo_output_kw, 6);
    // Out of coal, it stands cold.
    g.engine.spend({ coal_kg: g.engine.stock("coal_kg") });
    days(g, 1);
    expect(g.engine.get("dynamo_output_kw")).toBe(0);
  });

  it("Stage 4: AC delivers nearly everything the dynamo makes; DC loses most of it over the colony", () => {
    const g = new Game(tree);
    setBook(g, [...NEWCOMEN, "high_pressure_engine", "plate_rolling", "rotative_engine_shafting", "dynamo", "distribution_grid"]);
    g.engine.state.set("bearing_quality", 2);
    const dials = { ...NEWCOMEN_DIALS, cylinder_diameter: 1.2, boiler_pressure: 3, plate: { value: 20, option: "rolled" }, flywheel: "rotative", generator: "self_excited" };
    const ac = engineDesign(g, { ...dials, transmission: "ac_transformed" });
    const dc = engineDesign(g, { ...dials, transmission: "dc_local" });
    expect(ac.line_loss_pct!).toBeLessThan(1);
    expect(dc.line_loss_pct!).toBeGreaterThan(20);
  });

  it("the screen shows the design, the margin and a Build button", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = new Game(tree);
    setBook(g, NEWCOMEN);
    g.engine.addStock("iron_kg", 50_000);
    const unmount = mountShell(root, g, { autoStart: false });
    for (let d = 0; d < 8 && !root.querySelector(`button[data-open-ws="${ENGINE_WS}"]`); d++) {
      g.step();
      await frame();
    }
    (root.querySelector(`button[data-open-ws="${ENGINE_WS}"]`) as HTMLButtonElement).click();
    await frame();
    const view = root.querySelector(".wsview") as HTMLElement;
    expect(view.querySelectorAll(".wk-dial").length).toBe(4);
    expect(view.textContent).toContain(WS.engine.margin);
    (view.querySelector('button[data-act="build"]') as HTMLButtonElement).click();
    expect(g.engine.stock("iron_kg")).toBeLessThan(50_000);
    unmount();
  });
});
