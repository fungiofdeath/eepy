/**
 * @file Compile Letrecs
 * This pass converts `letrec*`s into an optimized form which only uses simpler
 * binding forms (let and labels). It tries to minimize `set!`s by computing
 * the dependency graph for each set of bindings, and then finding non-recursive,
 * non-mutating recursive, and mutating recursive variants.
 *
 * This optimization follows these two papers:
 *  - https://link.springer.com/article/10.1007/s10990-005-4878-3
 *  - https://legacy.cs.indiana.edu/~dyb/pubs/letrec-reloaded.pdf
 */

/// <reference path="../types/expr.d.ts"/>

import { free_variables } from '../utils/free-variables.js';
import { map_subforms } from '../utils/visitors.js';

/**
 * @param {Expr} exp
 * @returns {Expr}
 */
export function compile_letrec(exp) {
  exp = map_subforms(compile_letrec, exp);
  switch (exp.$) {
    default:
      return exp;
    case 'letrec*':
      const { binds, body } = exp;
      binds.forEach(bind => bind.free_vars = free_variables(bind.value));
      const complexp = bind => classify_binding(binds, bind) === 'complex';
      // maps names -> vertex objects. vertex objects contain the binding and
      // its index
      const lookup_vars = new Map(
        binds.map((b, i) => [b.name, { bind: b, at: i }]),
      );
      // adjacency matrix where edges[from][to] === 1 iff
      //  - `from` comes after `to` and both are complex
      //  - `from` uses `to` (i.e. `from` contains `to` in its free vars list)
      // otherwise 0
      const edges = initialize_square(binds.length);
      binds.forEach((bind, index) => {
        for (const fv of bind.free_vars) {
          const found = lookup_vars.get(fv);
          if (!found) continue;
          edges[index][lookup_vars.get(fv).at] = 1;
        }
        for (let before = 0; before < index; ++before) {
          if (complexp(bind) && complexp(binds[before])) {
            edges[index][before] = 1;
          }
        }
      });

      const vertices = [...lookup_vars].map(([_, v]) => v);
      const sccs = find_sccs(vertices, edges);
      return sccs.reduceRight(reduce_scc_to_ast(exp.span), body);
  }
}

function find_sccs(vertices, edges) {
  // Tarjan's SCC algorithm
  // @see: https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
  const connected_components = [];
  const stack = [];
  let tarjan_index = 0;

  for (const vertex of vertices) {
    if (vertex.index === undefined) {
      strong_connect(vertex);
    }
  }

  function strong_connect(vertex) {
    vertex.index = tarjan_index;
    vertex.lowlink = tarjan_index;
    tarjan_index += 1;
    stack.push(vertex);
    vertex.on_stack = true;

    edges[vertex.at].forEach((targetp, target_idx) => {
      if (targetp) {
        const target = vertices[target_idx];
        if (target.index === undefined) {
          strong_connect(target);
          vertex.lowlink = Math.min(vertex.lowlink, target.lowlink);
        } else if (target.on_stack) {
          vertex.lowlink = Math.min(vertex.lowlink, target.index);
        }
      }
    });

    if (vertex.index === vertex.lowlink) {
      const new_component = [];
      let current;
      do {
        current = stack.pop();
        current.on_stack = false;
        new_component.push(current);
      } while (current !== vertex);
      connected_components.push(new_component);
    }
  }

  return connected_components;
}

function reduce_scc_to_ast(span) {
  function empty_bind(name, span) {
    const nil = { $: 'literal', value: null, span };
    return { name, value: nil, free_vars: new Set() };
  }
  return function reducer(body, scc) {
    if (scc.length === 1) {
      const { bind } = scc[0];
      const { name, value, free_vars } = bind;
      // check if this is recursive
      if (!free_vars.has(name)) {
        // not recursive, so we can use a simple let-binding
        return { $: 'let', binds: [bind], body, span };
      } else if (value.$ === 'lambda' && !name.set) {
        // this is a recursive lambda, so we can use a `labels`
        return { $: 'labels', binds: [bind], body, span };
      } else {
        // we need to compile it into
        // | (let ((name nil))
        // |   (set! name val)
        // |   body)
        const set = { $: 'set!', name, value, span: bind.span };
        return {
          $: 'let',
          binds: [empty_bind(name, bind.span)],
          body: { $: 'block', subforms: [set, body], span },
          span,
        };
      }
    }
    // This are initially sparse. Bindings will be inserted in the same position
    //  as in the letrec.binds, and will later be "squished" to make them
    //  contiguous (non-sparse).
    // This is done to ensure that `set!`s occur in the correct order.
    let complex = [];
    // This isn't necessary for lambdas, since theyre not effectful.
    const lambdas = [];
    for (const { bind, at } of scc) {
      const { name, value } = bind;
      if (value.$ === 'lambda' && !name.set) {
        // since this lambda isnt mutated, we can use `labels`
        lambdas.push(bind);
      } else {
        // things here will use a predefined (let-bound) variable, and then
        // set! the variable to its correct value
        complex[at] = bind;
      }
    }
    // squish the array to remove empty elements
    complex = complex.filter(b => b);
    return {
      $: 'let',
      binds: complex.map(({ name, span }) => empty_bind(name, span)),
      body: {
        $: 'labels',
        binds: lambdas,
        body: {
          $: 'block',
          subforms: [
            ...complex.map(({ name, value, span }) => ({
              $: 'set!',
              name,
              value,
              span,
            })),
            body,
          ],
          span,
        },
        span,
      },
      span,
    };
  };
}

function simplep(exp) {
  switch (exp.$) {
    // we dont need to worry about lets, as they cant ever appear in a binding
    // due to the earlier combination step
    case 'literal':
    case 'var':
      return true;
    case 'block':
      return exp.subforms.every(simplep);
    case 'if':
      return simplep(exp.cond) && simplep(exp.then) && simplep(exp.otherwise);
    default:
      return false;
  }
}

function classify_binding(bindings, { name, value, free_vars }) {
  function disjoint_bindings(bindings, free_vars) {
    return !bindings.some(({ name }) => free_vars.has(name));
  }

  if (!name.used) return 'unreferenced';
  if (!name.set && value.$ === 'lambda') return 'lamdba';
  if (!name.set && simplep(value) && disjoint_bindings(bindings, free_vars))
    return 'simple';
  return 'complex';
}

function make_array(size, make_element) {
  const ret = new Array(size);
  for (let i = 0; i < size; ++i) {
    ret[i] = make_element(i);
  }
  return ret;
}

function initialize_square(size, starter = 0) {
  return make_array(size, () => make_array(size, () => starter));
}
