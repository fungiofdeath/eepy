import { pretty_print } from "../text/pretty-print.js";
import { debug_repr } from "./debug.js";

class NodeError extends Error {
  constructor(message) {
    super(message);
  }
}

export class Todo extends NodeError {
  constructor(exp, phase) {
    const x = debug_repr(exp);
    super(`Node type ${exp.$} is unfinished in phase ${phase}.\nFull node: ${x}`);
  }
}

export class WrongNodeType extends NodeError {
  constructor(exp, expected, form) {
    const x = debug_repr(exp);
    super(`Expected ${expected} in ${form}, got ${exp.$}.\nFull node: ${x}`);
  }
}

export class UnknownNode extends NodeError {
  constructor(exp) {
    const x = debug_repr(exp);
    super(`Unknown node type: ${exp.$}\nFull node: ${x}`);
  }
}

export class InvalidNode extends NodeError {
  constructor(exp, phase) {
    const x = debug_repr(exp);
    super(`Node type ${exp.$} invalid in phase ${phase}.\nFull node: ${x}`);
  }
}

export class DuplicateBinding extends NodeError {
  constructor(name) {
    super(`Variable ${name} is already bound in environment`);
  }
}

export class NameError extends NodeError {
  constructor(name, scope) {
    const s = debug_repr(scope);
    super(`Variable ${name} not found.\nFull scope: ${s}`);
  }
}

export class NotImplemented extends NodeError {
  constructor(name) {
    super(`Method .${name} not implemented`);
  }
}

export class TypeError extends NodeError {
  constructor (expected, actual, code) {
    const printed = pretty_print(code, '  ');
    super(`Invalid type: expected ${expected} got ${actual} in\n${printed}`);
  }
}

export class InvalidArgumentsError extends NodeError {
  constructor (fn, args, errors) {
    const pretty_args = args.map(a => ` ${a.print()}`).join('');
    let error = `Errors in (${fn}${pretty_args}):`;
    for (const [i, err] of errors.entries()) {
      error += `\n\t${i}: ${err}`
    }
    super(error);
  }
}
