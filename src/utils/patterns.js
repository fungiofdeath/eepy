/// <reference path="../types/parse-tree.d.ts" />

import { Result } from './result.js';

/**
 * @interface
 * @template I Input of the transformation
 * @template O Output of the transformation
 * @template E Error that occurs during the transformation
 */
export class IPattern {
  /**
   * @abstract
   * @param {I} object
   * @returns {Result<O, E>}
   */
  try_match = object => {
    throw new Error(
      `IPatternTransformer.prototype.try_transform() must be overridden by its subexport class: ${this.constructor}`,
    );
  };

  /**
   * @param {IPattern<I, O, E>} pattern
   * @returns {IPattern<I, O, E>}
   */
  or = pattern => new OrPattern(this, pattern);

  /**
   * @template P
   * @template F
   * @param {(result: Result<O, E>) => Result<P, F>} func
   * @returns {IPattern<I, P, F>}
   */
  rmap = func => new FunctionPattern(object => func(this.try_match(object)));

  /**
   * @template P
   * @template F
   * @param {(ok: O) => P} if_ok
   * @param {(err: E) => F} if_err
   * @returns {IPattern<I, O, E>}
   */
  bimap = (if_ok, if_err) => this.rmap(result => result.bimap(if_ok, if_err));

  /**
   * @template P
   * @param {(ok: O) => P} f
   * @returns {IPattern<I, P, E>}
   */
  map_ok = f => this.rmap(result => result.map_ok(f));

  /**
   * @template F
   * @param {(err: E) => F} f
   * @returns {IPattern<I, O, F>}
   */
  map_err = f => this.rmap(result => result.map_err(f));

  /**
   * @template P
   * @param {(ok: O) => Result<P, E>} f
   * @returns {IPattern<I, P, E>}
   */
  flat_map = f => this.rmap(result => result.flat_map(f));

  /**
   * @template P
   * @param {IPattern<O, P, E>} pattern
   * @returns {IPattern<I, P, E>}
   */
  compose = pattern =>
    this.rmap(result => result.flat_map(ok => pattern.try_match(ok)));
}

/**
 * @template I
 * @template O
 * @template E
 * @implements {IPattern<I, O, E>}
 */
export class OrPattern extends IPattern {
  /** @type {IPattern<I, O, E>[]} */
  #subpatterns;

  /**
   * @param {IPattern<I, O, E>[]} subpatterns
   */
  constructor(subpatterns) {
    super();
    if (!Array.isArray(subpatterns) || subpatterns.length < 2) {
      throw new Error('OrTransform must contain at least 2 sub-patterns');
    }
    this.#subpatterns = subpatterns;
  }

  /**
   * @param {I} object
   * @returns {Result<O, E>}
   */
  try_match = object => {
    let last;
    for (const pat of this.#subpatterns) {
      const result = pat.try_match(object);
      if (result.ok) {
        return result;
      }
      last = result;
    }
    return last;
  };

  or = pattern => {
    this.#subpatterns.push(pattern);
    return this;
  };
}

/**
 * @template I
 * @template O
 * @template E
 * @implements {IPattern<I, O, E>}
 * @hideconstructor
 */
export class FunctionPattern extends IPattern {
  /** @type {(object: I) => Result<O, E>} */
  #func;

  /**
   * @param {(object: I) => Result<O, E>}
   */
  constructor(func) {
    super();
    this.#func = func;
  }

  /**
   * @param {I} object
   * @returns {Result<O, E>}
   */
  try_match = object => {
    return this.#func(object);
  };
}

/**
 * @template O
 * @template E
 * @typedef {{
 *  too_many_items?: boolean,
 *  too_few_items?: boolean,
 *  results: Result<O, E>[],
 * }} ArrayError
 */

/**
 * @template I
 * @template O
 * @template E
 * @implements {IPattern<I[], O[], ArrayError<O, E>>}
 */
export class ArrayPattern extends IPattern {
  /** @type {IPattern<I, O, E>[]} */
  #required = [];
  /** @type {IPattern<I, O, E>[]} */
  #optional = [];
  /** @type {IPattern<I, O, E>} */
  #rest = undefined;

  /**
   * @param {IPattern<I, O, E>} pattern
   */
  required = pattern => {
    this.#required.push(pattern);
    return this;
  };

  /**
   * @param {IPattern<I, O, E>} pattern
   */
  optional = pattern => {
    this.#optional.push(pattern);
    return this;
  };

  /**
   * @param {IPattern<I, O, E>} pattern
   */
  rest = pattern => {
    if (this.#rest) {
      throw new Error(
        'ListyTransformer.prototype.rest(): rest has already been set, it may not be modified',
      );
    }
    this.#rest = pattern;
    return this;
  };

