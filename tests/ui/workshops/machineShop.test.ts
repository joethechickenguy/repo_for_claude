// @vitest-environment happy-dom
// E3: the machine shop. Dials in stage order, the tolerance ladder, retooling commits tolerance_mm and
// bearing_quality, the parts queue (order, rejects, a year of shop time) and the heartbeat balance.
import { describe, expect, it } from "vitest";
import { tree, type NodeBook } from "../../../src/content";
import type { JsonValue } from "../../../src/engine";
import { mountShell } from "../../../src/ui/shell";
import { Game } from "../../../src/ui/shellGame";
import { workshopSystem } from "../../../src/ui/workshops/kit";
import { movePart, partKinds, queuedParts, runQueue, SHOP, shopDials, shopHours, shopSetup, startRetool } from "../../../src/ui/workshops/machineShop";
import { WS } from "../../../src/ui/workshops/strings";

const frame = () => new Promise((r) => setTimeout(r, 30));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });
const sys = (g: Game) => workshopSystem<JsonValue>(g, SHOP)! as unknown as { data: { dials: Record<string, JsonValue>; order: string[]; history: unknown[] } };
const days = (g: Game, k: number) => {
  for (let i = 0; i < k; i++) g.step();
};
const SHOP_NODES = ["surface_plates", "screw_cutting_lathe", "measurement", "bearings_lubrication", "electric_motors_preview"];

