import { debug_repr } from '../utils/debug.js';
import { Todo, UnknownNode, WrongNodeType } from '../utils/errors.js';

function name_of(exp, form) {
  if (exp.$ !== 'atom') {
    throw new WrongNodeType(exp, 'atom', form);
  }
  return exp.name;
}

function nil(span) {
  return { $: 'var', name: 'nil', span };
}

function convert_quoted(exp) {
  const atom = name => ({ $: 'atom', name });
  const list = (...items) =>
    items.length === 0
      ? atom('nil')
      : { $: 'list', items: items.map(convert_quoted) };
  switch (exp.$) {
    case 'string':
      return exp.value;
    case 'number':
      return Number.parseFloat(exp.value);
    case 'quote':
      return list(atom('quote'), exp.exp);
    case 'atom':
      return atom(exp.name);
    case 'record':
      return list(atom('record'), ...exp.items);
    case 'infix':
      return list(atom('infix'), ...exp.items);
    case 'list':
      return list(...exp.items);
    default:
      throw UnknownNode(exp);
  }
}

export function parse_tree_to_ast(exp) {
  const rec = x => parse_tree_to_ast(x);
  const rec_null = (x, default_span) => (!x ? nil(default_span) : rec(x));
  const rec_block = items => {
    if (items.length === 0) {
      throw new Error('Internal error: block had 0 items');
    } else if (items.length === 1) {
      return rec(items[0]);
    } else {
      return {
        $: 'block',
        subforms: items.map(rec),
        span: [items[0].span[0], items[items.length - 1].span[1]],
      };
    }
  };
  switch (exp.$) {
    case 'string':
      return { ...exp, $: 'literal' };
    case 'number':
      return { ...exp, $: 'literal', value: Number.parseFloat(exp.value) };
    case 'quote':
      return { $: 'literal', span: exp.span, value: convert_quoted(exp.exp) };
    case 'atom':
      return { ...exp, $: 'var' };
    case 'record':
      return {
        $: 'call',
        fn: { $: 'var', name: 'record', span: exp.span },
        args: exp.items.map(rec),
        span: exp.span,
      };
    case 'list': {
      if (exp.items.length === 0) {
        return nil(exp.span);
      }
      const fn = exp.items[0];
      const args = exp.items.slice(1);
      if (fn.$ === 'atom') {
        switch (fn.name) {
          case 'set!': {
            if (args.length !== 2) {
              throw new NodeError(
                `Invalid set!: Expected 2 arguments, got ${args
                  .map(debug_repr)
                  .join('; ')}`,
              );
            }
            return {
              $: 'set!',
              name: name_of(args[0], 'set!'),
              value: rec(args[1]),
              span: exp.span,
            };
          }
          case 'block': {
            if (args.length === 0) {
              return nil(exp.span);
            }
            return { $: 'block', subforms: args.map(rec), span: exp.span };
          }
          case 'if': {
            if (args.length < 2 || args.length > 3) {
              throw new NodeError(
                `Invalid if: Expected 1 or 2 arguments, got ${args
                  .map(debug_repr)
                  .join('; ')}`,
              );
            }
            return {
              $: 'if',
              cond: rec(args[0]),
              then: rec(args[1]),
              otherwise: rec_null(args[2], exp.span),
            };
          }
          case 'let':
          case 'let*':
          case 'letrec*': {
            if (args.length < 2) {
              throw new NodeError(
                `Invalid ${fn.name}: expected bindings and body, got ${args
                  .map(debug_repr)
                  .join('; ')}`,
              );
            }

            let binds;
            if (args[0].$ === 'atom' && args[0].name === 'nil') {
              binds = [];
            } else if (args[0].$ === 'list') {
              binds = args[0].items.map(bind => {
                if (bind.$ === 'atom') {
                  return { name: bind.name, value: nil(bind.span) };
                } else if (bind.$ === 'list') {
                  if (bind.items.length < 2) {
                    throw new NodeError(
                      `Invalid binding in ${
                        fn.name
                      }: expected name and value, got ${debug_repr(bind)}`,
                    );
                  } else {
                    return {
                      name: name_of(bind.items[0], fn.name),
                      value: rec_block(bind.items.slice(1)),
                      span: bind.span,
                    };
                  }
                } else {
                  throw new NodeError(
                    `Invalid binding in ${
                      fn.name
                    }: expected atom or list, got ${debug_repr(bind)}`,
                  );
                }
              });
            } else {
              throw new NodeError(
                `Invalid ${
                  fn.name
                }: bindings must be a list or nil, got ${debug_repr(args[0])}`,
              );
            }

            const body = rec_block(args.slice(1));
            return { $: fn.name, binds, body, span: exp.span };
          }
          case 'labels': {
            if (args.length < 2) {
              throw new NodeError(
                `Invalid labels: expected bindings and body, got ${args
                  .map(debug_repr)
                  .join('; ')}`,
              );
            }

            let binds;
            if (args[0].$ === 'atom' && args[0].name === 'nil') {
              binds = [];
            } else if (args[0].$ === 'list') {
              binds = args[0].items.map(bind => {
                if (bind.$ === 'list') {
                  if (bind.items.length < 3) {
                    throw new NodeError(
                      `Invalid binding in labels: expected name, parameters, and body, got ${debug_repr(
                        bind,
                      )}`,
                    );
                  } else {
                    let params;
                    if (
                      bind.items[1].$ === 'atom' &&
                      bind.items[1].name === 'nil'
                    ) {
                      params = [];
                    } else if (bind.items[1].$ === 'list') {
                      params = bind.items[1].items.map(item =>
                        name_of(item, 'labels'),
                      );
                    } else {
                      throw new NodeError(
                        `Invalid binding in labels: expected parameters list, got ${debug_repr(
                          bind.items[1],
                        )}`,
                      );
                    }
                    return {
                      name: name_of(bind.items[0], 'labels'),
                      value: {
                        $: 'lambda',
                        params,
                        span: bind.span,
                        body: rec_block(bind.items.slice(2)),
                      },
                      span: bind.span,
                    };
                  }
                } else {
                  throw new NodeError(
                    `Invalid binding in labels: expected list, got ${debug_repr(
                      bind,
                    )}`,
                  );
                }
              });
            } else {
              throw new NodeError(
                `Invalid labels: bindings must be a list or nil, got ${debug_repr(
                  args[0],
                )}`,
              );
            }

            const body = rec_block(args.slice(1));
            return { $: 'labels', binds, body, span: exp.span };
          }
          case 'lambda': {
            if (args.length < 2) {
              throw new NodeError(
                `Invalid lambda: expected parameters and body, got ${args
                  .map(debug_repr)
                  .join('; ')}`,
              );
            }

            let params;
            if (args[0].$ === 'atom' && args[0].name === 'nil') {
              params = [];
            } else if (args[0].$ === 'list') {
              params = args[0].items.map(param => name_of(param, 'lambda'));
            } else {
              throw new NodeError(
                `Invalid parameters list in lambda:, got ${debug_repr(
                  args[0],
                )}`,
              );
            }

            const body = rec_block(args.slice(1));
            return { $: 'lambda', params, body, span: exp.span };
          }
          default:
            return {
              $: 'call',
              fn: rec(fn),
              args: args.map(rec),
              span: exp.span,
            };
        }
      } else {
        return {
          $: 'call',
          fn: rec(fn),
          args: args.map(rec),
          span: exp.span,
        };
      }
    }
    case 'infix':
      throw new Todo(exp, 'sexp->ast');
    default:
      throw new UnknownNode(exp);
  }
}
