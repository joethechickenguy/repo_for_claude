// Entry point (package D). A saved run resumes straight into the shell; otherwise the draft (package
// I, Stage 0) comes first and Depart starts Stage 1 with what it wrote. A save that can't be read is
// kept under UNREADABLE_SAVE_KEY before the new run replaces it.
import "./ui/shell.css";
import "./ui/controls/peopleTree.css";
import { tree } from "./content";
import type { SaveStorage } from "./engine";
import { DEFAULT_SAVE_KEY } from "./engine";
import { mountShell } from "./ui/shell";
import { mountDraft } from "./ui/draft";
import { outcomeFrom, type DraftOutcome } from "./ui/shellDraft";
import { Game } from "./ui/shellGame";

/** Where a save that failed to load is kept, so starting over never destroys it. */
const UNREADABLE_SAVE_KEY = `${DEFAULT_SAVE_KEY}.unreadable`;

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

function showDraft(app: HTMLElement, onDepart: (o: DraftOutcome) => void): void {
  app.replaceChildren();
  mountDraft(app, (o) => onDepart(outcomeFrom(tree, o)));
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
    showDraft(app, (outcome) => {
      const game = new Game(tree, { draft: outcome });
      if (store) game.save(store);
      play(game);
    });
  }

  let saved: Game | null = null;
  try {
    saved = store ? Game.load(tree, store) : null;
  } catch (err) {
    // An old or broken save: keep a copy, then start over.
    console.warn("Bootstrap: the saved run could not be loaded; starting a new run.", err);
    try {
      const text = store?.getItem(DEFAULT_SAVE_KEY);
      if (text) store?.setItem(UNREADABLE_SAVE_KEY, text);
    } catch {
      /* storage full or blocked */
    }
    saved = null;
  }
  if (saved) play(saved);
  else newRun();
}

boot();
