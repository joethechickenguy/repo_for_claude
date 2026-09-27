import "./workshops";
// A middling player for headless playtests (packages G1-G6, J). It plays the real game through the
// shell's own controller: people per job in ± blocks, the rest on Build, projects started as they
// become affordable (taking the options it was given at every exclusive choice), and each stage's
// workshops run by a small script. It records what a playtest note needs: days to each gate,
// decisions met (nodes with a trade-off line), slowdowns and how many new controls each brought, the
// longest stretch with no slowdown, and nodes that appeared with nothing visible to explain them.
import { tree } from "../../src/content";
import type { PauseReason, SaveGame } from "../../src/engine";
import { INTRO_PAUSE, introControls } from "../../src/ui/pressures";
import { Game, PEOPLE_BLOCK } from "../../src/ui/shellGame";

export interface StagePlan {
  /** People per job (rows that don't exist yet are skipped; the rest of the idle go to Build). */
  people: [string, number][];
  /** People kept idle to train, and the trade they learn. */
  train?: { trade: string; people: number };
  /** Options to take at this stage's exclusive choices (others closed). */
  picks: string[];
  /** Build only these (besides picks and the gate); omit to build every non-trap node of the stage. */
  only?: string[];
  /** Never build these. */
  skip?: string[];
  /** Run once a day before the tick: workshops, dials. */
  daily?(game: Game, day: number): void;
}

export interface Slowdown {
  day: number;
  kinds: string[];
  /** New controls introduced by this slowdown. */
  controls: number;
}

export interface StageReport {
  stage: number;
  startDay: number;
  gateDay: number | null;
  /** Days from the stage's start at which each decision (trade-off node) first appeared. */
  decisions: { id: string; day: number }[];
  /** Longest run of days with no slowdown at all. */
  longestLullDays: number;
  /** Longest run of days with no new decision (from the start, between decisions, to the gate). */
  longestDecisionGapDays: number;
  maxControlsPerSlowdown: number;
  slowdowns: number;
  /** Nodes revealed on a day with nothing finished, no red bar, milestone or workshop result nearby. */
  unexplained: string[];
  deadEndDays: number;
  energyAtGate: number;
}

export interface RunReport {
  stages: StageReport[];
  game: Game;
  days: number;
}

/** Days of context that count as "a visible reason" for a node appearing. */
const REASON_WINDOW_DAYS = 3;
const REASON_KINDS = new Set(["node_complete", "pressure_red", "milestone", "workshop_done", "gate", "workshop_open"]);

export function setRow(game: Game, job: string, target: number): void {
  for (let g = 0; g < 600; g++) {
    const row = game.peopleRows().find((r) => r.id === job);
    if (!row) return;
    const d = target - row.value;
    if (Math.abs(d) < PEOPLE_BLOCK) return void (d && game.adjust([job], d));
    if (d > 0 && row.canInc === false) return;
    game.adjust([job], Math.sign(d) * PEOPLE_BLOCK);
  }
}

