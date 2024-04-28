import { gensym } from "../utils/symbols.js";
import { map_subforms } from "../utils/visitors.js";

export function name_lambdas(exp) {
  const lambdas = [];
  return bind_lambdas(lambdas, lift_lambdas(exp, lambdas));
}

function lift_lambdas(exp, to=[]) {
  switch (exp.$) {
    default:
      return map_subforms(lift_lambdas, exp, to);
    case 'lambda':
      const new_exp = bind_body(exp);
      const name = gensym('named-lambda');
      to.push({ name, value: new_exp, span: exp.span, free_vars: exp.free_vars });
      return { $: 'var', name, span: exp.span };
    // Binders serve as delimiters for lambdas
    case 'let':
    case 'let*':
    case 'labels':
    case 'letrec*': {
      const binds = exp.binds.map(({ name, value, ...rest }) => {
        if (value.$ === 'lambda') {
          return { name, value: bind_body(value), ...rest };
        }
        const new_value = value.$ === 'lambda'
          ? bind_body(value)
          : lift_lambdas(value, to);
        return { name, value: new_value, ...rest };
      });
      return bind_body({ ...exp, binds });
    }
  }
}

function bind_body(exp) {
  const body_lambdas = [];
  const body = lift_lambdas(exp.body, body_lambdas);
  return { ...exp, body: bind_lambdas(body_lambdas, body) };
}

function bind_lambdas(lambdas, body) {
  if (lambdas.length === 0) return body;
  return {
    $: 'let',
    binds: lambdas,
    body,
  };
}
