import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const nr = data.normalized_result;
const summary = nr.summary;
const out = {
  evidence_id: data.evidence_id,
  subject: data.subject,
  parameters: data.parameters,
  statistics: nr.statistics,
  browser_windows: summary.browser_windows,
  explicit_web_preferences: summary.explicit_web_preferences,
  preload_entrypoints: summary.preload_entrypoints,
  context_bridge_apis: summary.context_bridge_apis,
  ipc_counts: summary.ipc && Object.fromEntries(Object.entries(summary.ipc).map(([k, v]) => [k, Array.isArray(v) ? { count: v.length, sample: v.slice(0, 12) } : v])),
  utility_processes: summary.utility_processes,
  native_addon_bindings: summary.native_addon_bindings,
  route_stats: nr.route_inventory.statistics,
  route_count: nr.route_inventory.routes?.length,
  sem_graph: {
    nodes: nr.semantic_graph.nodes?.length,
    relations: nr.semantic_graph.relations?.length,
    kinds: [...new Set((nr.semantic_graph.nodes || []).map(n => n.kind))],
  },
};
console.log(JSON.stringify(out, null, 2));
