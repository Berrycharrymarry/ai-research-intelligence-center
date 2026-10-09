import { Group } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { validateManifest } from "./manifestValidator.js";

async function sha256(buffer) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseGlb(buffer) {
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, "", resolve, reject));
}

export async function loadGpuAsset(asset, { signal } = {}) {
  const [modelResponse, manifestResponse] = await Promise.all([
    fetch(asset.modelUrl, { signal }),
    fetch(asset.manifestUrl, { signal }),
  ]);
  if (!modelResponse.ok) throw new Error(`GLB request failed (${modelResponse.status})`);
  if (!manifestResponse.ok) throw new Error(`Manifest request failed (${manifestResponse.status})`);
  const [buffer, manifest] = await Promise.all([modelResponse.arrayBuffer(), manifestResponse.json()]);
  const actualHash = await sha256(buffer);
  if (actualHash && actualHash !== asset.modelSha256) throw new Error("GLB integrity check failed");
  const validation = validateManifest(manifest, {
    mode: "production",
    assetMeta: { assetSha256: asset.modelSha256, assetVersion: asset.version },
  });
  if (validation.errors.length) throw new Error(validation.errors.map((item) => `${item.code}: ${item.message}`).join("\n"));
  const gltf = await parseGlb(buffer);
  return { gltf, manifest, manifestMap: validation.resolvedNodes, sourceRoot: new Group().add(gltf.scene) };
}
