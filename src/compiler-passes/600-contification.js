import { debug_repr } from '../utils/debug.js';
import { find_sccs } from '../utils/scc.js';
import { map_subforms } from '../utils/visitors.js';

// todo: ensure that find_sccs does not mutate name objects. consider using
//       id wrappers
// todo: clean up return values from analyze_labels. specifically,
//       calls has a confusing type because `.from` should probably be something
//       like `function_chain`
// todo: rename analyze_labels because its also run on let
// todo: make the big loop not suck
// todo: make letrec* use the new find_sccs
// todo: make the continuation parameter to set! an expression as its not a
//       binding
// todo: inline tail call detection here instead of using a separate pass as
//       this makes the decoupling of passes easier
// todo: visit set! continuation when finding uses.
//       this is needed for the following:
// todo: add letcont bindings when functions are contifiable
// todo: consider adding a DAG visitor to preserve mutations

export function contify(exp) {
  map_subforms(contify, exp);
  let finished = false;
  while (!finished) {
    switch (exp.$) {
      case 'let':
      case 'labels':
        finished = contify_bindings(exp);
        break;
      default:
        finished = true;
        break;
    }
  }
  return exp;
}

function contify_bindings(exp) {
  // these are the names of the bindings it creates
  // and all the calls to these functions
  const { bindings, functions, calls, references } = analyze_labels(exp);

  // inner edges representing tail calls between bindings
  const edges = new Map();
  for (const [target, called_by] of calls.entries()) {
    for (const { node, from: function_chain } of called_by) {
      if (node.tail_pos) {
        const fn = function_chain[0];
        edges.set(fn, edges.get(fn)?.add(target) ?? new Set([target]));
      }
    }
  }

  console.dir(
    [...calls.entries()].map(([name, froms]) => ({
      name,
      froms: froms.map(({ from }) => from),
    })),
    { depth: 5 },
  );
  console.log({ functions, edges });
  const tail_call_sccs = find_sccs(functions, edges);
  console.log({ functions, edges, tail_call_sccs });

  for (const scc of tail_call_sccs) {
    const contifiable = [];
    let called_from_binding = false;
    let called_from_body = false;

    let firstk, firsth;
    for (const f of scc) {
      const fcalls = calls.get(f) ?? [];
      if (
        fcalls.every(({ node, from }) => {
          const used_in_binding = from.find(name => functions.includes(name));
          if (used_in_binding) {
            called_from_binding = used_in_binding;
          } else {
            called_from_body = true;
          }

          if (scc.includes(from[0]) && node.tail_pos) {
            return true;
          } else if (firstk === undefined) {
            firstk = node.arg_k.name;
            firsth = node.arg_h.name;
            return true;
          } else {
            return firstk === node.arg_k.name && firsth === node.arg_h.name;
          }
        })
      ) {
        contifiable.push(f);
      }
    }

    //
    if (contifiable.length && called_from_binding) {
    } else if (contifiable.length && called_from_body) {
    }
    console.log({ contifiable, called_from_binding, called_from_body });
  }

  // eliminate dead code
  const dead_bindings = bindings.filter(name => !references.has(name));
  for (let i = 0; i < exp.binds.length; ++i) {
    if (dead_bindings.includes(exp.binds[i].name)) {
      exp.binds.splice(i, 1);
    }
  }

  // console.log('bindings', debug_repr(bindings));
  // console.log('references', debug_repr(references));
  console.dir({ sccs: tail_call_sccs, dead_bindings }, { depth: 5 });
  return dead_bindings.length === 0;
}

function analyze_labels(exp) {
  if (exp.$ !== 'labels' && exp.$ !== 'let') {
    throw new Error('IERR analyze_labels called with incorrect form: ' + exp.$);
  }

  const bindings = exp.binds.map(bind => bind.name);
  const functions = exp.binds.flatMap(bind =>
    bind.value.$ === 'lambda' ? [bind.name] : [],
  );
  const calls = new Map(); // function names -> { node from } list
  const references = new Map(); // variable name -> parent node list

  function iter(exp, function_chain = [], parent_node = undefined) {
    switch (exp.$) {
      case 'let':
      case 'labels':
        for (const bind of exp.binds) {
          if (bind.value.$ === 'lambda') {
            iter(bind.value, [bind.name, ...function_chain], exp);
          } else {
            iter(bind.value, function_chain, exp);
          }
        }
        iter(exp.body, function_chain, exp);
        break;
      case 'call':
        if (functions.includes(exp.fn.name)) {
          add_to(calls, exp.fn.name, { node: exp, from: function_chain });
        }
        map_subforms(iter, exp, function_chain, exp);
        break;
      case 'var':
      case 'set!':
        if (bindings.includes(exp.name)) {
          references.set(exp.name, parent_node);
        }
        break;
      default:
        map_subforms(iter, exp, function_chain, exp);
        break;
    }
  }
  iter(exp);

  return { bindings, functions, calls, references };
}

function add_to(map, name, value) {
  let found = map.get(name);
  if (!found) {
    found = [];
    map.set(name, found);
  }
  found.push(value);
}

