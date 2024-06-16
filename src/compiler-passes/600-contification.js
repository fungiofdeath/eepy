/// <reference path="../types/gensym.d.ts" />

import { find_sccs } from '../utils/scc.js';
import { gensym } from '../utils/symbols.js';
import { map_parts1, map_subforms } from '../utils/visitors.js';

// todo: [/] ensure that find_sccs does not mutate name objects. consider using
//       id wrappers
// todo: [/] make the continuation parameter to set! an expression as its not a
//       binding (convert all continuation references to expressions *or* names)
// todo: [/] inline tail call detection here instead of using a separate pass as
//       this makes the decoupling of passes easier
// todo: visit set! continuation when finding uses.
//       this is needed for the following:
// todo: add letcont bindings when functions are contifiable
// todo: consider adding a DAG visitor to preserve mutations
// todo: make letrec* use the new find_sccs
// // todo: clean up return values from analyze_labels. specifically,
// //       calls has a confusing type because `.from` should probably be something
// //       like `function_chain`
// // todo: rename analyze_labels because its also run on let
// // todo: make the big loop not suck
// // todo: filter recursive bindings from `called_from_binding`

class Continue {}

export function contify(exp) {
  exp = map_subforms(contify, exp);

  switch (exp.$) {
    case 'let':
    case 'labels':
      exp = contify_bindings(exp);
      return map_subforms(contify, exp);
    default:
      return exp;
  }
}

function find_tails(exp, k0, h0, tails = new Set()) {
  const rec = x => find_tails(x, k0, h0, tails);

  switch (exp.$) {
    case 'call':
      if (exp.arg_k.name === k0 && exp.arg_h.name === h0) {
        tails.add(exp.fn.name);
      }
    default:
      map_subforms(rec, exp);
  }

  return tails;
}

function collect_non_tails(
  exp,
  ktail,
  htail,
  ref,
  function_names,
  binding_name,
) {
  const rec = x =>
    collect_non_tails(x, ktail, htail, ref, function_names, binding_name);

  switch (exp.$) {
    case 'call':
      if (exp.arg_k.name === ktail && exp.arg_h.name === htail) return;
      if (!function_names.has(exp.fn.name)) return;
      if (ref.contents !== undefined) throw new Continue();

      ref.contents = [binding_name, exp.arg_k.name, exp.arg_h.name];
    default:
      map_subforms(rec, exp);
  }
}

function expStar(exp, map, param_k, k0, param_h, h0) {
  exp = map_parts1(
    {
      names: name => (name == param_k ? k0 : name == param_h ? h0 : name),
      exps: exp => expStar(exp, map, param_k, k0, param_h, h0),
      binds: ({ value, ...rest }) => ({
        ...rest,
        value: expStar(value, map, param_k, k0, param_h, h0),
      }),
    },
    exp,
  );

  switch (exp.$) {
    case 'call':
      const found = map.get(exp.fn.name);
      if (found) {
        return {
          $: 'kcall',
          fn: {
            $: 'var',
            name: found,
          },
          args: exp.args,
        };
      }
  }

  return exp;
}

function reachables(exp, set = new Set()) {
  const rec = x => reachables(x, set);

  switch (exp.$) {
    case 'labels':
    case 'klabels':
      reachables(exp.body, set);

      for (const bind of exp.binds) {
        if (!set.has(bind.name)) continue;

        reachables(bind.value, set);
      }
      break;
    default:
      map_parts1(
        {
          names: name => {
            set.add(name);
            return name;
          },
          exps: rec,
          binds: ({ name, value }) => {
            set.add(name);

            rec(value);
          },
        },
        exp,
      );
  }

  return set;
}

function sink(exp, k0, h0, f, state = { enclosing_exp: exp, done: false }) {
  if (k0 === null && h0 === null) return undefined;

  let saved_exp = exp;

  let run = false;
  switch (exp.$) {
    case 'klabels':
      for (const { name } of exp.binds) {
        if (name === k0) {
          run = true;

          k0 = null;
        }

        if (name === h0) {
          run = true;

          h0 = null;
        }
      }
    // fallthrough
    default:
      exp = map_subforms(sink, exp, k0, h0, f, state);
  }

  if (run && !state.done) {
    exp = { ...exp, body: f(exp.body) };

    state.done = true;
  } else if (saved_exp === state.enclosing_exp && !state.done) {
    exp = f(exp);

    state.done = true;
  }

  return exp;
}

