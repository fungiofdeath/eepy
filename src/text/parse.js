import { debug_repr } from '../utils/debug.js';

/// The following section should be temporary
/// URL: https://gist.github.com/DmitrySoshnikov/2a434dda67019a4a7c37
/// by Dmitry Soshnikov <dmitry.soshnikov@gmail.com>
/// MIT Style License, 2016

/**
 * Parses a recursive s-expression into
 * equivalent Array representation in JS.
 */
const SExpressionParser = {
  parse(expression) {
    this._expression = expression;
    this._cursor = 0;
    this._ast = [];

    return this._parseExpression();
  },

  /**
   * s-exp : atom
   *       | list
   */
  _parseExpression() {
    this._whitespace();

    if (this._expression[this._cursor] === '(') {
      return this._parseList();
    }

    return this._parseAtom();
  },

  /**
   * list : '(' list-entries ')'
   */
  _parseList() {
    // Allocate a new (sub-)list.
    this._ast.push([]);

    this._expect('(');
    this._parseListEntries();
    this._expect(')');

    return this._ast[0];
  },

  /**
   * list-entries : s-exp list-entries
   *              | ε
   */
  _parseListEntries() {
    this._whitespace();

    // ε
    if (this._expression[this._cursor] === ')') {
      return;
    }

    // s-exp list-entries

    let entry = this._parseExpression();

    if (entry !== '') {
      // Lists may contain nested sub-lists. In case we have parsed a nested
      // sub-list, it should be on top of the stack (see `_parseList` where we
      // allocate a list and push it onto the stack). In this case we don't
      // want to push the parsed entry to it (since it's itself), but instead
      // pop it, and push to previous (parent) entry.

      if (Array.isArray(entry)) {
        entry = this._ast.pop();
      }

      this._ast[this._ast.length - 1].push(entry);
    }

    return this._parseListEntries();
  },

  /**
   * atom : symbol
   *      | number
   */
  _parseAtom() {
    const terminator = /\s+|\)/;
    let atom = '';

    while (
      this._expression[this._cursor] &&
      !terminator.test(this._expression[this._cursor])
    ) {
      atom += this._expression[this._cursor];
      this._cursor++;
    }

    if (atom !== '' && !isNaN(atom)) {
      atom = Number(atom);
    }

    return atom;
  },

  _whitespace() {
    const ws = /^\s+/;
    while (
      this._expression[this._cursor] &&
      ws.test(this._expression[this._cursor])
    ) {
      this._cursor++;
    }
  },

  _expect(c) {
    if (this._expression[this._cursor] !== c) {
      throw new Error(
        `Unexpected token: ${this._expression[this._cursor]}, expected ${c}.`,
      );
    }
    this._cursor++;
  },
};

///
///
/// END SECTION
///
///

function convert_to_ast(sexp) {
  const rec = convert_to_ast;
  if (typeof sexp === 'boolean' || typeof sexp === 'number')
    return { $: 'literal', value: sexp };
  if (!sexp) return { $: 'literal', value: null };
  if (typeof sexp === 'string') return { $: 'var', name: sexp };
  if (!Array.isArray(sexp)) throw new Error(`Invalid sexp ${debug_repr(sexp)}`);
  if (sexp.length === 0) return rec(null);
  const type = sexp[0];
  switch (type) {
    case 'set!':
      if (sexp.length !== 3)
        throw new Error(`Invalid set! ${debug_repr(sexp)}`);
      return { $: 'set!', name: sexp[1], value: rec(sexp[2]) };
    case 'block':
    case 'begin':
      if (sexp.length === 1)
        throw new Error(`Invalid block ${debug_repr(sexp)}`);
      return { $: 'block', subforms: sexp.slice(1).map(rec) };
    case 'if':
      if (sexp.length < 3 || sexp.length > 4)
        throw new Error(`Invalid if ${debug_repr(sexp)}`);
      return {
        $: 'if',
        cond: rec(sexp[1]),
        then: rec(sexp[2]),
        otherwise: rec(sexp[3]),
      };
    case 'let':
    case 'let*':
    case 'letrec*': {
      const bindings = sexp[1];
      const body = sexp.slice(2);
      if (!Array.isArray(bindings))
        throw new Error(`Invalid ${type} bindings ${debug_repr(bindings)}`);
      const binds = bindings.map(bind => {
        if (typeof bind === 'string') return { name: bind, value: rec(null) };
        if (!Array.isArray(bind) || bind.length !== 2)
          throw new Error(`Invalid ${type} binding ${debug_repr(bind)}`);
        const [name, value] = bind;
        return { name, value: rec(value) };
      });
      return { $: type, binds, body: rec(['block', ...body]) };
    }
    case 'labels': {
      const bindings = sexp[1];
      const body = sexp.slice(2);
      if (!Array.isArray(bindings))
        throw new Error(`Invalid labels bindings ${debug_repr(bindings)}`);
      const binds = bindings.map(bind => {
        if (!Array.isArray(bind) || bind.length < 3)
          throw new Error(`Invalid labels binding ${debug_repr(bind)}`);
        const [name, params, ...body] = bind;
        return { name, value: rec(['lambda', params, ...body]) };
      });
      return { $: type, binds, body: rec(['block', ...body]) };
    }
    case 'lambda': {
      const parameters = sexp[1];
      const body = sexp.slice(2);
      if (!Array.isArray(parameters))
        throw new Error(`Invalid parameters ${debug_repr(parameters)}`);
      const params = parameters.map(param => {
        if (typeof param !== 'string' || !param)
          throw new Error(`Invalid parameter ${debug_repr(param)}`);
        return param;
      });
      return { $: 'lambda', params, body: rec(['block', ...body]) };
    }
    default:
      return { $: 'call', fn: rec(sexp[0]), args: sexp.slice(1).map(rec) };
  }
}

export function parse(code) {
  return convert_to_ast(SExpressionParser.parse(code));
}
