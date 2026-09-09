export const assemblyPositions = {
  case: [0, 0, 0], "side-panel": [2.74, 0.15, 0.05], motherboard: [0.05, 0.18, 0.05], cpu: [0.06, 1.08, 0.03], "cpu-cooler": [0.06, 1.48, 0.03], "ram-a": [0.58, 0.93, 0.07], "ram-b": [0.85, 0.93, 0.07], gpu: [0.2, -0.12, 0.7], m2: [0.42, 0.1, 0.16], "sata-ssd": [1.55, 0.05, 0.52], psu: [0.25, -1.18, -0.38], "case-fan-front": [-1.58, 0.18, 0.28], "case-fan-rear": [1.58, 0.22, 0.38], "main-power": [0.72, 0.4, 0.55], "cpu-power": [0.67, 0.92, 0.55], "gpu-power": [0.8, -0.15, 0.82], "sata-cables": [1.05, 0.02, 0.63],
};
export const explodeVectors = {
  case: [0, 0.1, -0.1], "side-panel": [1.35, 0.16, 0.2], motherboard: [0, 0.05, -0.22], cpu: [0, 0.75, 0.05], "cpu-cooler": [0, 1.12, 0.1], "ram-a": [-0.4, 0.8, 0.18], "ram-b": [0.42, 0.8, 0.18], gpu: [0.15, -0.58, 0.72], m2: [-0.65, 0.18, 0.5], "sata-ssd": [1.35, 0.25, 0.72], psu: [0.15, -0.9, -0.4], "case-fan-front": [-1.1, 0.1, 0.25], "case-fan-rear": [1.1, 0.12, 0.3], "main-power": [0.8, 0.25, 1.0], "cpu-power": [0.8, 0.55, 0.9], "gpu-power": [0.65, -0.35, 0.88], "sata-cables": [1.15, 0.15, 0.9],
};
export function getAssemblyPosition(instanceId) { return [...(assemblyPositions[instanceId] || [0, 0, 0])]; }
export function getExplodedPosition(instanceId, percentage = 0) { const base = getAssemblyPosition(instanceId); const vector = explodeVectors[instanceId] || [0, 0, 0]; const factor = Math.max(0, Math.min(100, percentage)) / 100; return base.map((value, index) => value + vector[index] * factor); }
export function clearFreeMoveOffsets() { return {}; }
