/// <reference path="../types/gensym.d.ts" />
/// <reference path="../types/parse-tree.d.ts" />
/// <reference path="../types/modules.d.ts"/>

import { Result } from '../utils/result.js';
import { Sexp, ArrayPattern, IPattern, OrPattern } from '../utils/patterns.js';
import { UnknownNode } from '../utils/errors.js';
import { debug_repr } from '../utils/debug.js';
import { ensure_loaded } from '../modules.js';
import { gensym } from '../utils/symbols.js';

export function sexp_to_ast(sexp, env = new Env()) {
  const recur = x => sexp_to_ast(x, env);
  switch (sexp.$) {
    case 'error':
      return sexp;
    case 'string':
    case 'number':
      return { $: 'literal', value: sexp, span: sexp.span };
    case 'quote':
      return { $: 'literal', value: sexp_to_data(sexp.exp), span: sexp.span };
    case 'atom':
    case 'qatom': {
      const resolved = env.resolve_symbol(sexp);
      return resolved.consume(
        name => ({ $: 'var', name }),
        err => error_wrap(sexp, env, new Error(err)),
      );
    }
    case 'infix':
      if (sexp.items.length === 0) {
        env.errors.push(
          new Error(`Infix nodes must contain an element: ${debug_repr(sexp)}`),
        );
        return { $: 'error', exp: sexp, span: sexp.span };
      }
      return apply(coreatom('infix', sexp.span), sexp.items, sexp, env);
    case 'record':
      return {
        $: 'call',
        fn: coreatom('record', sexp.span),
        args: sexp.items.map(recur),
        span: sexp.span,
      };
    case 'list':
      if (sexp.items.length === 0) {
        return nil(sexp);
      }
      return apply(sexp.items[0], sexp.items.slice(1), sexp, env);
    default:
      throw UnknownNode(sexp);
  }
}

const error_wrap = (sexp, env, error) => {
  env.errors.push(error);
  return { $: 'error', exp: sexp, span: sexp.span };
};

function coreatom(name, span) {
  return qatom(['sys', 'core', name], span);
}

function qatom(path, span) {
  return {
    $: 'qatom',
    path: path.map(name => ({ name, span })),
    span,
  };
}

function sexp_to_data(sexp) {
  switch (sexp.$) {
    case 'number':
    case 'string':
    case 'atom':
    case 'qatom':
    case 'error':
      return sexp;
    case 'quote':
      return sexp_to_tagged_list(sexp, 'quote', sexp.exp);
    case 'infix':
      return sexp_to_tagged_list(sexp, 'infix', ...sexp.items);
    case 'record':
      return sexp_to_tagged_list(sexp, 'record', sexp.items);
    case 'list':
      return {
        $: 'list',
        items: sexp.items.map(sexp_to_data),
        span: sexp.span,
      };
    default:
      throw new UnknownNode(sexp);
  }
}

function sexp_to_tagged_list(sexp, tag, ...items) {
  return {
    $: 'list',
    items: [coreatom(tag, sexp.span), ...items.map(sexp_to_data)],
    span: sexp.span,
  };
}

function identical_symbols_p(sym1, sym2) {
  if (sym1.$ !== 'atom' && sym1.$ !== 'qatom') {
    throw new Error(`Invalid Symbol ${debug_repr(sym1)}`);
  }
  if (sym2.$ !== 'atom' && sym2.$ !== 'qatom') {
    throw new Error(`Invalid Symbol ${debug_repr(sym2)}`);
  }

  if (sym1.$ === 'atom') {
    return sym2.$ === 'atom' && sym1.name === sym2.name;
  }
  // sym1.$ === 'qatom'
  if (sym2.$ !== 'qatom') return false;
  if (sym1.path.length !== sym2.path.length) return false;
  for (let i = 0; i < sym1.path.length; ++i) {
    if (sym1.path[i].name !== sym2.path[i].name) return false;
  }
  return true;
}

