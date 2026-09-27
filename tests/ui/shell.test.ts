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

  it("± moves people; Resume and a day later a project card offers Start, which starts it", async () => {
    const { root, game } = mount();
    const plus = root.querySelector('[aria-label="+ Gather wood"]') as HTMLButtonElement;
    for (let i = 0; i < 10; i++) plus.click();
    await frame();
    expect(game.engine.manual("gather_wood")).toBe(1000);
    expect(root.querySelector(".idle b")!.textContent).toBe("9,000");
    (root.querySelector("button[data-resume]") as HTMLButtonElement).click();
    expect(game.clock.isPaused).toBe(false);
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

  it("the notebook screen and the pause button save the run", async () => {
    const { root, game, store } = mount();
    const nb = [...root.querySelectorAll("button")].find((b) => b.textContent === STRINGS.header.notebook)!;
    nb.click();
    await frame();
    expect(root.querySelector(".notebook")!.textContent).toContain(STRINGS.notebook.empty);
    const pause = [...root.querySelectorAll("button")].find((b) => b.textContent === STRINGS.header.pause)!;
    game.clock.resume();
    pause.click();
    expect(store.size).toBe(1);
  });
});
