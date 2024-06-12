/// <reference path="./gensym.d.ts"/>

type ItemType = 'constant' | 'syntax' | 'function' | 'macro';

interface ModuleItem {
  name: Gensym<string>,
  meta: { type: ItemType };
}

interface Module {
  items: Map<string, ModuleItem>,
  qualified_name: string[],
  normalized_path: string,
}
