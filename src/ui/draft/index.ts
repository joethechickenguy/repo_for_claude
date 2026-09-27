// Stage 0: the draft (DESIGN.md § Stage 0; docs/work-packages.md § I). The screen: two columns
// (roster, pages) built from the recursive people-panel control (src/ui/controls, package D),
// pin-and-spread arithmetic and the departure result from ./model, everything else from ../strings.
//
// D wires this into the shell: `mountDraft(el, onDepart)`; `onDepart` gets a `DraftResult`
// (`../shellDraft`'s `DraftOutcome` shape), ready to pass to `new Game(tree, { draft: result })`.
import { tree } from "../../content";
import { mountPeopleTree, type PeopleTree } from "../controls";
import { STRINGS } from "../strings";
import "../controls/peopleTree.css";
import "./draft.css";
import {
  buildResult,
  defaultDraftState,
  stepCategory,
  stepPool,
  stepSpecialty,
  stepTopic,
  toggleSpecialtyPin,
  toggleTopicPin,
  BLOCK,
  type DraftState,
  type DraftResult,
} from "./model";
import { pagesLine, pagesRows, peopleLine, rosterRows, weakestAreaLine } from "./view";

export type { DraftResult } from "./model";

/** Mount the Stage 0 screen into `el`; `onDepart` fires once, with the drafted result. */
export function mountDraft(el: HTMLElement, onDepart: (result: DraftResult) => void): void {
  const doc = el.ownerDocument;
  let state: DraftState = defaultDraftState(tree);

  const root = doc.createElement("div");
  root.className = "draft-screen";

  const title = doc.createElement("h1");
  title.className = "draft-title";
  title.textContent = STRINGS.draft.title;
  root.appendChild(title);

  const weakest = doc.createElement("p");
  weakest.className = "draft-weakest";
  root.appendChild(weakest);

  const columns = doc.createElement("div");
  columns.className = "draft-columns";
  root.appendChild(columns);

  const rosterCol = doc.createElement("div");
  rosterCol.className = "draft-col";
  const rosterHeading = doc.createElement("h2");
  rosterHeading.textContent = STRINGS.draft.rosterHeading;
  const rosterLine = doc.createElement("p");
  rosterLine.className = "draft-col-line";
  const rosterHost = doc.createElement("div");
  rosterCol.append(rosterHeading, rosterLine, rosterHost);

  const pagesCol = doc.createElement("div");
  pagesCol.className = "draft-col";
  const pagesHeading = doc.createElement("h2");
  pagesHeading.textContent = STRINGS.draft.pagesHeading;
  const pagesLineEl = doc.createElement("p");
  pagesLineEl.className = "draft-col-line";
  const pagesHost = doc.createElement("div");
  pagesCol.append(pagesHeading, pagesLineEl, pagesHost);

  columns.append(rosterCol, pagesCol);

  const actions = doc.createElement("div");
  actions.className = "draft-actions";
  const departBtn = doc.createElement("button");
  departBtn.type = "button";
  departBtn.className = "draft-depart";
  departBtn.textContent = STRINGS.draft.depart;
  actions.appendChild(departBtn);
  root.appendChild(actions);

  el.appendChild(root);

  const render = (): void => {
    weakest.textContent = weakestAreaLine(tree, state);
    rosterLine.textContent = peopleLine(tree, state);
    pagesLineEl.textContent = pagesLine(tree, state);
    rosterTree.update(rosterRows(tree, state));
    pagesTree.update(pagesRows(tree, state));
  };

  const rosterTree: PeopleTree = mountPeopleTree(rosterHost, {
    onAdjust: (path, delta) => {
      const blocks = Math.round(delta / BLOCK);
      state = path.length === 1 ? stepPool(tree, state, path[0]!, blocks) : stepSpecialty(tree, state, path[0]!, path[1]!, blocks);
      render();
    },
    onPin: (path) => {
      if (path.length === 2) state = toggleSpecialtyPin(state, path[0]!, path[1]!);
      render();
    },
  });

  const pagesTree: PeopleTree = mountPeopleTree(pagesHost, {
    onAdjust: (path, delta) => {
      const blocks = Math.round(delta / BLOCK);
      state = path.length === 1 ? stepCategory(tree, state, path[0]!, blocks) : stepTopic(tree, state, path[0]!, path[1]!, blocks);
      render();
    },
    onPin: (path) => {
      if (path.length === 2) state = toggleTopicPin(state, path[0]!, path[1]!);
      render();
    },
  });

  departBtn.addEventListener("click", () => onDepart(buildResult(tree, state)));

  render();
}