/**
 * @param {Sexp} fn
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function apply(fn, args, sexp, env) {
  if (fn.$ === 'atom') {
    fn = env.qualify_symbol(fn);
    // no return
  } else if (fn.$ !== 'qatom') {
    // fn.$ !== 'atom' | 'qatom'
    return convert_call(fn, args, sexp, env);
  }

  const is = tag => identical_symbols_p(fn, coreatom(tag));

  if (is('block')) return convert_block(args, sexp, env);
  else if (is('set!')) return convert_set(args, sexp, env);
  else if (is('import')) return convert_import(args, sexp, env);
  else if (is('if')) return convert_if(args, sexp, env);
  else if (is('let')) return convert_let(args, sexp, env);
  else if (is('let*')) return convert_letstar(args, sexp, env);
  else if (is('letrec*')) return convert_letrec(args, sexp, env);
  else if (is('labels')) return convert_labels(args, sexp, env);
  else if (is('lambda')) return convert_lambda(args, sexp, env);
  else return convert_call(fn, args, sexp, env);
}

/**
 * @param {Sexp} fn
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_call(fn, args, sexp, env) {
  return {
    $: 'call',
    fn: sexp_to_ast(fn, env),
    args: args.map(arg => sexp_to_ast(arg, env)),
    span: sexp.span,
  };
}

function nil(sexp) {
  return { $: 'literal', value: coreatom('nil', sexp), span: sexp.span };
}

function convert_block(args, sexp, env) {
  if (args.length === 0) {
    return nil(sexp);
  }
  return {
    $: 'block',
    subforms: args.map(arg => sexp_to_ast(arg, env)),
    span: sexp.span,
  };
}

/** @returns {string} not really but it makes the types cuter */
function invalid_sexpr(sexp) {
  throw new Error(`IERR Invalid s-expression ${debug_repr(sexp)}`);
}

/**
 * @template O
 * @param {Sexp} sexp
 * @param {{
 *  not_a_sexp?: boolean,
 *  wrong_sexp?: boolean,
 *  too_many_items?: boolean,
 *  too_few_items?: boolean,
 *  results: Result<O, string>[],
 * }} errors
 * @return {string}
 */
function collate_arrayish_errors(name, sexp, errors) {
  if (errors.not_a_sexp) {
    return invalid_sexpr(sexp);
  } else if (errors.not_a_sexp) {
    return `Expected a list for ${name}, got a ${sexp.$}.`;
  }

  // Continuable errors
  const collated = [];

  if (errors.too_many_items) {
    collated.push(`too many arguments provided`);
  }
  if (errors.too_few_items) {
    collated.push(`some arguments are missing`);
  }
  for (const result of errors.results) {
    if (!result.ok) {
      collated.push(result.assert_err());
    }
  }

  if (collated.length === 0) {
    throw new Error(
      `IERR: Invalid list error: ${debug_repr(
        errors,
      )} for ${name} in ${debug_repr(sexp)}`,
    );
  } else if (errors.length === 1) {
    return `Error in ${name}: ${collated[0]}`;
  } else {
    let string = `${name} has the following problems:`;
    for (const err of collated) {
      string += `\n\t${err}`;
    }
    return string;
  }
}

