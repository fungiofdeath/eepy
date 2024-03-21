import fs from 'node:fs';
import readline from 'node:readline';

import { program } from 'commander';

import { sexp_to_ast, Env } from './compiler-passes/000-resolution.js';
import { name_lambdas } from './compiler-passes/100-name-lambdas.js';
import { normalize_let_variants } from './compiler-passes/200-combine-let-variants.js';
import { analyze_usages } from './compiler-passes/200-analyze-usage.js';
import { flatten } from './compiler-passes/300-flatten-forms.js';
import { compile_letrec } from './compiler-passes/400-compile-letrec.js';
import { start_cps } from './compiler-passes/500-cps.js';

import InterpreterGlobals from './interpreter/globals.js'
import { Env as InterpreterEnv } from './interpreter/environment.js';
import { evaluate } from './interpreter/eval.js';

import { debug_repr } from './utils/debug.js';
import { parse } from './text/parse.js';
import { pretty_print } from './text/pretty-print.js';
import {
  DuplicateBinding,
  InvalidArgumentsError,
  NameError,
  TypeError,
} from './utils/errors.js';

program
  .name('eepy')
  .description('An eeepy language for silly, tired kitties')
  .version('1.0.0');

program
  .command('pipeline')
  .description('Show the compilation pipeline for a target file')
  .argument('<path>', 'Path to the file')
  .option('--encoding <encoding>', 'Encoding the file uses', 'utf8')
  .action((path, { encoding }) => {
    const file = fs.readFileSync(path, {
      encoding,
      flag: 'r',
    });
    visualize_pipeline(file);
  });

program
  .command('repl')
  .description('Open a REPL')
  .action(() => repl());

program.parse();

function repl() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
    tabSize: 2,
  });
  const topenv = new InterpreterEnv(InterpreterGlobals);
  rl.on('line', line => {
    const errors = [];
    for (const exp of parse(line, errors)) {
      try {
        if (errors.length > 0) {
          for (let i = 0; i < errors.length; ++i) {
            console.error('Error', debug_repr(errors.shift()));
          }
        } else {
          const env = init_env();
          const ast = sexp_to_ast(exp, env);
          const result = evaluate(topenv, ast);
          console.log(result.print());
        }
      } catch (e) {
        if (
          e instanceof InvalidArgumentsError ||
          e instanceof TypeError ||
          e instanceof NameError ||
          e instanceof DuplicateBinding
        ) {
          console.error(`${e.constructor.name}: ${e.message}`);
        } else {
          throw e;
        }
      }
    }
    rl.prompt();
  });
  rl.prompt();
}

function visualize_pipeline(code) {
  const errors = [];
  for (const exp of parse(code, errors)) {
    try {
      consumeErrors(errors);

      print_header('name resolution');
      const env = init_env();
      const resolved = sexp_to_ast(exp, env);
      // console.debug(debug_repr(resolved));
      consumeErrors(errors);
      console.log(pretty_print(resolved));

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

      print_header('continuation passing style');
      const cpsed = start_cps(depanalysis);
      console.log('CPS:');
      console.log(pretty_print(cpsed));
    } catch (e) {
      console.error('Error', e);
    }
  }
}

function init_env() {
  const env = new Env(errors);
  const core_module_result = env.import_module('sys:core');
  core_module_result.consume(
    core_module => {
      for (const item of core_module.items.keys()) {
        env.add_import_symbol({ $: 'atom', name: item }, core_module);
      }
    },
    errors => {
      throw new Error(
        'Fatal error: Could not construct core module due to',
        errors,
      );
    },
  );
  return env;
}

function print_header(header, spacer = '\n\n\n\n\n') {
  spacer && console.log(spacer);
  console.log('=========================================');
  console.log(header);
  console.log('=========================================');
}

function consumeErrors(errors) {
  if (errors.length > 0) {
    for (const error of errors) {
      console.error('Error', error);
    }
    for (let i = 0; i < errors.length; ++i) {
      errors.pop();
    }
    throw new Error('The above errors occurred during processing');
  }
}
