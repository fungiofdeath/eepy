import { UnknownNode } from './errors.js';

/**
 * Transform the various parts of the form according to the provided configs.
 *
 * These functions are only run on the internal parts of `exp`. `config.exp` is
 *  not invoked on `exp`
 *
 * Each name `name_part` is transformed into `config.names(name_part)`.
 * Each expression `exp_part` is transformed into `config.exps(exp_part)`.
 * Each binding `bind_part` is transformed into `config.binds(bind_part)`.
 *
 * This only maps a single level deep, it does not traverse into parts of parts.
 * For example, it will not traverse into names or values inside of bindings,
 *  and will not traverse into names or values inside of sub-expressions.
 *
 * @template Name, Exp
 *
 * @param {{
 *  names: (name: Name) => Name,
 *  exps: (exp: Exp) => Exp,
 *  binds: (bind: { name: Name, value: Exp }) => { name: Name, value: Exp }
 * }} config
 * @param {Exp} exp
 * @returns {Exp}
 */
export function map_parts1(config, exp) {
  const { names, exps, binds } = config;
  switch (exp.$) {
    case 'literal':
      return exp;
    case 'var':
      return { ...exp, name: names(exp.name) };
    case 'set!':
      if (exp.k) {
        return {
          ...exp,
          name: names(exp.name),
          value: exps(exp.value),
          k: exps(exp.k),
        };
      }
      return { ...exp, name: names(exp.name), value: exps(exp.value) };
    case 'block':
      return { ...exp, subforms: exp.subforms.map(exps) };
    case 'call':
    case 'kcall':
      if (exp.arg_k) {
        return {
          ...exp,
          fn: exps(exp.fn),
          args: exp.args.map(exps),
          arg_h: exps(exp.arg_h),
          arg_k: exps(exp.arg_k),
        };
      }
      return { ...exp, fn: exps(exp.fn), args: exp.args.map(exps) };
    case 'if':
      return {
        ...exp,
        cond: exps(exp.cond),
        then: exps(exp.then),
        otherwise: exps(exp.otherwise),
      };
    case 'let':
    case 'let*':
    case 'klabels':
    case 'labels':
    case 'letrec*':
      return { ...exp, binds: exp.binds.map(binds), body: exps(exp.body) };
    case 'lambda':
    case 'klambda':
      return { ...exp, params: exp.params.map(names), body: exps(exp.body) };
    default:
      throw new UnknownNode(exp);
  }
}

/**
 * Transforms the subforms of `exp` via `fn(subform, ...args)`.
 * @param exp An expression
 * @param args Extra arguments for `fn`, in addition to the subform argument
 * @throws {UnknownNode} when `exp` is not a valid node type.
 */
export function map_subforms(fn, exp, ...args) {
  return map_parts1({
    names: name => name,
    exps: x => fn(x, ...args),
    binds: ({ value, ...rest }) => ({ ...rest, value: fn(value, ...args) }),
  }, exp)
}
