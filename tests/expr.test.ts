import { describe, expect, it } from "vitest";
import { evaluate, type Lookup } from "../src/content/evaluate";
import { CMP_OPS, ExprParseError, exprRefs, normalize, parseExpr, printExpr, type CmpOp, type Expr } from "../src/content/expr";
import type { StateValue } from "../src/content/types";
import { tree } from "../src/content";

// ---- seeded PRNG (mulberry32); no Math.random in this repo ------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!;
  return { next, int, pick };
}
type Rng = ReturnType<typeof rng>;

const NAMES = ["a", "b", "tool_wear", "has_x", "engine_type", "bundles_taken", "x1", "_y", "AND_x", "ORx", "NOTE", "hasty"];
const MEMBERS = ["watt", "survey", "chromite", "m_2"];

function genNumber(r: Rng): number {
  switch (r.int(4)) {
    case 0:
      return r.int(10);
    case 1:
      return r.int(200000) - 100000;
    case 2:
      return Math.round((r.next() * 20 - 10) * 1000) / 1000 || 0.5;
    default:
      return r.pick([0.8, 1.5, 15.3, 20000, 1e21, 1e-7]);
  }
}

function genLeaf(r: Rng): Expr {
  const ref = r.pick(NAMES);
  switch (r.int(5)) {
    case 0:
      return { kind: "flag", ref };
    case 1:
      return { kind: "has", ref, member: r.pick(MEMBERS) };
    case 2:
      return { kind: "cmp", ref, op: r.pick(["==", "!="] as CmpOp[]), value: r.pick([true, false, "watt", "none", "high_pressure"]) };
    default:
      return { kind: "cmp", ref, op: r.pick(CMP_OPS), value: genNumber(r) };
  }
}

function genExpr(r: Rng, depth: number): Expr {
  if (depth <= 0 || r.next() < 0.3) return genLeaf(r);
  switch (r.int(3)) {
    case 0:
      return { kind: "not", arg: genExpr(r, depth - 1) };
    default: {
      const n = 2 + r.int(3);
      const args = Array.from({ length: n }, () => genExpr(r, depth - 1));
      return { kind: r.next() < 0.5 ? "and" : "or", args };
    }
  }
}

function genState(r: Rng): Record<string, StateValue> {
  const s: Record<string, StateValue> = {};
  for (const n of NAMES) {
    switch (r.int(6)) {
      case 0:
        s[n] = r.next() < 0.5;
        break;
      case 1:
        s[n] = genNumber(r);
        break;
      case 2:
        s[n] = r.pick(["watt", "none", "high_pressure"]);
        break;
      case 3:
        s[n] = MEMBERS.filter(() => r.next() < 0.5);
        break;
      case 4:
        s[n] = Object.fromEntries(MEMBERS.map((m) => [m, r.int(5) / 4]));
        break;
      default:
        break; // unknown
    }
  }
  return s;
}

