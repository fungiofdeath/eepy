import { map_subforms } from "../utils/visitors.js";

export function find_tail_positions(exp, call_nodes = new Set(), current_function=null, current_return_continuation=null) {
  const rec = x => find_tail_positions(x, call_nodes, current_function, current_return_continuation);
  switch (exp.$) {
    default:
      map_subforms(rec, exp);
      return call_nodes;
    case 'lambda':
      map_subforms(find_tail_positions, exp, call_nodes, exp, exp.param_k);
      return call_nodes;
    case 'call':
      exp.tail_pos = false;  // reset
      if (exp.arg_k?.$ === 'var' && exp.arg_k.name === current_return_continuation) {
        exp.tail_pos = current_function;
        call_nodes.add(exp);
      }
      map_subforms(rec, exp);
      return call_nodes;
    case 'kcall':
      exp.tail_pos = false;  // reset
      if (exp.fn.name === current_return_continuation) {
        exp.tail_pos = current_function;
        call_nodes.add(exp);
      }
      map_subforms(rec, exp);
      return call_nodes;
    case 'set!':
      exp.tail_pos = false;  // reset
      if (exp.k === current_return_continuation) {
        exp.tail_pos = current_function;
        call_nodes.add(exp);
      }
      map_subforms(rec, exp);
      return call_nodes;
  }
}