describe("E3 machine shop", () => {
  it("every queued part names a real node and a positive tolerance", () => {
    for (const p of partKinds(new Game(tree))) {
      expect(tree.nodes[p.after], p.id).toBeDefined();
      expect(p.tolerance_mm).toBeGreaterThan(0);
      expect(p.hours).toBeGreaterThan(0);
    }
  });

  it("offers dials in the order the stage file adds them", () => {
    const g = new Game(tree);
    setBook(g, ["surface_plates"]);
    expect(shopDials(g).map((d) => d.id)).toEqual(["flat_reference"]);
    setBook(g, SHOP_NODES);
    expect(shopDials(g).map((d) => d.id)).toEqual(tree.workshops[SHOP]!.dials.map((d) => d.id));
  });

  it("climbs the tolerance ladder: 1.0 hand, 0.75 two plates, 0.5, 0.25, 0.1, 0.02, 0.01 with grinding", () => {
    const g = new Game(tree);
    setBook(g, SHOP_NODES);
    const tol = (v: Record<string, string>) => shopSetup(g, v).tolerance_mm;
    expect(tol({ flat_reference: "none" })).toBe(1);
    expect(tol({ flat_reference: "two_plates", lead_screw: "geared", gauging: "micrometer" })).toBe(0.75);
    expect(tol({ flat_reference: "three_plates" })).toBe(0.5);
    expect(tol({ flat_reference: "three_plates", lead_screw: "geared" })).toBe(0.25);
    expect(tol({ flat_reference: "three_plates", lead_screw: "geared", gauging: "go_no_go_gauges" })).toBe(0.1);
    expect(tol({ flat_reference: "three_plates", lead_screw: "geared", gauging: "micrometer" })).toBe(0.02);
    setBook(g, [...SHOP_NODES, "precision_grinding"]);
    expect(tol({ flat_reference: "three_plates", lead_screw: "geared", gauging: "micrometer" })).toBe(0.01);
  });

  it("retooling takes its days, then sets tolerance_mm and bearing_quality", () => {
    const g = new Game(tree);
    setBook(g, SHOP_NODES);
    sys(g).data.dials = { flat_reference: "three_plates", lead_screw: "geared", gauging: "go_no_go_gauges", bearings: "bronze_and_oil" };
    expect(startRetool(g)).toBe(true);
    days(g, 29);
    expect(g.engine.get("tolerance_mm")).toBe(1);
    days(g, 1);
    expect(g.engine.get("tolerance_mm")).toBe(0.1);
    expect(g.engine.get("bearing_quality")).toBe(1);
    expect(sys(g).data.history).toHaveLength(1);
  });

  it("parts join the queue as their nodes are built, in the player's order; a part tighter than the shop is remade", () => {
    const g = new Game(tree);
    setBook(g, [...SHOP_NODES, "rotative_engine_shafting", "rails_wagonways"]);
    const q0 = queuedParts(g, []).map((p) => p.id);
    expect(q0).toEqual(["engine_parts", "lathe_screws", "gauges", "rails"]);
    movePart(g, "rails", -1);
    movePart(g, "rails", -1);
    expect(queuedParts(g, sys(g).data.order).map((p) => p.id)).toEqual(["engine_parts", "rails", "lathe_screws", "gauges"]);
    const parts = queuedParts(g, sys(g).data.order);
    const loose = runQueue(g, parts, 0.5, 1000)!;
    expect(loose.parts.find((p) => p.id === "gauges")!.reject_rate).toBeGreaterThan(0); // needs 0.1, shop holds 0.5
    expect(loose.parts.find((p) => p.id === "rails")!.reject_rate).toBe(0);
    const tight = runQueue(g, parts, 0.1, 1000)!;
    expect(tight.wasted_hours).toBe(0);
    expect(tight.queue_days).toBeLessThan(loose.queue_days);
  });

  it("the heartbeat: shop hours are trained machinists at the lathes; too few and the balance goes negative", () => {
    const g = new Game(tree);
    setBook(g, [...SHOP_NODES, "rotative_engine_shafting"]);
    g.engine.unlockJob("turn_parts");
    g.engine.state.set("machinists_trained", 200);
    g.step();
    expect(g.engine.get("shop_hours_balance")).toBeLessThan(0); // trained, but nobody at the lathes
    g.engine.assign("turn_parts", 200);
    g.step();
    expect(g.engine.get("shop_hours_balance")).toBeGreaterThan(0);
    g.engine.assign("turn_parts", 900);
    g.step();
    expect(shopHours(g, null)).toBe(200 * 10); // only the 200 trained count
  });

  it("a late part slows the job waiting on it; moving it up the queue fixes that", () => {
    const g = new Game(tree);
    setBook(g, [...SHOP_NODES, "rotative_engine_shafting", "rails_wagonways", "newcomen_engine"]);
    for (const j of ["turn_parts", "tend_engine"]) g.engine.unlockJob(j);
    g.engine.state.set("machinists_trained", 64);
    g.engine.assign("turn_parts", 64);
    // 640 h/day: a year is ~234,000 h; rails (120,000) first, with the rest remade at hand tolerance,
    // pushes the engine parts past the year.
    sys(g).data.order = ["rails", "lathe_screws", "gauges", "engine_parts"];
    g.step();
    expect(g.engine.modifier("rate", "tend_engine")).toBeCloseTo(0.75, 9);
    expect(g.engine.get("parts_too_tight")).toBe(3); // engine parts, lathe screws and gauges are tighter than hand work (1.0 mm); rails aren't
    movePart(g, "engine_parts", -1);
    movePart(g, "engine_parts", -1);
    movePart(g, "engine_parts", -1);
    g.step();
    expect(g.engine.modifier("rate", "tend_engine")).toBe(1);
  });

  it("the screen shows the queue and its arrows reorder it", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = new Game(tree);
    setBook(g, [...SHOP_NODES, "rotative_engine_shafting", "rails_wagonways"]);
    g.engine.state.set("machinists_trained", 20);
    g.engine.unlockJob("turn_parts");
    g.engine.assign("turn_parts", 20);
    const unmount = mountShell(root, g, { autoStart: false });
    for (let d = 0; d < 8 && !root.querySelector(`button[data-open-ws="${SHOP}"]`); d++) {
      g.step();
      await frame();
    }
    (root.querySelector(`button[data-open-ws="${SHOP}"]`) as HTMLButtonElement).click();
    await frame();
    const view = root.querySelector(".wsview") as HTMLElement;
    expect(view.textContent).toContain(WS.shop.queue);
    const items = () => [...view.querySelectorAll(".wk-queue li")].map((li) => (li as HTMLElement).dataset.part);
    expect(items()[0]).toBe("engine_parts");
    (view.querySelector('button[data-act="down:engine_parts"]') as HTMLButtonElement).click();
    expect(items()[1]).toBe("engine_parts");
    unmount();
  });
});
