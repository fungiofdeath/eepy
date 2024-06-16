import { map_subforms } from './visitors.js';

export function free_variables(exp, frees = new Set()) {
  const recur = x => free_variables(x, frees);
  const free = name => frees.add(name);
  switch (exp.$) {
    default:
      map_subforms(recur, exp);
      return frees;
    case 'set!':
      recur(exp.value);
    // fallthrough
    case 'var':
      free(exp.name);
      return frees;
    // binding forms
    case 'let':
    case 'let*':
    case 'labels':
    case 'letrec*':
    case 'klabels':
      exp.binds.forEach(bind => recur(bind.value));
      recur(exp.body);
      exp.binds.forEach(bind => frees.delete(bind.name));
      return frees;
    case 'lambda':
    case 'klambda':
      recur(exp.body);
      exp.params.forEach(param => frees.delete(param));
      return frees;
  }
}