/** Reference semantics, written independently of evaluate(). */
function refEval(e: Expr, s: Record<string, StateValue>): boolean {
  if (e.kind === "and") return e.args.every((a) => refEval(a, s));
  if (e.kind === "or") return e.args.some((a) => refEval(a, s));
  if (e.kind === "not") return !refEval(e.arg, s);
  const v = s[e.ref];
  if (e.kind === "flag") {
    if (v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return v !== false && v !== 0 && v !== "";
  }
  if (e.kind === "has") {
    if (Array.isArray(v)) return v.includes(e.member);
    if (v && typeof v === "object") return ((v as Record<string, number>)[e.member] ?? -1) >= 0.5;
    return false;
  }
  if (v === undefined || typeof v !== typeof e.value) return false;
  const x = v as number;
  const y = e.value as number;
  return { "==": x === y, "!=": x !== y, "<": x < y, "<=": x <= y, ">": x > y, ">=": x >= y }[e.op] && (typeof y === "number" || e.op === "==" || e.op === "!=");
}

const lookupOf =
  (s: Record<string, StateValue>): Lookup =>
  (n) =>
    s[n];

const CASES = 2000;

describe("expression parser: examples", () => {
  it("parses the README forms", () => {
    expect(parseExpr("pump_workers > 500")).toEqual({ kind: "cmp", ref: "pump_workers", op: ">", value: 500 });
    expect(parseExpr("bundles_taken has geological_survey")).toEqual({ kind: "has", ref: "bundles_taken", member: "geological_survey" });
    expect(parseExpr("NOT has_kerosene")).toEqual({ kind: "not", arg: { kind: "flag", ref: "has_kerosene" } });
    expect(parseExpr("mine_drained_by_engine == true")).toEqual({ kind: "cmp", ref: "mine_drained_by_engine", op: "==", value: true });
    expect(parseExpr("engine_type != watt")).toEqual({ kind: "cmp", ref: "engine_type", op: "!=", value: "watt" });
  });

  it("gives NOT > AND > OR precedence", () => {
    expect(parseExpr("a OR b AND c")).toEqual({ kind: "or", args: [{ kind: "flag", ref: "a" }, { kind: "and", args: [{ kind: "flag", ref: "b" }, { kind: "flag", ref: "c" }] }] });
    expect(parseExpr("NOT a AND b")).toEqual({ kind: "and", args: [{ kind: "not", arg: { kind: "flag", ref: "a" } }, { kind: "flag", ref: "b" }] });
    expect(parseExpr("NOT has_bellows OR NOT has_wind_furnaces").kind).toBe("or");
    expect(parseExpr("(a OR b) AND c").kind).toBe("and");
  });

  it("rejects what the grammar doesn't allow", () => {
    for (const bad of ["", "a >", "a > > 1", "> 1", "a AND", "OR a", "a b", "(a", "a)", "a has", "a has 5", "a > 5abc", "a == \"x\"", "a and b", "a = 1", "tools < tool users", "never; it is the score", "a > 1,000"]) {
      expect(() => parseExpr(bad), bad).toThrow(ExprParseError);
    }
  });

  it("parses every requires.state and gate condition in the tree", () => {
    for (const n of Object.values(tree.nodes)) for (const c of n.requires.state) expect(printExpr(parseExpr(c.text))).toBe(printExpr(c.expr));
    for (const s of tree.stages) expect(s.gate.condition.length).toBeGreaterThan(0);
    expect(exprRefs(parseExpr("forest_cover < 50 OR fuel_balance < 0"))).toEqual(["forest_cover", "fuel_balance"]);
  });
});

describe("expression parser: properties (seeded)", () => {
  it("print then parse is the identity on normalized trees", () => {
    const r = rng(1);
    for (let i = 0; i < CASES; i++) {
      const e = normalize(genExpr(r, 4));
      const s = printExpr(e);
      expect(parseExpr(s), s).toEqual(e);
    }
  });

  it("printing is a fixed point after one parse", () => {
    const r = rng(2);
    for (let i = 0; i < CASES; i++) {
      const e = genExpr(r, 4);
      const once = printExpr(parseExpr(printExpr(e)));
      expect(once).toBe(printExpr(normalize(e)));
      expect(printExpr(parseExpr(once))).toBe(once);
    }
  });

  it("whitespace and redundant parentheses don't change the tree", () => {
    const r = rng(3);
    const spaces = ["", " ", "  ", "\t"];
    for (let i = 0; i < CASES; i++) {
      const e = normalize(genExpr(r, 3));
      const s = printExpr(e);
      const toks = s.split(" ");
      const noisy = "(".repeat(1) + toks.map((t) => r.pick(spaces) + t).join(" " + r.pick(spaces)) + r.pick(spaces) + ")";
      expect(parseExpr(noisy), noisy).toEqual(e);
    }
  });

  it("evaluation of the parsed form matches reference semantics", () => {
    const r = rng(4);
    for (let i = 0; i < CASES; i++) {
      const e = genExpr(r, 4);
      const s = genState(r);
      const parsed = parseExpr(printExpr(e));
      expect(evaluate(parsed, lookupOf(s))).toBe(refEval(e, s));
    }
  });

  it("AND/OR/NOT follow boolean algebra (precedence, De Morgan, double negation)", () => {
    const r = rng(5);
    for (let i = 0; i < CASES; i++) {
      const [a, b, c] = [genLeaf(r), genLeaf(r), genLeaf(r)].map(printExpr) as [string, string, string];
      const s = lookupOf(genState(r));
      const ev = (src: string) => evaluate(parseExpr(src), s);
      expect(ev(`${a} OR ${b} AND ${c}`)).toBe(ev(a) || (ev(b) && ev(c)));
      expect(ev(`${a} AND ${b} OR ${c}`)).toBe((ev(a) && ev(b)) || ev(c));
      expect(ev(`NOT (${a} AND ${b})`)).toBe(ev(`NOT ${a} OR NOT ${b}`));
      expect(ev(`NOT (${a} OR ${b})`)).toBe(ev(`NOT ${a} AND NOT ${b}`));
      expect(ev(`NOT NOT ${a}`)).toBe(ev(a));
    }
  });

  it("random input either parses (and round-trips) or throws ExprParseError", () => {
    const r = rng(6);
    const alphabet = ["a", "b_1", " ", "(", ")", "<", ">", "=", "!", "-", ".", "5", "0", "e", "AND", "OR", "NOT", "has", "true", "x", ";", ","];
    let parsed = 0;
    for (let i = 0; i < CASES * 5; i++) {
      const src = Array.from({ length: 1 + r.int(12) }, () => r.pick(alphabet)).join(r.next() < 0.5 ? " " : "");
      let e: Expr;
      try {
        e = parseExpr(src);
      } catch (err) {
        expect(err, src).toBeInstanceOf(ExprParseError);
        continue;
      }
      parsed++;
      expect(parseExpr(printExpr(e))).toEqual(normalize(e));
    }
    expect(parsed).toBeGreaterThan(50);
  });

  it("deleting any one token of a valid expression parses or throws ExprParseError", () => {
    const r = rng(7);
    for (let i = 0; i < CASES / 4; i++) {
      const toks = printExpr(genExpr(r, 3)).split(" ");
      for (let k = 0; k < toks.length; k++) {
        const src = [...toks.slice(0, k), ...toks.slice(k + 1)].join(" ");
        try {
          parseExpr(src);
        } catch (err) {
          expect(err, src).toBeInstanceOf(ExprParseError);
        }
      }
    }
  });
});
