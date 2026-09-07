export const topicNodeId = (topic) => `${topic.kind === "concept" ? "tech" : "topic"}:${topic.id}`;

// Keep all matching directions; only membership edges from the actual corpus are shown.
export function buildLandscapeGraph(topics, source) {
  const nodes = topics.map((topic, index) => {
    // A stable spherical scaffold keeps isolated directions in view, too.
    const y = topics.length === 1 ? 0 : 1 - 2 * index / (topics.length - 1);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const radius = Math.sqrt(1 - y * y);
    return { data: {
    id: topicNodeId(topic), label: topic.name, name: topic.name,
    type: topic.kind === "concept" ? "technology" : "topic", kind: topic.kind,
    size: 8 + Math.log2(1 + topic.paper_count), papers: topic.paper_count,
    fx: 145 * radius * Math.cos(angle), fy: 145 * y, fz: 145 * radius * Math.sin(angle),
  } }; });
  const topicIds = new Set(nodes.map((node) => node.data.id));
  const paperNodes = (source?.nodes || []).filter((node) => node.data.type === "paper");
  const paperIds = new Set(paperNodes.map((node) => node.data.id));
  const edges = (source?.edges || []).filter(({ data: edge }) =>
    ["belongs_to", "uses"].includes(edge.relation) && topicIds.has(edge.target) && paperIds.has(edge.source)
  );
  const connected = new Set(edges.map((edge) => edge.data.source));
  return { nodes: [...nodes, ...paperNodes.filter((node) => connected.has(node.data.id))], edges };
}
