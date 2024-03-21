import { InvalidArgumentsError } from '../utils/errors.js';

function match_types(name, args, classes) {
  const errors = new Map();
  for (let i = 0; i < classes.length; ++i) {
    if (i >= args.length) {
      errors.set(i, `Expected ${classes[i].name}, got (nothing)`);
      continue;
    }
    if (args[i] instanceof classes[i]) {
      continue;
    }
    errors.set(
      i,
      `Expected ${classes[i].name}, got ${args[i].print()}: ${
        args[i].constructor.name
      }`,
    );
  }
  if (errors.size !== 0) {
    throw new InvalidArgumentsError(name, args, errors);
  }
}

export function check_types(name, args, { min, max, type }) {
  const types = [];
  for (
    let i = 0;
    i < Math.min(max ?? Infinity, Math.max(min ?? 0, args.length));
    i += 1
  ) {
    types.push(type);
  }
  match_types(name, args, types);
}
