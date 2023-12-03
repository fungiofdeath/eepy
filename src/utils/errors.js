import { debug_repr } from "./debug.js";

class NodeError extends Error {
  constructor(message) {
    super(message);
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
