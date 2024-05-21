import { map_subforms, map_parts1 } from "../utils/visitors.js";

export function find_tail_positions(exp, func, k) {
  const rec = x => find_tail_positions(x, func, k);
  switch (exp.$) {
    default:
      return map_subforms(rec, exp);
    case 'let':
    case 'labels': {
      const lambda_bind_value = (name, value) => {
        if (value.$ === 'lambda') {
          return find_tail_positions(value, name, value.param_k);
        }
        return rec(value);
      };
      return {
        ...exp,
        binds: exp.binds.map(({ name, value, ...rest }) => ({
          ...rest,
          name,
          value: lambda_bind_value(name, value),
        })),
        body: rec(exp.body),
      };
    }
    case 'call': {
      if (exp.arg_k?.$ === 'var' && exp.arg_k.name === k) {
        return { ...exp, tail_call: func };
      }
      return exp;
    }
    case 'kcall': {
      if (exp.fn.name === k) {
        return { ...exp, tail_call: func };
      }
      return exp;
    }
    case 'set!': {
      if (exp.k === k) {
        return { ...exp, tail_call: func };
      }
      return exp;
    }
  }
}
