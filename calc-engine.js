/*
 * CalcEngine: a small, safe arithmetic evaluator (no eval()).
 * Supports + - * / %, parentheses, unary minus and decimals.
 * "200 + 10%" means 200 + 10% of 200 (= 220), like a pocket calculator.
 */
const CalcEngine = (() => {
  "use strict";

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === " ") { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        // optional exponent, e.g. 1e-7
        if (src[j] === "e" && /[0-9+-]/.test(src[j + 1] || "")) {
          j++;
          if (src[j] === "+" || src[j] === "-") j++;
          while (j < src.length && /[0-9]/.test(src[j])) j++;
        }
        const text = src.slice(i, j);
        if ((text.match(/\./g) || []).length > 1 || text === ".") throw new Error("Invalid number");
        tokens.push(parseFloat(text));
        i = j;
        continue;
      }
      if ("+-*/%()".includes(ch)) { tokens.push(ch); i++; continue; }
      throw new Error("Unexpected character");
    }
    return tokens;
  }

  function balance(expr) {
    let open = 0;
    for (const c of expr) {
      if (c === "(") open++;
      else if (c === ")") open--;
    }
    return open > 0 ? expr + ")".repeat(open) : expr;
  }

  function evaluate(expr) {
    const tokens = tokenize(balance(expr));
    if (!tokens.length) throw new Error("Nothing to calculate");
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];

    function parseExpr() {
      let value = parseTerm();
      while (peek() === "+" || peek() === "-") {
        const op = next();
        const start = i;
        let right = parseTerm();
        // a bare "n%" after + or - is a percentage of the left side
        const barePercent = i - start === 2 && typeof tokens[start] === "number" && tokens[start + 1] === "%";
        if (barePercent) right = value * right;
        value = op === "+" ? value + right : value - right;
      }
      return value;
    }

    function parseTerm() {
      let value = parseUnary();
      while (peek() === "*" || peek() === "/") {
        const op = next();
        const right = parseUnary();
        if (op === "/") {
          if (right === 0) throw new Error("Can’t divide by zero");
          value /= right;
        } else {
          value *= right;
        }
      }
      return value;
    }

    function parseUnary() {
      if (peek() === "-") { next(); return -parseUnary(); }
      if (peek() === "+") { next(); return parseUnary(); }
      return parsePostfix();
    }

    function parsePostfix() {
      let value = parsePrimary();
      while (peek() === "%") { next(); value /= 100; }
      return value;
    }

    function parsePrimary() {
      const t = next();
      if (typeof t === "number") return t;
      if (t === "(") {
        const value = parseExpr();
        if (next() !== ")") throw new Error("Missing closing bracket");
        return value;
      }
      throw new Error("Incomplete expression");
    }

    const result = parseExpr();
    if (i < tokens.length) throw new Error("Check the expression");
    if (!Number.isFinite(result)) throw new Error("Result is too large");
    return result;
  }

  // Trim floating point noise: 0.1 + 0.2 -> 0.3
  function clean(value) {
    if (Object.is(value, -0)) return 0;
    return parseFloat(value.toPrecision(12));
  }

  function format(value) {
    const v = clean(value);
    const abs = Math.abs(v);
    if (abs >= 1e15 || (abs > 0 && abs < 1e-9)) {
      return v.toExponential(6).replace(/\.?0+e/, "e");
    }
    return v.toLocaleString("en-US", { maximumFractionDigits: 10 });
  }

  return { evaluate, format, clean };
})();

if (typeof module !== "undefined") module.exports = CalcEngine;
