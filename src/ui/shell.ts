// The shell (package D): the frame every stage uses. Header (stage, date, speed, energy), the
// slide-rule meter, the pressure strip, stores, the recursive people panel, projects, workshops, the
// log, the notebook screen, and the decision banner with introduction cards (the game never
// stops; a decision drops it to 0.5x). It draws what
// ShellGame's views return and sends clicks to its actions; nothing here decides game rules.
import type { SaveStorage } from "../engine";
import { CLOCK_SPEEDS, type ClockSpeed } from "../engine";
import { PeopleTree } from "./controls/peopleTree";
import type { Game, ProjectCard, TechMap } from "./shellGame";
import { fmt, fmtRound, fmtSmart, yearDay } from "./shellFormat";
import { fill, STRINGS } from "./strings";

/** In-game days between autosaves while running. */
const AUTOSAVE_DAYS = 30;

/** A workshop screen (packages E1..E6) registers here; the shell mounts it under its entry. */
export type WorkshopMount = (el: HTMLElement, game: Game) => void | (() => void);
const workshopMounts = new Map<string, WorkshopMount>();
export function registerWorkshop(id: string, mount: WorkshopMount): void {
  workshopMounts.set(id, mount);
}

export interface ShellOptions {
  storage?: SaveStorage | null;
  /** Start a new run (the header's New run button). */
  onNewRun?: () => void;
  /** Scheduler override (tests). */
  autoStart?: boolean;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function setHTML(e: HTMLElement, html: string): void {
  if (e.innerHTML !== html) e.innerHTML = html;
}

/** Mount the shell for a run. Returns a function that unmounts it. */
export function mountShell(root: HTMLElement, game: Game, opts: ShellOptions = {}): () => void {
  const S = STRINGS;
  root.replaceChildren();
  const wrap = el("div", "wrap");
  root.appendChild(wrap);

  // ---- Header ----
  const top = el("div", "top");
  const h1 = el("h1", "", esc(S.title));
  const stageEl = el("div");
  const dateEl = el("div", "num");
  const speed = el("div", "speed");
  speed.appendChild(el("span", "muted", esc(S.header.speed)));
  const speedBtns = CLOCK_SPEEDS.map((n) => {
    const b = el("button", "", esc(fill(S.header.speedX, { n })));
    b.type = "button";
    b.dataset.speed = String(n);
    speed.appendChild(b);
    return b;
  });
  const nbBtn = el("button", "", esc(S.header.notebook));
  nbBtn.type = "button";
  const mapBtn = el("button", "", esc(S.header.map));
  mapBtn.type = "button";
  const themeBtn = el("button", "", esc(S.header.theme));
  themeBtn.type = "button";
  const newBtn = el("button", "", esc(S.header.reset));
  newBtn.type = "button";
  speed.append(mapBtn, nbBtn, themeBtn, newBtn);
  top.append(h1, stageEl, dateEl, speed);

  const energy = el("div", "energy num");
  const goal = el("div", "goal");
  const ruleWrap = el("div", "rulewrap");
  const slide = el("div", "slide");
  ruleWrap.appendChild(slide);
  const banner = el("div");
  const strip = el("div", "pressures");
  strip.setAttribute("aria-label", S.pressures.heading);

  // ---- Columns ----
  const cols = el("div", "cols");
  const c1 = el("div");
  const c2 = el("div");
  const c3 = el("div");
  cols.append(c1, c2, c3);
  c1.appendChild(el("h2", "", esc(S.stores.heading)));
  const res = el("div", "res");
  c1.appendChild(res);
  const earlierBox = el("div", "earlier");
  c1.appendChild(earlierBox);
  const toolsBox = el("div");
  c1.append(el("hr"), toolsBox);

  c2.appendChild(el("h2", "", esc(S.people.heading)));
  const idleBox = el("div", "idle");
  const idleNum = el("b", "num");
  const idleLabel = el("span", "", `${esc(S.people.idle)}: `);
  idleLabel.appendChild(idleNum);
  const trainLabel = el("label", "muted");
  trainLabel.textContent = `${S.people.training} `;
  const trainSel = el("select");
  trainLabel.appendChild(trainSel);
  idleBox.append(idleLabel, trainLabel);
  c2.appendChild(idleBox);
  const trainInfo = el("div", "train-info small muted");
  c2.appendChild(trainInfo);
  const treeHost = el("div");
  c2.appendChild(treeHost);
  const tree = new PeopleTree(
    treeHost,
    {
      onAdjust: (path, d) => {
        game.adjust(path, d);
        dirty();
      },
      onPin: (path, p) => {
        game.setPinned(path, p);
        dirty();
      },
      onSet: (path, v) => {
        game.setValue(path, v);
        dirty();
      },
    },
    { format: fmt },
  );

  c3.appendChild(el("h2", "", esc(S.projects.heading)));
  const stuckBox = el("div", "stuck");
  stuckBox.setAttribute("role", "status");
  c3.appendChild(stuckBox);
  const projBox = el("div");
  c3.appendChild(projBox);
  const wsBox = el("div");
  c3.appendChild(wsBox);
  c3.appendChild(el("h2", "", esc(S.log.heading))).style.marginTop = "16px";
  const logBox = el("div", "log");
  c3.appendChild(logBox);

  const nbView = el("div", "notebook");
  nbView.hidden = true;
  const mapView = el("div", "tmap");
  mapView.hidden = true;
  // A workshop's own screen (packages E1-E6), full width like the notebook and the map.
  const wsView = el("div", "wsview");
  wsView.hidden = true;

  wrap.append(top, energy, goal, ruleWrap, banner, strip, cols, nbView, mapView, wsView);

  // ---- Meter (static ticks, moving cursor) ----
  const m0 = game.meter();
  const xs = (v: number) => ((Math.log10(v) - Math.log10(m0.min)) / (Math.log10(m0.max) - Math.log10(m0.min))) * 100;
  {
    let h = "";
    for (let d = m0.min; d <= m0.max; d *= 10)
      for (let k = 1; k < 10; k++) {
        const v = d * k;
        if (v > m0.max) break;
        h += `<div class="tick ${k === 1 ? "maj" : "min"}" style="left:${xs(v)}%"></div>`;
        if (k === 1) {
          const lab = v >= 1000 ? fill(S.meter.kw, { n: v / 1000 }) : fill(S.meter.w, { n: v });
          const edge = v === m0.min ? " first" : v === m0.max ? " last" : "";
          h += `<div class="tlab${edge}" style="left:${xs(v)}%">${esc(lab)}</div>`;
        }
      }
    m0.gates.forEach((g, i) => {
      h += `<div class="gate row${i % 3}${xs(g.watts) > 60 ? " flip" : ""}" style="left:${xs(g.watts)}%"><span>${esc(g.name)}</span></div>`;
    });
    h += `<div class="cursor"><span>${esc(S.meter.you)}</span></div>`;
    slide.innerHTML = h;
  }
  const cursor = slide.querySelector(".cursor") as HTMLElement;

  // ---- Events ----
  let lastSaveDay = game.engine.day;
  const save = () => {
    if (!opts.storage) return;
    try {
      game.save(opts.storage);
    } catch {
      /* storage full or blocked: the run continues unsaved */
    }
  };
  // Choosing a speed is moving on: it clears the decision banner.
  for (const b of speedBtns)
    b.onclick = () => {
      game.clock.setSpeed(Number(b.dataset.speed) as ClockSpeed);
      game.dismissDecision();
      save();
      dirty();
    };
  // Three screens share the page: the colony, the notebook and the tech map.
  let view: "colony" | "notebook" | "map" | "workshop" = "colony";
  let wsUnmount: (() => void) | null = null;
  const setView = (v: typeof view): void => {
    if (view === "workshop" && v !== "workshop") {
      wsUnmount?.();
      wsUnmount = null;
      wsView.replaceChildren();
    }
    view = v;
    nbView.hidden = v !== "notebook";
    mapView.hidden = v !== "map";
    wsView.hidden = v !== "workshop";
    cols.hidden = v !== "colony";
    strip.hidden = v !== "colony";
    nbBtn.textContent = v === "notebook" ? S.header.back : S.header.notebook;
    mapBtn.textContent = v === "map" ? S.header.back : S.header.map;
    mapKey = "";
    dirty();
  };
  nbBtn.onclick = () => setView(view === "notebook" ? "colony" : "notebook");
  mapBtn.onclick = () => {
    if (view !== "map") mapStage = game.stage;
    setView(view === "map" ? "colony" : "map");
  };
  let mapStage = game.stage;
  let mapKey = "";
  /** Open a workshop's screen: its registered mount draws into the full-width view. */
  const openWorkshop = (id: string): void => {
    const mount = workshopMounts.get(id);
    const w = game.workshops().find((x) => x.id === id);
    if (!mount || !w) return;
    setView("workshop");
    const head = el("div", "ws-head", `<h2>${esc(w.name)}</h2><p class="muted">${esc(w.loop)}</p>`);
    const back = el("button", "", esc(S.header.back));
    back.type = "button";
    back.onclick = () => setView("colony");
    head.appendChild(back);
    const body = el("div", "ws-body");
    wsView.replaceChildren(head, body);
    const off = mount(body, game);
    wsUnmount = typeof off === "function" ? off : null;
  };
  wsBox.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button[data-open-ws]") as HTMLButtonElement | null;
    if (b) openWorkshop(b.dataset.openWs!);
  });
  mapView.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button[data-map-stage]") as HTMLButtonElement | null;
    if (!b) return;
    mapStage = Number(b.dataset.mapStage);
    dirty();
  });
  const onResize = () => {
    if (view === "map") drawMapEdges(mapView);
  };
  addEventListener("resize", onResize);
  themeBtn.onclick = () => {
    const rootEl = document.documentElement;
    const dark = rootEl.dataset.theme ? rootEl.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    rootEl.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("bootstrap.theme", rootEl.dataset.theme);
    } catch {
      /* per-viewer convenience only */
    }
  };
  newBtn.onclick = () => {
    if (!confirm(S.header.resetConfirm)) return;
    game.clock.stop();
    opts.onNewRun?.();
  };
  trainSel.onchange = () => {
    game.setTrainingTrade(trainSel.value || null);
  };
  projBox.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button[data-start]") as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    game.startProject(b.dataset.start!);
    save();
    dirty();
  });
  banner.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button[data-resume]");
    if (!b) return;
    // Back to the speed the player had before the decision slowed things down.
    const from = game.decisionFromSpeed;
    if (from !== null) game.clock.setSpeed(from);
    game.dismissDecision();
    dirty();
  });

  const offTick = game.engine.onTick(() => {
    if (game.engine.day - lastSaveDay >= AUTOSAVE_DAYS) {
      lastSaveDay = game.engine.day;
      save();
    }
    dirty();
  });
  const offDecision = game.clock.onDecision(() => {
    save();
    dirty();
  });
  const onUnload = () => save();
  addEventListener("beforeunload", onUnload);

  // ---- Training options (static per run) ----
  {
    const opt0 = el("option");
    opt0.value = "";
    opt0.textContent = S.people.trainingNone;
    trainSel.appendChild(opt0);
    for (const t of game.trades()) {
      const o = el("option");
      o.value = t.id;
      o.textContent = t.label;
      trainSel.appendChild(o);
    }
  }

  // ---- Render ----
  const projEls = new Map<string, HTMLElement>();
  const choiceEls = new Map<string, HTMLElement>();
  let logCount = -1;
  let wsKey = "";
  let nbCount = -1;

  function renderProjects(cards: ProjectCard[], stuck: boolean): void {
    if (!cards.length) {
      // "Keep working; new problems will surface" is only true when something can still move.
      setHTML(projBox, stuck ? "" : `<p class="small muted">${esc(S.projects.nothing)}</p>`);
      projEls.clear();
      choiceEls.clear();
      return;
    }
    if (projBox.querySelector(":scope > p")) projBox.replaceChildren();
    const seen = new Set<string>();
    const seenChoices = new Set<string>();
    // Group the cards: options of one choice (two or more open) share a "Choose one" box.
    const groups: { choice?: { id: string; prompt: string }; cards: ProjectCard[] }[] = [];
    for (const c of cards) {
      const last = groups[groups.length - 1];
      if (c.choice && last?.choice?.id === c.choice.id) last.cards.push(c);
      else groups.push({ ...(c.choice ? { choice: c.choice } : {}), cards: [c] });
    }
    let prev: Element | null = null;
    const place = (parent: HTMLElement, node: HTMLElement, after: Element | null): void => {
      const want: Element | null = after ? after.nextElementSibling : parent.firstElementChild;
      if (want !== node) parent.insertBefore(node, want);
    };
    for (const g of groups) {
      if (g.choice && g.cards.length > 1) {
        seenChoices.add(g.choice.id);
        let box = choiceEls.get(g.choice.id);
        if (!box) {
          box = el("div", "choice");
          box.setAttribute("role", "group");
          box.innerHTML =
            `<div class="choice-head"><span class="tag">${esc(S.projects.chooseOne)}</span><h3>${esc(g.choice.prompt)}</h3>` +
            `<p class="small muted">${esc(S.projects.chooseOneNote)}</p></div><div class="opts"></div>`;
          box.setAttribute("aria-label", g.choice.prompt);
          choiceEls.set(g.choice.id, box);
        }
        const opts = box.querySelector(".opts") as HTMLElement;
        let inner: Element | null = null;
        for (const c of g.cards) {
          seen.add(c.id);
          const e = paintCard(c);
          place(opts, e, inner);
          inner = e;
        }
        place(projBox, box, prev);
        prev = box;
      } else {
        for (const c of g.cards) {
          seen.add(c.id);
          const e = paintCard(c);
          place(projBox, e, prev);
          prev = e;
        }
      }
    }
    for (const [id, e] of projEls)
      if (!seen.has(id)) {
        e.remove();
        projEls.delete(id);
      }
    for (const [id, e] of choiceEls)
      if (!seenChoices.has(id)) {
        e.remove();
        choiceEls.delete(id);
      }
  }

  function paintCard(c: ProjectCard): HTMLElement {
    const builders = game.engine.assigned("build");
    let e = projEls.get(c.id);
    if (!e) {
      e = el("div", "proj");
      e.innerHTML =
        `<h3>${esc(c.name)}</h3><div class="tag"></div><div class="problem">${esc(c.problem)}</div>` +
        `<div class="tradeoff"></div><div class="cost"></div><div class="eff"></div><div class="prog"></div><div class="ms"></div>` +
        `<div class="go"><button type="button" data-start="${esc(c.id)}">${esc(S.projects.start)}</button><span class="short"></span></div>` +
        `<details><summary>${esc(S.projects.why)}</summary><p>${esc(c.why)}</p></details>`;
      projEls.set(c.id, e);
    }
    e.classList.toggle("active", c.status === "building");
    e.classList.toggle("suggested", c.suggested);
    setHTML(e.querySelector(".tag") as HTMLElement, c.suggested ? esc(S.projects.suggested) : "");
    e.classList.toggle("option", !!c.choice);
    setHTML(
      e.querySelector(".tradeoff") as HTMLElement,
      [c.tradeoff ? esc(c.tradeoff) : "", c.choseOver ? `<span class="muted">${esc(fill(S.projects.choseOver, { list: c.choseOver.join(S.projects.or) }))}</span>` : ""]
        .filter(Boolean)
        .join(" "),
    );
    const mats = c.cost.map((x) => `${fmt(x.amount)} ${x.name.toLowerCase()}`).join(", ");
    setHTML(
      e.querySelector(".cost") as HTMLElement,
      esc([mats ? fill(S.projects.materials, { list: mats }) : "", fill(S.projects.labor, { n: fmtRound(c.labor) })].filter(Boolean).join(" ")),
    );
    setHTML(e.querySelector(".eff") as HTMLElement, c.effects.length ? esc(fill(S.projects.effect, { list: c.effects.join("; ") })) : "");
    const prog = e.querySelector(".prog") as HTMLElement;
    if (c.progress) {
      const pct = Math.min(100, (c.progress.done / Math.max(1, c.progress.total)) * 100);
      const txt = fill(S.projects.progress, { done: fmt(c.progress.done), total: fmt(c.progress.total) }) + (builders > 0 ? "" : `. ${S.projects.noBuilders}`);
      setHTML(prog, `<div class="bar"><i style="width:${pct.toFixed(2)}%"></i></div><div class="small">${esc(txt)}</div>`);
    } else setHTML(prog, "");
    setHTML(
      e.querySelector(".ms") as HTMLElement,
      c.milestones
        .map((m) => `<div class="${m.fired ? "done" : ""}">${esc(fill(S.projects.milestone, { pct: Math.round(m.at * 100), text: m.text }))}</div>`)
        .join(""),
    );
    const go = e.querySelector(".go") as HTMLElement;
    go.hidden = c.status !== "available";
    const btn = go.querySelector("button") as HTMLButtonElement;
    btn.disabled = !c.affordable;
    const label = c.choice ? S.projects.choose : S.projects.start;
    if (btn.textContent !== label) btn.textContent = label;
    const short = c.missing.map((x) => `${fmt(Math.ceil(x.amount))} ${x.name.toLowerCase()}`).join(", ");
    setHTML(go.querySelector(".short") as HTMLElement, c.affordable ? "" : esc(fill(S.projects.missing, { list: short })));
    return e;
  }

  function render(): void {
    const hd = game.header();
    setHTML(stageEl, esc(fill(S.header.stage, { n: hd.stage, name: hd.stageName })));
    setHTML(dateEl, esc(fill(S.header.date, { year: hd.year, day: hd.day })));
    for (const b of speedBtns) b.classList.toggle("on", Number(b.dataset.speed) === game.clock.speed);
    setHTML(energy, `${esc(fmtRound(hd.energy))} <small>${esc(S.header.energyUnit)}</small>`);
    const g = game.gate();
    setHTML(
      goal,
      g.done
        ? `<span class="blue">${esc(fill(S.goal.reached, { name: g.name }))}</span>`
        : g.unmet.length
          ? `<span class="muted">${esc(fill(S.goal.line, { name: g.name, unmet: g.unmet.join(S.goal.joiner) }))}</span>`
          : `<span class="muted">${esc(fill(S.goal.route, { name: g.name, list: g.routes.join(S.goal.routeJoiner) }))}</span>`,
    );
    const m = game.meter();
    cursor.style.left = `${xs(Math.max(m.min, Math.min(m.max, m.value || m.min)))}%`;

    // Banner: what needs the player and its introduction cards, until they move on.
    const pv = game.pauseView();
    if (pv.line || pv.cards.length) {
      const gateReason = pv.reasons.find((r) => r.kind === "gate");
      let h = "";
      if (gateReason) {
        const st = game.tree.stages.find((s) => String(s.stage) === gateReason.subject);
        const { year, day } = yearDay(game.engine.day);
        const gateNode = st ? game.tree.nodes[st.gate.id] : undefined;
        h += `<h2>${esc(fill(S.gate.banner, { n: gateReason.subject ?? "", name: st?.gate.name ?? "" }))}</h2>`;
        if (gateNode?.notebook) h += `<p>${esc(gateNode.notebook)}</p>`;
        h += `<p class="small muted">${esc(fill(S.gate.time, { year, day }))}</p>`;
      }
      if (pv.line) h += `<p class="line">${esc(pv.line)}</p>`;
      if (pv.cards.length) {
        h += `<div class="cards">`;
        for (const c of pv.cards)
          h += `<div class="card-intro"><div class="tag">${esc(S.pause.newHere)}</div><h3>${esc(c.name)}</h3><p>${esc(c.what)}</p><p class="muted">${esc(c.why)}</p></div>`;
        h += `</div>`;
      }
      const from = game.decisionFromSpeed;
      const label = from !== null && from > game.clock.speed ? fill(S.pause.backTo, { n: from }) : S.pause.ok;
      h += `<div class="actions"><button type="button" data-resume="1">${esc(label)}</button></div>`;
      setHTML(banner, `<div class="banner" role="status">${h}</div>`);
    } else setHTML(banner, "");

    // Pressure strip
    let sh = "";
    for (const b of game.bars()) {
      const v = b.unit === "percent" ? `${fmtSmart(b.value)}%` : `${fmtSmart(b.value)}${b.unit && b.unit !== "percent" ? ` ${b.unit}` : ""}`;
      sh += `<div class="pbar${b.red ? " red" : ""}${b.warn ? " warn" : ""}${b.heartbeat ? " heartbeat" : ""}"><div class="head"><span class="n">${esc(b.name)}</span><span class="v num">${esc(v)}</span></div>`;
      sh += `<div class="track"><i style="width:${(b.fill * 100).toFixed(1)}%"></i>${b.mark !== undefined ? `<b style="left:${(b.mark * 100).toFixed(1)}%"></b>` : ""}</div>`;
      if (b.warn) sh += `<div class="eff warn">${esc(fill(S.pressures.warn, { effect: b.effect }))}</div>`;
      if (b.red || b.warn) {
        if (b.red) sh += `<div class="eff">${esc(fill(S.pressures.red, { effect: b.effect }))}</div>`;
        const hints = b.hints
          .filter((h) => h.state !== "closed")
          .map((h) =>
            h.state === "ready"
              ? fill(S.pressures.hintReady, { name: h.name })
              : h.state === "building"
                ? fill(S.pressures.hintBuilding, { name: h.name })
                : h.state === "done"
                  ? fill(S.pressures.hintDone, { name: h.name })
                  : h.after.length
                    ? fill(S.pressures.hintLater, { name: h.name, after: h.after.join(", ") })
                    : fill(S.pressures.hintSoon, { name: h.name }),
          );
        if (hints.length) sh += `<div class="ans">${esc(fill(S.pressures.fixes, { list: hints.join("; ") }))}</div>`;
      }
      sh += `</div>`;
    }
    setHTML(strip, sh);

    // Stores
    const storeRows = (rows: ReturnType<Game["stores"]>): string => {
      let h = "";
      for (const r of rows) {
        const rs = Math.abs(r.rate) < 0.05 ? "" : fill(S.stores.perDay, { sign: r.rate > 0 ? S.stores.plus : S.stores.minus, n: fmt(Math.max(1, Math.abs(r.rate))) });
        h += `<div>${esc(r.name)}</div><div class="v">${esc(fmt(r.stock))}</div><div class="r ${r.rate < -0.05 ? "red" : "muted"}">${esc(rs)}</div>`;
        const extra: string[] = [];
        if (r.demand > 0.05) extra.push(fill(S.stores.demand, { n: fmt(Math.max(1, r.demand)) }));
        if (r.claimed > 0) extra.push(fill(S.stores.claimed, { n: fmt(r.claimed) }));
        if (extra.length) h += `<div class="d">${esc(extra.join(" · "))}</div>`;
      }
      return h;
    };
    const rows = game.stores();
    const earlier = game.earlierStores();
    setHTML(res, storeRows(rows) || (earlier.length ? "" : `<p class="small muted">${esc(S.stores.empty)}</p>`));
    // Earlier materials: one line, opened on request (the open state survives the redraw).
    if (earlier.length) {
      const was = earlierBox.querySelector("details")?.open ?? false;
      setHTML(
        earlierBox,
        `<details${was ? " open" : ""}><summary class="small muted">${esc(fill(S.stores.earlier, { n: earlier.length }))}</summary><div class="res">${storeRows(earlier)}</div></details>`,
      );
    } else setHTML(earlierBox, "");
    const t = game.tools();
    if (game.intro.isIntroduced("pressure:tool_wear") || t.users > 0) {
      const bare = Math.max(0, t.users - t.tools);
      setHTML(
        toolsBox,
        `<p class="small">${esc(fill(S.tools.line, { tools: fmt(t.tools), users: fmt(t.users) }))} ${bare > 0.5 ? `<span class="red">${esc(fill(S.tools.bare, { n: fmt(bare) }))}</span>` : ""}</p>`,
      );
    }

    // People
    idleNum.textContent = fmt(game.idle());
    tree.update(game.peopleRows());
    const trade = game.engine.trainingTrade() ?? "";
    if (trainSel.value !== trade) trainSel.value = trade;
    const tr = game.training();
    trainLabel.hidden = !tr.show;
    trainInfo.hidden = !tr.show;
    if (tr.show) {
      const lines = [
        fill(S.people.trainingExplain, { days: fmt(tr.personDays), perDay: fmtSmart(tr.idle / tr.personDays), idle: fmt(tr.idle) }),
      ];
      const counts = tr.trades.filter((t) => t.trained > 0).map((t) => fill(S.people.trainingCount, { n: fmt(t.trained), label: t.label }));
      if (counts.length) lines.push(fill(S.people.trainingCounts, { list: counts.join(", ") }));
      const cur = tr.trades.find((t) => t.id === trade);
      if (cur) {
        lines.push(fill(S.people.trainingNext, { label: cur.label, pct: Math.floor(cur.progress * 100) }));
        if (cur.matters.length) lines.push(fill(S.people.trainingMatters, { label: cur.label[0]!.toUpperCase() + cur.label.slice(1), list: cur.matters.join(", ") }));
      }
      setHTML(trainInfo, lines.map((l) => `<p>${esc(l)}</p>`).join(""));
    }

    // Projects, workshops, log. When nothing can move, say what's blocking instead of "keep working".
    const stuck = game.stuck();
    if (stuck) {
      let h = `<h3>${esc(S.stuck.heading)}</h3>`;
      if (stuck.deadEnd) h += `<p class="dead">${esc(fill(S.stuck.cantMake, { list: stuck.cantMake.join(", ") }))}</p>`;
      for (const w of stuck.waiting) h += `<p>${esc(fill(S.stuck.waiting, { name: w.name, list: w.needs.join("; ") }))}</p>`;
      if (!stuck.deadEnd) h += `<p class="muted">${esc(S.stuck.hint)}</p>`;
      setHTML(stuckBox, h);
    } else setHTML(stuckBox, "");
    stuckBox.hidden = !stuck;
    renderProjects(game.projectCards(), !!stuck);
    const ws = game.workshops();
    const key = ws.map((w) => w.id).join(",");
    if (key !== wsKey) {
      wsKey = key;
      wsBox.replaceChildren();
      if (ws.length) {
        wsBox.appendChild(el("h2", "", esc(S.projects.workshopsHeading))).style.marginTop = "16px";
        for (const w of ws) {
          const d = el("div", "ws", `<h3>${esc(w.name)}</h3><p class="muted">${esc(w.loop)}</p>`);
          if (workshopMounts.has(w.id))
            d.appendChild(el("p", "", `<button type="button" data-open-ws="${esc(w.id)}">${esc(S.projects.openWorkshop)}</button>`));
          wsBox.appendChild(d);
        }
      }
    }
    const lines = game.logLines();
    if (lines.length !== logCount) {
      logCount = lines.length;
      logBox.innerHTML = lines.map((l) => `<p><b>${esc(l.stamp)}</b> ${esc(l.text)}</p>`).join("");
    }

    // Notebook
    if (!nbView.hidden) {
      const nb = game.notebook();
      const n = nb.reduce((s, x) => s + x.entries.length, 0);
      if (n !== nbCount) {
        nbCount = n;
        let h = `<h2>${esc(S.notebook.heading)}</h2>`;
        if (!n) h += `<p class="muted">${esc(S.notebook.empty)}</p>`;
        for (const st of nb) {
          h += `<h3>${esc(fill(S.notebook.stage, { n: st.stage, name: st.name }))}</h3>`;
          for (const e of st.entries) h += `<div class="entry"><b>${esc(e.name)}</b><p>${esc(e.text)}</p></div>`;
        }
        nbView.innerHTML = h;
      }
    }

    // Tech map: redrawn only when something on it changed.
    if (view === "map") {
      const m = game.techMap(mapStage);
      const key = JSON.stringify(m);
      if (key !== mapKey) {
        mapKey = key;
        mapView.innerHTML = techMapHTML(m);
        requestAnimationFrame(() => drawMapEdges(mapView));
      }
    }
  }

  let scheduled = false;
  function dirty(): void {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }

  render();
  if (opts.autoStart !== false) game.clock.start();

  return () => {
    game.clock.stop();
    offTick();
    offDecision();
    wsUnmount?.();
    removeEventListener("beforeunload", onUnload);
    removeEventListener("resize", onResize);
    tree.destroy();
    root.replaceChildren();
  };
}

