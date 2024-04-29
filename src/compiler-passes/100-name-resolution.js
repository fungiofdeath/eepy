import { DuplicateBinding } from '../utils/errors.js';
import { gensym } from '../utils/symbols.js';
import { map_subforms } from '../utils/visitors.js';

/**
 * @param exp
 * @param {Env} env
 */
export function resolve_names(exp, env) {
  const step = (step_exp = exp, step_env = env) =>
    map_subforms(resolve_names, step_exp, step_env);
  switch (exp.$) {
    default:
      return step();
    /// Lookups
    ///
    case 'var':
    case 'set!':
      return step({ ...exp, name: env.get(exp.name) });
    /// Bindings
    ///
    case 'let': {
      const let_env = env.new_scope();
      const new_binds = exp.binds.map(({ name, value, ...rest }) => {
        const new_name = let_env.bind(name);
        const value_env = let_env.new_scope();
        const new_value = resolve_names(value, value_env);
        return {
          ...rest,
          name: new_name,
          value: new_value,
        };
      });
      const body_env = let_env.new_scope();
      return {
        ...exp,
        binds: new_binds,
        body: resolve_names(exp.body, body_env),
      };
    }
    case 'let*': {
      const inner_env = env.new_scope();
      const new_binds = exp.binds.map(({ name, value, ...rest }) => {
        // we compute the new value first so that we dont accidentally use
        //  the current binding inside the value
        const value_env = inner_env.new_scope();
        const new_value = resolve_names(value, value_env);
        const new_name = inner_env.bind(name);
        return {
          ...rest,
          name: new_name,
          value: new_value,
        };
      });
      const body_env = inner_env.new_scope();
      return {
        ...exp,
        binds: new_binds,
        body: resolve_names(exp.body, body_env),
      };
    }
    case 'labels':
    case 'letrec*': {
      // "total" because its the scope for all binds and the body
      const total_env = env.new_scope();
      // we do 2 passes here to handle use-before-declaration
      // this is the lookup pass
      exp.binds.forEach(({ name }) => total_env.bind_unique(name));
      // replacement pass
      const new_binds = exp.binds.map(({ name, value, ...rest }) => {
        const new_name = total_env.bindings.get(name);
        const bind_env = total_env.new_scope();
        return {
          ...rest,
          name: new_name,
          value: resolve_names(value, bind_env),
        };
      });
      const body_env = total_env.new_scope();
      return {
        ...exp,
        binds: new_binds,
        body: resolve_names(exp.body, body_env),
      };
    }
    case 'lambda': {
      const lambda_env = env.new_scope();
      const new_params = exp.params.map(lambda_env.bind_unique);
      return {
        ...exp,
        params: new_params,
        body: resolve_names(exp.body, lambda_env),
      };
    }
  }
}

export class Env {
  /**
   * @param {Env | null} parent
   * @param {Globals} global_scope
   */
  constructor(parent, global_scope) {
    /** @type {Env | null} */
    this.parent = parent;
    /** @type {Globals} */
    this.global_scope = global_scope;
    /** @type {Map} */
    this.bindings = new Map();
  }

  new_scope = () => {
    return new Env(this, this.global_scope);
  };

  get = name => {
    let find_cursor = this;
    let has;
    while (find_cursor) {
      has = find_cursor.bindings.get(name);
      if (has) break;
      find_cursor = find_cursor.parent;
    }
    return has || this.global_scope.mark_undefined_var(name);
  };

  bind = name => {
    const new_name = gensym(name);
    this.bindings.set(name, new_name);
    return new_name;
  };

  bind_unique = name => {
    if (this.bindings.has(name)) {
      throw new DuplicateBinding(name);
    }
    return this.bind(name);
  };
}

export class Globals {
  constructor() {
    this.undefined_vars = new Map();
  }

  mark_undefined_var = name => {
    const found = this.undefined_vars.get(name);
    if (found) return found;
    const new_name = gensym(name);
    this.undefined_vars.set(name, new_name);
    return new_name;
  };
}
