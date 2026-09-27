// The people panel's one recursive control (DESIGN.md, Labor): a row with name, number, ± , an
// expander and a pin. The same control shows jobs (people tier), works and their jobs (works tier),
// departments -> works -> jobs (departments tier), and the draft's pools -> specialties and
// categories -> topics (package I).
//
// The control is a view: the caller owns the numbers and passes a fresh row list to `update()`; the
// control calls back with the row's path. Expanded state is kept inside the control by path, so a
// re-render every tick keeps what the player opened. Rows are reused by key, so a ± clicked while the
// game runs is never lost to a rebuild. The pin-and-spread arithmetic is in ./spread.ts (pure).
//
// API is shared with package I; extend it additively.
import { STRINGS } from "../strings";

/** One row. Children make it expandable. */
export interface TreeRow {
  /** Stable id among its siblings. The row's path is its ancestors' ids plus this one. */
  id: string;
  /** Row label (from content). */
  name: string;
  /** The row's number (people, pages). */
  value: number;
  /** Optional text after the number: "of 600", "/ 1.0 t a day", a shortfall. From content or strings. */
  detail?: string;
  /** Optional second line under the name: a specialty's "speeds", a job's "io". */
  note?: string;
  /** Hover text for the row (e.g. the nodes a topic changes). */
  hint?: string;
  /** Visual state of the number: `short` is red (a shortfall, a bottleneck), `auto` is muted (engine set it). */
  tone?: "normal" | "short" | "auto" | "good";
  /** ± step for this row (default: the control's `step`). 0 hides the ± buttons. */
  step?: number;
  /** Disable + or − without hiding them. */
  canInc?: boolean;
  canDec?: boolean;
  /** Show a pin toggle. `pinned` is its state. */
  canPin?: boolean;
  pinned?: boolean;
  /** Children; the row gets an expander when there is at least one. */
  children?: TreeRow[];
  /** Start expanded the first time this row is seen (later the player's choice wins). */
  defaultExpanded?: boolean;
  /** Extra CSS class on the row (e.g. `new` for a just-introduced control). */
  className?: string;
}

export interface TreeHandlers {
  /** ± pressed: delta is +step or −step (shift-click: ×10). */
  onAdjust(path: readonly string[], delta: number): void;
  /** Pin toggled. */
  onPin?(path: readonly string[], pinned: boolean): void;
  /** Expander toggled (the control already remembers it). */
  onToggle?(path: readonly string[], expanded: boolean): void;
}

/** Button labels and aria text; defaults from the UI strings file. */
export interface TreeLabels {
  inc: string;
  dec: string;
  expand: string;
  collapse: string;
  pin: string;
  unpin: string;
}

export interface TreeOptions {
  /** Default ± step (a block of people or pages). */
  step?: number;
  /** Multiplier for shift-click. */
  bigStepFactor?: number;
  labels?: Partial<TreeLabels>;
  /** Number formatter (default: en-US grouping, whole numbers). */
  format?: (n: number) => string;
}

export const DEFAULT_TREE_LABELS: TreeLabels = { ...STRINGS.tree };

/** Shift-click moves this many blocks. */
const DEFAULT_BIG_STEP_FACTOR = 10;

interface RowEls {
  root: HTMLElement;
  line: HTMLElement;
  toggle: HTMLButtonElement;
  name: HTMLElement;
  note: HTMLElement;
  value: HTMLElement;
  detail: HTMLElement;
  dec: HTMLButtonElement;
  inc: HTMLButtonElement;
  pin: HTMLButtonElement;
  kids: HTMLElement;
  row: TreeRow;
  path: string[];
}

const KEY_SEP = "\u0000";

function defaultFormat(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Make an element with a class. */
function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  return e;
}

export class PeopleTree {
  readonly root: HTMLElement;
  private readonly rows = new Map<string, RowEls>();
  private readonly expanded = new Map<string, boolean>();
  private readonly labels: TreeLabels;
  private readonly step: number;
  private readonly big: number;
  private readonly format: (n: number) => string;

  constructor(
    container: HTMLElement,
    private readonly handlers: TreeHandlers,
    opts: TreeOptions = {},
  ) {
    this.labels = { ...DEFAULT_TREE_LABELS, ...(opts.labels ?? {}) };
    this.step = opts.step ?? 100;
    this.big = opts.bigStepFactor ?? DEFAULT_BIG_STEP_FACTOR;
    this.format = opts.format ?? defaultFormat;
    this.root = el(container.ownerDocument, "div", "ptree");
    this.root.setAttribute("role", "tree");
    container.appendChild(this.root);
    this.root.addEventListener("click", (ev) => this.onClick(ev as MouseEvent));
  }

  /** Is a row (by path) expanded now? */
  isExpanded(path: readonly string[]): boolean {
    return this.expanded.get(path.join(KEY_SEP)) ?? false;
  }

  /** Open or close a row from code (the player's clicks do this too). */
  setExpanded(path: readonly string[], open: boolean): void {
    this.expanded.set(path.join(KEY_SEP), open);
    const r = this.rows.get(path.join(KEY_SEP));
    if (r) this.paintExpanded(r);
  }

  /** Render the rows. Call as often as needed (every tick is fine). */
  update(rows: readonly TreeRow[]): void {
    const seen = new Set<string>();
    this.renderLevel(this.root, rows, [], seen, 0);
    for (const [k, r] of this.rows)
      if (!seen.has(k)) {
        r.root.remove();
        this.rows.delete(k);
      }
  }

  /** Remove the control from the page. */
  destroy(): void {
    this.root.remove();
    this.rows.clear();
  }

