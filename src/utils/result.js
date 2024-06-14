
const IsOk = Symbol('ok?');
const Data = Symbol('data');

/**
 * @template Ok
 * @template Err
 * @hideconstructor
 */
export class Result {
  /** @type {boolean} */
  [IsOk];
  /** @type {Ok | Err} */
  [Data];

  /**
   * @constructor
   * @param {boolean} ok
   * @param {Ok | Err} data must be T if boolean === true, E if boolean === false
   */
  constructor(ok, data) {
    this[IsOk] = ok;
    this[Data] = data;
  }

  get ok() {
    return this[IsOk];
  }

  /**
   * @param {Ok} data
   * @returns {Result<Ok, never>}
   */
  static Ok = data => new Result(true, data);

  /**
   * @param {Err} data
   * @returns {Result<never, Err>}
   */
  static Err = data => new Result(false, data);

  /**
   * @returns {Result<Ok, Err>}
   */
  clone = () => new Result(this[IsOk], this[Data]);

  /**
   * @returns {Result<Err, Ok>}
   */
  swap = () => new Result(!this[IsOk], this[Data]);

  /**
   * @template X
   * @template Y
   * @param {(ok: Ok) => X} if_ok
   * @param {(error: Err) => Y} if_err
   * @returns {X | Y}
   */
  consume = (if_ok, if_err) =>
    this[IsOk] ? if_ok(this[Data]) : if_err(this[Data]);

  /**
   * @template X
   * @template Y
   * @param {(ok: Ok) => X} if_ok
   * @param {(error: Err) => Y} if_err
   * @returns {Result<X, Y>}
   */
  bimap = (if_ok, if_err) => new Result(this[IsOk], this.consume(if_ok, if_err));

  /**
   * @template X
   * @param {(ok: Ok) => X} if_ok
   * @returns {Result<X, Err>}
   */
  map_ok = if_ok => this.bimap(if_ok, x => x);

  /**
   * @template Y
   * @param {(ok: Err) => Y} if_err
   * @returns {Result<Ok, Y>}
   */
  map_err = if_err => this.bimap(x => x, if_err);

  /**
   * @template Throwable
   * @param {Throwable} error
   * @throws {Throwable}
   * @returns {Ok}
   */
  assert_ok_with_error = error => {
    if (!this[IsOk]) throw error;
    return this[Data];
  };

  /**
   * @template Throwable
   * @param {Throwable} error
   * @throws {Throwable}
   * @returns {Err}
   */
  assert_err_with_error = error => {
    if (this[IsOk]) throw error;
    return this[Data];
  };

  assert_ok = () =>
    this.assert_ok_with_error(
      new Error(
        `Result was asserted to be ok but it is err. Current error: ${
          this[Data]
        }`,
      ),
    );

  assert_err = () =>
    this.assert_err_with_error(
      new Error(
        `Result was asserted to be err but it is ok. Current data: ${
          this[Data]
        }`,
      ),
    );

  /**
   * @returns {Ok | Result<never, Err>}
   */
  flatten = () => (this[IsOk] ? this[Data] : this);

  /**
   * @template X
   * @param {(ok: Ok) => Result<X, Err>} f
   * @returns {Result<X, Err>}
   */
  flat_map = f => (this[IsOk] ? f(this[Data]) : this);

  /**
   * @template X
   * @template Y
   * @param {Result<(ok: Ok) => X, Y>} result
   * @returns {Result<X, Err | Y>}
   */
  apply = result => this.flat_map(data => result.flat_map(f => f(data)));

  /**
   * @param {Result<T, E>[]} results non-empty list of results
   * @returns {Result<T, E> | undefined}
   *  the last err result or the first ok result in the list
   */
  static or = results => {
    let last;
    for (const result of results) {
      if (result.ok) {
        return result;
      }
      last = result;
    }
    return last;
  };

  /**
   * @param {Result<T, E>[]} results a non-empty list of results
   * @returns {Result<T, E> | undefined}
   *  the first err result or the last ok result in the list
   */
  static and = results => {
    let last;
    for (const result of results) {
      if (!result.ok) {
        return result;
      }
      last = result;
    }
    return last;
  };

  /**
   * @param {Result<Ok, Err>[]} results
   * @returns {Result<Ok[], Err>}
   */
  static combine = results => {
    const ok_array = [];
    for (const result of results) {
      let flag = false;
      result.consume(
        ok => ok_array.push(ok),
        _ => (flag = true),
      );
      if (flag) return result;
    }

    return Result.Ok(ok_array);
  };

  /**
   * @template X
   * @param {X} result
   * @returns {Result<Ok, never> | X}
   */
  or = result => (this[IsOk] ? this : result);

  /**
   * @template X
   * @template Y
   * @param {Result<X, Y>} result
   * @returns {Result<[Ok, X], Err | Y>}
   */
  append = result => Result.combine([this, result]);
}
