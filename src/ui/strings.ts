// The UI's small strings file (docs/work-packages.md, Conventions: "Everything the player reads comes
// from the YAML or a small strings file"). Words that belong to the frame, not to any stage: button
// labels, panel headings, pause reasons, units. Stage text (node names, problems, why, pressure names,
// log lines, notebook entries) comes from tech-tree/ through src/content.
//
// `{name}` placeholders are filled by `fill()`.

export const STRINGS = {
  title: "Bootstrap",
  tree: {
    inc: "+",
    dec: "−",
    expand: "▸",
    collapse: "▾",
    pin: "pin",
    unpin: "pinned",
  },
  header: {
    stage: "Stage {n}, {name}",
    date: "Year {year}, day {day}",
    speed: "Speed",
    pause: "Pause",
    play: "Run",
    speedX: "{n}×",
    energyUnit: "watts per person",
    notebook: "Notebook",
    back: "Back to the colony",
    theme: "Light / dark",
    reset: "New run",
    resetConfirm: "Start a new run? This one is erased.",
  },
  meter: {
    you: "You",
    w: "{n} W",
    kw: "{n} kW",
  },
  stores: {
    heading: "Stores",
    perDay: "{sign}{n}/day",
    demand: "needs {n}/day",
    claimed: "{n} waiting",
    empty: "Nothing in store yet.",
  },
  people: {
    heading: "People",
    idle: "Idle",
    idleNote: "Idle people train",
    training: "Training as",
    trainingNone: "nobody in particular",
    short: "short of {what}",
    pullCapped: "stopped: nobody needs more",
    target: "target {n}/day",
    crew: "crew {n}",
    shortfall: "{n} short",
    job: "job",
  },
  projects: {
    heading: "Projects",
    nothing: "Nothing to build yet. Keep working; new problems will surface.",
    materials: "Materials: {list}.",
    labor: "Labor: {n} person-days.",
    start: "Start building",
    building: "Building",
    progress: "{done} of {total} person-days",
    noBuilders: "Nobody is assigned to build.",
    why: "Why this works",
    missing: "Short of {list}.",
    suggested: "Answers a red bar",
    milestone: "At {pct}%: {name}",
    completeHeading: "Built",
    gate: "Stage {n} gate",
    gateReached: "Gate reached.",
    choice: "Choose one",
    locked: "Needs",
    queue: "Queue",
    queued: "Queued",
    unqueue: "Unqueue",
  },
  pressures: {
    heading: "Pressures",
    red: "red",
    heartbeat: "heartbeat",
    answers: "Answers",
  },
  log: {
    heading: "Log",
    stamp: "Year {year}, day {day}.",
    started: "Started: {name}.",
    finished: "Finished: {name}.",
    newJob: "New job: {name}.",
    revealed: "A new problem needs solving: {name}.",
    milestone: "Milestone: {name}.",
    red: "{name} is red.",
    workshop: "Workshop open: {name}.",
    gate: "Stage {n} complete.",
    depart: "Departed.",
  },
  pause: {
    node_revealed: "New problem: {name}",
    node_complete: "Finished: {name}",
    milestone: "Milestone: {name}",
    pressure_red: "{name} is red",
    workshop_open: "Workshop open: {name}",
    gate: "Stage gate reached",
    intro: "New here",
    resume: "Resume",
    dismiss: "Close",
  },
  notebook: {
    heading: "Notebook",
    empty: "Entries fill in as projects are completed.",
    stage: "Stage {n}",
  },
  intro: {
    what: "What it is",
    why: "Why",
  },
  gate: {
    banner: "Stage {n} complete: {name}",
    time: "Time: year {year}, day {day}.",
    continue: "Continue",
  },
  draft: {
    missing: "The draft screen isn't built yet. Departing with the default draft.",
    depart: "Depart",
  },
} as const;

/** Fill `{key}` placeholders. Unknown keys are left as they are. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
