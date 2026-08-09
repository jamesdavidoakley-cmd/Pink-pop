/**
 * Tiny safe arithmetic evaluator for question answerExpr / distractorRules.
 * Supports numbers, variables, + - * / %, parentheses, floor()/abs()/max()/min().
 * No eval(), no Function() — a hand-rolled recursive-descent parser.
 */
export function evalExpr(expr: string, vars: Record<string, number>): number {
  let i = 0;
  const s = expr;

  function skip(): void { while (i < s.length && s[i] === ' ') i++; }

  function parseExpr(): number {
    let v = parseTerm();
    for (;;) {
      skip();
      const c = s[i];
      if (c === '+') { i++; v += parseTerm(); }
      else if (c === '-') { i++; v -= parseTerm(); }
      else return v;
    }
  }

  function parseTerm(): number {
    let v = parseFactor();
    for (;;) {
      skip();
      const c = s[i];
      if (c === '*') { i++; v *= parseFactor(); }
      else if (c === '/') { i++; v /= parseFactor(); }
      else if (c === '%') { i++; v %= parseFactor(); }
      else return v;
    }
  }

  function parseFactor(): number {
    skip();
    const c = s[i];
    if (c === '-') { i++; return -parseFactor(); }
    if (c === '(') {
      i++;
      const v = parseExpr();
      skip();
      if (s[i] === ')') i++;
      return v;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
      const v = Number(s.slice(i, j));
      i = j;
      return v;
    }
    if (/[a-zA-Z_]/.test(c ?? '')) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      const name = s.slice(i, j);
      i = j;
      skip();
      if (s[i] === '(') {
        i++;
        const args: number[] = [parseExpr()];
        skip();
        while (s[i] === ',') { i++; args.push(parseExpr()); skip(); }
        if (s[i] === ')') i++;
        switch (name) {
          case 'floor': return Math.floor(args[0]);
          case 'abs': return Math.abs(args[0]);
          case 'max': return Math.max(...args);
          case 'min': return Math.min(...args);
          case 'round': return Math.round(args[0]);
          default: throw new Error(`unknown function ${name}`);
        }
      }
      if (name in vars) return vars[name];
      throw new Error(`unknown variable ${name}`);
    }
    throw new Error(`bad expression at '${s.slice(i, i + 8)}'`);
  }

  const result = parseExpr();
  if (Number.isNaN(result) || !Number.isFinite(result)) throw new Error(`expression '${expr}' → ${result}`);
  return result;
}
