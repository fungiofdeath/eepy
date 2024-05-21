
/**
 * @template V
 * @param {V[]} vertices
 * @param {Map<V, Set<V> | undefined>} edges
 * @returns {V[][]}
 */
export function find_sccs(vertices, edges) {
  /** @typedef {{ value: V, index?: number, low_link?: number, on_stack?: boolean }} VWrapper */

  // Tarjan's SCC algorithm
  // @see: https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
  /** @type {VWrapper[][]} */
  const connected_components = [];
  /** @type {VWrapper[]} */
  const stack = [];
  let tarjan_index = 0;

  /** @type {VWrapper[]} */
  const vertices_internal = vertices.map(value => ({ value }));

  for (const vertex of vertices_internal) {
    if (vertex.index === undefined) {
      strong_connect(vertex);
    }
  }

  /**
   * @param {VWrapper} vertex
   */
  function strong_connect(vertex) {
    vertex.index = tarjan_index;
    vertex.low_link = tarjan_index;
    tarjan_index += 1;
    stack.push(vertex);
    vertex.on_stack = true;

    for (const target of vertices_internal) {
      if (edges.get(vertex.value)?.has(target.value)) {
        if (target.index === undefined) {
          strong_connect(target);
          vertex.low_link = Math.min(vertex.low_link, target.low_link);
        } else if (target.on_stack) {
          vertex.low_link = Math.min(vertex.low_link, target.index);
        }
      }
    }

    if (vertex.index === vertex.low_link) {
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

  return connected_components.map(component => component.map(v => v.value));
}