const Parse = {
  /**
   * Constructs a pattern that checks that an item is a sexp, and if it isnt
   * provides a default error.
   * @returns {IPattern<any, Sexp, string>}
   */
  Any: () => Sexp.Any().map_err(invalid_sexpr),
  Composed: (type_error, next_pattern) =>
    Parse.Any()
      .compose(next_pattern)
      .map_err(obj => `${type_error}, got a ${debug_repr(obj)}`),
  /**
   * Checks if an item is a sexp and an atom (qatom or simple atom).
   * This does not transform it.
   * @param {string} name prefix for the error
   * @returns {IPattern<any, Sexp, string>}
   */
  Atom: name => Parse.Composed(`${name} must be a symbol`, Sexp.Atom()),
  /**
   * Checks if an item matches `pattern`, and if it does converts it into an ast
   * @template I
   * @param {Env} env
   * @param {IPattern<I, Sexp, string>} pattern
   * @returns {IPattern<I, Ast, string>}
   */
  ToAst: (env, pattern = Sexp.Any()) =>
    pattern.map_ok(sexp => sexp_to_ast(sexp, env)),
  /**
   * An array pattern dedicated for destructuring arguments lists
   * @type {<O>() => ArrayPattern<Sexp, O, string>}
   */
  Args: () => new ArrayPattern(),
  /**
   * For handling the shape of let, let*, and letrec*
   * @returns {IPattern<any, [Sexp[], ...Sexp[]], ArrayError<any, string>>}
   */
  LetPattern: () =>
    Parse.Args()
      .required(
        Sexp.ListOf().rest(
          Parse.Composed(
            'binding must be a symbol or (symbol expression) list',
            new OrPattern([
              Parse.Atom('lone binding names'),
              Sexp.ListOf()
                .required(Parse.Atom('binding names'))
                .required(Parse.Any()),
            ]),
          ),
        ),
      )
      .required(Parse.Any())
      .rest(Parse.Any()),
};

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_set(args, sexp, env) {
  return Parse.Args()
    .required(
      Parse.Atom('the name').flat_map(name =>
        env.resolve_symbol(name).map_err(err => error_wrap(sexp, env, err)),
      ),
    )
    .required(Parse.ToAst(env))
    .try_match(args)
    .consume(
      ([name, value]) => ({ $: 'set!', name, value, span: sexp.span }),
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('set!', sexp, errors)),
    );
}

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_import(args, sexp, env) {
  const ImportList = Sexp.ListOf().rest(
    Parse.Composed('imported name must be an unqualified atom', Sexp.SAtom()),
  );
  return Parse.Args()
    .required(ImportList)
    .required(
      Parse.Composed(
        'import path must be a module descriptor',
        Sexp.String().or(Sexp.Atom()),
      ),
    )
    .try_match(args)
    .consume(
      ([imports, path]) => {
        const mod = env.import_module(path);
        if (!mod) {
          return error_wrap(
            sexp,
            env,
            new Error(`Invalid module ${path.value}`),
          );
        }
        for (const sym of imports) {
          env.add_import_symbol(sym, mod);
        }
        return nil(sexp);
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('import', sexp, errors)),
    );
}

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_if(args, sexp, env) {
  return Parse.Args()
    .required(Parse.ToAst(env))
    .required(Parse.ToAst(env))
    .optional(Parse.ToAst(env))
    .try_match(args)
    .consume(
      ([cond, then, otherwise]) => ({
        $: 'if',
        cond,
        then,
        otherwise: otherwise || nil(args[2]),
      }),
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('if', sexp, errors)),
    );
}

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_let(args, sexp, env) {
  return Parse.LetPattern()
    .try_match(args)
    .consume(
      () => {
        const inner_env = env.extend_env(true);
        const binds = args[0];
        const body = args.slice(1);

        const new_binds = binds.items.map(bind => {
          if (bind.$ === 'list') {
            const value = sexp_to_ast(bind.items[1], env);
            const name_result = inner_env.bind(bind.items[0]);
            if (!name_result.ok)
              return error_wrap(sexp, env, name_result.assert_err());
            const new_name = name_result.assert_ok();
            return { name: new_name, value, span: bind.span };
          } else if (bind.$ === 'atom' || bind.$ === 'qatom') {
            const value = nil(bind);
            const name_result = inner_env.bind(bind);
            if (!name_result.ok)
              return error_wrap(sexp, env, name_result.assert_err());
            const new_name = name_result.assert_ok();
            return { name: new_name, value, span: bind.span };
          } else {
            // if this happens, Parse.LetPattern has a bug
            throw new Error(
              `IERR: Invalid binding after validation: ${debug_repr(bind)}`,
            );
          }
        });

        const new_body =
          body.length === 1
            ? sexp_to_ast(body[0], inner_env)
            : convert_block(body, sexp, inner_env);

        return { $: 'let', binds: new_binds, body: new_body, span: sexp.span };
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('let', sexp, errors)),
    );
}

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_letstar(args, sexp, env) {
  return Parse.LetPattern()
    .try_match(args)
    .consume(
      () => {
        const binds = args[0];
        const body = args.slice(1);

        let inner_env = env;
        const new_binds = binds.items.map(bind => {
          if (bind.$ === 'list') {
            const value = sexp_to_ast(bind.items[1], inner_env);
            inner_env = inner_env.extend_env(true);
            const name_result = inner_env.bind(bind.items[0]);
            if (!name_result.ok)
              return error_wrap(sexp, env, name_result.assert_err());
            const new_name = name_result.assert_ok();
            return { name: new_name, value, span: bind.span };
          } else if (bind.$ === 'atom' || bind.$ === 'qatom') {
            const value = nil(bind);
            inner_env = inner_env.extend_env(true);
            const name_result = inner_env.bind(bind);
            if (!name_result.ok)
              return error_wrap(sexp, env, name_result.assert_err());
            const new_name = name_result.assert_ok();
            return { name: new_name, value, span: bind.span };
          } else {
            // if this happens, Parse.LetPattern has a bug
            throw new Error(
              `IERR: Invalid binding after validation: ${debug_repr(bind)}`,
            );
          }
        });

        const new_body =
          body.length === 1
            ? sexp_to_ast(body[0], inner_env)
            : convert_block(body, sexp, inner_env);

        return { $: 'let*', binds: new_binds, body: new_body, span: sexp.span };
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('let*', sexp, errors)),
    );
}

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_letrec(args, sexp, env) {
  return Parse.LetPattern()
    .try_match(args)
    .consume(
      () => {
        const binds = args[0];
        const body = args.slice(1);

        const inner_env = env.extend_env(true);

        // pass 1: find names
        const new_bind_names = [];
        const bind_values = [];
        for (const bind of binds.items) {
          if (bind.$ === 'list') {
            const new_name = inner_env.bind(bind.items[0]);
            if (!new_name.ok)
              return error_wrap(sexp, env, new_name.assert_err());
            new_bind_names.push(new_name.assert_ok());
            bind_values.push(bind.items[1]);
          } else if (bind.$ === 'qatom' || bind.$ === 'atom') {
            const new_name = inner_env.bind(bind);
            if (!new_name.ok)
              return error_wrap(sexp, env, new_name.assert_err());
            new_bind_names.push(new_name.assert_ok());
            bind_values.push(nil(bind));
          } else {
            // if this happens, Parse.LetPattern has a bug
            throw new Error(
              `IERR: Invalid binding after validation: ${debug_repr(bind)}`,
            );
          }
        }

        // pass 2: convert values
        const new_bind_values = bind_values.map(value =>
          sexp_to_ast(value, inner_env),
        );

        // zip
        const new_binds = new_bind_names.map((name, idx) => ({
          name,
          value: new_bind_values[idx],
          span: binds.items[idx].span,
        }));

        const new_body =
          body.length === 1
            ? sexp_to_ast(body[0], inner_env)
            : convert_block(body, sexp, inner_env);

        return {
          $: 'letrec*',
          binds: new_binds,
          body: new_body,
          span: sexp.span,
        };
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('letrec', sexp, errors)),
    );
}

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_labels(args, sexp, env) {
  return Parse.Args()
    .required(
      Sexp.ListOf().rest(
        Sexp.ListOf()
          .required(Parse.Atom('label names'))
          .required(Sexp.ListOf().rest(Parse.Atom('parameters')))
          .required(Parse.Any())
          .rest(Parse.Any()),
      ),
    )
    .required(Parse.Any())
    .rest(Parse.Any())
    .try_match(args)
    .consume(
      () => {
        const binds = args[0];
        const body = args.slice(1);

        const inner_env = env.extend_env(true);

        // pass 1: find names
        const new_bind_names = [];
        const bind_lambdas = [];
        for (const bind of binds.items) {
          if (bind.$ === 'list') {
            const new_name = inner_env.bind(bind.items[0]);
            if (!new_name.ok)
              return error_wrap(sexp, env, new_name.assert_err());
            new_bind_names.push(new_name.assert_ok());
            bind_lambdas.push(bind.items.slice(1));
          } else {
            // if this happens, Parse.LetPattern has a bug
            throw new Error(
              `IERR: Invalid binding after validation: ${debug_repr(bind)}`,
            );
          }
        }

        // pass 2: convert values
        const new_bind_values = bind_lambdas.map((lambda, idx) =>
          convert_lambda(lambda, binds.items[idx], inner_env),
        );

        // zip
        const new_binds = new_bind_names.map((name, idx) => ({
          name,
          value: new_bind_values[idx],
          span: binds.items[idx].span,
        }));

        const new_body =
          body.length === 1
            ? sexp_to_ast(body[0], inner_env)
            : convert_block(body, sexp, inner_env);

        return {
          $: 'labels',
          binds: new_binds,
          body: new_body,
          span: sexp.span,
        };
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('labels', sexp, errors)),
    );
}

