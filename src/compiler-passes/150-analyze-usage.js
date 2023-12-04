import { map_subforms } from '../utils/visitors.js';

export function analyze_usages(exp, seen_vars = new Set()) {
  map_subforms(analyze_usages, exp, seen_vars);
  switch (exp.$) {
    case 'var':
      seen_vars.add(exp.name);
      exp.name.used = true;
      break;
    case 'set!':
      seen_vars.add(exp.name);
      exp.name.set = true;
      break;
    case 'let*':
    case 'labels':
    case 'letrec*':
      exp.binds.forEach(({ name }) => seen_vars.add(name));
      break;
    case 'lambda':
      exp.params.forEach(name => seen_vars.add(name));
      exp.free_vars.forEach(name => name.captured = true);
      break;
  }
  return seen_vars;
}
