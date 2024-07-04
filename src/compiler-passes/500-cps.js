/**
 * @file Continuation Passing Style Transform
 * This pass transforms each node into continuation-passing style.
 * It follows this couple of resources:
 *  1. https://doi.org/10.1145/1291151.1291179
 *  2. https://matt.might.net/articles/cps-conversion/
 *
 * To actually follow the algorithm, there's a couple concepts to note:
 *  - We want to avoid needless eta expansions, and we want to make sure that
 *    all code invoking continuations is fully reduced.
 *    Any failures of this are known as "administrative redexes".
 *  - Continuations come in two forms:
 *     - named continuations: these continuations are represented by a symbol
 *     - hole continuations: these are basically meta-continuations that result
 *       in an expressions
 *    The reason hole continuations are used are as an optimization. To reduce
 *    an administrative redex, we need to replace the continuation's
 *    (represented as a lambda, since its administrative) parameter with the
 *    arguments of the redex. However, this may require digging deep into
 *    the body of the lambda. To simplify things, we use a higher-order abstract
 *    syntax to represent the lambda (basically, instead of a object lambda we
 *    use a lambda in the meta language).
 *  - Continuations can have a desired name, which occurs whenever the
 *    continuation is bound to a name in the original source.
 *
 * This pass also uses an idea from this to convert the meta-CPSed code from (1)
 * into something closer to direct style:
 *  - https://gist.github.com/yelouafi/44f5ed9bcdd1100b1902bcdb80aa32da
 * This is used to turn the creation of HOAS terms into an effect, so that we
 * can avoid excessive recursion.
 */

/// <reference path="../types/expr.d.ts"/>

import { debug_repr } from '../utils/debug.js';
import { InvalidNode, UnknownNode } from '../utils/errors.js';
import { gensym, is_name, concat_hints } from '../utils/symbols.js';

/**
 * @param {Expr} exp
 * @returns {Expr}
 */
export function start_cps(exp) {
  return cps(exp, '#%empty-handlers', '#%finish');
}

/**
 * @param {Expr} exp
 * @param {Name} h
 * @param {Name | Function} k
 * @param {Name} desired_name
 */
function* _cps(exp, h, k, desired_name=undefined) {
  switch (exp.$) {
    case 'literal':
    case 'var':
      return apply_continuation(k, exp);
    case 'lambda': {
      const param_h = gensym('handlers-continuation');
      const param_k = gensym('return-continuation');
      const body = cps(exp.body, param_h, param_k);
      return apply_continuation(k, { ...exp, param_k, param_h, body });
    }
    case 'set!': {
      const kwrap = yield wrap("set!", k, desired_name);
      const value = yield eval_intermediate(exp.value, h);
      return { ...exp, value, k: kwrap, };
    }
    case 'block': {
      if (exp.subforms.length === 0) {
        return apply_continuation(k, { $: 'literal', value: null });
      }
      for (let i = 0; i < exp.subforms.length - 1; ++i) {
        yield eval_intermediate(exp.subforms[i], h);
      }
      return cps(exp.subforms[exp.subforms.length - 1], h, k, desired_name);
    }
    case 'call': {
      const fn = yield eval_intermediate(exp.fn, h);
      const args = [];
      for (const arg of exp.args) {
        const converted_arg = yield eval_intermediate(arg, h);
        args.push(converted_arg);
      }
      return {
        ...exp,
        fn,
        args,
        arg_h: { $: 'var', name: h },
        arg_k: reify_continuation(concat_hints('call-', fn.name), k, desired_name),
      };
    }
    case 'if': {
      const kjoin = yield wrap('if', k, desired_name);
      const cond = yield eval_intermediate(exp.cond, h);
      return {
        ...exp,
        cond: cond,
        then: cps(exp.then, h, kjoin),
        otherwise: cps(exp.otherwise, h, kjoin),
      };
    }
    case 'let':
    case 'labels': {
      const binds = [];
      for (const bind of exp.binds) {
        const value = yield eval_intermediate(bind.value, h, bind.name);
        if (value.name === bind.name) continue;
        binds.push({ ...bind, value });
      }
      const body = cps(exp.body, h, k);
      if (binds.length === 0) return body;
      return { ...exp, binds, body };
    }
    case 'let*':
      // This is not added because its not currently needed, but its
      // definitely implementable.
      //
      // fallthrough
    case 'letrec*':
      throw new InvalidNode(exp, 'cps');
    default:
      throw new UnknownNode(exp);
  }
}

function cps(exp, h, k, desired_name=undefined) {
  return driver(_cps(exp, h, k, desired_name), undefined, x => x);
}

/**
 * Applies a continuation `k` to `args`.
 * Works for both named continuations and hole continuations.
 *
 * @param k a continuation
 * @param args a list of atoms
 * @returns the result of applying `k` to `args`
 */
function apply_continuation(k, ...args) {
  if (is_name(k)) {
    return { $: 'kcall', fn: { $: 'var', name: k }, args: [...args] };
  } else if (typeof k === 'function') {
    return k(...args);
  } else {
    throw new Error(`IERR ${debug_repr(k)} is not a continuation`);
  }
}

/**
 * Reifies `k` into an expression that may be used in expression continuation
 * positions. `k` may be a named or hole continuation.
 *
 * @param type hint used in the constructed lambda's parameter
 * @param k a continuation
 * @returns a continuation expression that references k
 */
function reify_continuation(type, k, desired_name=undefined) {
  if (is_name(k)) {
    return { $: 'var', name: k };
  } else if (typeof k === 'function') {
    const result = desired_name || gensym(concat_hints(type, '-result'));
    return {
      $: 'klambda',
      params: [result],
      body: k({ $: 'var', name: result }),
    };
  } else {
    throw new Error(`IERR ${debug_repr(k)} is not a continuation`);
  }
}

/**
 * Used to convert the meta-CPS into more of a direct-style.
 *
 * This may only be used with CPS as the effects may be defunctionalized.
 *
 * @see https://gist.github.com/yelouafi/bbc559aef92f00d9682b8d0531a36503
 */
function driver(generator, arg, then) {
  const { done, value } = generator.next(arg);
  if (done) return then(value);
  if (typeof value !== 'function') {
    throw new Error(`IERR ${value} is not a function`);
  }
  return value(function driver_step(result) {
    return driver(generator, result, then);
  });
}

/**
 * An intermediate evaluation effect, used to tell the driver to invoke `exp`
 * using this effect's continuation as `exp`s continuation.
 *
 * Warning: This should not be used for the final evaluation, as that may leave
 * administrative redexes.
 *
 * @param exp any expression
 * @param h a handler name
 * @returns an atom representing the result of evaluating `exp`
 */
function eval_intermediate(exp, h, desired_name=undefined) {
  return function evaluate(cc) {
    return cps(exp, h, cc, desired_name);
  };
}

/**
 * A join effect, used to tell the driver to bind `k` to a name before
 * continuing, if it hasn't already been bound.
 *
 * @param {Name | String} name a hint used in generating the name of the newly-bound `k`.
 * @param {Name | Function} k a continuation to be bound to a name
 * @returns a continuation name that, if invoked, will invoke `k`
 */
function wrap(name, k, desired_name=undefined) {
  return function join(cc) {
    if (is_name(k)) {
      return cc(k);
    } else if (typeof k === 'function') {
      const join = gensym(concat_hints('join', name));
      return {
        $: 'klabels',
        binds: [
          {
            name: join,
            value: reify_continuation(name, k, desired_name),
          },
        ],
        body: cc(join),
      };
    }
  };
}
