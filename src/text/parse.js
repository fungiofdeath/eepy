/// <reference path="parse-tree.d.ts" />

/**
 * @param {string} text
 * @returns {Token[]}
 */
function* tokenize(text) {
  // Use /m to handle multiline strings
  // Use /g to use it as a lexer
  // Use /d to capture indices
  const lexer =
    /(?:;[^\n]*|'|"(?:[^"\\]|\\.)*"|[()\[\]{}]|[^\s"'()\[\]{};]+)/dgm;
  //   ^^^^^^^^    comments
  // quotation  ^
  // strings      ^^^^^^^^^^^^^^^^^
  // delimiters                     ^^^^^^^^^^
  // atoms (numbers & symbols)                 ^^^^^^^^^^^^^^^^^^
  let tok;
  while ((tok = lexer.exec(text)) !== null) {
    switch (tok[0][0]) {
      case '(':
        yield { $: 'lparen', text: tok[0], span: tok.indices[0] }
        break;
      case ')':
        yield { $: 'rparen', text: tok[0], span: tok.indices[0] };
        break;
      case '[':
        yield { $: 'lbracket', text: tok[0], span: tok.indices[0] };
        break;
      case ']':
        yield { $: 'rbracket', text: tok[0], span: tok.indices[0] };
        break;
      case '{':
        yield { $: 'lbrace', text: tok[0], span: tok.indices[0] };
        break;
      case '}':
        yield { $: 'rbrace', text: tok[0], span: tok.indices[0] };
        break;
      case "'":
        yield { $: 'quote', text: tok[0], span: tok.indices[0] };
        break;
      case ';':
        // discard comment tokens
        break;
      case '"':
        yield { $: 'string', text: tok[0], span: tok.indices[0] };
        break;
      default:
        yield { $: 'atom', text: tok[0], span: tok.indices[0] };
    }
  }
  return { $: 'eof', text: '', span: [text.length, text.length] };
}

/**
 * @param {Token} token
 */
function is_delimiter_open(token) {
  switch (token.$) {
    case 'lparen':
    case 'lbracket':
    case 'lbrace':
      return true;
    default:
      return false;
  }
}

/**
 * @param {Token} token
 */
function is_delimiter_close(token) {
  switch (token.$) {
    case 'rparen':
    case 'rbracket':
    case 'rbrace':
      return true;
    default:
      return false;
  }
}

/**
 * @param {Token} token
 */
function is_delimiter(token) {
  return is_delimiter_open(token) || is_delimiter_close(token);
}

/**
 * @param {Token} ltoken
 * @param {Token} rtoken
 */
function corresponding_delimiters(ltoken, rtoken) {
  if (
    ltoken.$ === 'lparen' &&
    rtoken.$ === 'rparen'
  )
    return true;
  if (
    ltoken.$ === 'lbracket' &&
    rtoken.$ === 'rbracket'
  )
    return true;
  if (
    ltoken.$ === 'lbrace' &&
    rtoken.$ === 'rbrace'
  )
    return true;
  return false;
}

class TokenPeek {
  constructor(iter) {
    /** @type {undefined | IteratorResult<Token, void>} */
    this.peek_buffer = undefined;
    /** @type {undefined | IteratorResult<Token, void>} */
    this.eof_buffer = undefined;
    /** @type {Generator<Token, void, void>} */
    this.iter = iter;
  }

  /**
   * @returns {IteratorResult<Token, { $: 'eof', text: '', span: Span }>}
   */
  next = () => {
    if (this.peek_buffer) {
      const saved = this.peek_buffer;
      this.peek_buffer = undefined;
      return saved;
    } else if (this.eof_buffer) {
      return this.eof_buffer;
    }

    const value = this.iter.next();
    if (value.done || value.value.$ === 'eof') {
      this.eof_buffer = { done: true, value: value.value };
      return this.eof_buffer;
    }

    return value;
  };

  /**
   * @returns {IteratorResult<Token, { $: 'eof', text: '', span: Span }>}
   */
  peek = () => {
    if (this.peek_buffer) {
      return this.peek_buffer;
    }
    this.peek_buffer = this.next();
    return this.peek_buffer;
  };
}

class ParseError {
  /**
   * @param {string} message
   * @param {[number, number]} span
   */
  constructor(message, span) {
    /** @type {string} */
    this.message = message;
    /** @type {[number, number]} */
    this.span = span;
  }
}

class InternalError extends ParseError {
  /**
   * @param {string} message
   * @param {Span} span
   */
  constructor(message, span) {
    super(`Internal Error: ${message}`, span)
  }
}

class UnbalancedError extends ParseError {
  /**
   * @param {Token} open_delimiter
   */
  constructor(open_delimiter) {
    super(`Unbalanced ${open_delimiter.text}`, open_delimiter.span)
  }
}

class WrongDelimiterError extends ParseError {
  /**
   * @param {string} expected_delimiter
   * @param {Token} actual_delimiter
   */
  constructor(expected_delimiter, actual_delimiter, span) {
    super(`Expected ${expected_delimiter}, got ${actual_delimiter.text}`, actual_delimiter.span)
  }
}

