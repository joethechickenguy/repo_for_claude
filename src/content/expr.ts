// The `requires.state` expression language (tech-tree/README.md, Conventions):
//
//   expr    := or
//   or      := and ("OR" and)*
//   and     := unary ("AND" unary)*
//   unary   := "NOT" unary | primary
//   primary := "(" expr ")" | IDENT [ cmpop literal | "has" IDENT ]
//   cmpop   := "==" | "!=" | "<" | "<=" | ">" | ">="
//   literal := NUMBER | "true" | "false" | IDENT        (a bare IDENT is an enum member)
//
// NOT binds tightest, then AND, then OR. A bare IDENT is a flag test. Keywords are case-sensitive.
// This module has no imports so scripts/build-content.mjs can load it with Node's type stripping.

export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=";
export type Literal = number | boolean | string;

export type Expr =
  | { kind: "cmp"; ref: string; op: CmpOp; value: Literal }
  | { kind: "has"; ref: string; member: string }
  | { kind: "flag"; ref: string }
  | { kind: "not"; arg: Expr }
  | { kind: "and"; args: Expr[] }
  | { kind: "or"; args: Expr[] };

export class ExprParseError extends Error {
  readonly pos: number;
  readonly source: string;
  constructor(message: string, pos: number, source: string) {
    super(`${message} at ${pos} in ${JSON.stringify(source)}`);
    this.name = "ExprParseError";
    this.pos = pos;
    this.source = source;
  }
}

type Tok =
  | { t: "ident"; v: string; pos: number }
  | { t: "num"; v: number; pos: number }
  | { t: "op"; v: CmpOp; pos: number }
  | { t: "kw"; v: "AND" | "OR" | "NOT" | "has"; pos: number }
  | { t: "lp" | "rp" | "end"; pos: number };

const KEYWORDS = new Set(["AND", "OR", "NOT", "has"]);
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUM_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const OPS: CmpOp[] = ["==", "!=", "<=", ">=", "<", ">"];

export const CMP_OPS: readonly CmpOp[] = ["==", "!=", "<", "<=", ">", ">="];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ t: "lp", pos: i++ });
      continue;
    }
    if (c === ")") {
      toks.push({ t: "rp", pos: i++ });
      continue;
    }
    const rest = src.slice(i);
    const op = OPS.find((o) => rest.startsWith(o));
    if (op) {
      toks.push({ t: "op", v: op, pos: i });
      i += op.length;
      continue;
    }
    const num = NUM_RE.exec(rest);
    if (num) {
      const v = Number(num[0]);
      if (!Number.isFinite(v)) throw new ExprParseError(`bad number ${num[0]}`, i, src);
      // "5abc" is not a number followed by an identifier; reject run-on tokens.
      if (IDENT_RE.test(rest.slice(num[0].length))) throw new ExprParseError("bad number", i, src);
      toks.push({ t: "num", v, pos: i });
      i += num[0].length;
      continue;
    }
    const id = IDENT_RE.exec(rest);
    if (id) {
      const w = id[0];
      if (KEYWORDS.has(w)) toks.push({ t: "kw", v: w as "AND" | "OR" | "NOT" | "has", pos: i });
      else toks.push({ t: "ident", v: w, pos: i });
      i += w.length;
      continue;
    }
    throw new ExprParseError(`unexpected character ${JSON.stringify(c)}`, i, src);
  }
  toks.push({ t: "end", pos: src.length });
  return toks;
}