/**
 * @param {Sexp[]} args
 * @param {SexpList} sexp
 * @param {Env} env
 */
function convert_lambda(args, sexp, env) {
  return Parse.Args()
    .required(Sexp.ListOf().rest(Parse.Atom('parameter names')))
    .required(Parse.Any())
    .rest(Parse.Any())
    .try_match(args)
    .consume(
      ([params, ...body]) => {
        const inner_env = env.extend_env(true);
        const new_params = [];
        for (const param of params) {
          const new_name = inner_env.bind(param);
          if (!new_name.ok) return error_wrap(sexp, env, new_name.assert_err())
          new_params.push(new_name.assert_ok());
        }
        const new_body =
          body.length === 1
            ? sexp_to_ast(body[0], inner_env)
            : convert_block(body, sexp, inner_env);

        return {
          $: 'lambda',
          params: new_params,
          body: new_body,
          span: sexp.span,
        };
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('lambda', sexp, errors)),
    );
}

/**
 * @typedef {{
 *  module: Module,
 *  item: ModuleItem,
 *  import_name: SexpSAtom,
 * }} ImportRecord
 */
export class Env {
  /** @type {(string | Error)[]} */
  errors;
  /** @type {Map<string, ImportRecord>} */
  imported;
  /** @type {LocalScope} */
  locals;

  constructor(errors = [], locals = new LocalScope(), imported = new Map()) {
    this.errors = errors;
    this.locals = locals;
    this.imported = imported;
  }

