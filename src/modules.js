/// <reference path="types/parse-tree.d.ts" />
/// <reference path="types/modules.d.ts" />

import fs from 'node:fs';
import { gensym } from './utils/symbols.js';
import { Result } from './utils/result.js';

export const EEPY_SYSTEM_PATH = 'src/module-interfaces';
export const EEPY_LOCAL_PATH = 'samples';
export const EEPY_LIB_PATH = 'samples';

const system_import = /^sys:(?<mod>[a-z]+(?:\.[a-z]+)*)$/i;
const library_import = /^lib:(?<library>[a-z]+):(?<mod>[a-z]+(?:\.[a-z]+)*)$/i;
const local_import = /^(?:local\:)?(?<mod>[a-z]+(?:\.[a-z]+)*)$/i;

/** @type {Map<string, Module>} */
export const loaded_modules = new Map();

/**
 * @param {string | string[]} path
 * @returns {Result<Module, string>}
 */
export function ensure_loaded(path) {
  const parsed_result = Array.isArray(path)
    ? parse_import_array(path)
    : parse_import_string(path);
  if (!parsed_result.ok) return parsed_result;
  const parsed = parsed_result.assert_ok();

  const found = loaded_modules.get(parsed.normalized);
  if (found) {
    return Result.Ok(found);
  }

  const json_result = read_import(parsed);
  if (!json_result.ok) return json_result;
  const json = json_result.assert_ok();

  const items = parse_json_interface(json);
  const mod = {
    normalized_path: parsed.normalized,
    qualified_name: parsed.parts,
    items,
  };

  loaded_modules.set(parsed.normalized, mod);

  return Result.Ok(mod);
}

/**
 * @param {string[]} parts
 * @returns {Result<{
 *  dir: string,
 *  mod: string,
 *  normalized: string,
 *  parts: [],
 * }, string>}
 */
function parse_import_array(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error(`IErr: parts must be a non-zero array, got ${parts}`);
  }

  const is_sys = parts[0] === 'sys';
  const is_lib = parts[0] === 'lib';

  if (is_sys) {
    if (parts.length === 1) {
      return Result.Err(`system import path missing its module`);
    }

    const mod_parts = parts.slice(1);
    const mod = mod_parts.join('.');
    return Result.Ok({
      dir: EEPY_SYSTEM_PATH,
      mod,
      normalized: `sys:${mod}`,
      parts: parts,
    });
  } else if (is_lib) {
    if (parts.length === 1) {
      return Result.Err(`library import missing its library`);
    } else if (parts.length === 2) {
      return Result.Err(`library import missing its module`);
    }

    const lib_name = parts[1];
    const mod_parts = parts.slice(2);
    const mod = mod_parts.join('.');
    return Result.Ok({
      dir: EEPY_LIB_PATH,
      mod,
      normalized: `lib:${lib_name}:${mod}`,
      parts: parts,
    });
  } else {
    const mod_parts = parts[0] === 'local'
      ? parts.slice(1)
      : parts;
    if (mod_parts.length === 0) {
      return Result.Err(`local import missing its module`);
    }
    const mod = mod_parts.join('.');
    return Result.Ok({
      dir: EEPY_LOCAL_PATH,
      mod,
      normalized: `local:${mod}`,
      parts: ['local', ...parts],
    });
  }
}

/**
 * @param {string} path
 * @returns {Result<{
 *  dir: string,
 *  mod: string,
 *  normalized: string,
 *  parts: string[],
 * }, string>}
 */
function parse_import_string(path) {
  const sys = path.match(system_import)?.groups;
  const lib = path.match(library_import)?.groups;
  const loc = path.match(local_import)?.groups;

  if (sys) {
    return Result.Ok({
      dir: EEPY_SYSTEM_PATH,
      mod: sys.mod,
      normalized: path,
      parts: ['sys', ...sys.mod.split(/\./g)],
    });
  } else if (lib) {
    const dir = `${EEPY_LIB_PATH}/${lib.library}`;
    return Result.Ok({
      dir,
      mod: lib.mod,
      normalized: path,
      parts: ['lib', lib.library, ...lib.mod.split(/\./g)],
    });
  } else if (loc) {
    return Result.Ok({
      dir: EEPY_LOCAL_PATH,
      mod: loc.mod,
      normalized: `local:${loc.mod}`,
      parts: ['local', ...loc.mod.split(/\./g)],
    });
  } else {
    return Result.Err(`invalid format for import path: '${path}'`);
  }
}

/**
 * @param {{ dir: string, mod: string }} parsed
 * @returns {Result<string, string>}
 */
function read_import(parsed) {
  const { dir, mod } = parsed;

  const dirstats = fs.lstatSync(dir);
  if (!dirstats) {
    return Result.Err(`Load path not found: ${dir}`);
  } else if (!dirstats.isDirectory) {
    return Result.Err(`Invalid load path, expected a directory: ${dir}`);
  }

  const files = fs.readdirSync(dir, {
    withFileTypes: true,
  });
  const found = files.find(file => {
    if (!file.isFile || !file.name.startsWith(mod)) {
      return false;
    }
    const rest = file.name.slice(mod.length);
    return rest.match(/^(?:\.json)$/);
  });

  if (!found) {
    return Result.Err(`Module not found: ${mod}\nLoad path: ${dir}`);
  }

  return Result.Ok(
    fs
      .readFileSync(`${found.parentPath}/${found.name}`, {
        encoding: 'utf8',
        flag: fs.constants.O_RDONLY,
      })
      .toString(),
  );
}

/**
 * @param {string} json
 * @returns {Map<string, ModuleItem>}
 */
function parse_json_interface(json) {
  const object = JSON.parse(json);
  const result = new Map();
  Object.getOwnPropertyNames(object).forEach(prop => {
    const name = gensym(prop);
    result.set(prop, { name, meta: object[prop] });
  });
  return result;
}
