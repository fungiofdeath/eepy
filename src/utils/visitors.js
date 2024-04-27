import { UnknownNode } from './errors.js';

/**
 * Transforms the subforms of `exp` via `fn(subforms, ...args)`.
 * @param exp An expression
 * @param args Extra arguments for `fn`, in addition to the subform argument
 * @throws {UnknownNode} when `exp` is not a valid node type.
 */
export function map_subforms(fn, exp, ...args) {
  const visit = x => fn(x, ...args);
  switch (exp.$) {
    case 'literal':
      return exp;
    case 'var':
      return exp;
    case 'set!':
      return { ...exp, value: visit(exp.value) };
    case 'block':
      return { ...exp, subforms: exp.subforms.map(visit) };
    case 'call':
      if (exp.arg_k?.$)
        return {
          ...exp,
          fn: visit(exp.fn),
          args: exp.args.map(visit),
          arg_k: visit(exp.arg_k),
        };
      return { ...exp, fn: visit(exp.fn), args: exp.args.map(visit) };
    case 'kcall':
      return { ...exp, args: exp.args.map(visit) };
    case 'if':
      return {
        ...exp,
        cond: visit(exp.cond),
        then: visit(exp.then),
        otherwise: visit(exp.otherwise),
      };
    case 'let':
    case 'let*':
    case 'klabels':
    case 'labels':
    case 'letrec*':
      return {
        ...exp,
        binds: exp.binds.map(({ value, ...rest }) => ({
          ...rest,
          value: visit(value),
        })),
        body: visit(exp.body),
      };
    case 'klambda':
    case 'lambda':
      return { ...exp, body: visit(exp.body) };
    default:
      throw new UnknownNode(exp);
  }
}