  /**
   * @param {I[]} object
   * @returns {Result<O[], ArrayError<O, E>>}
   */
  try_match = object => {
    let position = 0;
    let results = [];

    const too_few = object.length < this.#required;
    const too_many =
      !this.#rest && object.length > this.#required + this.#optional;

    let errorful = too_few || too_many;

    for (
      let ii = 0;
      ii < this.#required.length && position < object.length;
      ++ii, ++position
    ) {
      const result = this.#required[ii].try_match(object[position]);
      errorful ||= !result.ok;
      results.push(result);
    }

    for (
      let jj = 0;
      jj < this.#optional.length && position < object.length;
      ++jj, ++position
    ) {
      const result = this.#optional[jj].try_match(object[position]);
      errorful ||= !result.ok;
      results.push(result);
    }

    if (this.#rest) {
      for (; position < object.length; ++position) {
        const result = this.#rest.try_match(object[position]);
        errorful ||= !result.ok;
        results.push(result);
      }
    }

    if (!errorful) {
      const outputs = results.map(result => result.assert_ok());
      return Result.Ok(outputs);
    } else {
      const error = {
        too_many_items: too_many,
        too_few_items: too_few,
        results,
      };
      return Result.Err(error);
    }
  };
}

/**
 * @template O
 * @template E
 * @typedef {{
 *  not_a_sexp?: boolean,
 *  wrong_sexp?: boolean,
 * } & ArrayError<O, E>} SexpListError
 */

/**
 * @template O
 * @template E
 * @implements {IPattern<Sexp, O[], SexpListError<O, E>>}
 * @hideconstructor
 */
class SexpListy extends IPattern {
  /** @type {ArrayPattern<Sexp, O, E>} */
  #array_transformer = new ArrayPattern();
  #$;

  constructor(type) {
    super();
    this.#$ = type;
  }

  /**
   * @param {IPattern<Sexp, O, E>} pattern
   */
  required = pattern => {
    this.#array_transformer.required(pattern);
    return this;
  };

  /**
   * @param {IPattern<Sexp, O, E>} pattern
   */
  optional = pattern => {
    this.#array_transformer.optional(pattern);
    return this;
  };

  /**
   * @param {IPattern<Sexp, O, E>} pattern
   */
  rest = pattern => {
    this.#array_transformer.rest(pattern);
    return this;
  };

  /**
   * @param {Sexp} object
   * @returns {Result<O[], SexpListError<O, E>>}
   */
  try_match = object => {
    if (!object.$) {
      return Result.Err({
        not_a_sexp: true,
        results: [],
      });
    } else if (object.$ !== this.#$) {
      return Result.Err({
        wrong_sexp: true,
        results: [],
      });
    }

    return this.#array_transformer.try_match(object.items);
  };
}

/**
 * @template E
 * @typedef {{ inner_error: E } | { not_an_option: boolean }} QuoteOfError
 */

/**
 * @type {{
 *  Any:            <I>() => IPattern<I, Sexp, I>,
 *  Number:         <I>() => IPattern<I, Sexp, I>,
 *  String:         <I>() => IPattern<I, Sexp, I>,
 *  SAtom:          <I>() => IPattern<I, Sexp, I>,
 *  QAtom:          <I>() => IPattern<I, Sexp, I>,
 *  Atom:           <I>() => IPattern<I, Sexp, I>,
 *  List:           <I>() => IPattern<I, Sexp, I>,
 *  Infix:          <I>() => IPattern<I, Sexp, I>,
 *  Record:         <I>() => IPattern<I, Sexp, I>,
 *  Quote:          <I>() => IPattern<I, Sexp, I>,
 *  ListOf:      <O, E>() => SexpListy<O, E>,
 *  InfixOf:     <O, E>() => SexpListy<O, E>,
 *  RecordOf:    <O, E>() => SexpListy<O, E>,
 *  QuoteOf:  <I, O, E>(pattern: IPattern<Sexp, O, E>) => IPattern<I, O, QuoteOfError<E>>,
 * }}
 */
export const Sexp = (function _iife() {
  const all_types = [
    'number',
    'string',
    'quote',
    'atom',
    'list',
    'infix',
    'record',
    'error',
    'qatom',
  ];
  const test =
    (...$s) =>
    object =>
      ['error', ...$s].includes(object.$);
  const pass =
    (...$s) =>
    object =>
      test(...$s)(object) ? Result.Ok(object) : Result.Err(object);
  return {
    // Basic type checks
    Any: () => new FunctionPattern(pass(...all_types)),
    Number: () => new FunctionPattern(pass('number')),
    String: () => new FunctionPattern(pass('string')),
    SAtom: () => new FunctionPattern(pass('atom')),
    QAtom: () => new FunctionPattern(pass('qatom')),
    Atom: () => new FunctionPattern(pass('atom', 'qatom')),
    List: () => new FunctionPattern(pass('list')),
    Infix: () => new FunctionPattern(pass('infix')),
    Record: () => new FunctionPattern(pass('record')),
    Quote: () => new FunctionPattern(pass('quote')),
    // Listy Types
    ListOf: () => new SexpListy('list'),
    InfixOf: () => new SexpListy('infix'),
    RecordOf: () => new SexpListy('record'),
    // Compound Data
    QuoteOf: pattern =>
      new FunctionPattern(object =>
        ['error', 'quote'].includes(object?.$)
          ? pattern.try_match(object).map_err(err => ({ inner_error: err }))
          : Result.Err({ not_an_option: true }),
      ),
  };
})();
