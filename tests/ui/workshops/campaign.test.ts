// @vitest-environment happy-dom
// Package H through the game: the flaw table is well formed; a design with injector_quality 0 carries
// combustion instability and three instrumented static fires reveal it; launching with a known fatal
// flaw loses the pilot and costs two years; the same run gives the same launch; a clean vehicle lands.
import { describe, expect, it } from "vitest";
import { exprRefs, parseExpr, tree, type NodeBook } from "../../../src/content";
import type { JsonValue } from "../../../src/engine";
import { mountShell } from "../../../src/ui/shell";
import { Game } from "../../../src/ui/shellGame";
import { CAMPAIGN, flawTable, launch, launchBlocked, startFix, startTest, testSpecs, vehicleFacts, vehicleFlaws } from "../../../src/ui/workshops/campaign";
import { workshopSystem } from "../../../src/ui/workshops/kit";
import { adoptRocket, ROCKET } from "../../../src/ui/workshops/rocket";
import { WS } from "../../../src/ui/workshops/strings";

const frame = () => new Promise((r) => setTimeout(r, 30));
const setBook = (g: Game, completed: string[]) => ((g.projects as unknown as { bookValue: NodeBook }).bookValue = { completed, building: {}, revealed: [] });
type Data = { known: string[]; fixed: string[]; testsDone: Record<string, number>; rebuildUntil: number | null; history: { detail: string }[] };
const data = (g: Game) => workshopSystem<JsonValue>(g, CAMPAIGN)!.data as unknown as Data;
const days = (g: Game, k: number) => {
  for (let i = 0; i < k; i++) g.step();
};
const NODES = ["rocket_workshop", "stage_separation", "capsule", "lander_stage", "guidance_choice", "radio_command_guidance", "test_campaign"];

/** A Stage 6 colony with a big enough vehicle adopted in the rocket workshop. */
function colony(state: Record<string, JsonValue> = {}): Game {
  // (dv_margin_km_s comes from the adopted design.)
  const g = new Game(tree);
  setBook(g, NODES);
  for (const f of ["has_kerosene", "has_ethanol", "has_duralumin", "has_radar_altimeter"]) g.engine.state.set(f, true);
  g.engine.state.set("guidance_mode", "radio_command");
  for (const [k, v] of Object.entries(state)) g.engine.state.set(k, v as never);
  g.engine.addStock("lox_kg", 5e6);
  const r = workshopSystem<JsonValue>(g, ROCKET)!.data as unknown as { stages: Record<string, JsonValue>[] };
  // Aluminum kerosene turbopump stages with ~0.3 km/s over the 15.3 km/s budget.
  r.stages = [700, 150, 30, 8].map((m) => ({ propellant_mass: m, propellants: "kerosene_lox", tank_material: "aluminum", feed: "turbopump" }));
  adoptRocket(g);
  return g;
}

describe("the test campaign (package H)", () => {
  it("the flaw table is well formed: conditions parse over known names, tests exist, severities are known", () => {
    const tests = Object.keys(testSpecs(new Game(tree)));
    const facts = Object.keys(vehicleFacts([]));
    const rows = flawTable(new Game(tree));
    expect(rows.length).toBe(19);
    for (const f of rows) {
      for (const ref of exprRefs(parseExpr(f.when))) expect(ref in tree.stateVariables || facts.includes(ref), `${f.id}: ${ref}`).toBe(true);
      for (const t of f.revealedBy) expect(tests, f.id).toContain(t);
      expect(["fatal", "mission_loss", "survivable"]).toContain(f.severity);
      expect(["booster", "flight", "landing", "capsule"]).toContain(f.phase);
    }
  });

  it("injector_quality 0 always carries combustion instability; three instrumented static fires reveal it", () => {
    const g = colony({ injector_quality: 0, instrumentation_level: 1 });
    expect(vehicleFlaws(g).map((f) => f.id)).toContain("combustion_instability");
    for (let i = 0; i < 3; i++) {
      expect(data(g).known).not.toContain("combustion_instability");
      expect(startTest(g, "static_fire")).toBe(true);
      days(g, 60);
    }
    expect(data(g).known).toContain("combustion_instability");
    expect(data(g).testsDone.static_fire).toBe(3);
    expect(g.engine.get("known_flaws")).toContain("combustion_instability");
  });

  it("a good injector doesn't carry it", () => {
    expect(vehicleFlaws(colony({ injector_quality: 2 })).map((f) => f.id)).not.toContain("combustion_instability");
  });

  it("launching with a known fatal flaw loses the pilot and costs two years", () => {
    const g = colony({ injector_quality: 0 });
    data(g).known.push("combustion_instability");
    expect(launchBlocked(g)).toBeNull();
    const r = launch(g)!;
    expect(r.outcome).toBe("pilot_lost");
    expect(r.cause).toBe("combustion_instability");
    expect(g.engine.get("pilots_lost")).toBe(1);
    expect(data(g).rebuildUntil).toBe(g.engine.day + 730);
    expect(launchBlocked(g)).toContain("new pilot");
    days(g, 730);
    expect(launchBlocked(g)).toBeNull();
  });

  it("the same run gives the same launch", () => {
    const outcome = () => {
      const g = colony({ injector_quality: 1 });
      return launch(g);
    };
    expect(outcome()).toEqual(outcome());
  });

  it("with every flaw fixed the mission lands: the gate's flag and the score", () => {
    const g = colony({ injector_quality: 2 });
    const d = data(g);
    for (const f of vehicleFlaws(g)) {
      d.known.push(f.id);
      d.fixed.push(f.id);
    }
    expect(launch(g)!.outcome).toBe("landed");
    expect(g.engine.get("crewed_landing_survived")).toBe(true);
    expect(g.engine.get("landing_year")).toBe(0);
    expect(launchBlocked(g)).toContain("Landed");
  });

  it("a fix takes its months", () => {
    const g = colony({ injector_quality: 0 });
    data(g).known.push("combustion_instability");
    expect(startFix(g, "combustion_instability")).toBe(true);
    days(g, 9 * 30 - 1);
    expect(data(g).fixed).not.toContain("combustion_instability");
    days(g, 1);
    expect(data(g).fixed).toContain("combustion_instability");
  });

  it("the screen: a test button, the known flaws with a fix button, and the launch section", async () => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const g = colony({ injector_quality: 0, instrumentation_level: 2 });
    const unmount = mountShell(root, g, { autoStart: false });
    for (let d = 0; d < 8 && !root.querySelector(`button[data-open-ws="${CAMPAIGN}"]`); d++) {
      g.step();
      await frame();
    }
    (root.querySelector(`button[data-open-ws="${CAMPAIGN}"]`) as HTMLButtonElement).click();
    await frame();
    const view = root.querySelector(".wsview") as HTMLElement;
    expect(view.textContent).toContain(WS.campaign.launch);
    (view.querySelector('button[data-act="test:static_fire"]') as HTMLButtonElement).click();
    days(g, 60);
    await frame();
    expect(view.querySelector('button[data-act="fix:combustion_instability"]')).not.toBeNull();
    unmount();
  });
});
