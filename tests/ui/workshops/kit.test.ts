// @vitest-environment happy-dom
// The shared workshop kit and the shell's workshop plumbing (set up before Wave 3).
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../../src/content";
import { mountShell, registerWorkshop } from "../../../src/ui/shell";
import { Game, registerGameSystem } from "../../../src/ui/shellGame";
import { STRINGS } from "../../../src/ui/strings";
import { defaultDialValue, historyHTML, mountDials, outputsHTML, workshopDials, workshopSystem, WorkshopSystem } from "../../../src/ui/workshops/kit";

const frame = () => new Promise((r) => setTimeout(r, 40));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });

// A test workshop system, registered once for every Game made below.
registerGameSystem(() => new WorkshopSystem<{ runs: number }>("kit_test", { runs: 0 }, (_ctx, sys) => void (sys.data = { runs: sys.data.runs + 1 })));

describe("workshop kit", () => {
  it("offers only the dials the player has earned, in stage order", () => {
    const g = new Game(tree);
    expect(workshopDials(g, "furnace_workshop")).toEqual([]); // not open yet
    setBook(g, ["crucibles_blowpipes"]);
    expect(workshopDials(g, "furnace_workshop").map((d) => d.id)).toEqual(["air_supply", "fuel_ratio"]);
    setBook(g, ["crucibles_blowpipes", "iron_prospecting", "bloomery"]);
    expect(workshopDials(g, "furnace_workshop").map((d) => d.id)).toEqual(["air_supply", "fuel_ratio", "ore_choice", "charge_mode"]);
  });

  it("draws range and option dials; clicks and typed numbers report new values, clamped to the range", () => {
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    const dials = workshopDials(g, "furnace_workshop");
    const host = document.createElement("div");
    const seen: [string, unknown][] = [];
    mountDials(host, dials, {}, (id, v) => seen.push([id, v]));
    (host.querySelector('[data-dial="air_supply"] button[data-opt="wind_site"]') as HTMLButtonElement).click();
    const num = host.querySelector('[data-dial="fuel_ratio"] .wk-num') as HTMLInputElement;
    num.value = "99";
    num.dispatchEvent(new Event("change", { bubbles: true }));
    expect(seen).toEqual([["air_supply", "wind_site"], ["fuel_ratio", 15]]);
    expect(defaultDialValue(dials[1]!)).toBe(7.8);
    expect(host.querySelector('[data-dial="air_supply"] button.on')!.textContent).toBe("wind site");
  });

  it("renders outputs and history (newest first)", () => {
    expect(outputsHTML([{ label: "Copper", value: "12 kg", tone: "good" }])).toContain("12 kg");
    expect(historyHTML([])).toContain(STRINGS.workshop.noHistory);
    const h = historyHTML([{ day: 10, title: "A", detail: "" }, { day: 400, title: "B", detail: "" }]);
    expect(h.indexOf("B")).toBeLessThan(h.indexOf("A"));
  });

  it("a workshop system ticks with the run and its data survives save and load", () => {
    const g = new Game(tree);
    for (let d = 0; d < 3; d++) g.step();
    expect(workshopSystem<{ runs: number }>(g, "kit_test")!.data.runs).toBe(3);
    const back = new Game(tree, { save: g.engine.save() });
    expect(workshopSystem<{ runs: number }>(back, "kit_test")!.data.runs).toBe(3);
  });

  it("the shell lists an open workshop with an Open button that shows its screen full width", async () => {
    let mounted = 0;
    registerWorkshop("furnace_workshop", (el) => {
      mounted++;
      el.textContent = "furnace screen";
      return () => void (mounted = -1);
    });
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = new Game(tree);
    setBook(g, ["crucibles_blowpipes"]);
    const unmount = mountShell(root, g, { autoStart: false });
    g.step();
    await frame();
    const open = root.querySelector('button[data-open-ws="furnace_workshop"]') as HTMLButtonElement | null;
    if (!open) {
      // The workshop entry waits for its introduction; let the intro queue release it.
      for (let d = 0; d < 5 && !root.querySelector('button[data-open-ws="furnace_workshop"]'); d++) {
        g.step();
        await frame();
      }
    }
    (root.querySelector('button[data-open-ws="furnace_workshop"]') as HTMLButtonElement).click();
    await frame();
    expect(mounted).toBe(1);
    expect((root.querySelector(".wsview") as HTMLElement).hidden).toBe(false);
    expect(root.querySelector(".wsview")!.textContent).toContain("furnace screen");
    expect((root.querySelector(".cols") as HTMLElement).hidden).toBe(true);
    (root.querySelector(".ws-head button") as HTMLButtonElement).click();
    await frame();
    expect(mounted).toBe(-1);
    expect((root.querySelector(".cols") as HTMLElement).hidden).toBe(false);
    unmount();
  });
});
