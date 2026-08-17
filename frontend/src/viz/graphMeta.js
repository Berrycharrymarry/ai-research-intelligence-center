/** Lightweight shared graph metadata — imported everywhere without pulling in 3D/2D engines. */
export const NODE_COLORS = {
  paper: "#2dd4bf",
  author: "#f59e0b",
  topic: "#22d3ee",
  technology: "#a78bfa",
};

const TYPE_LABEL_KEYS = {
  paper: "nodeType.paper",
  author: "nodeType.author",
  topic: "nodeType.topic",
  technology: "nodeType.technology",
};

export function nodeLabel(t, type) {
  const key = TYPE_LABEL_KEYS[type];
  if (!key) return type;
  const label = t(key);
  return label === key ? type : label;
}

/** Returns the translated value for key, or `fallback` when the key is missing. */
export function tOr(t, key, fallback) {
  const v = t(key);
  return v === key ? fallback : v;
}
