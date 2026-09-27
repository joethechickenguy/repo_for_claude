// @vitest-environment happy-dom
// E5: the rocket engine workshop. Dials in stage order, the V-2 worked example renders (≈200 / 239 s,
// ≈250 kN for a minute), firings queue for the stand, burn LOX, and the best one sets the gate's numbers.
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../../src/content";
import type { JsonValue } from "../../../src/engine";
import { mountShell } from "../../../src/ui/shell";
import { Game } from "../../../src/ui/shellGame";
import { workshopSystem } from "../../../src/ui/workshops/kit";
import { fuelNeed, fuelResource, loxNeed, queueFiring, ROCKET_ENGINE, rocketEngineDesign, rocketEngineDials, rocketEngineResult, rocketEngineRows } from "../../../src/ui/workshops/rocketEngine";
import { WS } from "../../../src/ui/workshops/strings";

const frame = () => new Promise((r) => setTimeout(r, 30));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });
const sys = (g: Game) =>
  workshopSystem<JsonValue>(g, ROCKET_ENGINE)! as unknown as { data: { dials: Record<string, JsonValue>; queue: unknown[]; history: { detail: string; tone: string }[] } };
const days = (g: Game, k: number) => {
  for (let i = 0; i < k; i++) g.step();
};
const ALL = ["test_stand", "fuel_alcohol", "first_liquid_rocket", "instrumentation", "regenerative_cooling", "injector_design", "pressure_fed_booster_engine", "hydrogen_peroxide"];
const V2 = { mixture_ratio: 1.3, chamber_pressure: 15, nozzle: 4, cooling: "film", injector: "showerhead", feed: "peroxide_turbopump" };

describe("E5 rocket engine workshop", () => {
  it("offers dials in the order the stage file adds them", () => {
    const g = new Game(tree);
    setBook(g, ["test_stand", "first_liquid_rocket"]);
    expect(rocketEngineDials(g).map((d) => d.id)).toEqual(["mixture_ratio", "chamber_pressure"]);
    setBook(g, ALL);
    const order = tree.workshops[ROCKET_ENGINE]!.dials.map((d) => d.id);
    expect(rocketEngineDials(g).map((d) => d.id)).toEqual(order);
    expect(Object.keys(rocketEngineDials(g).find((d) => d.id === "feed")!.locked ?? {})).toEqual(["gas_generator_turbopump"]);
  });

  it("the V-2's settings: ≈200 s at sea level, ≈239 s in vacuum, ≈250 kN, a minute on film cooling", () => {
    const g = new Game(tree);
    setBook(g, ALL);
    const r = rocketEngineResult(g, rocketEngineDesign(g, V2));
    expect(r.isp_sl_s).toBeGreaterThan(196);
    expect(r.isp_sl_s).toBeLessThan(204);
    expect(r.isp_vac_s).toBeGreaterThan(236);
    expect(r.isp_vac_s).toBeLessThan(242);
    expect(r.thrust_kn).toBeGreaterThanOrEqual(250);
    expect(r.burn_time_s).toBeCloseTo(60, 6);
    const text = rocketEngineRows(g, r).map((x) => `${x.label} ${x.value}`).join(" | ");
    expect(text).toContain(`${WS.rocketEngine.flaws} ${WS.frame.pendingH}`);
  });

  it("the first engine (uncooled showerhead) burns through in seconds", () => {
    const g = new Game(tree);
    setBook(g, ["test_stand", "fuel_alcohol", "first_liquid_rocket"]);
    const r = rocketEngineResult(g, rocketEngineDesign(g, { mixture_ratio: 1.4, chamber_pressure: 10 }));
    expect(r.burn_time_s).toBeLessThan(10);
  });

  it("a firing waits for LOX and fuel, takes its stand days, and the best one sets engine_static_fire_s and engine_thrust_kn", () => {
    const g = new Game(tree);
    setBook(g, ALL);
    sys(g).data.dials = V2;
    const r0 = rocketEngineResult(g, rocketEngineDesign(g, V2));
    const need = loxNeed(g, r0);
    expect(fuelResource(g)).toBe("ethanol_kg"); // alcohol route: no kerosene
    expect(fuelNeed(g, r0) * 1.3).toBeCloseTo(need, 6); // 1.3 : 1 oxidizer to fuel
    g.engine.addStock("ethanol_kg", 1e6);
    queueFiring(g);
    days(g, 3);
    expect(g.engine.get("lox_balance")).toBeCloseTo(-need, 6);
    expect(g.engine.get("stand_days_balance")).toBe(365 - 14);
    g.engine.addStock("lox_kg", need + 10);
    days(g, 1);
    expect(g.engine.stock("lox_kg")).toBeCloseTo(10, 6);
    days(g, 14);
    expect(g.engine.get("engine_static_fire_s")).toBeCloseTo(60, 6);
    expect(g.engine.get("engine_thrust_kn")).toBeGreaterThanOrEqual(250);
    expect(g.engine.get("feed_system")).toBe("peroxide_turbopump");
    expect(sys(g).data.history.at(-1)!.tone).toBe("good");
    // A worse firing afterwards doesn't lose the record.
    sys(g).data.dials = { ...V2, cooling: "none" };
    g.engine.addStock("lox_kg", need * 2);
    queueFiring(g);
    days(g, 16);
    expect(sys(g).data.history.at(-1)!.tone).toBe("bad");
    expect(g.engine.get("engine_static_fire_s")).toBeCloseTo(60, 6);
  });

  it("the screen draws the pressure trace and queues a firing", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = new Game(tree);
    setBook(g, ALL);
    const unmount = mountShell(root, g, { autoStart: false });
    for (let d = 0; d < 8 && !root.querySelector(`button[data-open-ws="${ROCKET_ENGINE}"]`); d++) {
      g.step();
      await frame();
    }
    (root.querySelector(`button[data-open-ws="${ROCKET_ENGINE}"]`) as HTMLButtonElement).click();
    await frame();
    const view = root.querySelector(".wsview") as HTMLElement;
    expect(view.querySelector("svg.wk-svg title")!.textContent).toBe(WS.rocketEngine.trace);
    (view.querySelector('button[data-act="queue"]') as HTMLButtonElement).click();
    expect(sys(g).data.queue).toHaveLength(1);
    expect(view.querySelector(".wk-queue li")).not.toBeNull();
    unmount();
  });
});
