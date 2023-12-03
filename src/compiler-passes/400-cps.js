import { debug_repr } from '../utils/debug.js';
import { InvalidNode, UnknownNode } from '../utils/errors.js';
import { gensym } from '../utils/symbols.js';

export function cps(exp) {
  return cps_named(exp, 'unhandled-exception', 'abort/success');
}

function cps_holed(exp, h, khole) {
  // console.debug('\nholed', debug_repr(exp));
  const holed = (x = exp, k = khole) => cps_holed(x, h, k);
  const named = (x, k) => cps_named(x, h, k);
  switch (exp.$) {
    case 'literal':
    case 'var':
      return khole(exp);
    case 'set!':
      return holed(exp.value, value => ({
        $: 'set!-then',
        name: exp.name,
        value,
        then: khole(value),
      }));
    case 'block':
      if (exp.subforms.length === 0)
        return khole({ $: 'literal', value: null });
      if (exp.subforms.length === 1) return holed(exp.subforms[0]);
      return holed(exp.subforms[0], _ =>
        holed({ ...exp, subforms: exp.subforms.slice(1) }),
      );
    case 'call': {
      const kname = gensym('callk');
      const kparam = gensym('callx');
      return holed(exp.fn, fn =>
        k_args(exp.args, h, args => ({
          $: 'klabels',
          binds: [
            {
              name: kname,
              param: kparam,
              body: khole({ $: 'var', name: kparam }),
            },
          ],
          body: {
            ...exp,
            fn,
            args,
            cont: { $: 'var', name: kname },
            handlers: { $: 'var', name: h },
          },
        })),
      );
    }
    case 'if': {
      const jname = gensym('ifj');
      const jparam = gensym('ifx');
      const k1name = gensym('ifk1');
      const k1param = gensym('ifx1');
      const k2name = gensym('ifk2');
      const k2param = gensym('ifx2');
      return holed(exp.cond, cond => ({
        $: 'klabels',
        binds: [
          {
            name: jname,
            param: jparam,
            body: khole({ $: 'var', name: jparam }),
          },
          {
            name: k1name,
            param: k1param,
            body: named(exp.then, jname),
          },
          {
            name: k2name,
            param: k2param,
            body: named(exp.otherwise, jname),
          },
        ],
        body: {
          ...exp,
          cond,
          then: {
            $: 'kcall',
            name: { $: 'var', name: k1name },
            arg: { $: 'literal', value: null },
          },
          otherwise: {
            $: 'kcall',
            name: { $: 'var', name: k2name },
            arg: { $: 'literal', value: null },
          },
        },
      }));
    }
    case 'let': // for now we treat this as the same let* for saving implementation effort
    case 'let*': {
      if (exp.binds.length === 0) return holed(exp.body, khole);
      const jname = gensym(exp.$ + 'j');
      return {
        $: 'klabels',
        binds: [
          {
            name: jname,
            param: exp.binds[0].name,
            body: holed(
              {
                $: exp.$,
                binds: exp.binds.slice(1),
                body: exp.body,
              },
              khole,
            ),
          },
        ],
        body: named(exp.binds[0].value, jname),
      };
    }
    case 'labels':
      return {
        ...exp,
        binds: exp.binds.map(({ name, value }) => ({
          name,
          value: holed(value, x => x),
        })),
        body: holed(exp.body),
      };
    case 'lambda': {
      const kname = gensym('lambdak');
      const hname = gensym('lambdah');
      return khole({
        ...exp,
        kparam: kname,
        hparam: hname,
        body: cps_named(exp.body, hname, kname),
      });
    }
    case 'letrec*':
      throw new InvalidNode(exp, 'cps');
    default:
      throw new UnknownNode(exp);
  }
}

function k_args(args, h, cb) {
  if (args.length === 0) return cb([]);
  return cps_holed(args[0], h, arg0 =>
    k_args(args.slice(1), h, rest => cb([arg0, ...rest])),
  );
}

function cps_named(exp, hname, kname) {
  // console.debug('\nnamed', debug_repr(exp));
  // return cps_holed(exp, hname, x => ({
  //   $: 'kcall',
  //   name: kname,
  //   arg: x,
  // }))
  const holed = (x, k) => cps_holed(x, hname, k);
  const named = (x = exp, k = kname) => cps_named(x, hname, k);
  switch (exp.$) {
    case 'literal':
    case 'var':
      return {
        $: 'kcall',
        name: { $: 'var', name: kname },
        arg: exp,
      };
    case 'set!':
      return holed(exp.value, value => ({
        $: 'set!-then',
        name: exp.name,
        value,
        then: named(value),
      }));
    case 'block':
      if (exp.subforms.length === 0)
        return named({ $: 'literal', value: null });
      if (exp.subforms.length === 1) return named(exp.subforms[0]);
      return holed(exp.subforms[0], _ =>
        named({ ...exp, subforms: exp.subforms.slice(1) }),
      );
    case 'call': 
    {
      return holed(exp.fn, fn =>
        k_args(exp.args, hname, args => ({
            ...exp,
            fn,
            args,
            cont: { $: 'var', name: kname},
            handlers: { $: 'var', name: hname},
        })),
      );
    }
    case 'if':
    case 'let':
    case 'let*':
    case 'labels':
    case 'lambda':
      return cps_holed(exp, hname, x => ({
        $: 'kcall',
        name: { $: 'var', name: kname },
        arg: x,
      }))
    case 'letrec*':
      throw new InvalidNode(exp, 'cps');
    default:
      throw new UnknownNode(exp);
  }
}
