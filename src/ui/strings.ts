// The UI's small strings file (docs/work-packages.md, Conventions: "Everything the player reads comes
// from the YAML or a small strings file"). Words that belong to the frame, not to any stage: button
// labels, panel headings, pause reasons, units. Stage text (node names, problems, notebook entries,
// pressure names, job names and lines, the opening problem) comes from tech-tree/ via src/content.
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
  goal: {
    line: "{name}: {unmet}.",
    now: "{text} (now {n})",
    route: "{name}: finish one route: {list}.",
    routeJoiner: " or ",
    reached: "Gate reached: {name}.",
    joiner: ", ",
  },
  stores: {
    heading: "Stores",
    perDay: "{sign}{n}/day",
    plus: "+",
    minus: "−",
    demand: "needs {n}/day",
    claimed: "{n} waiting for projects",
    empty: "Nothing in store yet.",
  },
  tools: {
    line: "{tools} tools for {users} people who need them.",
    bare: "{n} working bare-handed.",
  },
  people: {
    heading: "People",
    idle: "Idle",
    training: "Idle people train as",
    trainingNone: "nothing in particular",
    short: "short of {what}",
    pullCapped: "stopped: nobody needs more",
    target: "target {n}/day",
    pull: "fills demand",
    shortfall: "{n} short",
    priority: "priority {n}",
  },
  projects: {
    heading: "Projects",
    nothing: "Nothing to build yet. Keep working; new problems will surface.",
    materials: "Materials: {list}.",
    labor: "Labor: {n} person-days.",
    effect: "Effect: {list}.",
    start: "Start building",
    progress: "{done} of {total} person-days",
    noBuilders: "Nobody is assigned to build.",
    why: "Why this works",
    missing: "Short of {list}.",
    suggested: "Answers a red bar",
    milestone: "At {pct}%: {text}",
    workshopsHeading: "Workshops",
  },
  pressures: {
    heading: "Pressures",
    red: "Red: {effect}",
    answers: "Answers: {list}",
  },
  log: {
    heading: "Log",
    stamp: "Year {year}, day {day}.",
    started: "Started: {name}.",
    node_complete: "Finished: {name}.",
    node_revealed: "A new problem needs solving: {name}.",
    milestone: "Milestone: {name}.",
    pressure_red: "{name} is red.",
    workshop_open: "Workshop open: {name}.",
    gate: "Stage {n} complete.",
  },
  pause: {
    node_revealed: "New problem: {name}",
    node_complete: "Finished: {name}",
    milestone: "Milestone: {name}",
    pressure_red: "{name} is red",
    workshop_open: "Workshop open: {name}",
    gate: "Stage {n} gate reached",
    join: " · ",
    resume: "Resume",
    paused: "Paused",
    newHere: "New",
  },
  notebook: {
    heading: "Notebook",
    empty: "Entries fill in as projects are completed.",
    stage: "Stage {n}, {name}",
  },
  gate: {
    banner: "Stage {n} complete: {name}",
    time: "Time: year {year}, day {day}.",
  },
  draft: {
    hook: "The draft screen isn't on this build yet. Departing with the default draft.",
    depart: "Depart",
  },
} as const;

/** Fill `{key}` placeholders. Unknown keys are left as they are. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
