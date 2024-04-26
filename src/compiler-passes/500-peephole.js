// Some peephole optimizations.

import { free_variables } from '../utils/free-variables.js';
import { map_subforms } from '../utils/visitors.js';

function subst(exp, mappings) {
  switch (exp.$) {
    default:
      map_subforms(subst, exp, mappings);
    case 'var':
      let value = mappings.get(exp.name);
      if (value) return value;
  }

  return exp;
}

function betaDCE(exp, env) {
  switch (exp.$) {
    default:
      return map_subforms(betaDCE, exp, env);
    case 'let': {
      env = env.derive();

      for (const { name, value } of exp.binds) {
        env.bind(name, value);
      }

      const body = betaDCE(exp.body, env);

      const binds = env.toBindings();

      if (binds.length === 0) {
        return body;
      }

      return {
        ...exp,
        binds,
        body,
      };
    }
    case 'labels': {
      const body = betaDCE(exp.body, env);

      const usages = free_variables(body);
      
      if (!exp.binds.some(({name}) => usages.has(name))) {
        return body;
      }

      return {...exp, body};
    }
    case 'call':
    case 'kcall': {
      let value = undefined;

      switch (exp.fn.$) {
        case 'var':
          if (exp.fn.name.set) break;

          value = env.use(exp.fn.name);
          break;
      }

      if (!value) return exp;

      const mappings = new Map();

      if (exp.args.length !== value.params.length) return exp;

      for (let i = 0; i < exp.args.length; i++) {
        mappings.set(value.params[i], exp.args[i]);
      }

      if (value.param_h) {
        mappings.set(value.param_h, exp.arg_h);
      }
      if (value.param_k) {
        mappings.set(value.param_k, exp.arg_k);
      }

      return subst(value.body, mappings);
    }
  }

  return exp;
}

export function peephole(exp) {
  let env = new Env();

  for (let i = 0; i < 100; i++) {
    exp = betaDCE(exp, env);
  }

  return exp;
}

class Env {
  constructor(parent) {
    this.parent = parent;
    this.bindings = new Map();
  }

  derive() {
    return new Env(this);
  }

  bind(name, value) {
    this.bindings.set(name, {
      value,
      uses: 0,
    });
  }

  use(name) {
    let env = this;

    for (; env; env = env.parent) {
      let binding = env.bindings.get(name);

      if (binding) {
        binding.uses++;
        return binding.value;
      }
    }
  }

  toBindings() {
    let bindings = [];

    for (const [name, { value, uses }] of this.bindings) {
      if (uses > 0) {
        bindings.push({ name, value });
      }
    }

    return bindings;
  }
}