class InvalidFormatError extends ParseError {
  /**
   * @param {Token} number
   */
  constructor(number) {
    super(`Invalid format for number ${number.text}`, number.span)
  }
}

class UnexpectedEofError extends ParseError {
  /**
   * @param {Token} eof
   */
  constructor(eof) {
    super(`Unexpected eof`, eof.span)
  }
}

class UnexpectedCloseDelimiterError extends ParseError {
  /**
   * @param {Token} delimiter
   */
  constructor(delimiter) {
    super(`Unexpected ${delimiter.text}`, delimiter.span)
  }
}

/**
 * @param {Sexp | Token} exp
 * @returns {Sexp}
 */
function error(exp) {
  return { $: "error", exp: exp, span: exp.span };
}

/**
 * @param {TokenPeek} stream
 * @returns {Sexp}
 */
function parse_list(stream, errors=[]) {
  const { value: first } = stream.next();

  let $;
  let expected;
  if (first.$ === 'lparen') {
    $ = 'list';
    expected = ')';
  } else if (first.$ === 'lbracket') {
    $ = 'infix';
    expected = ']';
  } else if (first.$ === 'lbrace') {
    $ = 'record';
    expected = '}';
  } else {
    errors.push(new InternalError('First token was not an open delimiter', first.span));
    return error({ $: 'list', items: [], span: first.span });
  }

  const items = [];
  let { done, value: current } = stream.peek();
  while (!done && !is_delimiter_close(current)) {
    items.push(parse_exp(stream, errors));
    ({ done, value: current } = stream.peek());
  }

  const lastish = items[items.length - 1] ?? first;
  if (done) {
    errors.push(new UnbalancedError(first));
    return error({ $, items, span: [first.span[0], lastish.span[1]] });
  } else if (!corresponding_delimiters(first, current)) {
    errors.push(new WrongDelimiterError(expected, current));
    return error({ $, items, span: [first.span[0], lastish.span[1]] });
  } else {
    stream.next();
    return { $, items, span: [first.span[0], current.span[1]] };
  }
}

/**
 * @param {TokenPeek} stream
 * @returns {Sexp}
 */
function parse_quotation(stream, errors=[]) {
  const { value: quote } = stream.next();
  if (quote.$ !== 'quote') {
    errors.push(new InternalError('First token was not a quotation', quote.span));
    return error({ $: 'quote', exp: undefined, span: quote.span });
  }
  const exp = parse_exp(stream, errors);
  return { $: 'quote', exp, span: [quote.span[0], exp.span[1]] };
}

/**
 * @param {Token} atom
 * @param {Array} errors mutated in the event of an error
 * @returns {Sexp}
 */
function parse_atom(atom, errors) {
  if (atom.$ !== 'atom') {
    errors.push(new InternalError('Provided argument was not an atom', atom.span));
    return error(atom);
  }

  const number_test = /^[\-+]?[_.]*[0-9]+[0-9_.]*$/;
  const valid_number_test =
    /^[\-+]?(?:[0-9]+(?:_+[0-9]+)*(?:\.[0-9]+(?:_+[0-9]+)*)?|\.[0-9]+(?:_+[0-9]+)*)$/;

  if (number_test.test(atom.text)) {
    const number = { $: 'number', value: atom.text, span: atom.span };
    if (valid_number_test.test(atom.text)) {
      return number;
    }
    errors.push(new InvalidFormatError(atom));
    return error(number);
  }

  // note: atoms cannot be multiline
  const parts_sublex = /(?:\.+|[^\.]+)/dg;
  const parts = [...atom.text.toString().matchAll(parts_sublex)];
  if (parts.length === 0) {
    errors.push(new InternalError('Atom is empty', atom.span));
    return error(atom);
  } else if (parts.length === 1) {
    return { $: 'atom', name: atom.text, span: atom.span };
  }

  // parse qualified atom
  let relative = false;
  const path = [];
  if (parts[0][0].startsWith('.')) {
    relative = true;
    parts.shift();
  }
  while (parts.length) {
    const part = parts.shift();
    if (part[0].startsWith('.')) continue;
    path.push({ name: part[0], span: part.indices });
  }
  return { $: 'qatom', path, relative, span: atom.span }
}

/**
 * @param {TokenPeek} stream
 * @returns {Sexp}
 */
function parse_exp(stream, errors=[]) {
  const { done, value: tok } = stream.peek();
  if (done) {
    errors.push(new UnexpectedEofError(tok));
    return error(tok);
  } else if (is_delimiter_close(tok)) {
    stream.next();
    errors.push(new UnexpectedCloseDelimiterError(tok));
    return error(tok);
  }

  if (is_delimiter_open(tok)) {
    return parse_list(stream, errors);
  }
  if (tok.$ === 'quote') {
    return parse_quotation(stream, errors);
  }

  stream.next();

  if (tok.$ === 'string') {
    return { $: 'string', value: tok.text, span: tok.span };
  }
  if (tok.$ === 'atom') {
    return parse_atom(tok, errors);
  }

  errors.push(new InternalError('Unknown token type', tok.span));
  return error(tok);
}

export function* parse(text, errors=[]) {
  const stream = new TokenPeek(tokenize(text));
  while (!stream.peek().done) {
    yield parse_exp(stream, errors);
  }
}