function simplify_administrative_redex(exp, map = new Map()) {
  const rec = exp => simplify_administrative_redex(exp, map);

  switch (exp.$) {
    case 'klabels':
      for (const { name, value } of exp.binds) {
        if (value.$ !== 'klambda') continue;
        if (value.body.$ !== 'kcall') continue;

        map.set(name, value.body.fn.name);
      }
    default:
      exp = map_parts1(
        {
          names: name => map.get(name) ?? name,
          exps: exp => rec(exp),
          binds: ({ value, ...rest }) => ({
            ...rest,
            value: rec(value),
          }),
        },
        exp,
      );
  }
  return exp;
}

/**
 *
 * @param {*} exp
 * @returns
 */
function contify_bindings(exp) {
  /** @type {Gensym<string>[]} */
  const vertices = [];
  /** @type {Map<Gensym<string>, Set<Gensym<string>>>} */
  const edges = new Map();

  let modified = false;

  for (const { name, value } of exp.binds) {
    if (value.$ !== 'lambda') continue;

    const tails = find_tails(value.body, value.param_k, value.param_h);

    vertices.push(name);
    edges.set(name, tails);
  }

  const components = find_sccs(vertices, edges);

  for (const candidate_contifiable of components) {
    try {
      const ref = { contents: undefined };
      const candidate_contifiable_set = new Set(candidate_contifiable);

      for (const { name, value } of exp.binds) {
        if (value.$ !== 'lambda') continue;

        collect_non_tails(
          value.body,
          value.param_k,
          value.param_h,
          ref,
          candidate_contifiable_set,
          name,
        );
      }

      collect_non_tails(
        exp.body,
        exp.param_k,
        exp.param_h,
        ref,
        candidate_contifiable_set,
        null,
      );

      if (ref.contents === undefined) continue;

      modified = true;

      const [fname, k0, h0] = ref.contents;

      const map = new Map(
        candidate_contifiable.map(name => [name, gensym(name.name)]),
      );

      let enclosing_exp = exp;
      if (fname === null) {
        // RecCont
        exp = {
          ...exp,
          body: sink(exp.body, k0, h0, exp => ({
            $: 'klabels',
            binds: [...map.entries()].map(([fn, k]) => {
              const lambda = enclosing_exp.binds.find(
                bind => bind.name === fn,
              ).value;

              return {
                name: k,
                value: {
                  $: 'klambda',
                  params: lambda.params,
                  body: expStar(
                    lambda.body,
                    map,
                    lambda.param_k,
                    k0,
                    lambda.param_h,
                    h0,
                  ),
                },
              };
            }),
            body: expStar(exp, map, exp.param_k, k0, h0),
          })),
        };
      } else {
        exp = {
          ...exp,
          binds: exp.binds.map(bind => {
            if (bind.name === fname) {
              return {
                ...bind,
                value: sink(bind.value, k0, h0, exp => {
                  return {
                    $: 'klabels',
                    binds: [...map.entries()].map(([fn, k]) => {
                      const lambda = enclosing_exp.binds.find(
                        bind => bind.name === fn,
                      ).value;

                      return {
                        name: k,
                        value: {
                          $: 'klambda',
                          params: lambda.params,
                          body: expStar(
                            lambda.body,
                            map,
                            lambda.param_k,
                            k0,
                            lambda.param_h,
                            h0,
                          ),
                        },
                      };
                    }),
                    body: expStar(exp, map, bind.value.param_k, k0, h0),
                  };
                }),
              };
            }
            return bind;
          }),
        };
      }
    } catch (e) {
      if (e instanceof Continue) continue;
      throw e;
    }
  }

  // Simplify administrative redex
  exp = simplify_administrative_redex(exp);

  // DCE
  const reachable = reachables(exp);
  if (exp.binds.filter(bind => !reachable.has(bind.name)).length > 0) {
    modified = true;
  }
  exp = {
    ...exp,
    binds: exp.binds.filter(bind => reachable.has(bind.name)),
  };
  if (exp.binds.length === 0) {
    exp = exp.body;
  }

  if (modified) return contify_bindings(exp);

  return exp;
}
