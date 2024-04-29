/// <reference path="../types/gensym.d.ts" />

import { debug_repr } from "./debug.js";

export const symbol_table = [];

const $symbol = Symbol('symbol');

/**
 * @template T
 * @param {T} name
 * @returns {Gensym<T>}
 */
export function gensym(name, rest = {}) {
  let extra_data = { ...rest };
  if (typeof name === 'string') {
    extra_data.name = name;
  } else {
    Object.assign(extra_data, name);
  }
  const g = { [$symbol]: true, ...extra_data, id: symbol_table.length };
  symbol_table.push(g);
  return g;
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

export const finish = gensym('#%finish');
export const empty_handlers = gensym('#%empty-handlers');