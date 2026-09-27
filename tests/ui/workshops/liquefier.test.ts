// @vitest-environment happy-dom
// E4: the liquefier. Dials in stage order, C's worked examples (30 trays -> 99% O2; Linde vs Claude
// energy), a run cools to the first drop and then fills the stores with oxygen, a stalled plant says so.
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../../src/content";
import type { JsonValue } from "../../../src/engine";
import { mountShell } from "../../../src/ui/shell";
import { Game } from "../../../src/ui/shellGame";
import { workshopSystem } from "../../../src/ui/workshops/kit";
import { LIQUEFIER, liquefierDesign, liquefierDials, liquefierResult, startLiquefier, stopLiquefier } from "../../../src/ui/workshops/liquefier";
import { WS } from "../../../src/ui/workshops/strings";

const frame = () => new Promise((r) => setTimeout(r, 30));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });
const sys = (g: Game) => workshopSystem<JsonValue>(g, LIQUEFIER)! as unknown as { data: { dials: Record<string, JsonValue>; history: { detail: string; tone: string }[] } };
const days = (g: Game, k: number) => {
  for (let i = 0; i < k; i++) g.step();
};
const ALL = ["cascade_liquefier", "compressors", "linde_liquefier", "claude_expander", "air_separation"];
const LINDE = { method: "throttle_regenerative", pressure: 200, exchanger_length: 10, column: 30 };

describe("E4 liquefier workshop", () => {
  it("offers dials in the order the stage file adds them", () => {
    const g = new Game(tree);
    setBook(g, ["cascade_liquefier"]);
    expect(liquefierDials(g).map((d) => d.id)).toEqual(["method"]);
    expect(Object.keys(liquefierDials(g)[0]!.locked ?? {})).toEqual(["throttle_regenerative", "expansion_engine"]);
    setBook(g, ALL);
    expect(liquefierDials(g).map((d) => d.id)).toEqual(tree.workshops[LIQUEFIER]!.dials.map((d) => d.id));
  });

  it("30 trays give 99% oxygen; the expansion engine needs about half the Linde plant's energy", () => {
    const g = new Game(tree);
    setBook(g, ALL);
    const linde = liquefierResult(g, liquefierDesign(g, LINDE));
    expect(linde.purity_pct).toBeCloseTo(99, 6);
    expect(linde.kwh_per_kg!).toBeGreaterThan(1);
    expect(linde.kwh_per_kg!).toBeLessThan(3);
    const claude = liquefierResult(g, liquefierDesign(g, { ...LINDE, method: "expansion_engine", pressure: 40 }));
    expect(claude.kwh_per_kg!).toBeLessThan(linde.kwh_per_kg! * 0.6);
  });

  it("a run cools for days, then makes liquid oxygen every day: lox_kg_per_day reaches the gate's 500", () => {
    const g = new Game(tree);
    setBook(g, ALL);
    sys(g).data.dials = LINDE;
    const r = liquefierResult(g, liquefierDesign(g, LINDE));
    startLiquefier(g);
    days(g, Math.ceil(r.days_to_first_drop!) - 1);
    expect(g.engine.get("lox_kg_per_day")).toBe(0);
    days(g, 1);
    expect(g.engine.get("cryo_process")).toBe("linde");
    expect(g.engine.get("has_liquid_air")).toBe(true);
    expect(g.engine.get("lox_kg_per_day")).toBeGreaterThanOrEqual(500);
    const lox = g.engine.stock("lox_kg");
    days(g, 3);
    expect(g.engine.stock("lox_kg") - lox).toBeCloseTo(3 * r.oxygen_kg_per_day, 3);
    stopLiquefier(g);
    expect(g.engine.get("lox_kg_per_day")).toBe(0);
  });

  it("without a column the plant makes liquid air, not oxygen for the stores", () => {
    const g = new Game(tree);
    setBook(g, ALL);
    sys(g).data.dials = { ...LINDE, column: 0 };
    startLiquefier(g);
    days(g, 10);
    expect(g.engine.get("has_liquid_air")).toBe(true);
    expect(g.engine.get("lox_kg_per_day")).toBe(0);
  });

  it("a short exchanger never gets cold enough: the run is given up and the history says why", () => {
    const g = new Game(tree);
    setBook(g, ALL);
    const bad = { method: "throttle_regenerative", pressure: 20, exchanger_length: 1, column: 0 };
    expect(liquefierResult(g, liquefierDesign(g, bad)).days_to_first_drop).toBeNull();
    sys(g).data.dials = bad;
    startLiquefier(g);
    days(g, 30);
    const h = sys(g).data.history.at(-1)!;
    expect(h.tone).toBe("bad");
    expect(h.detail).toContain("stalled");
    expect(g.engine.get("has_liquid_air")).toBe(false);
  });

  it("the screen draws the cool-down curve and starts a run", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = new Game(tree);
    setBook(g, ALL);
    const unmount = mountShell(root, g, { autoStart: false });
    for (let d = 0; d < 8 && !root.querySelector(`button[data-open-ws="${LIQUEFIER}"]`); d++) {
      g.step();
      await frame();
    }
    (root.querySelector(`button[data-open-ws="${LIQUEFIER}"]`) as HTMLButtonElement).click();
    await frame();
    const view = root.querySelector(".wsview") as HTMLElement;
    expect(view.querySelector("svg.wk-svg title")!.textContent).toBe(WS.liquefier.chart);
    (view.querySelector('button[data-act="start"]') as HTMLButtonElement).click();
    expect(view.querySelector('button[data-act="stop"]')).not.toBeNull();
    unmount();
  });
});
