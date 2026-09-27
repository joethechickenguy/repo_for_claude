// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { PeopleTree, type TreeRow } from "../../src/ui/controls/peopleTree";

function setup(rows: TreeRow[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const calls: { adjust: [string[], number][]; pin: [string[], boolean][]; toggle: [string[], boolean][] } = {
    adjust: [],
    pin: [],
    toggle: [],
  };
  const t = new PeopleTree(
    host,
    {
      onAdjust: (p, d) => calls.adjust.push([[...p], d]),
      onPin: (p, v) => calls.pin.push([[...p], v]),
      onToggle: (p, v) => calls.toggle.push([[...p], v]),
    },
    { step: 100 },
  );
  t.update(rows);
  return { host, t, calls };
}

const rows: TreeRow[] = [
  { id: "gather", name: "Gather wood", value: 1200, note: "40 kg a day" },
  {
    id: "metals",
    name: "Metals",
    value: 300,
    children: [
      { id: "furnace", name: "Furnace 1", value: 200, canPin: true, pinned: true },
      { id: "forge", name: "Forge", value: 100, canPin: true, tone: "short", detail: "20 short" },
    ],
  },
];

describe("PeopleTree", () => {
  it("renders rows with name, number and ±", () => {
    const { host } = setup(rows);
    const items = host.querySelectorAll(".ptree-item");
    expect(items.length).toBe(4);
    expect(host.querySelector(".ptree-name")!.textContent).toBe("Gather wood");
    expect(host.querySelector(".ptree-value")!.textContent).toBe("1,200");
  });

  it("calls back with the row path; shift-click is ten blocks", () => {
    const { host, calls } = setup(rows);
    (host.querySelector(".ptree-inc") as HTMLButtonElement).click();
    const dec = host.querySelector(".ptree-dec") as HTMLButtonElement;
    dec.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    expect(calls.adjust).toEqual([
      [["gather"], 100],
      [["gather"], -1000],
    ]);
  });

  it("children are hidden until expanded, and expansion survives updates", () => {
    const { host, t, calls } = setup(rows);
    const metals = host.querySelectorAll(":scope > .ptree > .ptree-item")[1] as HTMLElement;
    const kids = metals.querySelector(".ptree-kids") as HTMLElement;
    expect(kids.hidden).toBe(true);
    (metals.querySelector(".ptree-toggle") as HTMLButtonElement).click();
    expect(kids.hidden).toBe(false);
    expect(calls.toggle).toEqual([[["metals"], true]]);
    t.update(rows.map((r) => ({ ...r, value: r.value + 1 })));
    expect(t.isExpanded(["metals"])).toBe(true);
    expect(kids.hidden).toBe(false);
  });

  it("pins and nested ± report the full path", () => {
    const { host, t, calls } = setup(rows);
    t.setExpanded(["metals"], true);
    const forge = [...host.querySelectorAll(".ptree-item")].find(
      (e) => e.querySelector(":scope > .ptree-row .ptree-name")!.textContent === "Forge",
    )!;
    (forge.querySelector(".ptree-pin") as HTMLButtonElement).click();
    (forge.querySelector(".ptree-inc") as HTMLButtonElement).click();
    expect(calls.pin).toEqual([[["metals", "forge"], true]]);
    expect(calls.adjust).toEqual([[["metals", "forge"], 100]]);
    expect((forge as HTMLElement).dataset.tone).toBe("short");
  });

  it("reuses row elements across updates (a click mid-tick is not lost)", () => {
    const { host, t } = setup(rows);
    const before = host.querySelector(".ptree-item");
    t.update([{ ...rows[0]!, value: 5 }, rows[1]!]);
    expect(host.querySelector(".ptree-item")).toBe(before);
    expect(before!.querySelector(".ptree-value")!.textContent).toBe("5");
  });

  it("removes rows that disappear and keeps order", () => {
    const { host, t } = setup(rows);
    t.update([rows[1]!, { id: "knap", name: "Knap flint", value: 0 }]);
    const names = [...host.querySelectorAll(":scope > .ptree > .ptree-item > .ptree-row .ptree-name")].map((e) => e.textContent);
    expect(names).toEqual(["Metals", "Knap flint"]);
  });

  it("disabled and hidden ± follow the row", () => {
    const { host } = setup([{ id: "x", name: "X", value: 0, canDec: false }, { id: "y", name: "Y", value: 0, step: 0 }]);
    const [x, y] = [...host.querySelectorAll(".ptree-item")] as HTMLElement[];
    expect((x!.querySelector(".ptree-dec") as HTMLButtonElement).disabled).toBe(true);
    expect((y!.querySelector(".ptree-inc") as HTMLButtonElement).hidden).toBe(true);
  });

  it("typed entry: double-click a number, type, Enter sends the whole clamped value to onSet", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const sets: [string[], number][] = [];
    const t = new PeopleTree(host, { onAdjust: () => {}, onSet: (p, v) => sets.push([[...p], v]) }, { step: 100 });
    t.update([
      { id: "gather", name: "Gather wood", value: 1200, max: 1300 },
      { id: "dept", name: "Metals", value: 5, editable: false },
    ]);
    const value = host.querySelector(".ptree-value") as HTMLElement;
    expect(value.classList.contains("editable")).toBe(true);
    value.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = host.querySelector("input.ptree-input") as HTMLInputElement;
    expect(input.value).toBe("1200");
    expect(t.editing).toBe(true);
    // A re-render while typing doesn't clobber the field.
    t.update([
      { id: "gather", name: "Gather wood", value: 1300, max: 1300 },
      { id: "dept", name: "Metals", value: 5, editable: false },
    ]);
    expect(host.querySelector("input.ptree-input")).toBe(input);
    input.value = "1,298";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(sets).toEqual([[["gather"], 1298]]);
    expect(host.querySelector("input.ptree-input")).toBeNull();
    // Above max clamps; Escape cancels; rubbish is ignored; editable:false rows don't open.
    value.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    let i2 = host.querySelector("input.ptree-input") as HTMLInputElement;
    i2.value = "99999";
    i2.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(sets[1]).toEqual([["gather"], 1300]);
    value.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    i2 = host.querySelector("input.ptree-input") as HTMLInputElement;
    i2.value = "50";
    i2.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    value.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    i2 = host.querySelector("input.ptree-input") as HTMLInputElement;
    i2.value = "lots";
    i2.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(sets).toHaveLength(2);
    const dept = host.querySelectorAll(".ptree-value")[1] as HTMLElement;
    expect(dept.classList.contains("editable")).toBe(false);
    dept.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(host.querySelector("input.ptree-input")).toBeNull();
  });

  it("without onSet, numbers are not editable", () => {
    const { host } = setup(rows);
    expect(host.querySelector(".ptree-value.editable")).toBeNull();
  });
});
