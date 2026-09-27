// The typed state store: every variable in state-variables.yaml, checked against its declared type.
import type { JsonValue, SetValue, StateValue, StateVarDef, StateVarType } from "./types";

export class StateError extends Error {}

/** The default initial value for a declared variable. */
export function initialValue(def: StateVarDef): StateValue {
  if (def.initial !== undefined) return cloneValue(def.initial);
  switch (def.type) {
    case "flag":
      return false;
    case "number":
    case "count":
      return 0;
    case "enum":
      return def.values?.[0] ?? "";
    case "set":
      return {};
  }
}

function cloneValue(v: StateValue): StateValue {
  return typeof v === "object" ? (JSON.parse(JSON.stringify(v)) as SetValue) : v;
}

function isSetValue(v: unknown): v is SetValue {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Throws StateError if `value` doesn't fit `def`. */
export function checkValue(def: StateVarDef, value: unknown): asserts value is StateValue {
  const bad = (why: string) => new StateError(`state ${def.id} (${def.type}): ${why}`);
  switch (def.type) {
    case "flag":
      if (typeof value !== "boolean") throw bad(`expected boolean, got ${JSON.stringify(value)}`);
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw bad(`expected finite number, got ${value}`);
      return;
    case "count":
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        throw bad(`expected count >= 0, got ${value}`);
      return;
    case "enum":
      if (typeof value !== "string") throw bad(`expected string, got ${JSON.stringify(value)}`);
      if (def.values && !def.values.includes(value)) throw bad(`'${value}' not in [${def.values.join(", ")}]`);
      return;
    case "set":
      if (!isSetValue(value)) throw bad(`expected an object map, got ${JSON.stringify(value)}`);
      return;
  }
}

/**
 * Read and write declared state. Values live in the engine's saved state record, so a save captures
 * them. Writing an undeclared variable or a wrongly typed value throws.
 */
export class StateStore {
  private readonly defs: Map<string, StateVarDef>;

  constructor(
    defs: readonly StateVarDef[],
    private readonly values: Record<string, StateValue>,
  ) {
    this.defs = new Map(defs.map((d) => [d.id, d]));
  }

  /** A fresh record with every declared variable at its initial value, in declaration order. */
  static initialValues(defs: readonly StateVarDef[]): Record<string, StateValue> {
    const out: Record<string, StateValue> = {};
    for (const d of defs) out[d.id] = initialValue(d);
    return out;
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  def(id: string): StateVarDef | undefined {
    return this.defs.get(id);
  }

  typeOf(id: string): StateVarType | undefined {
    return this.defs.get(id)?.type;
  }

  ids(): string[] {
    return [...this.defs.keys()];
  }

  /** The value, or throws if undeclared. */
  get(id: string): StateValue {
    const def = this.need(id);
    const v = this.values[id];
    return v === undefined ? initialValue(def) : v;
  }

  getFlag(id: string): boolean {
    return this.typed(id, ["flag"]) as boolean;
  }

  getNumber(id: string): number {
    return this.typed(id, ["number", "count"]) as number;
  }

  getEnum(id: string): string {
    return this.typed(id, ["enum"]) as string;
  }

  getSet(id: string): SetValue {
    return this.typed(id, ["set"]) as SetValue;
  }

  /** `var has member` for set variables. */
  hasMember(id: string, member: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.getSet(id), member);
  }

  set(id: string, value: StateValue): void {
    const def = this.need(id);
    checkValue(def, value);
    this.values[id] = cloneValue(value);
  }

  /** Add to a number or count. Counts don't go below zero. */
  add(id: string, delta: number): number {
    const def = this.need(id);
    if (def.type !== "number" && def.type !== "count") throw new StateError(`state ${id}: add needs a number`);
    let v = this.getNumber(id) + delta;
    if (def.type === "count" && v < 0) v = 0;
    this.values[id] = v;
    return v;
  }

  /** Add a member (value `true` unless given) to a set variable. */
  addMember(id: string, member: string, value: JsonValue = true): void {
    const s = { ...this.getSet(id), [member]: value };
    this.set(id, s);
  }

  removeMember(id: string, member: string): void {
    const s = { ...this.getSet(id) };
    delete s[member];
    this.set(id, s);
  }

  /** Set a variable only if it's declared; returns whether it was. For engine bindings. */
  setIfDeclared(id: string, value: StateValue): boolean {
    if (!this.defs.has(id)) return false;
    this.set(id, value);
    return true;
  }

  private need(id: string): StateVarDef {
    const def = this.defs.get(id);
    if (!def) throw new StateError(`state variable '${id}' is not declared`);
    return def;
  }

  private typed(id: string, types: StateVarType[]): StateValue {
    const def = this.need(id);
    if (!types.includes(def.type)) throw new StateError(`state ${id} is ${def.type}, not ${types.join("/")}`);
    return this.get(id);
  }
}