  /**
   * Load a module. If the module has already been loaded, do nothing.
   *
   * @param {string | SexpSAtom | SexpQAtom} path path to the module to load
   * @returns {Result<Module, string>} the module or an error message
   */
  import_module = path => {
    if (typeof path === 'string') {
      return ensure_loaded(path);
    } else if (path.$ === 'atom') {
      return ensure_loaded(path.name);
    } else if (path.$ === 'qatom') {
      return ensure_loaded(path.path.map(({ name }) => name));
    } else {
      throw new Error(`IERR Import path is not a string or atom, ${path}`);
    }
  };

  /**
   * Import a symbol from its parent module
   *
   * @param {SexpSAtom} symbol to be imported
   * @param {Module} mod parent module object
   * @returns {Result<Gensym<string>, string>}
   *  the new name of the symbol, or an error message
   */
  add_import_symbol = (symbol, mod) => {
    const found = this.imported.get(symbol.name);
    if (found) {
      return Result.Err(
        `Ambiguous import, ${symbol.name} has already been imported from '${found.module.normalized_path}'`,
      );
    }

    const item = mod.items.get(symbol.name);
    if (!item) {
      throw new Error(
        `IERR symbol ${symbol.name} does not belong to module (${mod.normalized_path}) its being imported with`,
      );
    }

    const record = { module: mod, item, import_name: symbol };
    this.imported.set(symbol.name, record);

    return item.name;
  };

  /**
   * Attach module information to a symbol if possible. If not, return the
   * original symbol
   *
   * @param {SexpSAtom | SexpQAtom} atom
   * @returns {SexpSAtom | SexpQAtom}
   */
  qualify_symbol = atom => {
    if (atom.$ === 'qatom') {
      return atom;
    }
    // If the symbol is local, it has no associated module data
    const found_local = this.locals.lookup(atom.name);
    if (found_local) return atom;

    // If the symbol is imported, the module it was imported from is the
    // module data we're after.
    const found_imported = this.imported.get(atom.name);
    if (!found_imported) {
      return atom;
    }
    return {
      $: 'qatom',
      path: [
        ...found_imported.module.qualified_name.map(part => ({ name: part })),
        { name: atom.name },
      ],
    };
  };

  /**
   * Lookup the symbol's name object in the current scope.
   *
   * @param {SexpSAtom | SexpQAtom} atom
   * @returns {Result<Gensym<string>, string>}
   */
  resolve_symbol = atom => {
    if (atom.$ === 'qatom') {
      const modname = atom.path.slice(0, -1).map(({ name }) => name);
      const name = atom.path[atom.path.length-1].name;
      const mod_opt = ensure_loaded(modname);
      if (!mod_opt.ok) return mod_opt;
      const mod = mod_opt.assert_ok();
      const item = mod.items.get(name);
      if (!item) return Result.Err(`no symbol ${name} found in ${mod.normalized_path}`)
      return Result.Ok(item.name);
    } else {
      const found_local = this.locals.lookup(atom.name);
      if (found_local) return Result.Ok(found_local);
      const found_import = this.imported.get(atom.name);
      if (found_import) return Result.Ok(found_import.item.name);

      return Result.Err(`could not find symbol ${atom.name}`);
    }
  };

  /**
   * Bind an atom in the current local environment
   * @param {SexpSAtom | SexpQAtom} atom
   * @returns {Result<Gensym<string>, string>}
   *  the bound symbol's new name object, or an error message
   */
  bind = atom => {
    if (atom.$ === 'qatom') {
      return Result.Err(
        `qualified names may not be bound, got: ${atom.path
          .map(({ name }) => name)
          .join('.')}`,
      );
    }
    return this.locals.bind(atom.name);
  };

  /**
   * Extend the current envrionment to add an extra local environment
   */
  extend_env = () => {
    return new Env(this.errors, new LocalScope(this.locals), this.imported);
  };
}

class LocalScope {
  /** @type {LocalScope} */
  parent;
  /** @type {Map<string, Gensym<string>>} */
  bindings = new Map();

  constructor(parent = null) {
    this.parent = parent;
  }

  /**
   * @param {string} name
   */
  bind = name => {
    if (this.bindings.has(name))
      return Result.Err(`symbol may not be bound twice: ${name}`);
    const new_name = gensym(name);
    this.bindings.set(name, new_name);
    return Result.Ok(new_name);
  };

  /**
   * @param {string} name
   * @returns {Gensym<string> | undefined}
   */
  lookup = name => {
    const found = this.bindings.get(name);
    if (found) return found;
    return this.parent?.lookup(name);
  };
}
