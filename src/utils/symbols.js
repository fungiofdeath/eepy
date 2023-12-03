export let symbol_table = [];

export function gensym(name, rest = {}) {
  let extra_data = { ...rest };
  if (typeof name === 'string') {
    extra_data.name = name;
  } else {
    Object.assign(extra_data, name);
  }
  const g = { ...extra_data, id: symbol_table.length };
  symbol_table.push(g);
  return g;
}
