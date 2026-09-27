// The shell (package D): the frame every stage uses. Header (stage, date, speed, energy), the
// slide-rule meter, the pressure strip, stores, the recursive people panel, projects, workshops, the
// log, the notebook screen, and the auto-pause banner with introduction cards. It draws what
// ShellGame's views return and sends clicks to its actions; nothing here decides game rules.
import type { SaveStorage } from "../engine";
import { CLOCK_SPEEDS, type ClockSpeed } from "../engine";
import { PeopleTree } from "./controls/peopleTree";
import type { Game, ProjectCard } from "./shellGame";
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
  const pauseBtn = el("button", "", esc(S.header.pause));
  pauseBtn.type = "button";
  speed.appendChild(pauseBtn);
  const speedBtns = CLOCK_SPEEDS.map((n) => {
    const b = el("button", "", esc(fill(S.header.speedX, { n })));
    b.type = "button";
    b.dataset.speed = String(n);
    speed.appendChild(b);
    return b;
  });
  const nbBtn = el("button", "", esc(S.header.notebook));
  nbBtn.type = "button";
  const themeBtn = el("button", "", esc(S.header.theme));
  themeBtn.type = "button";
  const newBtn = el("button", "", esc(S.header.reset));
  newBtn.type = "button";
  speed.append(nbBtn, themeBtn, newBtn);
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
    },
    { format: fmt },
  );

  c3.appendChild(el("h2", "", esc(S.projects.heading)));
  const projBox = el("div");
  c3.appendChild(projBox);
  const wsBox = el("div");
  c3.appendChild(wsBox);
  c3.appendChild(el("h2", "", esc(S.log.heading))).style.marginTop = "16px";
  const logBox = el("div", "log");
  c3.appendChild(logBox);

  const nbView = el("div", "notebook");
  nbView.hidden = true;

  wrap.append(top, energy, goal, ruleWrap, banner, strip, cols, nbView);

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
  pauseBtn.onclick = () => {
    game.clock.pause();
    save();
    dirty();
  };
  for (const b of speedBtns)
    b.onclick = () => {
      game.clock.setSpeed(Number(b.dataset.speed) as ClockSpeed);
      game.clock.resume();
      dirty();
    };
  nbBtn.onclick = () => {
    nbView.hidden = !nbView.hidden;
    cols.hidden = !nbView.hidden;
    strip.hidden = !nbView.hidden;
    nbBtn.textContent = nbView.hidden ? S.header.notebook : S.header.back;
    dirty();
  };
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
    game.clock.pause();
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
    game.clock.resume();
    dirty();
  });

  const offTick = game.engine.onTick(() => {
    if (game.engine.day - lastSaveDay >= AUTOSAVE_DAYS) {
      lastSaveDay = game.engine.day;
      save();
    }
    dirty();
  });
  const offPause = game.clock.onPause((e) => {
    if (!e.byPlayer) save();
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
  let logCount = -1;
  let wsKey = "";
  let nbCount = -1;

  function renderProjects(cards: ProjectCard[]): void {
    const building = cards.some((c) => c.status === "building");
    const builders = game.engine.assigned("build");
    if (!cards.length) {
      setHTML(projBox, `<p class="small muted">${esc(S.projects.nothing)}</p>`);
      projEls.clear();
      return;
    }
    if (projBox.querySelector(":scope > p")) projBox.replaceChildren();
    const seen = new Set<string>();
    let prev: Element | null = null;
    for (const c of cards) {
      seen.add(c.id);
      let e = projEls.get(c.id);
      if (!e) {
        e = el("div", "proj");
        e.innerHTML =
          `<h3>${esc(c.name)}</h3><div class="tag"></div><div class="problem">${esc(c.problem)}</div>` +
          `<div class="cost"></div><div class="eff"></div><div class="prog"></div><div class="ms"></div>` +
          `<div class="go"><button type="button" data-start="${esc(c.id)}">${esc(S.projects.start)}</button><span class="short"></span></div>` +
          `<details><summary>${esc(S.projects.why)}</summary><p>${esc(c.why)}</p></details>`;
        projEls.set(c.id, e);
      }
      e.classList.toggle("active", c.status === "building");
      e.classList.toggle("suggested", c.suggested);
      setHTML(e.querySelector(".tag") as HTMLElement, c.suggested ? esc(S.projects.suggested) : "");
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
      const short = c.missing.map((x) => `${fmt(Math.ceil(x.amount))} ${x.name.toLowerCase()}`).join(", ");
      setHTML(go.querySelector(".short") as HTMLElement, c.affordable ? "" : esc(fill(S.projects.missing, { list: short })));
      const want: Element | null = prev ? prev.nextElementSibling : projBox.firstElementChild;
      if (want !== e) projBox.insertBefore(e, want);
      prev = e;
    }
    for (const [id, e] of projEls)
      if (!seen.has(id)) {
        e.remove();
        projEls.delete(id);
      }
    void building;
  }

  function render(): void {
    const hd = game.header();
    setHTML(stageEl, esc(fill(S.header.stage, { n: hd.stage, name: hd.stageName })));
    setHTML(dateEl, esc(fill(S.header.date, { year: hd.year, day: hd.day })));
    const paused = game.clock.isPaused;
    pauseBtn.classList.toggle("on", paused);
    for (const b of speedBtns) b.classList.toggle("on", !paused && Number(b.dataset.speed) === game.clock.speed);
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

    // Banner: the last auto-pause's line and its introduction cards, while paused.
    const pv = game.pauseView();
    if (paused && (pv.line || pv.cards.length)) {
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
      h += `<div class="actions"><button type="button" data-resume="1">${esc(S.pause.resume)}</button></div>`;
      setHTML(banner, `<div class="banner" role="status">${h}</div>`);
    } else setHTML(banner, "");

    // Pressure strip
    let sh = "";
    for (const b of game.bars()) {
      const v = b.unit === "percent" ? `${fmtSmart(b.value)}%` : `${fmtSmart(b.value)}${b.unit && b.unit !== "percent" ? ` ${b.unit}` : ""}`;
      sh += `<div class="pbar${b.red ? " red" : ""}${b.heartbeat ? " heartbeat" : ""}"><div class="head"><span class="n">${esc(b.name)}</span><span class="v num">${esc(v)}</span></div>`;
      sh += `<div class="track"><i style="width:${(b.fill * 100).toFixed(1)}%"></i>${b.mark !== undefined ? `<b style="left:${(b.mark * 100).toFixed(1)}%"></b>` : ""}</div>`;
      if (b.red) {
        sh += `<div class="eff">${esc(fill(S.pressures.red, { effect: b.effect }))}</div>`;
        if (b.answers.length) sh += `<div class="ans">${esc(fill(S.pressures.answers, { list: b.answers.map((a) => game.tree.nodes[a]?.name ?? a).join(", ") }))}</div>`;
      }
      sh += `</div>`;
    }
    setHTML(strip, sh);

    // Stores
    const rows = game.stores();
    let rh = "";
    for (const r of rows) {
      const rs = Math.abs(r.rate) < 0.05 ? "" : fill(S.stores.perDay, { sign: r.rate > 0 ? S.stores.plus : S.stores.minus, n: fmt(Math.max(1, Math.abs(r.rate))) });
      rh += `<div>${esc(r.name)}</div><div class="v">${esc(fmt(r.stock))}</div><div class="r ${r.rate < -0.05 ? "red" : "muted"}">${esc(rs)}</div>`;
      const extra: string[] = [];
      if (r.demand > 0.05) extra.push(fill(S.stores.demand, { n: fmt(Math.max(1, r.demand)) }));
      if (r.claimed > 0) extra.push(fill(S.stores.claimed, { n: fmt(r.claimed) }));
      if (extra.length) rh += `<div class="d">${esc(extra.join(" · "))}</div>`;
    }
    setHTML(res, rh || `<p class="small muted">${esc(S.stores.empty)}</p>`);
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

    // Projects, workshops, log
    renderProjects(game.projectCards());
    const ws = game.workshops();
    const key = ws.map((w) => w.id).join(",");
    if (key !== wsKey) {
      wsKey = key;
      wsBox.replaceChildren();
      if (ws.length) {
        wsBox.appendChild(el("h2", "", esc(S.projects.workshopsHeading))).style.marginTop = "16px";
        for (const w of ws) {
          const d = el("div", "ws", `<h3>${esc(w.name)}</h3><p class="muted">${esc(w.loop)}</p>`);
          wsBox.appendChild(d);
          workshopMounts.get(w.id)?.(d, game);
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
    offPause();
    removeEventListener("beforeunload", onUnload);
    tree.destroy();
    root.replaceChildren();
  };
}
