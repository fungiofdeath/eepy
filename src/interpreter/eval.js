import { TypeError, UnknownNode } from '../utils/errors.js';
import { Env } from './environment.js';
import { Closure, EepyFunction, EepyLiteral, EepySymbol } from './types.js';

/**
 * @param {Env} env
 * @param exp
 */
export function evaluate(env, exp) {
  const recur = x => evaluate(env, x);
  switch (exp.$) {
    case 'literal':
      return new EepyLiteral(exp.value);
    case 'var':
      return env.get(exp.name);
    case 'set!':
      return env.set(exp.name, recur(exp.value));
    case 'block': {
      let last = EepySymbol.nil;
      for (const subform of exp.subforms) {
        last = recur(subform);
      }
      return last;
    }
    case 'call': {
      const fn = recur(exp.fn);
      const args = exp.args.map(recur);
      if (fn instanceof EepyFunction) {
        return fn.apply(args);
      }
      throw new TypeError('Function', fn.constructor.name, exp);
    }
    case 'if': {
      const condition = recur(exp.cond);
      if (condition === EepySymbol.nil) {
        return recur(exp.otherwise);
      }
      return recur(exp.then);
    }
    case 'let': {
      const inner = new Env(env);
      for (const bind of exp.binds) {
        inner.bind(bind.name, recur(bind.value));
      }
      return evaluate(inner, exp.body);
    }
    case 'let*': {
      let current = env;
      for (const bind of exp.binds) {
        current = new Env(current);
        current.bind(bind.name, evaluate(current, bind.value));
      }
      return evaluate(current, exp.body);
    }
    case 'labels': {
      const inner = new Env(env);
      for (const bind of exp.binds) {
        inner.bind(bind.name, evaluate(inner, bind.value));
      }
      return evaluate(inner, exp.body);
    }
    case 'letrec*': {
      const inner = new Env(env);
      // bind lamdbas first
      for (const bind of exp.binds) {
        if (bind.value.$ === 'lambda') {
          inner.bind(bind.name, evaluate(inner, bind.value));
        }
      }
      // run remaining bindings
      for (const bind of exp.binds) {
        if (bind.value.$ !== 'lambda') {
          inner.bind(bind.name, evaluate(inner, bind.value));
        }
      }
      return evaluate(current, exp.body);
    }
    case 'lambda':
      return new Closure(env, exp.params, exp.body);
    default:
      throw new UnknownNode(exp);
  }
}
