import { EVIDENCE, JOINTS, NODE_KINDS, SCHEMA_VERSION, defaultCapabilities } from "./contracts.js";

export function validateManifest(manifest, { mode = "production", assetMeta = {} } = {}) {
  const errors = [], warnings = [];
  const fail = (code, id, message) => errors.push({ code, id, message });
  if (!manifest || typeof manifest !== "object") return { errors: [{ code: "manifest_type", message: "Manifest must be an object" }], warnings, resolvedNodes: new Map() };
  if (manifest.schemaVersion !== SCHEMA_VERSION) fail("schema_version", null, `Expected ${SCHEMA_VERSION}`);
  if (manifest.unit !== "m") fail("unit", null, "unit must be m");
  if (manifest.rootId !== "gpu") fail("root", null, "rootId must be gpu");
  if (assetMeta.assetSha256 && manifest.assetSha256 !== assetMeta.assetSha256) fail("asset_hash", null, "GLB hash mismatch");
  if (assetMeta.assetVersion && manifest.assetVersion !== assetMeta.assetVersion) fail("asset_version", null, "Asset version mismatch");
  const nodes = Array.isArray(manifest.nodes) ? manifest.nodes : [];
  const map = new Map();
  for (const node of nodes) {
    if (!node?.id || map.has(node.id)) { fail("duplicate_id", node?.id, "Missing or duplicate node id"); continue; }
    map.set(node.id, { ...node, capabilities: node.capabilities || defaultCapabilities(node) });
  }
  for (const node of map.values()) {
    if (!NODE_KINDS.has(node.kind)) fail("kind", node.id, "Invalid kind");
    if (!JOINTS.has(node.joint)) fail("joint", node.id, "Invalid joint");
    if (!EVIDENCE.has(node.evidence)) fail("evidence", node.id, "Invalid evidence");
    if (node.parentId !== null && !map.has(node.parentId)) fail("orphan", node.id, `Missing parent ${node.parentId}`);
    const actual = [...map.values()].filter(n => n.parentId === node.id).map(n => n.id);
    const declared = node.childIds || [];
    if (actual.length !== declared.length || actual.some(id => !declared.includes(id))) fail("child_mismatch", node.id, "childIds do not match parentId links");
    if (!declared.length && !node.leafReason && node.kind !== "region" && node.kind !== "feature") fail("leaf_reason", node.id, "Leaf needs a reason");
    if ((node.kind === "feature" || node.kind === "region") && node.capabilities?.detach) fail("false_detach", node.id, "Feature/region cannot detach");
    if (node.joint === "integral" && node.capabilities?.detach) fail("integral_detach", node.id, "Integral part cannot detach");
    if (node.evidence === "conceptual" && node.teachingOnly !== true) fail("conceptual_label", node.id, "Conceptual node must be teachingOnly");
    if (mode === "production" && node.kind === "part" && !(node.meshIds?.length)) fail("missing_geometry", node.id, "Production part has no meshIds");
  }
  for (const node of map.values()) {
    const seen = new Set(); let cursor = node;
    while (cursor) {
      if (seen.has(cursor.id)) { fail("cycle", node.id, "Ownership cycle detected"); break; }
      seen.add(cursor.id); cursor = cursor.parentId ? map.get(cursor.parentId) : null;
    }
  }
  const meshOwner = new Map();
  for (const binding of manifest.meshBindings || []) {
    if (!map.has(binding.partId)) fail("binding_part", binding.meshId, `Unknown part ${binding.partId}`);
    if (meshOwner.has(binding.meshId)) fail("mesh_owner", binding.meshId, "Mesh assigned more than once");
    meshOwner.set(binding.meshId, binding.partId);
  }
  if (mode === "production" && !(manifest.meshBindings?.length)) fail("bindings", null, "No production mesh bindings");
  return { errors, warnings, resolvedNodes: map };
}

export function assertValidManifest(manifest, options) {
  const result = validateManifest(manifest, options);
  if (result.errors.length) throw new Error(result.errors.map(e => `${e.code}:${e.id || "manifest"}:${e.message}`).join("\n"));
  return result;
}
