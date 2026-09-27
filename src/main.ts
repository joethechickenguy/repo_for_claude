// Entry point (package D). A saved run resumes straight into the shell; otherwise the draft (package
// I, Stage 0) comes first and Depart starts Stage 1 with what it wrote.
import "./ui/shell.css";
import "./ui/controls/peopleTree.css";
import { tree } from "./content";
import type { SaveStorage } from "./engine";
import { DEFAULT_SAVE_KEY } from "./engine";
import { mountShell } from "./ui/shell";
import { defaultDraftOutcome, type DraftOutcome } from "./ui/shellDraft";
import { Game } from "./ui/shellGame";
import { STRINGS } from "./ui/strings";

/** localStorage, or null where it is blocked (private windows, previews). */
function storage(): SaveStorage | null {
  try {
    const s = window.localStorage;
    const k = "bootstrap.probe";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

function applyTheme(): void {
  try {
    const t = localStorage.getItem("bootstrap.theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch {
    /* per-viewer convenience only */
  }
}

/** Whatever the draft hands over; missing parts fall back to the draft.yaml defaults. */
function outcomeFrom(x: unknown): DraftOutcome {
  const d = defaultDraftOutcome(tree);
  const o = (x ?? {}) as Partial<DraftOutcome>;
  return {
    draft_roster: o.draft_roster && typeof o.draft_roster === "object" ? { ...o.draft_roster } : d.draft_roster,
    bundles_taken: o.bundles_taken && typeof o.bundles_taken === "object" ? { ...o.bundles_taken } : d.bundles_taken,
  };
}

type MountDraft = (el: HTMLElement, onDepart: (outcome: unknown) => void) => unknown;

/**
 * HOOK for package I: if `src/ui/draft.ts` exists and exports `mountDraft(el, onDepart)`, it is the
 * first screen of a new run. Until it lands, a one-line screen departs with the default draft.
 */
const draftModules = import.meta.glob<{ mountDraft?: MountDraft }>("./ui/draft.ts");

async function showDraft(app: HTMLElement, onDepart: (o: DraftOutcome) => void): Promise<void> {
  const load = draftModules["./ui/draft.ts"];
  const mod = load ? await load() : null;
  app.replaceChildren();
  if (mod?.mountDraft) {
    mod.mountDraft(app, (o) => onDepart(outcomeFrom(o)));
    return;
  }
  const box = document.createElement("div");
  box.className = "hook";
  const h = document.createElement("h1");
  h.textContent = STRINGS.title;
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = STRINGS.draft.hook;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = STRINGS.draft.depart;
  b.onclick = () => onDepart(defaultDraftOutcome(tree));
  box.append(h, p, b);
  app.appendChild(box);
}

function boot(): void {
  applyTheme();
  const app = document.getElementById("app")!;
  const store = storage();
  let unmount: (() => void) | null = null;

  const play = (game: Game) => {
    unmount?.();
    unmount = mountShell(app, game, { storage: store, onNewRun: newRun });
  };
  function newRun(): void {
    unmount?.();
    unmount = null;
    try {
      store?.removeItem(DEFAULT_SAVE_KEY);
    } catch {
      /* nothing saved */
    }
    void showDraft(app, (outcome) => {
      const game = new Game(tree, { draft: outcome });
      if (store) game.save(store);
      play(game);
    });
  }

  let saved: Game | null = null;
  try {
    saved = store ? Game.load(tree, store) : null;
  } catch {
    saved = null; // an old or broken save: start over
  }
  if (saved) play(saved);
  else newRun();
}

boot();
