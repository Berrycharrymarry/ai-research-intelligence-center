import test from "node:test";
import assert from "node:assert/strict";
import { gpuReducer, initialGpuState } from "../../src/viz/gpu-lab/interactionState.js";

const nodes = new Map([
  ["gpu", { id: "gpu", parentId: null }],
  ["board", { id: "board", parentId: "gpu" }],
  ["board.gpu", { id: "board.gpu", parentId: "board" }],
  ["board.gpu.die", { id: "board.gpu.die", parentId: "board.gpu" }],
]);

test("selection derives recursive breadcrumb path", () => {
  const state = gpuReducer(initialGpuState, { type: "SELECT", id: "board.gpu.die", nodes });
  assert.deepEqual(state.path, ["gpu", "board", "board.gpu", "board.gpu.die"]);
  assert.equal(state.exploded, false);
});

test("back returns exactly one ownership level", () => {
  const selected = gpuReducer(initialGpuState, { type: "SELECT", id: "board.gpu.die", nodes });
  const state = gpuReducer(selected, { type: "BACK" });
  assert.equal(state.selectedId, "board.gpu");
  assert.deepEqual(state.path, ["gpu", "board", "board.gpu"]);
});

test("explode returns navigation to the assembly root", () => {
  const selected = gpuReducer(initialGpuState, { type: "SELECT", id: "board.gpu.die", nodes });
  const state = gpuReducer(selected, { type: "EXPLODE" });
  assert.equal(state.exploded, true);
  assert.equal(state.selectedId, "gpu");
  assert.deepEqual(state.path, ["gpu"]);
});

test("visibility toggles without mutating the previous set", () => {
  const hidden = gpuReducer(initialGpuState, { type: "VISIBILITY", id: "board.gpu.die" });
  assert.equal(initialGpuState.hidden.size, 0);
  assert.equal(hidden.hidden.has("board.gpu.die"), true);
  const visible = gpuReducer(hidden, { type: "VISIBILITY", id: "board.gpu.die" });
  assert.equal(visible.hidden.has("board.gpu.die"), false);
});

test("reset preserves asset readiness and conceptual preference", () => {
  const state = gpuReducer({ ...initialGpuState, status: "ready", conceptual: true, selectedId: "board" }, { type: "RESET" });
  assert.equal(state.status, "ready");
  assert.equal(state.conceptual, true);
  assert.equal(state.selectedId, "gpu");
});
