import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GPU_LAB_ASSET } from "../src/viz/gpu-lab/assetCatalog.js";
import { validateManifest } from "../src/viz/gpu-lab/manifestValidator.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicPath = (url) => join(root, "public", ...url.split("/").filter(Boolean));
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const manifestBuffer = await readFile(publicPath(GPU_LAB_ASSET.manifestUrl));
const glb = await readFile(publicPath(GPU_LAB_ASSET.modelUrl));
const manifest = JSON.parse(manifestBuffer.toString("utf8"));

if (sha256(glb) !== GPU_LAB_ASSET.modelSha256) throw new Error("GLB catalog hash mismatch");
if (sha256(manifestBuffer) !== GPU_LAB_ASSET.manifestSha256) throw new Error("Manifest catalog hash mismatch");
if (glb.toString("ascii", 0, 4) !== "glTF") throw new Error("Asset is not a binary glTF");
const jsonLength = glb.readUInt32LE(12);
const jsonType = glb.toString("ascii", 16, 20);
if (jsonType !== "JSON") throw new Error("GLB has no JSON chunk");
const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
const names = new Set((gltf.nodes || []).map((node) => node.name));
const validation = validateManifest(manifest, {
  mode: "production",
  assetMeta: { assetSha256: GPU_LAB_ASSET.modelSha256, assetVersion: GPU_LAB_ASSET.version },
});
for (const binding of manifest.meshBindings || []) {
  if (!names.has(binding.gltfNodeName)) validation.errors.push({ code: "missing_glb_node", id: binding.gltfNodeName, message: "Binding target absent from GLB" });
}
if (validation.errors.length) throw new Error(validation.errors.map((e) => `${e.code}:${e.id || "manifest"}:${e.message}`).join("\n"));
const report = {
  version: manifest.assetVersion,
  manifestNodes: manifest.nodes.length,
  meshBindings: manifest.meshBindings.length,
  gltfNodes: gltf.nodes?.length || 0,
  meshes: gltf.meshes?.length || 0,
  materials: gltf.materials?.length || 0,
  bytes: glb.length,
  sha256: sha256(glb),
};
console.log(JSON.stringify(report, null, 2));
