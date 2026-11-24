// graph: { [node]: string[] }  ->  start 에서 goal 까지 최단 경로(노드 배열), 없으면 null
export function shortestPath(graph, start, goal) {
  const visited = [start];
  const queue = [[start]];
  while (queue.length > 0) {
    const path = queue.shift();
    const node = path[path.length - 1];
    if (node === goal) return path;
    for (const next of graph[node] || []) {
      if (!visited.includes(next)) {
        visited.push(next);
        queue.push(path.concat(next));
      }
    }
  }
  return null;
}