/** Parse a condition. Throws ExprParseError on anything outside the grammar. */
export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let k = 0;
  const peek = (): Tok => toks[k]!;
  const next = (): Tok => toks[k++]!;
  const fail = (msg: string, tok: Tok = peek()): never => {
    throw new ExprParseError(msg, tok.pos, src);
  };
  const isKw = (tok: Tok, v: string): boolean => tok.t === "kw" && tok.v === v;

  function parseOr(): Expr {
    const args = [parseAnd()];
    while (isKw(peek(), "OR")) {
      next();
      args.push(parseAnd());
    }
    return join("or", args);
  }
  function parseAnd(): Expr {
    const args = [parseUnary()];
    while (isKw(peek(), "AND")) {
      next();
      args.push(parseUnary());
    }
    return join("and", args);
  }
  function parseUnary(): Expr {
    if (isKw(peek(), "NOT")) {
      next();
      return { kind: "not", arg: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePrimary(): Expr {
    const tok = next();
    if (tok.t === "lp") {
      const e = parseOr();
      if (peek().t !== "rp") fail("expected )");
      next();
      return e;
    }
    if (tok.t !== "ident") return fail("expected a variable", tok);
    const ref = tok.v;
    const after = peek();
    if (after.t === "op") {
      next();
      const lit = next();
      if (lit.t === "num") return { kind: "cmp", ref, op: after.v, value: lit.v };
      if (lit.t === "ident") {
        const value: Literal = lit.v === "true" ? true : lit.v === "false" ? false : lit.v;
        return { kind: "cmp", ref, op: after.v, value };
      }
      return fail("expected a value", lit);
    }
    if (isKw(after, "has")) {
      next();
      const m = next();
      if (m.t !== "ident") return fail("expected a member after has", m);
      return { kind: "has", ref, member: m.v };
    }
    return { kind: "flag", ref };
  }

  const e = parseOr();
  if (peek().t !== "end") fail("unexpected trailing input");
  return e;
}

/** n-ary AND/OR with nested same-kind children flattened; one arg is returned as is. */
function join(kind: "and" | "or", args: Expr[]): Expr {
  if (args.length === 1) return args[0]!;
  const flat: Expr[] = [];
  for (const a of args) {
    if (a.kind === kind) flat.push(...a.args);
    else flat.push(a);
  }
  return { kind, args: flat };
}

/** Canonical form: nested same-kind AND/OR flattened (what the parser returns). */
export function normalize(e: Expr): Expr {
  switch (e.kind) {
    case "not":
      return { kind: "not", arg: normalize(e.arg) };
    case "and":
    case "or":
      return join(e.kind, e.args.map(normalize));
    default:
      return e;
  }
}

/** Print with the fewest parentheses that parse back to the same (normalized) tree. */
export function printExpr(e: Expr): string {
  switch (e.kind) {
    case "cmp":
      return `${e.ref} ${e.op} ${String(e.value)}`;
    case "has":
      return `${e.ref} has ${e.member}`;
    case "flag":
      return e.ref;
    case "not": {
      const inner = printExpr(e.arg);
      return e.arg.kind === "and" || e.arg.kind === "or" ? `NOT (${inner})` : `NOT ${inner}`;
    }
    case "and":
      return e.args.map((a) => (a.kind === "or" || a.kind === "and" ? `(${printExpr(a)})` : printExpr(a))).join(" AND ");
    case "or":
      return e.args.map((a) => (a.kind === "or" ? `(${printExpr(a)})` : printExpr(a))).join(" OR ");
  }
}

/** Every variable name the expression reads, in first-seen order. */
export function exprRefs(e: Expr, out: string[] = []): string[] {
  switch (e.kind) {
    case "cmp":
    case "has":
    case "flag":
      if (!out.includes(e.ref)) out.push(e.ref);
      break;
    case "not":
      exprRefs(e.arg, out);
      break;
    case "and":
    case "or":
      for (const a of e.args) exprRefs(a, out);
      break;
  }
  return out;
}

/** Every leaf of the expression (comparisons, has-tests, flags). */
export function exprLeaves(e: Expr, out: Expr[] = []): Expr[] {
  if (e.kind === "not") exprLeaves(e.arg, out);
  else if (e.kind === "and" || e.kind === "or") for (const a of e.args) exprLeaves(a, out);
  else out.push(e);
  return out;
}
