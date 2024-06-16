import * as assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { Result } from '../result.js';

function fn(returns) {
  function func(...args) {
    func.calls.push(args);
    return returns(...args);
  }
  func.calls = [];
  func.reset = () => {
    func.calls = [];
  };
  return func;
}

describe('Result', () => {
  test('Ok.ok should be true and .Err().ok should be false', () => {
    assert.equal(Result.Ok(1).ok, true);
    assert.equal(Result.Err(2).ok, false);
  });

  test('Ok.assert_ok should return inner data', () => {
    assert.equal(Result.Ok(1).assert_ok(), 1);
  });

  test('Err.assert_ok should throw', () => {
    assert.throws(Result.Err(2).assert_ok);
  });

  test('Ok.assert_err should throw', () => {
    assert.throws(Result.Ok(1).assert_err);
  });

  test('Err.assert_err should return inner data', () => {
    assert.equal(Result.Err(2).assert_err(), 2);
  });

  test('clone should return a new, equal result', () => {
    const ok1 = Result.Ok(1);
    const ok2 = ok1.clone();
    assert.notEqual(ok1, ok2, 'they should be have different identity');
    assert.equal(ok1.ok, true);
    assert.equal(ok2.ok, true);
    assert.equal(ok1.assert_ok(), ok2.assert_ok());

    const err1 = Result.Err(2);
    const err2 = err1.clone();
    assert.notEqual(err1, err2, 'they should be have different identity');
    assert.equal(err1.ok, false);
    assert.equal(err2.ok, false);
    assert.equal(err1.assert_err(), err2.assert_err());
  });

  test('Ok.swap should return a new Err', () => {
    const ok = Result.Ok(1);
    const err = ok.swap();
    assert.notEqual(ok, err);
    assert.equal(ok.ok, true);
    assert.equal(err.ok, false);
    assert.equal(ok.assert_ok(), err.assert_err());
  });

  test('Err.swap should return a new Ok', () => {
    const err = Result.Err(2);
    const ok = err.swap();
    assert.notEqual(ok, err);
    assert.equal(ok.ok, true);
    assert.equal(err.ok, false);
    assert.equal(ok.assert_ok(), err.assert_err());
  });

  test('Ok.consume should invoke only its first argument with its inner data', () => {
    const if_ok = fn(num => `ok ${num}`);
    const if_err = fn(num => `err ${num}`);
    const result = Result.Ok(1).consume(if_ok, if_err);
    assert.deepEqual(if_ok.calls, [[1]]);
    assert.deepEqual(if_err.calls, []);
    assert.equal(result, `ok 1`);
  });

  test('Err.consume should invoke only its second argument with its inner data', () => {
    const if_ok = fn(num => `ok ${num}`);
    const if_err = fn(num => `err ${num}`);
    const result = Result.Err(2).consume(if_ok, if_err);
    assert.deepEqual(if_ok.calls, []);
    assert.deepEqual(if_err.calls, [[2]]);
    assert.equal(result, `err 2`);
  });

  test('both Ok.bimap and Err.bimap should transform inner data', () => {
    const if_ok = fn(num => `ok ${num}`);
    const if_err = fn(num => `err ${num}`);
    const result_ok = Result.Ok(1).bimap(if_ok, if_err);
    assert.deepEqual(if_ok.calls, [[1]], 'Ok.bimap(f, g) must run f');
    assert.deepEqual(if_err.calls, [], 'Ok.bimap(f, g) must not run g');
    assert.equal(result_ok.ok, true);
    assert.equal(result_ok.assert_ok(), `ok 1`);

    if_ok.reset();
    if_err.reset();

    const result_err = Result.Err(2).bimap(if_ok, if_err);
    assert.deepEqual(if_ok.calls, [], 'Err.bimap(f, g) must not run f');
    assert.deepEqual(if_err.calls, [[2]], 'Err.bimap(f, g) must run g');
    assert.equal(result_err.ok, false);
    assert.equal(result_err.assert_err(), `err 2`);
  });

  test('Ok.map_ok should transform inner data', () => {
    const if_ok = fn(num => `ok ${num}`);
    const result_ok = Result.Ok(1).map_ok(if_ok);
    assert.deepEqual(if_ok.calls, [[1]]);
    assert.equal(result_ok.ok, true);
    assert.equal(result_ok.assert_ok(), `ok 1`);
  });

  test('Err.map_ok should do nothing', () => {
    const if_err = fn(num => `err ${num}`);
    const result_err = Result.Err(2).map_ok(if_err);
    assert.deepEqual(if_err.calls, []);
    assert.equal(result_err.ok, false);
    assert.equal(result_err.assert_err(), 2);
  });

  test('Ok.map_err should do nothing', () => {
    const if_ok = fn(num => `ok ${num}`);
    const result_ok = Result.Ok(1).map_err(if_ok);
    assert.deepEqual(if_ok.calls, []);
    assert.equal(result_ok.ok, true);
    assert.equal(result_ok.assert_ok(), 1);
  });

  test('Err.map_err should transform inner data', () => {
    const if_err = fn(num => `err ${num}`);
    const result_err = Result.Err(2).map_err(if_err);
    assert.deepEqual(if_err.calls, [[2]]);
    assert.equal(result_err.ok, false);
    assert.equal(result_err.assert_err(), `err 2`);
  });
});