  private renderLevel(parent: HTMLElement, rows: readonly TreeRow[], prefix: string[], seen: Set<string>, depth: number): void {
    let prev: Element | null = null;
    for (const row of rows) {
      const path = [...prefix, row.id];
      const key = path.join(KEY_SEP);
      seen.add(key);
      let r = this.rows.get(key);
      if (!r) {
        r = this.make(path, depth);
        this.rows.set(key, r);
        if (!this.expanded.has(key)) this.expanded.set(key, row.defaultExpanded ?? false);
      }
      r.row = row;
      this.paint(r);
      const want: Element | null = prev ? prev.nextElementSibling : parent.firstElementChild;
      if (want !== r.root) parent.insertBefore(r.root, want);
      prev = r.root;
      if (row.children && row.children.length > 0) this.renderLevel(r.kids, row.children, path, seen, depth + 1);
    }
  }

  private make(path: string[], depth: number): RowEls {
    const doc = this.root.ownerDocument;
    const root = el(doc, "div", "ptree-item");
    root.setAttribute("role", "treeitem");
    root.dataset.key = path.join(KEY_SEP);
    root.style.setProperty("--depth", String(depth));
    const line = el(doc, "div", "ptree-row");
    const toggle = el(doc, "button", "ptree-toggle");
    toggle.type = "button";
    toggle.dataset.act = "toggle";
    const label = el(doc, "div", "ptree-label");
    const name = el(doc, "span", "ptree-name");
    const note = el(doc, "span", "ptree-note");
    label.append(name, note);
    const value = el(doc, "span", "ptree-value num");
    const detail = el(doc, "span", "ptree-detail num");
    const dec = el(doc, "button", "ptree-dec");
    dec.type = "button";
    dec.dataset.act = "dec";
    const inc = el(doc, "button", "ptree-inc");
    inc.type = "button";
    inc.dataset.act = "inc";
    const pin = el(doc, "button", "ptree-pin");
    pin.type = "button";
    pin.dataset.act = "pin";
    line.append(toggle, label, dec, value, inc, detail, pin);
    const kids = el(doc, "div", "ptree-kids");
    kids.setAttribute("role", "group");
    root.append(line, kids);
    return { root, line, toggle, name, note, value, detail, dec, inc, pin, kids, row: { id: "", name: "", value: 0 }, path };
  }

  private paint(r: RowEls): void {
    const row = r.row;
    const hasKids = !!row.children && row.children.length > 0;
    r.root.className = `ptree-item${row.className ? ` ${row.className}` : ""}`;
    r.root.dataset.tone = row.tone ?? "normal";
    setText(r.name, row.name);
    setText(r.note, row.note ?? "");
    r.note.hidden = !row.note;
    setText(r.value, this.format(row.value));
    setText(r.detail, row.detail ?? "");
    r.detail.hidden = !row.detail;
    if (row.hint) r.line.title = row.hint;
    else r.line.removeAttribute("title");

    const step = row.step ?? this.step;
    const showPm = step > 0;
    r.dec.hidden = !showPm;
    r.inc.hidden = !showPm;
    setText(r.dec, this.labels.dec);
    setText(r.inc, this.labels.inc);
    r.dec.disabled = row.canDec === false;
    r.inc.disabled = row.canInc === false;
    r.dec.setAttribute("aria-label", `${this.labels.dec} ${row.name}`);
    r.inc.setAttribute("aria-label", `${this.labels.inc} ${row.name}`);

    r.pin.hidden = !row.canPin;
    setText(r.pin, row.pinned ? this.labels.unpin : this.labels.pin);
    r.pin.setAttribute("aria-pressed", row.pinned ? "true" : "false");
    r.root.classList.toggle("pinned", !!row.pinned);

    r.toggle.style.visibility = hasKids ? "visible" : "hidden";
    r.toggle.tabIndex = hasKids ? 0 : -1;
    r.kids.hidden = !hasKids;
    if (!hasKids) r.kids.replaceChildren();
    this.paintExpanded(r);
  }

  private paintExpanded(r: RowEls): void {
    const open = this.expanded.get(r.path.join(KEY_SEP)) ?? false;
    const hasKids = !!r.row.children && r.row.children.length > 0;
    setText(r.toggle, open ? this.labels.collapse : this.labels.expand);
    r.toggle.setAttribute("aria-label", open ? this.labels.collapse : this.labels.expand);
    r.root.setAttribute("aria-expanded", hasKids ? String(open) : "false");
    r.kids.hidden = !(hasKids && open);
  }

  private onClick(ev: MouseEvent): void {
    const target = ev.target as HTMLElement | null;
    const btn = target?.closest("button[data-act]") as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const item = btn.closest(".ptree-item") as HTMLElement | null;
    const key = item?.dataset.key;
    if (key === undefined) return;
    const r = this.rows.get(key);
    if (!r) return;
    const act = btn.dataset.act;
    const step = (r.row.step ?? this.step) * (ev.shiftKey ? this.big : 1);
    if (act === "inc") this.handlers.onAdjust(r.path, step);
    else if (act === "dec") this.handlers.onAdjust(r.path, -step);
    else if (act === "pin") this.handlers.onPin?.(r.path, !r.row.pinned);
    else if (act === "toggle") {
      const open = !(this.expanded.get(key) ?? false);
      this.expanded.set(key, open);
      this.paintExpanded(r);
      this.handlers.onToggle?.(r.path, open);
    }
  }
}

/** Only touch the DOM when the text changed (cheap per-tick re-renders). */
function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/** Convenience: mount a tree into a container and return it. */
export function mountPeopleTree(container: HTMLElement, handlers: TreeHandlers, opts?: TreeOptions): PeopleTree {
  return new PeopleTree(container, handlers, opts);
}
