import { map_subforms } from '../utils/visitors.js';

export function contify(exp) {
  const calls = new Map();
  const usages = new Map();
  const bindings = new Map();
  const defs = new Map();
  const sets = new Map();
  const dag = gather_data(exp, undefined, calls, usages, bindings, defs, sets);

  const vertices = [];
  const edges = [];

  for (const [_, bind] of bindings) {
    if (bind.value.$ !== 'lambda') continue;
    vertices.push(bind);
  }

  // const funargs = new Set();
  // const always_same_k = new Map();
  // for (const [name, call_exps] of calls.entries()) {
  //   for (const use of usages.get(name) ?? []) {
  //     if (
  //       use.parent.$ !== 'call' ||
  //       use.args.some(arg => arg.$ === 'var' && arg.name === name)
  //     ) {
  //       funargs.add(name);
  //     }
  //   }
  //   const k0 = call_exps[0].arg_k.name;
  //   const has_always_same_k = call_exps
  //     .slice(1)
  //     .every(call => call.arg_k.name === k0);
  //   if (has_always_same_k) {
  //     always_same_k.set(name, k0);
  //   }
  // }

  // console.dir(
  //   {
  //     calls: [...calls.entries()].map(([name, calls], idx) => ({
  //       idx,
  //       name,
  //       calls: calls.length,
  //     })),
  //   },
  //   { depth: 10 },
  // );
  // console.dir([...calls.entries()][27], { depth: 4 });
  // console.log('Contifying', always_same_k);
}

function add_to(map, name, value) {
  let found = map.get(name);
  if (!found) {
    found = [];
    map.set(name, found);
  }
  found.push(value);
}

function gather_data(
  exp,
  parent = () => {},
  parent_function = () => {},
  calls = new Map(),
  usages = new Map(),
  bindings = new Map(),
  defs = new Map(),
  sets = new Map(),
) {
  const dostuff = (x, is_parent_function = false) => {
    const nodes = [];
    const pfnodes = [];
    const set_parent = node => nodes.push(node);
    const set_parent_function = node => pfnodes.push(node);
    const mapped = map_subforms(
      gather_data,
      x,
      set_parent,
      is_parent_function ? set_parent_function : parent_function,
      calls,
      usages,
      bindings,
      sets,
    );
    ref.node = mapped;
    parent(mapped);
    parent_function(mapped);
    nodes.forEach(node => node.parent = mapped);
    pfnodes.forEach(node => node.parent_function = mapped);
    return dostuff;
  };
  const ref = {};
  exp = map_subforms(
    gather_data,
    exp,
    ref,
    parent_function,
    calls,
    usages,
    bindings,
    sets,
  );
  ref.node = exp;
  exp.parent = parent;
  exp.parent_function = parent_function;
  switch (exp.$) {
    case 'var':
      add_to(usages, exp.name, exp);
      return exp;
    case 'set!':
      add_to(sets, exp.name, exp);
      return exp;
    case 'call':
      add_to(calls, exp.fn.name, exp);
      return exp;
    case 'let':
    case 'labels':
    case 'klabels':
      exp.binds.forEach(bind => {
        add_to(bindings, bind.name, bind);
        add_to(defs, bind.name, exp);
        bind.parent = exp;
      });
      return exp;
    case 'lambda':
    case 'klambda':
      exp.params.forEach(param => {
        add_to(defs, param, exp);
      });
      return exp;
    case 'let*':
    case 'letrec*':
      throw new InvalidNode(exp, 'contification');
    default:
      return exp;
  }
}
