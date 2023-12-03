/**
 * @file A simple pretty printer
 */

import { UnknownNode } from '../utils/errors.js';
import { debug_repr } from '../utils/debug.js';

export function pretty_print(exp, indent = '') {
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
    case 'block':
      return `(begin${exp.subforms
        .map(f => `\n${indent2}${rec(f, indent2)}`)
        .join('')})`;
    case 'call': {
      const parts = exp.args.map(f => `\f${rec(f, indent + ' ')}`).join('');
      return `(${rec(exp.fn)}${partsfmt(parts, ' ', `\n${indent} `, 30)})`;
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
    case 'lambda':
      return partsfmt(
        `(lambda (${exp.params.map(namefmt).join(' ')})\f${rec(
          exp.body,
          indent2,
        )})`,
        ' ',
        `\n${indent2}`,
      );
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
