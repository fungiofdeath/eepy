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
 *
 * This pass also uses an idea from this to convert the meta-CPSed code from (1)
 * into something closer to direct style:
 *  - https://gist.github.com/yelouafi/44f5ed9bcdd1100b1902bcdb80aa32da
 * This is used to turn the creation of HOAS terms into an effect, so that we
 * can avoid excessive recursion.
 */

import { debug_repr } from '../utils/debug.js';
import { InvalidNode, UnknownNode } from '../utils/errors.js';
import { gensym, is_name, concat_hints } from '../utils/symbols.js';

export function start_cps(exp) {
  return cps(exp, '#%empty-handlers', '#%finish');
}

function* _cps(exp, h, k) {
  switch (exp.$) {
    case 'literal':
    case 'var':
      return apply_continuation(k, exp);
    case 'set!': {
      const value = yield eval_intermediate(exp.value, h);
      return {
        $: 'set!-then',
        name: exp.name,
        value,
        then: apply_continuation(k, value),
      };
    }
    case 'block': {
      if (exp.subforms.length === 0) {
        return apply_continuation(k, { $: 'literal', value: null });
      }
      for (let i = 0; i < exp.subforms.length - 1; ++i) {
        yield eval_intermediate(exp.subforms[i], h);
      }
      return cps(exp.subforms[exp.subforms.length - 1], h, k);
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
        arg_k: reify_continuation(concat_hints('call-', fn.name), k),
      };
    }
    case 'if': {
      const cond = yield eval_intermediate(exp.cond, h);
      const kjoin = yield wrap('if', k);
      return {
        ...exp,
        cond: cond,
        then: cps(exp.then, h, kjoin),
        otherwise: cps(exp.otherwise, h, kjoin),
      };
    }
    case 'let':
    case 'let*': {
      if (exp.binds.length === 0) return cps(exp.body, h, k);
      const params = [];
      const args = [];
      for (const bind of exp.binds) {
        const value = yield eval_intermediate(bind.value, h);
        params.push(bind.name);
        args.push(value);
      }
      const join = gensym(`join-${exp.$}`);
      return {
        $: 'klabels',
        binds: [
          {
            name: join,
            value: {
              $: 'klambda',
              params,
              body: cps(exp.body, h, k),
            },
          },
        ],
        body: apply_continuation(join, ...args),
      };
    }
    case 'labels': {
      if (exp.binds.length === 0) return cps(exp.body, h, k);
      const binds = [];
      for (const bind of exp.binds) {
        const converted = yield eval_intermediate(bind.value, h);
        binds.push({ ...bind, value: converted });
      }
      return {
        ...exp,
        binds,
        body: cps(exp.body, h, k),
      };
    }
    case 'lambda': {
      const param_h = gensym('handlers-continuation');
      const param_k = gensym('return-continuation');
      const body = cps(exp.body, param_h, param_k);
      return apply_continuation(k, { ...exp, param_k, param_h, body });
    }
    case 'letrec*':
      throw new InvalidNode(exp, 'cps');
    default:
      throw new UnknownNode(exp);
  }
}

function cps(exp, h, k) {
  return driver(_cps(exp, h, k), undefined, x => x);
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
function reify_continuation(type, k) {
  if (is_name(k)) {
    return { $: 'var', name: k };
  } else if (typeof k === 'function') {
    const result = gensym(concat_hints(type, '-result'));
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
function eval_intermediate(exp, h) {
  return function evaluate(cc) {
    return cps(exp, h, cc);
  };
}

/**
 * A join effect, used to tell the driver to bind `k` to a name before
 * continuing, if it hasn't already been bound.
 *
 * @param name a hint used in generating the name of the newly-bound `k`.
 * @param k a continuation to be bound to a name
 * @returns a continuation name that, if invoked, will invoke `k`
 */
function wrap(name, k) {
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
            value: reify_continuation(name, k),
          },
        ],
        body: cc(join),
      };
    }
  };
}