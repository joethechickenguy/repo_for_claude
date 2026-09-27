// Headless playtests (packages G1-G6, J): the middling bot (tests/play/bot.ts) plays the campaign on
// its main options, then each stage again from the same start with its other options, and writes one
// note per stage to docs/playtests/ in the format docs/playtests/README.md asks for.
//
//   npx vite-node scripts/playtest.ts [YYYY-MM-DD] [label]
//
// Minutes are at 1x (one in-game day per second) and don't count the time slowdowns spend at 0.5x.
import { writeFileSync } from "node:fs";
import { tree } from "../src/content";
import type { SaveGame } from "../src/engine";
import { playRun, type StagePlan, type StageReport } from "../tests/play/bot";
import { STAGE1, STAGE2, STAGE3, STAGE4, STAGE5, STAGE6 } from "../tests/play/plans";

const PLANS: Record<number, StagePlan> = { 1: STAGE1, 2: STAGE2, 3: STAGE3, 4: STAGE4, 5: STAGE5, 6: STAGE6 };
const VARIANTS: Record<number, string[][]> = {
  1: [["ground_stone_axes", "timber_sledges", "ore_roasting", "wind_furnaces"]],
  2: [["bog_iron", "near_seam", "shallow_pits", "plate_rolling"]],
  3: [["canals", "water_turbine"]],
  4: [["claude_expander", "heat_resistant_steel"]],
  5: [["hydrogen_peroxide", "solid_motors", "human_computers"]],
  6: [["inertial_guidance"]],
};
const YEAR = 365;
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
/** Optional suffix for the file names, e.g. a tuning pass ("j1"). */
const label = process.argv[3] ? `-${process.argv[3]}` : "";

const min = (d: number | null): string => (d === null ? "not reached" : `${Math.round(d / 60)} min`);
const yrs = (d: number | null): string => (d === null ? "-" : (d / YEAR).toFixed(1));

function row(label: string, s: StageReport): string {
  return `| ${label} | ${yrs(s.gateDay)} | ${min(s.gateDay)} | ${s.decisions.length} | ${s.longestDecisionGapDays} | ${s.longestLullDays} | ${s.slowdowns} | ${s.maxControlsPerSlowdown} | ${Math.round(s.energyAtGate)} |`;
}

function note(stage: number, main: StageReport, variants: { picks: string[]; s: StageReport }[]): string {
  const st = tree.stages.find((x) => x.stage === stage)!;
  const picks = PLANS[stage]!.picks;
  let md = `# ${date}, Stage ${stage} (${st.name}), headless bot${label ? ` (${label.slice(1)})` : ""}\n\n`;
  md += `Played by the middling bot in \`tests/play/bot.ts\` through the shell's own controller (\`scripts/playtest.ts\`): people per job in blocks, the rest building, every affordable project started (optional ones only while fewer than two builds are underway), producers staffed when a project waits on a resource, and the workshops run by simple habits (\`tests/play/workshops.ts\`). Default draft. Minutes are at 1x without the 0.5x slowdowns. A bot is not a person: it never misreads a card, and it never plays well.\n\n`;
  md += `| Run | Years to gate | Minutes at 1x | Decisions | Longest gap without one (days) | Longest lull without a slowdown (days) | Slowdowns | Most new controls in one slowdown | Energy at gate (W) |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  md += row(`Main: ${picks.join(", ") || "no choices"}`, main) + "\n";
  for (const v of variants) md += row(v.picks.join(", "), v.s) + "\n";
  md += `\n## Main run\n\n`;
  md += `- **Minutes to gate at a middling strategy:** ${min(main.gateDay)} at 1x (${yrs(main.gateDay)} in-game years).\n`;
  md += `- **Substantive decisions taken:** ${main.decisions.length} (nodes with a trade-off line${PLANS[stage]!.decisionWorkshops ? ", plus test results" : ""}): ${main.decisions.map((d) => `${d.id} (day ${d.day})`).join(", ") || "none"}.\n`;
  md += `- **Longest lull:** ${main.longestLullDays} days without any slowdown; ${main.longestDecisionGapDays} days without a new decision.\n`;
  md += `- **Nodes that appeared without a visible reason:** ${main.unexplained.length ? main.unexplained.join(", ") + " (nothing finished, no red bar, milestone or workshop result in the 3 days before)" : "none"}.\n`;
  md += `- **Moments with more than two new controls:** ${main.maxControlsPerSlowdown > 2 ? "yes" : "none"} (most in one slowdown: ${main.maxControlsPerSlowdown}).\n`;
  md += `- **Dead-end days:** ${main.deadEndDays}.\n`;
  md += `- **What kept slowing the game** (more than 3 times): ${Object.entries(main.slowdownKinds).filter(([, k]) => k > 3).map(([x, k]) => `${x} x${k}`).join(", ") || "nothing"}.\n`;
  md += `- **Order of completion:** ${main.completed.map((c) => `${c.id} (${c.day})`).join(", ")}.\n`;
  for (const v of variants) {
    md += `\n## ${v.picks.join(", ")}\n\n`;
    md += `- Gate in ${yrs(v.s.gateDay)} years; ${v.s.decisions.length} decisions, longest gap ${v.s.longestDecisionGapDays} days; dead-end days ${v.s.deadEndDays}.\n`;
    md += `- Decisions: ${v.s.decisions.map((d) => `${d.id} (${d.day})`).join(", ")}.\n`;
  }
  return md;
}

let from: SaveGame | undefined;
const mains: Record<number, StageReport> = {};
const starts: Record<number, SaveGame | undefined> = { 1: undefined };
for (let stage = 1; stage <= 6; stage++) {
  const r = playRun(PLANS, stage, 20 * YEAR, from);
  mains[stage] = r.stages.find((x) => x.stage === stage)!;
  from = r.game.engine.save();
  starts[stage + 1] = from;
  process.stdout.write(`stage ${stage}: gate ${mains[stage]!.gateDay}\n`);
}
for (let stage = 1; stage <= 6; stage++) {
  const variants = (VARIANTS[stage] ?? []).map((picks) => {
    const r = playRun({ ...PLANS, [stage]: { ...PLANS[stage]!, picks } }, stage, 20 * YEAR, starts[stage]);
    return { picks, s: r.stages.find((x) => x.stage === stage)! };
  });
  const file = `docs/playtests/${date}-stage${stage}-bot${label}.md`;
  writeFileSync(file, note(stage, mains[stage]!, variants));
  process.stdout.write(`wrote ${file}\n`);
}
