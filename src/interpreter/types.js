import { NotImplemented } from '../utils/errors.js';
import { Env } from './environment.js';
import { evaluate } from './eval.js';
import { check_types } from './utils.js';

export class Value {
  print = () => {
    throw new NotImplemented('print');
  };
}

export class EepySymbol extends Value {
  static t = null;
  static nil = null;

  constructor(name) {
    super();
    this.name = name;
  }

  print = () => {
    return this.name;
  };
}

export class EepyLiteral extends Value {
  constructor(value) {
    super();
    this.value = value;
  }

  print = () => {
    return `${this.value}`;
  };
}

export class Cons extends Value {
  constructor(car, cdr) {
    super();
    this.car = car;
    this.cdr = cdr;
  }

  print = () => {
    let out = `(${this.car.print()}`;
    let cursor = this.cdr;
    while (cursor instanceof Cons) {
      out += ` ${cursor.car.print()}`;
      cursor = cursor.cdr;
    }
    if (cursor === Eepy.nil) {
      return `${out})`;
    }
    return `${out} . ${cursor.print()})`;
  };
}

export class EepyFunction extends Value {
  /**
   * @param {Value[]} args
   */
  apply = args => {
    throw new NotImplemented('apply');
  };
}

export class Closure extends EepyFunction {
  constructor(env, params, body) {
    super();
    this.env = env;
    this.params = params;
    this.body = body;
  }

  apply = args => {
    check_types('[anonymous]', args, {
      type: Value,
      min: this.params.length,
      max: this.params.length,
    });
    const inner = new Env(this.env);
    for (let i = 0; i < this.params.length; ++i) {
      inner.bind(this.params[i], args[i]);
    }
    return evaluate(inner, this.body);
  };

  print = () => {
    return `#<closure${this.params.map(p => ` ${p}`).join('')}>`;
  };
}

export class Builtin extends EepyFunction {
  constructor(name, func) {
    super();
    this.name = name;
    this.func = func;
  }

  apply = args => {
    return this.func(args);
  };

  print = () => {
    return `#<builtin ${this.name}>`;
  };
}
