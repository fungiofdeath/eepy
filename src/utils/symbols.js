/// <reference path="../types/gensym.d.ts" />

import { debug_repr } from "./debug.js";

export const symbol_table = [];

const $symbol = Symbol('symbol');

const Gensym = { [$symbol]: true };

/**
 * @template T
 * @param {T} name
 * @returns {Gensym<T>}
 */
export function gensym(name, rest = {}) {
  const output = Object.create(Gensym);
  Object.assign(output, rest);
  if (typeof name === 'string') {
    output.name = name;
  } else if (name[$symbol]) {
    output.name = name.name;
  } else if (typeof name === 'object') {
    Object.assign(output, name);
  }
  output.id = symbol_table.length;
  symbol_table.push(output);
  return output;
}

export function is_name(obj) {
  return typeof obj === 'string' || obj?.[$symbol];
}

export function concat_hints(...parts) {
  const strings = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      strings.push(part);
    } else if (part?.[$symbol]) {
      strings.push(part.name);
    } else {
      throw new Error(`IERR ${debug_repr(part)} is not a name`);
    }
  }
  return strings.join('');
}
