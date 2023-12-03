import { inspect } from 'util';

export function debug_repr(obj) {
  return inspect(obj, {
    breakLength: 60,
    colors: true,
    depth: Infinity,
    getters: true,
    numericSeparator: true,
    sorted: true,
  });
}

