import test from "node:test";
import assert from "node:assert/strict";
import { validateManifest } from "../../src/viz/gpu-lab/manifestValidator.js";

const base = () => ({ schemaVersion: 1, assetVersion: "v1", assetSha256: "abc", unit: "m", rootId: "gpu", meshBindings: [], nodes: [
  { id:"gpu", parentId:null, childIds:["part"], kind:"assembly", joint:"service", evidence:"existing_model", leafReason:null, capabilities:{select:true,detach:false,drill:true,inspectRotate:true} },
  { id:"part", parentId:"gpu", childIds:[], kind:"part", joint:"integral", evidence:"existing_model", leafReason:"atomic", sourceNames:["Mesh"], newGeometry:false, capabilities:{select:true,detach:false,drill:false,inspectRotate:true} },
]});
test("valid planning manifest", () => assert.equal(validateManifest(base(), { mode:"planning" }).errors.length, 0));
test("rejects duplicate ids", () => { const m=base(); m.nodes.push({...m.nodes[1]}); assert.ok(validateManifest(m,{mode:"planning"}).errors.some(e=>e.code==="duplicate_id")); });
test("rejects cycles", () => { const m=base(); m.nodes[0].parentId="part"; m.nodes[0].childIds=[]; m.nodes[1].childIds=["gpu"]; assert.ok(validateManifest(m,{mode:"planning"}).errors.some(e=>e.code==="cycle")); });
test("rejects conceptual node without teaching marker", () => { const m=base(); m.nodes[1].evidence="conceptual"; assert.ok(validateManifest(m,{mode:"planning"}).errors.some(e=>e.code==="conceptual_label")); });
test("production requires geometry and bindings", () => assert.ok(validateManifest(base()).errors.some(e=>e.code==="missing_geometry")));
test("rejects asset mismatch", () => assert.ok(validateManifest(base(),{mode:"planning",assetMeta:{assetSha256:"wrong"}}).errors.some(e=>e.code==="asset_hash")));
