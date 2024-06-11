import { debug_repr } from '../utils/debug';
import { InvalidNode, Todo, UnknownNode } from '../utils/errors';
import { Sexp, ArrayPattern, IPattern, OrPattern } from '../utils/validate_transformer/patterns';

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
    case 'qatom':
      return env.resolve_symbol(sexp);
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
  return qatom(['core', name], span);
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
    if (sym1.path[i] !== sym2.path[i]) return false;
  }
  return true;
}

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
  else if (is('letrec*')) return convert_labels(args, sexp, env);
  else if (is('labels')) return convert_letrec(args, sexp, env);
  else if (is('lambda')) return convert_lambda(args, sexp, env);
  else return convert_call(fn, args, sexp, env);
}

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
  /**
   * Checks if an item is a sexp and an atom (qatom or simple atom).
   * This does not transform it.
   * @param {string} name prefix for the error
   * @returns {IPattern<any, Sexp, string>}
   */
  Atom: name =>
    Parse.Any()
      .compose(Sexp.Atom())
      .map_err(obj => `${name} must be a symbol, got a ${obj?.$}`),
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
        Parse.Any()
          .compose(
            new OrPattern([
              Parse.Atom('binding names'),
              Sexp.ListOf()
                .required(Parse.Atom('binding names'))
                .required(Parse.Any()),
            ]),
          )
          .map_err(
            sexp =>
              `binding must be a symbol or a (symbol expression) list, got ${debug_repr(
                sexp,
              )}`,
          ),
      )
      .required(Parse.Any())
      .rest(Parse.Any()),
};

function convert_set(args, sexp, env) {
  return Parse.Args()
    .required(Parse.ToAst(env, Parse.Atom('the name')))
    .required(Parse.ToAst(env))
    .try_match(args)
    .consume(
      ([name, value]) => ({ $: 'set!', name, value, span: sexp.span }),
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('set!', sexp, errors)),
    );
}

function convert_import(args, sexp, env) {
  return Parse.Args()
    .required(
      Parse.Atom('the import path').map_ok(path => env.load_module(path)),
    )
    .try_match(args)
    .consume(
      () => nil(sexp),
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('import', sexp, errors)),
    );
}

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
            const new_name = inner_env.bind(bind.items[0]);
            return { name: new_name, value, span: bind.span };
          } else if (bind.$ === 'atom' || bind.$ === 'qatom') {
            const value = nil(bind)
            const new_name = inner_env.bind(bind);
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
            inner_env = env.extend_env(true);
            const new_name = inner_env.bind(bind.items[0]);
            return { name: new_name, value, span: bind.span };
          } else if (bind.$ === 'atom' || bind.$ === 'qatom') {
            const value = nil(bind);
            inner_env = env.extend_env(true);
            const new_name = inner_env.bind(bind);
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
            new_bind_names.push(inner_env.bind(bind.items[0]));
            bind_values.push(bind.items[1]);
          } else if (bind.$ === 'qatom' || bind.$ === 'atom') {
            new_bind_names.push(inner_env.bind(bind));
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
          span: binds[idx].span,
        }));

        const new_body =
          body.length === 1
            ? sexp_to_ast(body[0], inner_env)
            : convert_block(body, sexp, inner_env);

        return {
          $: 'letrec',
          binds: new_binds,
          body: new_body,
          span: sexp.span,
        };
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('letrec', sexp, errors)),
    );
}

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
            new_bind_names.push(inner_env.bind(bind.items[0]));
            bind_lambdas.push(bind.slice(1));
          } else {
            // if this happens, Parse.LetPattern has a bug
            throw new Error(
              `IERR: Invalid binding after validation: ${debug_repr(bind)}`,
            );
          }
        }

        // pass 2: convert values
        const new_bind_values = bind_lambdas.map((lambda, idx) =>
          convert_lambda(lambda, binds[idx], inner_env),
        );

        // zip
        const new_binds = new_bind_names.map((name, idx) => ({
          name,
          value: new_bind_values[idx],
          span: binds[idx].span,
        }));

        const new_body =
          body.length === 1
            ? sexp_to_ast(body[0], inner_env)
            : convert_block(body, sexp, inner_env);

        return { $: 'labels', binds: new_binds, body: new_body, span: sexp.span };
      },
      errors =>
        error_wrap(sexp, env, collate_arrayish_errors('labels', sexp, errors)),
    );
}

function convert_lambda(args, sexp, env) {
  return Parse.Args()
    .required(Sexp.ListOf().rest(Parse.Atom('parameter names')))
    .required(Parse.Any())
    .rest(Parse.Any())
    .try_match(args)
    .consume(
      ([params, ...body]) => {
        const inner_env = env.extend_env(true);
        const new_params = params.map(param => inner_env.bind(param));
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
    )
}

class Env {
  constructor() {
    this.modules = null;
    this.global = null;
    this.locals = null;
    this.errors = [];
  }

  load_module = path => {};
  qualify_symbol = atom => {};
  resolve_symbol = atom => {};

  extend_env = (unique_binds = true) => {};
  alias_symbol = (atom, to) => {};
  bind = atom => {};
}

class ModuleLoader {}
class GlobalScope {}
class LocalScope {}
