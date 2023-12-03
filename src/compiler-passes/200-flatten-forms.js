import { InvalidNode } from '../utils/errors.js';
import { map_subforms } from '../utils/visitors.js';

export function flatten(exp) {
  switch (exp.$) {
    default:
      return map_subforms(flatten, exp);
    case 'let*':
    case 'letrec*':
    case 'letrec*': {
      if (exp.binds.length === 0) return flatten(exp.body);
      const new_binds = exp.binds.flatMap(({ name, value, ...rest }) => {
        const fvalue = flatten(value);
        if (['let*', 'letrec*', 'letrec*'].includes(fvalue.$)) {
          return [...fvalue.binds, { name, value: fvalue.body, ...rest }];
        } else {
          return [{ name, value: fvalue, ...rest }];
        }
      });
      const new_body = flatten(exp.body);
      if (['let', 'letrec*', 'letrec*'].includes(new_body.$)) {
        new_binds.push(...new_body.binds);
        return { ...new_body, $: 'letrec*', binds: new_binds };
      }
      return { ...exp, $: 'letrec*', binds: new_binds, body: new_body };
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
    case 'labels':
      throw new InvalidNode(exp, 'flatten');
  }
}
