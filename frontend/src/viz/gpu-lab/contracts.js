export const SCHEMA_VERSION = 1;
export const COMMANDS = Object.freeze({
  SELECT: "SELECT", ENTER: "ENTER", BACK: "BACK", RESTORE_CURRENT: "RESTORE_CURRENT",
  RESET_ALL: "RESET_ALL", SET_EXPLODED: "SET_EXPLODED", SET_CONCEPTUAL: "SET_CONCEPTUAL",
  SET_VISIBILITY: "SET_VISIBILITY", SET_XRAY: "SET_XRAY", SET_AUTOROTATE: "SET_AUTOROTATE",
  SET_INSPECTION_MODE: "SET_INSPECTION_MODE", RETRY_LOAD: "RETRY_LOAD",
});
export const NODE_KINDS = new Set(["assembly", "part", "region", "feature"]);
export const JOINTS = new Set(["service", "bonded", "integral", "none"]);
export const EVIDENCE = new Set(["photo", "existing_model", "conceptual"]);

export function defaultCapabilities(node) {
  const leaf = !node.childIds?.length;
  return {
    select: node.kind !== "region",
    detach: node.kind === "part" && node.joint === "service",
    drill: !leaf && node.kind === "assembly",
    inspectRotate: node.kind === "part" || node.kind === "assembly",
  };
}

export function makeInitialSnapshot() {
  return Object.freeze({
    phase: "loading", revision: 0, committedPath: ["gpu"], selectionId: "gpu", hoverId: null,
    layout: "assembled", conceptual: false, xray: false, autoRotate: false,
    inspectionMode: "scene", explicitVisibility: {}, temporaryOverrides: {}, pendingIntent: null,
  });
}
