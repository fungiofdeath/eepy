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
      return `${print_value(exp.value, indent)}`;
    case 'env-var':
    case 'var': {
      const env = exp.env ? `${namefmt(exp.env)}.` : '';
      return `${env}${namefmt(exp.name)}`;
    }
    case 'env-set!':
    case 'set!': {
      const env = exp.env ? `${namefmt(exp.env)}.` : '';
      const k = exp.k ? `\f${namefmt(exp.k)}` : '';
      return partsfmt(
        `(set! ${env}${namefmt(exp.name)}\f${rec(exp.value, indent2)}${k})`,
        ' ',
        `\n${indent2}`,
        60,
      );
    }
    case 'block':
      return `(block${exp.subforms
        .map(f => `\n${indent2}${rec(f, indent2)}`)
        .join('')})`;
    case 'funcall':
    case 'kcall':
    case 'call': {
      const args = [...exp.args];
      if (exp.arg_h) args.push(exp.arg_h);
      if (exp.arg_k) args.push(exp.arg_k);
      const pref =
        exp.$ === 'kcall' ? 'k ' : exp.$ === 'funcall' ? 'funcall ' : '';
      const parts = args.map(f => `\f${rec(f, indent + ' ')}`).join('');
      return `(${pref}${rec(exp.fn)}${partsfmt(parts, ' ', `\n${indent} `, 30)})`;
    }
    case 'make-closure': {
      return `(make-closure ${rec(exp.fn)}${partsfmt(
        exp.captures
          .map(
            ({ name, value }) => `\f:${namefmt(name)}\f${rec(value, indent2)}`,
          )
          .join(''),
        `\n${indent}  `,
        40,
      )})`;
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
    case 'klabels':
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
    case 'klambda':
    case 'lambda': {
      const params = [...exp.params];
      if (exp.param_h) params.push(exp.param_h);
      if (exp.param_k) params.push(exp.param_k);
      return partsfmt(
        `(${exp.$} (${params.map(namefmt).join(' ')})\f${rec(
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

function print_value(value, indent) {
  const rec = (x, new_indent = indent) => print_value(x, new_indent);
  if (!value?.$) {
    return debug_repr(value);
  }
  switch (value.$) {
    case 'string':
      return debug_repr(value.value);
    case 'number':
      return debug_repr(Number.parseFloat(value.value));
    case 'atom':
    case 'qatom':
      return namefmt(value);
    case 'list':
      return `(${partsfmt(
        value.items.map(item => `\f${rec(item)}`).join(''),
        ' ',
        `\n${indent}  `,
      )})`;
    case 'error':
      return `#<error ${value.exp} ${value.exp?.$}>`;
    default:
      throw new Error(`IERR Not a value ${debug_repr(value)}`);
  }
}

function namefmt(name) {
  if (typeof name === 'string') {
    return name;
  } else if (typeof name === 'object' && name.$ === 'qatom') {
    return name.path.map(mod => namefmt(mod.name)).join('.');
  } else if (typeof name === 'object' && name.$ === 'atom') {
    return namefmt(name.name);
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