/** The tech map's markup: the stage chain, then the chosen stage's projects by step (beat). */
function techMapHTML(m: TechMap): string {
  const M = STRINGS.map;
  let h = `<h2>${esc(M.heading)}</h2><p class="small muted">${esc(M.intro)}</p>`;
  h += `<ol class="tmap-stages">`;
  for (const s of m.stages) {
    const cls = `${s.status}${s.stage === m.stage ? " shown" : ""}`;
    h +=
      `<li class="${cls}"><button type="button" data-map-stage="${s.stage}" aria-pressed="${s.stage === m.stage}">` +
      `<span class="n">${esc(fill(M.stage, { n: s.stage }))}${s.status === "current" ? ` · ${esc(M.here)}` : ""}</span>` +
      `<b>${esc(s.name)}</b>` +
      `<span>${esc(fill(M.gateLine, { name: s.gate }))}${s.watts !== null ? ` · ${esc(fill(M.watts, { n: fmt(s.watts) }))}` : ""}</span>` +
      `<span class="c">${esc(fill(M.count, { done: s.done, total: s.total }))}</span></button></li>`;
  }
  h += `<li class="moon"><b>${esc(M.moon)}</b></li></ol>`;
  const legend = (["done", "building", "ready", "closed", "ahead"] as const)
    .map((k) => `<span class="tnode ${k}">${esc(M[k])}</span>`)
    .join("");
  h += `<div class="tmap-legend">${legend}</div>`;
  h += `<div class="tmap-stage"><svg class="tmap-edges" aria-hidden="true"></svg><div class="tmap-grid">`;
  // Steps are numbered by position (a stage may skip a beat number).
  for (const [i, b] of m.beats.entries()) {
    h += `<div class="tmap-beat${b.here ? " here" : ""}"><h4>${esc(fill(M.beat, { n: i + 1 }))}${b.here ? ` <span>${esc(M.here)}</span>` : ""}</h4>`;
    for (const n of b.nodes) {
      const deps = JSON.stringify({ r: n.requires, a: n.anyOf });
      h +=
        `<div class="tnode ${n.status}${n.gate ? " gate" : ""}" data-node="${esc(n.id)}" data-deps="${esc(deps)}" title="${esc(M[n.status])}">` +
        `${esc(n.name)}${n.choice ? `<small>${esc(M.either)}</small>` : ""}</div>`;
    }
    h += `</div>`;
  }
  h += `</div></div>`;
  return h;
}

