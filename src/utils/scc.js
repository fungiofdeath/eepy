
/**
 * @template V
 * @param {V[]} vertices
 * @param {Map<V, Set<V> | undefined>} edges
 * @returns {V[][]}
 */
export function find_sccs(vertices, edges) {
  // Tarjan's SCC algorithm
  // @see: https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
  const connected_components = [];
  const stack = [];
  let tarjan_index = 0;

  for (const vertex of vertices) {
    if (vertex.index === undefined) {
      strong_connect(vertex);
    }
  }

  function strong_connect(vertex) {
    vertex.index = tarjan_index;
    vertex.lowlink = tarjan_index;
    tarjan_index += 1;
    stack.push(vertex);
    vertex.on_stack = true;

    for (const target of vertices) {
      if (edges.get(vertex)?.has(target)) {
        if (target.index === undefined) {
          strong_connect(target);
          vertex.lowlink = Math.min(vertex.lowlink, target.lowlink);
        } else if (target.on_stack) {
          vertex.lowlink = Math.min(vertex.lowlink, target.index);
        }
      }
    }

    if (vertex.index === vertex.lowlink) {
      const new_component = [];
      let current;
      do {
        current = stack.pop();
        current.on_stack = false;
        new_component.push(current);
      } while (current !== vertex);
      connected_components.push(new_component);
    }
  }

  return connected_components;
}
