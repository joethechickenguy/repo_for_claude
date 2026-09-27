// Entry point (package D). A saved run resumes straight into the shell; otherwise the draft (package
// I, Stage 0) comes first and Depart starts Stage 1 with what it wrote.
import "./ui/shell.css";
import "./ui/controls/peopleTree.css";
import { tree } from "./content";
import type { SaveStorage } from "./engine";
import { DEFAULT_SAVE_KEY } from "./engine";
import { mountShell } from "./ui/shell";
import { defaultDraftOutcome, outcomeFrom, type DraftOutcome } from "./ui/shellDraft";
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

type MountDraft = (el: HTMLElement, onDepart: (outcome: unknown) => void) => unknown;

/**
 * HOOK for package I: the first module of `src/ui/draft.ts`, `src/ui/draft/index.ts` or
 * `src/ui/draft/screen.ts` that exports `mountDraft(el, onDepart)` is the first screen of a new run.
 * Until one lands, a one-line screen departs with the default draft.
 */
const draftModules = import.meta.glob<{ mountDraft?: MountDraft }>(["./ui/draft.ts", "./ui/draft/index.ts", "./ui/draft/screen.ts"]);

async function showDraft(app: HTMLElement, onDepart: (o: DraftOutcome) => void): Promise<void> {
  let mountDraft: MountDraft | undefined;
  for (const path of ["./ui/draft.ts", "./ui/draft/index.ts", "./ui/draft/screen.ts"]) {
    const load = draftModules[path];
    const mod = load ? await load() : null;
    if (mod?.mountDraft) {
      mountDraft = mod.mountDraft;
      break;
    }
  }
  app.replaceChildren();
  if (mountDraft) {
    mountDraft(app, (o) => onDepart(outcomeFrom(tree, o)));
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

// Workshop screens (packages E1-E6) register themselves and their game systems on import; load them
// all before any Game is created or loaded.
import.meta.glob("./ui/workshops/*.ts", { eager: true });

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
