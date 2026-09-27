// @vitest-environment happy-dom
// The mounted shell: panels draw the controller's views and clicks reach its actions.
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import { mountShell } from "../../src/ui/shell";
import { Game } from "../../src/ui/shellGame";
import { STRINGS } from "../../src/ui/strings";

const frame = () => new Promise((r) => setTimeout(r, 40));

function mount() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const game = new Game(tree);
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const unmount = mountShell(root, game, { storage, autoStart: false });
  return { root, game, store, unmount };
}

describe("shell", () => {
  it("draws the header, meter, opening banner with two intro cards, and the people rows", () => {
    const { root } = mount();
    expect(root.querySelector("h1")!.textContent).toBe(STRINGS.title);
    expect(root.textContent).toContain(tree.stages[0]!.name);
    expect(root.querySelectorAll(".slide .gate").length).toBe(tree.stages.filter((s) => s.gate.condition.some((c) => c.text.startsWith("energy_w_per_person"))).length);
    expect([...root.querySelectorAll(".card-intro h3")].map((e) => e.textContent)).toEqual(["Gather wood", "Knap flint"]);
    expect([...root.querySelectorAll(".ptree-name")].map((e) => e.textContent)).toEqual(["Gather wood", "Knap flint"]);
    expect(root.querySelector(".log p")!.textContent).toContain(tree.stages[0]!.openingProblem);
  });

  it("± moves people; the banner clears on Got it; a day later a project card offers Start", async () => {
    const { root, game } = mount();
    const plus = root.querySelector('[aria-label="+ Gather wood"]') as HTMLButtonElement;
    for (let i = 0; i < 10; i++) plus.click();
    await frame();
    expect(game.engine.manual("gather_wood")).toBe(1000);
    expect(root.querySelector(".idle b")!.textContent).toBe("9,000");
    (root.querySelector("button[data-resume]") as HTMLButtonElement).click();
    await frame();
    expect(game.decision).toEqual([]);
    expect(root.querySelector(".banner")).toBeNull();
    game.step(); // a day passes (the clock's scheduler is off in this test)
    game.step();
    await frame();
    const start = root.querySelector('button[data-start="digging_sticks"]') as HTMLButtonElement;
    expect(start).toBeTruthy();
    expect(start.disabled).toBe(false);
    start.click();
    await frame();
    expect(game.projects.status("digging_sticks")).toBe("building");
    expect(root.querySelector(".proj.active h3")!.textContent).toBe(tree.nodes.digging_sticks!.name);
    expect(root.querySelector(".pbar .n")!.textContent).toBe("Tools");
  });

  it("the notebook screen; the speed buttons are 0.5x, 1x and 2x, and choosing one saves", async () => {
    const { root, game, store } = mount();
    const nb = [...root.querySelectorAll("button")].find((b) => b.textContent === STRINGS.header.notebook)!;
    nb.click();
    await frame();
    expect(root.querySelector(".notebook")!.textContent).toContain(STRINGS.notebook.empty);
    const speeds = [...root.querySelectorAll<HTMLButtonElement>("button[data-speed]")];
    expect(speeds.map((b) => b.textContent)).toEqual(["0.5×", "1×", "2×"]);
    expect([...root.querySelectorAll("button")].some((b) => b.textContent === "Pause")).toBe(false);
    speeds[2]!.click();
    expect(game.clock.speed).toBe(2);
    expect(store.size).toBe(1);
  });

  it("a decision drops to 0.5x and shows the banner; its button returns to the player's speed", async () => {
    const { root, game } = mount();
    (root.querySelector("button[data-speed='2']") as HTMLButtonElement).click();
    expect(game.decision).toEqual([]);
    root.querySelector<HTMLButtonElement>('[aria-label="+ Gather wood"]')!.click();
    for (let d = 0; d < 400 && game.decision.length === 0; d++) game.step();
    expect(game.decision.length).toBeGreaterThan(0);
    expect(game.clock.speed).toBe(0.5);
    await frame();
    const back = root.querySelector("button[data-resume]") as HTMLButtonElement;
    expect(back.textContent).toBe("Back to 2×");
    back.click();
    await frame();
    expect(game.clock.speed).toBe(2);
    expect(root.querySelector(".banner")).toBeNull();
  });

  it("typing a number on a job row assigns exactly that many, never more than are idle", async () => {
    const { root, game } = mount();
    const value = root.querySelector(".ptree-value") as HTMLElement;
    value.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = root.querySelector("input.ptree-input") as HTMLInputElement;
    input.value = "1,234";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(game.engine.manual("gather_wood")).toBe(1234);
    const knap = root.querySelectorAll(".ptree-value")[1] as HTMLElement;
    knap.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const i2 = root.querySelector("input.ptree-input") as HTMLInputElement;
    i2.value = "20000";
    i2.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(game.engine.manual("knap_flint")).toBe(10000 - 1234);
  });

  it("an exclusive choice shows as one 'Choose one' box; taking an option closes the other", async () => {
    const { root, game } = mount();
    game.adjust(["gather_wood"], 1000);
    game.adjust(["knap_flint"], 100); // 300 blades a day for 1,000 tool users: tools run short
    for (let d = 0; d < 30 && !root.querySelector(".choice"); d++) {
      game.step();
      await frame();
    }
    const box = root.querySelector(".choice") as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.querySelector("h3")!.textContent).toBe(tree.choices!.first_tool_fix!.prompt);
    const opts = [...box.querySelectorAll(".proj.option")];
    expect(opts.map((o) => o.querySelector("h3")!.textContent)).toEqual([tree.nodes.ground_stone_axes!.name, tree.nodes.hafted_blades!.name]);
    expect(opts[1]!.querySelector(".tradeoff")!.textContent).toBe(tree.nodes.hafted_blades!.tradeoff);
    const choose = box.querySelector('button[data-start="hafted_blades"]') as HTMLButtonElement;
    expect(choose.textContent).toBe(STRINGS.projects.choose);
    for (let d = 0; d < 200 && choose.disabled; d++) {
      game.step();
      await frame();
    }
    choose.click();
    await frame();
    expect(game.projects.status("ground_stone_axes")).toBe("closed");
    expect(root.querySelector(".choice")).toBeNull();
    expect(root.querySelector('button[data-start="ground_stone_axes"]')).toBeNull();
    const taken = [...root.querySelectorAll(".proj")].find((p) => p.querySelector("h3")!.textContent === tree.nodes.hafted_blades!.name)!;
    expect(taken.querySelector(".tradeoff")!.textContent).toContain(`Chosen over ${tree.nodes.ground_stone_axes!.name}.`);
  });
});

