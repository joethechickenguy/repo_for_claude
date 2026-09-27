// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { tree } from "../../../src/content";
import { mountDraft, type DraftResult } from "../../../src/ui/draft";

describe("mountDraft", () => {
  it("done-criterion 1: defaults load and Depart works with no interaction", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    let result: DraftResult | null = null;
    mountDraft(host, (r) => (result = r));

    // A weakest-area line and a Depart button are on screen from the start.
    expect(host.querySelector(".draft-weakest")!.textContent).toContain("Weakest area:");
    const depart = host.querySelector(".draft-depart") as HTMLButtonElement;
    expect(depart).toBeTruthy();

    depart.click();
    expect(result).not.toBeNull();
    const total = tree.draft.roster.reduce((s, r) => s + result!.draft_roster[r.id]!, 0);
    expect(total).toBe(tree.draft.peopleTotal);
    for (const c of tree.draft.pages) {
      for (const t of c.topics) expect(result!.bundles_taken[t.id]).toBeGreaterThanOrEqual(0);
    }
  });

  it("renders both panels with every pool and category as a top-level row", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    mountDraft(host, () => {});
    const names = Array.from(host.querySelectorAll(".ptree-name")).map((e) => e.textContent);
    for (const pool of tree.draft.roster) expect(names).toContain(pool.name);
    for (const cat of tree.draft.pages) expect(names).toContain(cat.name);
  });

  it("clicking a pool's + moves it and the weakest-area line can change", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    mountDraft(host, () => {});
    const rosterHost = host.querySelectorAll(".ptree")[0]!;
    const prospectorsItem = Array.from(rosterHost.querySelectorAll(".ptree-item")).find(
      (item) => item.querySelector(":scope > .ptree-row .ptree-name")?.textContent === "Prospectors and miners",
    )! as HTMLElement;
    const before = prospectorsItem.querySelector(":scope > .ptree-row .ptree-value")!.textContent;
    const inc = prospectorsItem.querySelector(":scope > .ptree-row .ptree-inc") as HTMLButtonElement;
    inc.click();
    const after = prospectorsItem.querySelector(":scope > .ptree-row .ptree-value")!.textContent;
    expect(after).not.toBe(before);
    expect(after).toBe("900"); // 800 -> +100 block
  });

  it("pinning a topic keeps its number fixed when its category's total changes (done-criterion 4, through the DOM)", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    mountDraft(host, () => {});
    const pagesHost = host.querySelectorAll(".ptree")[1]!;
    const surveyItem = Array.from(pagesHost.querySelectorAll(".ptree-item")).find(
      (item) => item.querySelector(":scope > .ptree-row .ptree-name")?.textContent === "Geological survey",
    )! as HTMLElement;
    surveyItem.querySelector(":scope > .ptree-row .ptree-toggle")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const topicItem = Array.from(surveyItem.querySelectorAll(".ptree-kids .ptree-item")).find(
      (item) => item.querySelector(":scope > .ptree-row .ptree-name")?.textContent === "Copper, tin, clay, flint",
    )! as HTMLElement;
    const pin = topicItem.querySelector(":scope > .ptree-row .ptree-pin") as HTMLButtonElement;
    pin.click();
    const pinnedValue = topicItem.querySelector(":scope > .ptree-row .ptree-value")!.textContent;

    (surveyItem.querySelector(":scope > .ptree-row .ptree-inc") as HTMLButtonElement).click();
    expect(topicItem.querySelector(":scope > .ptree-row .ptree-value")!.textContent).toBe(pinnedValue);
  });
});
