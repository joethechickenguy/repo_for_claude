// G1-G6: each stage's gate banner and its nodes' log lines reach the log and the slowdown banner.
import { describe, expect, it } from "vitest";
import { tree } from "../../src/content";
import { Game } from "../../src/ui/shellGame";
import { GATE_PAUSE } from "../../src/ui/shellSystems";

describe("stage text", () => {
  it("every stage has a gate banner, and every stage has log lines for its key nodes", () => {
    for (const s of tree.stages) {
      expect(s.gate.banner, `stage ${s.stage}`).toBeTruthy();
      expect(Object.values(tree.nodes).some((n) => n.stage === s.stage && n.log), `stage ${s.stage}`).toBe(true);
    }
  });

  it("a finished node's log line and a gate's banner show in the log and the banner line", () => {
    const g = new Game(tree);
    g.log.add({ day: 10, kind: "node_complete", subject: "bessemer_converter" });
    g.log.add({ day: 20, kind: GATE_PAUSE, subject: "3" });
    const lines = g.logLines().map((l) => l.text);
    expect(lines.some((t) => t.includes(tree.nodes.bessemer_converter!.log!))).toBe(true);
    expect(lines.some((t) => t.includes(tree.stages.find((s) => s.stage === 3)!.gate.banner!))).toBe(true);
    expect(g.pauseView([{ kind: GATE_PAUSE, subject: "3" }]).line).toContain(tree.stages.find((s) => s.stage === 3)!.gate.banner!);
  });
});
