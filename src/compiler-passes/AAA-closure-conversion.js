/**
 * @file Closure Conversion and Lambda Lifting
 *
 * This pass does lambda lifting (where applicable). For functions which are
 * used in too-complicated a fashion to be lambda lifted, instead it converts
 * the function to a closure.
 */

/// <reference path="../types/expr.d.ts"/>

import { debug_repr } from '../utils/debug.js';
import { free_variables } from '../utils/free-variables.js';
import { concat_hints, gensym } from '../utils/symbols.js';
import { map_subforms } from '../utils/visitors.js';

/**
 * @param {Expr} exp
 * @param {Set<Name> | Map<Name>} globals
 */
export function lift(exp, globals) {
  const { functions, closures } = find_closures(exp, globals);

  const toplevel = [];

  /**
   * @param {Expr} exp
   * @param {Map<Name, ['replace' | 'attach-env', Name]>} substitutions
   */
  function inner(exp, substitutions = new Map()) {
    const rec = x => inner(x, substitutions);
    switch (exp.$) {
      case 'var': {
        const subst = substitutions.get(exp.name);
        if (subst?.[0] === 'replace') {
          return { $: 'var', name: subst[1] };
        } else if (subst?.[0] === 'attach-env') {
          const env_name = subst[1];
          return {
            $: 'env-var',
            env: env_name,
            name: exp.name,
          };
        }
        return exp;
      }
      case 'set!':
        const subst = substitutions.get(exp.name);
        if (subst?.[0]=== 'replace') {
          return {
            ...exp,
            name: subst[1],
            value: rec(exp.value),
          };
        } else if (subst?.[0] === 'attach-env') {
          const env_name = subst[1];
          return {
            ...exp,
            $: 'env-set!',
            env: env_name,
            name: exp.name,
            value: rec(exp.value),
          };
        }
        return map_subforms(rec, exp);
      case 'call':
        console.log('function call type', exp.fn.$);
        if (exp.fn.$ === 'var') {
          const captures = functions.get(exp.fn.name);
          console.log('  calling function', exp.fn.name);
          if (closures.has(exp.fn.name) || !(captures || globals.has(exp.fn.name))) {
            console.log('    funcall');
            // if this is a known closure, then the closure is already
            //  constructed, so we can just funcall.
            // or we're dealing with something that hasnt been
            //  obviously declared, so we're dealing with a function parameter.
            //  all function parameters must be closures, so we also funcall
            return {
              ...exp,
              $: 'funcall',
              fn: rec(exp.fn),
              args: exp.args.map(rec),
              arg_h: exp.arg_h && rec(exp.arg_h),
              arg_k: exp.arg_k && rec(exp.arg_k),
            };
          } else if (captures) {
            console.log('    declared function');
            // in this case, we have to prepend extra arguments for each
            // of the lambdas captures
            return {
              ...exp,
              args: [
                ...captures.map(name => ({ $: 'var', name })),
                ...exp.args.map(rec),
              ],
              arg_h: exp.arg_h && rec(exp.arg_h),
              arg_k: exp.arg_k && rec(exp.arg_k),
            }
          } else {
            console.log('    imported function');
            return {
              ...exp,
              args: exp.args.map(rec),
              arg_h: exp.arg_h && rec(exp.arg_h),
              arg_k: exp.arg_k && rec(exp.arg_k),
            };
          }
        }
        return map_subforms(rec, exp);
      case 'let':
      case 'let*':
      case 'labels':
      case 'letrec*': {
        const new_binds = exp.binds.flatMap(({ name, value }) => {
          const captures = functions.get(name);
          if (closures.has(name)) {
            console.log(name, 'is to be closure converted');
            const env_name = gensym('env');
            const new_substitutions = new Map(substitutions.entries());
            captures.forEach(name =>
              new_substitutions.set(name, ['attach-env', env_name]),
            );
            const lifted_lambda = {
              ...value,
              params: [env_name, ...value.params],
              body: inner(value.body, new_substitutions),
            };
            const lifted_name = gensym(concat_hints(name, '-lifted'));
            toplevel.push({ name: lifted_name, value: lifted_lambda });
            return [
              {
                name,
                value: {
                  $: 'make-closure',
                  fn: { $: 'var', name: lifted_name },
                  captures: captures.map(name => ({
                    name,
                    value: { $: 'var', name },
                  })),
                },
              },
            ];
          } else if (captures) {
            console.log(name, 'is to be lambda lifted');
            const new_names = captures.map(name => gensym(name));
            const new_substitutions = new Map(substitutions.entries());
            captures.forEach((name, idx) =>
              new_substitutions.set(name, ['replace', new_names[idx]]),
            );
            const lifted_lambda = {
              ...value,
              params: [...new_names, ...value.params],
              body: inner(value.body, new_substitutions),
            };
            toplevel.push({ name, value: lifted_lambda });
            return []; // drop this binding
          }
          return [{ name, value: rec(value) }];
        });

        const new_body = rec(exp.body);

        return new_binds.length === 0
          ? new_body
          : { ...exp, binds: new_binds, body: new_body };
      }
      default:
        return map_subforms(rec, exp);
    }
  }

  const body = inner(exp);

  return {
    $: 'labels',
    binds: toplevel,
    body,
  };
}

/**
 * Find all functions which must be closure converted
 */
function find_closures(exp, globals) {
  const functions = new Map();
  const closures = new Set();

  function inner(exp) {
    switch (exp.$) {
      case 'set!':
        inner(exp.value);
      // fallthrough
      case 'var':
        // pessimize dynamic usages
        if (functions.has(exp.name)) {
          console.log(exp.name, 'is a function');
          closures.add(exp.name);
        } else {
          console.log(exp.name, 'is not a function');
        }
        break;
      // we override lookup for calls, because we dont want function calls to
      // pessimize those functions, only dynamic usages
      case 'call':
        exp.args.forEach(inner);
        if (exp.arg_h) inner(exp.arg_h);
        if (exp.arg_k) inner(exp.arg_k);
        break;
      // find functions
      case 'let':
      case 'let*':
      case 'labels':
      case 'letrec*':
        for (const bind of exp.binds) {
          if (bind.value.$ === 'lambda') {
            console.log('finding captures for', bind.name);
            const frees = new Set();
            free_variables(bind.value, frees);
            functions.set(bind.name, [...frees]);
          }
        }
        for (const bind of exp.binds) {
          inner(bind.value);
        }
        inner(exp.body);
        break;
      default:
        map_subforms(inner, exp);
        break;
    }
  }

  inner(exp);
  
  for (const [name, frees] of functions) {
    console.log('function', name, ':');
    let i = 0;
    while (i < frees.length) {
      console.log('  free variable', frees[i]);
      if (
        (functions.has(frees[i]) && !closures.has(frees[i])) ||
        globals.has(frees[i])
      ) {
        frees.splice(i, 1);
      } else {
        console.log('    captured');
        i += 1;
      }
    }
  }

  for (const name of closures) {
    console.log('closure', name);
  }

  return { functions, closures };
}
