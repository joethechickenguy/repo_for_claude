// Evaluating parsed conditions against the running game.

import type { CmpOp, Expr, Literal } from "./expr";
import type { StateValue, StateView, Tree } from "./types";

export type Lookup = (name: string) => StateValue | undefined;

/**
 * Resolve an identifier the way the tree says: resources read stock; declared variables read the
 * state view; a name that is neither (tree.identifiers "undeclared", e.g. energy_w_per_person or
 * ore_kg) reads the state view first (an engine metric) and falls back to stock (an engine-only
 * resource).
 */
export function lookupFor(tree: Pick<Tree, "resources" | "identifiers">, view: StateView): Lookup {
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  return (name) => {
    if (own(tree.resources, name)) return view.stock(name);
    const v = view.get(name);
    if (v === undefined && own(tree.identifiers, name) && tree.identifiers[name] === "undeclared") return view.stock(name);
    return v;
  };
}

/**
 * Minimum share for `map has member` on a map-valued set (bundles_taken: topic -> coverage).
 * Equal to the "partial" page-coverage threshold in draft.yaml: below it the topic counts as absent.
 * Callers with a tree pass `tree.draft.coverageTiers.partial` instead.
 */
export const DEFAULT_HAS_MIN_SHARE = 0.5;

/**
 * Semantics:
 * - `x op n` compares numbers; `x == v` / `x != v` compare booleans and enum strings strictly.
 *   A comparison whose left side is unknown (undefined) or of the wrong type is false.
 * - `x has m`: list membership, or for a map, share of m >= hasMinShare.
 * - bare `x`: true for true, non-zero numbers, non-empty strings and non-empty sets.
 */
export function evaluate(e: Expr, lookup: Lookup, hasMinShare = DEFAULT_HAS_MIN_SHARE): boolean {
  switch (e.kind) {
    case "and":
      return e.args.every((a) => evaluate(a, lookup, hasMinShare));
    case "or":
      return e.args.some((a) => evaluate(a, lookup, hasMinShare));
    case "not":
      return !evaluate(e.arg, lookup, hasMinShare);
    case "flag":
      return truthy(lookup(e.ref));
    case "has":
      return has(lookup(e.ref), e.member, hasMinShare);
    case "cmp":
      return compare(lookup(e.ref), e.op, e.value);
  }
}

function truthy(v: StateValue | undefined): boolean {
  if (v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "";
  if (Array.isArray(v)) return v.length > 0;
  return Object.keys(v).length > 0;
}

function has(v: StateValue | undefined, member: string, minShare: number): boolean {
  if (v === undefined || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.includes(member);
  const share = (v as Readonly<Record<string, number>>)[member];
  return typeof share === "number" && share >= minShare;
}

function compare(v: StateValue | undefined, op: CmpOp, lit: Literal): boolean {
  if (v === undefined) return false;
  if (typeof lit === "number") {
    if (typeof v !== "number") return false;
    switch (op) {
      case "==":
        return v === lit;
      case "!=":
        return v !== lit;
      case "<":
        return v < lit;
      case "<=":
        return v <= lit;
      case ">":
        return v > lit;
      case ">=":
        return v >= lit;
    }
  }
  if (typeof v !== typeof lit) return false;
  if (op === "==") return v === lit;
  if (op === "!=") return v !== lit;
  return false;
}

/** Evaluate against a tree and state view (resources -> stock, tree's has-threshold). */
export function holds(tree: Tree, e: Expr, view: StateView): boolean {
  return evaluate(e, lookupFor(tree, view), tree.draft.coverageTiers.partial);
}
