import { Builtin, Cons, EepyLiteral, Value, EepySymbol } from './types.js';
import { check_types } from './utils.js';

const bindings = {
  '+': args => {
    check_types('+', args, { type: EepyLiteral });
    return new EepyLiteral(args.map(a => a.value).reduce((x, y) => x + y, 0));
  },
  '-': args => {
    check_types('-', args, { type: EepyLiteral });
    return new EepyLiteral(args.map(a => a.value).reduce((x, y) => x - y, 0));
  },
  '*': args => {
    check_types('*', args, { type: EepyLiteral });
    return new EepyLiteral(args.map(a => a.value).reduce((x, y) => x * y, 1));
  },
  '/': args => {
    check_types('/', args, { type: EepyLiteral, min: 2 });
    return new EepyLiteral(args.map(a => a.value).reduce((x, y) => x / y));
  },
  '<': args => {
    check_types('<', args, { type: EepyLiteral, min: 2 });
    for (let i = 0; i < args.length - 1; ++i) {
      if (args[i].value >= args[i + 1].value) return EepySymbol.nil;
    }
    return EepySymbol.t;
  },
  '<=': args => {
    check_types('<=', args, { type: EepyLiteral, min: 2 });
    for (let i = 0; i < args.length - 1; ++i) {
      if (args[i].value > args[i + 1].value) return EepySymbol.nil;
    }
    return EepySymbol.t;
  },
  '=': args => {
    check_types('=', args, { type: EepyLiteral, min: 2 });
    for (let i = 0; i < args.length - 1; ++i) {
      if (args[i].value !== args[i + 1].value) return EepySymbol.nil;
    }
    return EepySymbol.t;
  },
  '>': args => {
    check_types('>', args, { type: EepyLiteral, min: 2 });
    for (let i = 0; i < args.length - 1; ++i) {
      if (args[i].value <= args[i + 1].value) return EepySymbol.nil;
    }
    return EepySymbol.t;
  },
  '>=': args => {
    check_types('>=', args, { type: EepyLiteral, min: 2 });
    for (let i = 0; i < args.length - 1; ++i) {
      if (args[i].value < args[i + 1].value) return EepySymbol.nil;
    }
    return EepySymbol.t;
  },
  '/=': args => {
    check_types('/=', args, { type: EepyLiteral, min: 2 });
    for (let i = 0; i < args.length - 1; ++i) {
      if (args[i].value === args[i + 1].value) return EepySymbol.nil;
    }
    return EepySymbol.t;
  },
  cons: args => {
    check_types('cons', args, { type: Value, min: 2, max: 2 });
    return new Cons(args[0], args[1]);
  },
  car: args => {
    check_types('car', args, { type: Cons, min: 1, max: 1 });
    return args[0].car;
  },
  cdr: args => {
    check_types('cdr', args, { type: Cons, min: 1, max: 1 });
    return args[0].cdr;
  },
  'null?': args => {
    check_types('null?', args, { type: Value, min: 1, max: 1 });
    return args[0] === EepySymbol.nil;
  },
  'eq?': args => {
    check_types('eq?', args, { type: Value, min: 2 });
    for (let i = 0; i < args.length - 1; ++i) {
      if (args[i] !== args[i + 1]) return EepySymbol.nil;
    }
    return EepySymbol.t;
  },
  not: args => {
    check_types('not', args, { type: Value, min: 1, max: 1 });
    return args[0] === EepySymbol.nil;
  },
  andf: args => {
    check_types('andf', args, { type: Value });
    for (const arg of args) {
      if (arg === EepySymbol.nil) return nil;
    }
    return args[args.length - 1];
  },
  orf: args => {
    check_types('orf', args, { type: Value });
    for (const arg of args) {
      if (arg !== EepySymbol.nil) return arg;
    }
    return EepySymbol.nil;
  },
  print: args => {
    check_types('print', args, { type: Value, min: 1, max: 1 });
    console.log(args[0].print());
    return EepySymbol.nil;
  },
};

export const builtins = new Map();
for (const [name, fn] of Object.entries(bindings)) {
  builtins.set(name, new Builtin(name, fn));
}
