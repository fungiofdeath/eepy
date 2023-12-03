/**
 * @file A simple pretty printer
 */

import { UnknownNode } from '../utils/errors.js';
import { debug_repr } from '../utils/debug.js';

export function pretty_print(exp, indent = '') {
  // console.debug('\npretty_print', debug_repr(exp));
  const rec = (f, new_indent = indent) => pretty_print(f, new_indent);
  const indent2 = indent + '  ';
  const indent4 = indent + '    ';
  switch (exp.$) {
    case 'literal':
      return `${exp.value}`;
    case 'var':
      return `${namefmt(exp.name)}`;
    case 'set!':
      return partsfmt(
        `(set! ${namefmt(exp.name)}\f${rec(exp.value, indent2)})`,
        ' ',
        `\n${indent2}`,
        60,
      );
    case 'set!-then':
      return partsfmt(
        `(set!-then ${namefmt(exp.name)}\f${rec(exp.value, indent2)}\f${rec(exp.then, indent2)})`,
        ' ',
        `\n${indent2}`,
        60,
      );
    case 'block':
      return `(begin${exp.subforms
        .map(f => `\n${indent2}${rec(f, indent2)}`)
        .join('')})`;
    case 'call': {
      const args = exp.args;
      if (exp.cont) args.unshift(exp.cont);
      if (exp.handlers) args.unshift(exp.handlers);
      const parts = args.map(f => `\f${rec(f, indent + ' ')}`).join('');
      return `(${rec(exp.fn)}${partsfmt(parts, ' ', `\n${indent} `, 30)})`;
    }
    case 'kcall': {
      return `(${rec(exp.name)} ${rec(exp.arg)})`;
    }
    case 'if':
      return partsfmt(
        `(if ${rec(exp.cond, indent4)}\f${rec(exp.then, indent4)}\f${rec(
          exp.otherwise,
          indent4,
        )})`,
        ' ',
        `\n${indent4}`,
        20,
      );
    case 'let':
    case 'let*':
    case 'labels':
    case 'letrec*': {
      const sub = indent + repeat(' ', exp.$.length) + '   ';
      return `(${exp.$} (${exp.binds
        .map(f =>
          partsfmt(
            `(${namefmt(f.name)}\f${rec(f.value, sub + '  ')})`,
            ' ',
            `\n${sub}  `,
          ),
        )
        .join(`\n${sub}`)})\n${indent2}${rec(exp.body, indent2)})`;
    }
    case 'klabels': {
      const sub = indent + repeat(' ', exp.$.length) + '   ';
      return `(${exp.$} (${exp.binds
        .map(f =>
          partsfmt(
            `(${namefmt(f.name)} (${namefmt(f.param)})\f${rec(f.body, sub + '  ')})`,
            ' ',
            `\n${sub}  `,
          ),
        )
        .join(`\n${sub}`)})\n${indent2}${rec(exp.body, indent2)})`;
    }
    case 'lambda': {
      const params = exp.params;
      if (exp.kparam) params.unshift(exp.kparam);
      if (exp.hparam) params.unshift(exp.hparam);
      return partsfmt(
        `(lambda (${params.map(namefmt).join(' ')})\f${rec(
          exp.body,
          indent2,
        )})`,
        ' ',
        `\n${indent2}`,
      );
    }
    default:
      throw new UnknownNode(exp);
  }
}

function namefmt(name) {
  if (typeof name === 'string') {
    return name;
  } else if (typeof name === 'object' && name.$ !== undefined) {
    throw new Error(`Invalid name ${debug_repr(name)}`);
  } else if (typeof name === 'object' && name.name) {
    let prefix = '';
    let suffix = '';
    if (name.id !== undefined) suffix += `~${name.id}`;
    if (name.captured) prefix += `&`;
    return `${prefix}${name.name}${suffix}`;
  }
  throw new Error(`Invalid name ${debug_repr(name)}`);
}

const _parts = /\f/g;
const _multiline = /\n/;
function partsfmt(parts, inline, multiline, maxlen = 40) {
  return parts.length > maxlen || parts.match(_multiline)
    ? parts.replace(_parts, multiline)
    : parts.replace(_parts, inline);
}

function repeat(str, times) {
  let ret = '';
  for (let i = 0; i < times; ++i) {
    ret += str;
  }
  return ret;
}
