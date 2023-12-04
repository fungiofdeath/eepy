import { InvalidNode } from '../utils/errors.js';
import { map_subforms } from '../utils/visitors.js';

export function flatten(exp) {
  switch (exp.$) {
    default:
      return map_subforms(flatten, exp);
    // We cannot flatten `let`s as that incorrectly handles scope.
    case 'let*':
    case 'labels':
    case 'letrec*': {
      if (exp.binds.length === 0) return flatten(exp.body);
      const new_binds = exp.binds.flatMap(({ name, value, ...rest }) => {
        const fvalue = flatten(value);
        if (exp.$ === fvalue.$) {
          // this is never true for `labels`
          return [...fvalue.binds, { name, value: fvalue.body, ...rest }];
        } else {
          return [{ name, value: fvalue, ...rest }];
        }
      });
      const new_body = flatten(exp.body);
      if (exp.$ === new_body.$) {
        new_binds.push(...new_body.binds);
        return { ...new_body, $: exp.$, binds: new_binds };
      }
      return { ...exp, binds: new_binds, body: new_body };
    }
    case 'block':
      if (exp.subforms.length === 0) return exp;
      if (exp.subforms.length === 1) return flatten(exp.subforms[0]);
      return {
        ...exp,
        subforms: exp.subforms
          .map(flatten)
          .flatMap(x => (x.$ === 'block' ? x.subforms : [x])),
      };
  }
}
