import fs from 'node:fs';

import { analyze_usages } from './compiler-passes/150-L-analyze-usage.js';
import { compile_letrec } from './compiler-passes/300-compile-letrec.js';
import { start_cps } from './compiler-passes/400-cps.js';
import { flatten } from './compiler-passes/200-L-flatten-forms.js';
import { name_lambdas } from './compiler-passes/125-name-lambdas.js';
import { normalize_let_variants } from './compiler-passes/150-combine-let-variants.js';
import {
  Env,
  Globals,
  resolve_names,
} from './compiler-passes/100-name-resolution.js';

import { parse } from './text/parse.js';
import { pretty_print } from './text/pretty-print.js';
import { debug_repr } from './utils/debug.js';
import { parse_tree_to_ast } from './compiler-passes/000-ast-conversion.js';
import { find_tail_positions } from './compiler-passes/500-L-tail-calls.js';
import { peephole } from './compiler-passes/500-peephole.js';

const sample = fs.readFileSync('samples/random-shit-1.sample.lisp', {
  encoding: 'utf-8',
  flag: 'r',
});

visualize_pipeline(sample);

function visualize_pipeline(code) {
  const errors = [];
  for (const exp of parse(code, errors)) {
    try {
      if (errors.length > 0) {
        for (const error of errors) {
          console.error('Error', debug_repr(error));
        }
        for (let i = 0; i < errors.length; ++i) {
          errors.pop();
        }
      } else {
        print_header('parsing');
        const ast = parse_tree_to_ast(exp);
        console.log(pretty_print(ast));

        print_header('name resolution');
        const globals = new Globals();
        const start_env = new Env(null, globals);
        const resolved = resolve_names(ast, start_env);
        console.log('Result:');
        console.log(pretty_print(resolved));
        console.log(
          '\nUndefined variables',
          [...globals.undefined_vars].map(([_, v]) => v),
        );

        print_header('naming lambdas');
        const named = name_lambdas(resolved);
        console.log('Named Lambdas');
        // console.log(debug_repr(named));
        console.log(pretty_print(named));

        print_header('normalize let forms');
        const normalized = normalize_let_variants(named);
        console.log('New AST');
        console.log(pretty_print(normalized));

        print_header('analyze usages');
        console.log('Analysis');
        console.log(
          new Set([...analyze_usages(normalized)].sort((x, y) => x.id - y.id)),
        );

        print_header('flatten extraneously-nested forms');
        const flattened = flatten(normalized);
        console.log('Flattened:');
        console.log(pretty_print(flattened));

        print_header("compile-out letrec*'s");
        const depanalysis = compile_letrec(flattened);
        console.log('Compiled-out:');
        console.log(pretty_print(depanalysis));

        print_header("continuation passing style");
        const cpsed = start_cps(depanalysis);
        console.log('CPS:');
        console.log(pretty_print(cpsed));

        print_header("finding tail calls");
        const calls = find_tail_positions(cpsed, new Set(), '#%finish', '#%finish')
        for (const [call] of calls.entries()) {
          console.log('tail call before', call.tail_pos.param_k, 'for', call.tail_pos, 'at', call);
        }
        console.log(pretty_print(cpsed));

        print_header("peephole opts")
        console.log(pretty_print(peephole(cpsed)));
      }
    } catch (e) {
      console.error('Error', e);
    }
  }
}

function print_header(header, spacer = '\n\n\n\n\n') {
  spacer && console.log(spacer);
  console.log('=========================================');
  console.log(header);
  console.log('=========================================');
}
