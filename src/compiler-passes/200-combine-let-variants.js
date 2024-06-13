import { map_subforms } from '../utils/visitors.js';

export function normalize_let_variants(exp) {
  const step = (x = exp) => map_subforms(normalize_let_variants, x);
  switch (exp.$) {
    default:
      return step();
    case 'let':
    case 'let*':
    case 'labels':
      return step({ ...exp, $: 'letrec*' });
  }
}