/** Play from a new run until `untilStage`'s gate (or `maxDays`). */
export function playRun(plans: Record<number, StagePlan>, untilStage: number, maxDays = 60 * 365, from?: SaveGame): RunReport {
  const game = new Game(tree, from ? { save: from } : {});
  const reports: StageReport[] = [];
  let rep: StageReport | null = null;
  let layout = "";
  let day = game.engine.day;
  let lastSlow = day;
  // A resumed run starts right after a gate: that is the reason for the first reveals.
  const recentReasons: { day: number; kind: string }[] = from ? [{ day, kind: "gate" }] : [];
  const seenDecision = new Set<string>();

  const open = (stage: number): StageReport => ({
    stage,
    startDay: day,
    gateDay: null,
    decisions: [],
    longestLullDays: 0,
    longestDecisionGapDays: 0,
    maxControlsPerSlowdown: 0,
    slowdowns: 0,
    unexplained: [],
    deadEndDays: 0,
    energyAtGate: 0,
  });
  const close = (r: StageReport, end: number): void => {
    r.longestLullDays = Math.max(r.longestLullDays, end - lastSlow);
    const ds = [0, ...r.decisions.map((d) => d.day).sort((a, b) => a - b), end - r.startDay];
    r.longestDecisionGapDays = Math.max(0, ...ds.slice(1).map((d, i) => d - ds[i]!));
  };

  const end = day + maxDays;
  while (day < end) {
    const stage = game.stage;
    if (!rep || rep.stage !== stage) {
      if (rep) close(rep, day);
      rep = open(stage);
      reports.push(rep);
      lastSlow = day;
    }
    if (game.gateReached(untilStage)) break;
    const plan = plans[stage] ?? plans[Math.max(...Object.keys(plans).map(Number).filter((s) => s <= stage))]!;

    // People: re-lay the plan when rows change, then everyone idle (beyond trainees) builds.
    const key = `${stage}|${game.peopleRows().map((r) => r.id).join(",")}`;
    if (key !== layout) {
      layout = key;
      setRow(game, "build", 0);
      for (const [j] of plan.people) setRow(game, j, 0);
      for (const [j, n] of plan.people) setRow(game, j, n);
      if (plan.train) game.setTrainingTrade(plan.train.trade);
    }
    const keep = plan.train?.people ?? 0;
    const build = game.peopleRows().find((r) => r.id === "build")?.value ?? 0;
    setRow(game, "build", Math.max(0, build + game.idle() - keep));

    // Projects.
    for (const c of game.projectCards()) {
      const n = tree.nodes[c.id]!;
      if (n.stage === stage && n.tradeoff && !seenDecision.has(c.id)) {
        seenDecision.add(c.id);
        rep.decisions.push({ id: c.id, day: day - rep.startDay });
      }
      const p = plans[n.stage] ?? plan;
      const want = n.choice
        ? p.picks.includes(c.id)
        : !(p.skip ?? []).includes(c.id) && !n.tags.includes("trap") && (!p.only || p.only.includes(c.id) || n.kind === "gate");
      if (want && c.status === "available" && c.affordable) game.startProject(c.id);
    }
    plan.daily?.(game, day);

    const r = game.step();
    day++;
    // Slowdowns and their new controls.
    const reasons: PauseReason[] = r.pauseReasons;
    for (const x of reasons) recentReasons.push({ day, kind: x.kind });
    while (recentReasons.length && recentReasons[0]!.day < day - REASON_WINDOW_DAYS) recentReasons.shift();
    if (reasons.length) {
      const controls = reasons.filter((x) => x.kind === INTRO_PAUSE).reduce((s, x) => s + introControls(x.subject).length, 0);
      rep.slowdowns++;
      rep.maxControlsPerSlowdown = Math.max(rep.maxControlsPerSlowdown, controls);
      rep.longestLullDays = Math.max(rep.longestLullDays, day - lastSlow);
      lastSlow = day;
      for (const x of reasons)
        if (x.kind === "node_revealed" && !recentReasons.some((y) => REASON_KINDS.has(y.kind))) rep.unexplained.push(x.subject ?? "");
    }
    if (game.stuck()?.deadEnd) rep.deadEndDays++;
    if (rep.gateDay === null && game.gateReached(rep.stage)) {
      rep.gateDay = day - rep.startDay;
      rep.energyAtGate = game.energy();
    }
    // Clear the banner as a player would.
    game.dismissDecision();
  }
  if (rep) close(rep, day);
  return { stages: reports, game, days: day };
}

/** One line per stage, for logs and playtest notes. */
export function summarize(r: RunReport): string {
  return r.stages
    .map(
      (s) =>
        `stage ${s.stage}: gate ${s.gateDay ?? "not reached"} days (${s.gateDay === null ? "-" : (s.gateDay / 60).toFixed(0)} min at 1x), ` +
        `${s.decisions.length} decisions, longest gap ${s.longestDecisionGapDays} d, longest lull ${s.longestLullDays} d, ` +
        `${s.slowdowns} slowdowns, max ${s.maxControlsPerSlowdown} new controls, unexplained [${s.unexplained.join(", ")}], ` +
        `dead-end days ${s.deadEndDays}, energy at gate ${Math.round(s.energyAtGate)} W`,
    )
    .join("\n");
}
