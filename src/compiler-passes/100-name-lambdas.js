/// <reference path="../types/expr.d.ts"/>
/// <reference path="../types/gensym.d.ts"/>

import { gensym } from '../utils/symbols.js';
import { map_subforms } from '../utils/visitors.js';

/**
 * @param {Exp} exp
 * @returns {Exp}
 */
export function name_lambdas(exp) {
  const lambdas = [];
  return bind_lambdas(lambdas, lift_lambdas(exp, lambdas));
}

/**
 * @param {Expr} exp
 * @param {Bind[]} to
 */
function lift_lambdas(exp, to = []) {
  switch (exp.$) {
    default:
      return map_subforms(lift_lambdas, exp, to);
    case 'lambda': {
      const new_exp = bind_body(exp);
      const name = gensym('named-lambda');
      to.push({
        name,
        value: new_exp,
        span: exp.span,
      });
      return { $: 'var', name, span: exp.span };
    }
    // Binders serve as delimiters for lambdas
    case 'let':
    case 'labels': {
      const binds = exp.binds.map(({ value, ...rest }) => {
        const new_value =
          value.$ === 'lambda' // always true for labels
            ? bind_body(value)
            : lift_lambdas(value, to);
        return { ...rest, value: new_value };
      });
      return bind_body({ ...exp, binds });
    }
    case 'let*':
    case 'letrec*': {
      const binds = exp.binds.flatMap(({ value, ...rest }) => {
        const lambdas = [];
        const new_value =
          value.$ === 'lambda'
            ? bind_body(value)
            : lift_lambdas(value, lambdas);
        return [...lambdas, { ...rest, value: new_value }];
      });
      return bind_body({ ...exp, binds });
    }
  }
}

/**
 * @param {ExprLet | ExprLetStar | ExprLetrec | ExprLabels | ExprLambda} exp
 * @returns {Expr}
 */
function bind_body(exp) {
  const body_lambdas = [];
  const body = lift_lambdas(exp.body, body_lambdas);
  return { ...exp, body: bind_lambdas(body_lambdas, body) };
}

/**
 * @param {Bind[]} lambdas
 * @param {Expr} body
 * @returns {Expr}
 */
function bind_lambdas(lambdas, body) {
  if (lambdas.length === 0) return body;
  return {
    $: 'let',
    binds: lambdas,
    body,
    span: body.span,
  };
}