/** Lines from each project to the ones it needs (dashed: one of an any_of group), after layout. */
function drawMapEdges(root: HTMLElement): void {
  const stage = root.querySelector(".tmap-stage") as HTMLElement | null;
  const svg = root.querySelector(".tmap-edges") as SVGSVGElement | null;
  if (!stage || !svg) return;
  const box = stage.getBoundingClientRect();
  svg.setAttribute("width", String(stage.scrollWidth));
  svg.setAttribute("height", String(stage.scrollHeight));
  const at = new Map<string, DOMRect>();
  for (const e of stage.querySelectorAll<HTMLElement>(".tnode[data-node]")) at.set(e.dataset.node!, e.getBoundingClientRect());
  let d = "";
  let dash = "";
  const line = (from: DOMRect, to: DOMRect): string => {
    // Side by side: right edge to left edge; stacked (phone): bottom to top.
    if (to.left >= from.right - 1) {
      const x1 = from.right - box.left, y1 = from.top + from.height / 2 - box.top;
      const x2 = to.left - box.left, y2 = to.top + to.height / 2 - box.top;
      const mx = (x1 + x2) / 2;
      return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} `;
    }
    const x1 = from.left + from.width / 2 - box.left, y1 = from.bottom - box.top;
    const x2 = to.left + to.width / 2 - box.left, y2 = to.top - box.top;
    const my = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2} `;
  };
  for (const e of stage.querySelectorAll<HTMLElement>(".tnode[data-node]")) {
    const to = at.get(e.dataset.node!)!;
    const deps = JSON.parse(e.dataset.deps ?? "{}") as { r?: string[]; a?: string[][] };
    for (const r of deps.r ?? []) {
      const from = at.get(r);
      if (from) d += line(from, to);
    }
    for (const g of deps.a ?? [])
      for (const r of g) {
        const from = at.get(r);
        if (from) dash += line(from, to);
      }
  }
  svg.innerHTML = `<path d="${d}" class="req"/><path d="${dash}" class="any"/>`;
}
