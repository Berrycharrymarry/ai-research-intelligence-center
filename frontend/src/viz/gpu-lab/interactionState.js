export const initialGpuState = {
  status: "loading",
  selectedId: "gpu",
  hoverId: null,
  path: ["gpu"],
  exploded: false,
  conceptual: false,
  xray: false,
  autoRotate: false,
  inspectionMode: "scene",
  hidden: new Set(),
  error: null,
  revision: 0,
  motionRevision: 0,
};

function lineage(id, nodes) {
  const path = [];
  let current = nodes.get(id);
  while (current) { path.unshift(current.id); current = current.parentId ? nodes.get(current.parentId) : null; }
  return path.length ? path : ["gpu"];
}

export function gpuReducer(state, action) {
  const revision = state.revision + 1;
  switch (action.type) {
    case "READY": return { ...state, status: "ready", error: null, revision };
    case "ERROR": return { ...state, status: "error", error: action.error, revision };
    case "HOVER": return state.hoverId === action.id ? state : { ...state, hoverId: action.id, revision };
    case "SELECT": return { ...state, selectedId: action.id, path: lineage(action.id, action.nodes), exploded: false, revision, motionRevision: state.motionRevision + 1 };
    case "BACK": {
      const path = state.path.length > 1 ? state.path.slice(0, -1) : state.path;
      return { ...state, selectedId: path.at(-1), path, exploded: false, revision, motionRevision: state.motionRevision + 1 };
    }
    case "RESET": return { ...initialGpuState, status: state.status, conceptual: state.conceptual, revision, motionRevision: state.motionRevision + 1 };
    case "EXPLODE": return { ...state, exploded: !state.exploded, selectedId: "gpu", path: ["gpu"], revision, motionRevision: state.motionRevision + 1 };
    case "CONCEPTUAL": return { ...state, conceptual: !state.conceptual, revision };
    case "XRAY": return { ...state, xray: !state.xray, revision };
    case "AUTOROTATE": return { ...state, autoRotate: !state.autoRotate, revision };
    case "MODE": return { ...state, inspectionMode: action.mode, revision };
    case "VISIBILITY": {
      const hidden = new Set(state.hidden);
      if (hidden.has(action.id)) hidden.delete(action.id); else hidden.add(action.id);
      return { ...state, hidden, revision };
    }
    default: return state;
  }
}
