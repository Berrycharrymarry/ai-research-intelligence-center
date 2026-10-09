import { Group, Matrix4, Vector3 } from "three";

const WORLD_UP_FIX = Math.PI / 2;

function cloneMaterial(material) {
  const result = material.clone();
  result.userData.gpuBase = { opacity: result.opacity, transparent: result.transparent, depthWrite: result.depthWrite };
  return result;
}

export function createObjectRegistry(gltfScene, manifest) {
  const root = new Group();
  root.name = "GPU_INTERACTION_ROOT";
  const normalize = new Group();
  normalize.rotation.x = WORLD_UP_FIX;
  normalize.add(gltfScene);
  normalize.updateMatrixWorld(true);

  const nodes = new Map(manifest.nodes.map((node) => [node.id, node]));
  const groups = new Map();
  const meshes = [];
  for (const node of manifest.nodes) {
    const group = new Group();
    group.name = `PART__${node.id.replaceAll(".", "__")}`;
    group.userData.gpuPartId = node.id;
    groups.set(node.id, group);
  }
  for (const node of manifest.nodes) {
    const group = groups.get(node.id);
    const parent = node.parentId ? groups.get(node.parentId) : root;
    parent.add(group);
    const pivot = new Vector3(...(node.restPivot || [0, 0, 0]));
    const parentPivot = node.parentId ? new Vector3(...(nodes.get(node.parentId).restPivot || [0, 0, 0])) : new Vector3();
    group.position.copy(pivot.sub(parentPivot));
  }
  root.updateMatrixWorld(true);

  for (const binding of manifest.meshBindings) {
    const object = gltfScene.getObjectByName(binding.gltfNodeName);
    const owner = groups.get(binding.partId);
    if (!object || !owner) continue;
    object.updateMatrixWorld(true);
    const world = object.matrixWorld.clone();
    const local = new Matrix4().copy(owner.matrixWorld).invert().multiply(world);
    owner.add(object);
    local.decompose(object.position, object.quaternion, object.scale);
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.userData.gpuPartId = binding.partId;
      child.userData.gpuEvidence = binding.evidence;
      child.material = Array.isArray(child.material) ? child.material.map(cloneMaterial) : cloneMaterial(child.material);
      child.castShadow = false;
      child.receiveShadow = false;
      meshes.push(child);
    });
  }
  const home = new Map();
  for (const [id, group] of groups) home.set(id, { position: group.position.clone(), quaternion: group.quaternion.clone() });
  root.updateMatrixWorld(true);
  return { root, nodes, groups, meshes, home, manifest };
}

export function setRegistryAppearance(registry, { conceptual = false, xray = false, selectedId = "gpu", temporaryHidden = new Set(), explicitHidden = new Set() }) {
  const containedBy = (set, id) => [...set].some((owner) => id === owner || id.startsWith(`${owner}.`));
  for (const mesh of registry.meshes) {
    const id = mesh.userData.gpuPartId;
    const node = registry.nodes.get(id);
    mesh.visible = !containedBy(explicitHidden, id) && !containedBy(temporaryHidden, id) && (conceptual || node?.evidence !== "conceptual");
    const inSelection = selectedId === "gpu" || id === selectedId || id.startsWith(`${selectedId}.`) || selectedId.startsWith(`${id}.`);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const base = material.userData.gpuBase;
      const fade = xray && !inSelection;
      material.transparent = fade || base.transparent;
      material.opacity = fade ? 0.1 : base.opacity;
      material.depthWrite = fade ? false : base.depthWrite;
      material.needsUpdate = true;
    }
  }
}

export function disposeRegistry(registry) {
  registry.root.traverse((object) => {
    object.geometry?.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    for (const material of materials) material.dispose();
  });
}
