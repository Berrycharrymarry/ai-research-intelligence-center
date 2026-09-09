import * as THREE from "three";

const colors = { pcb: 0x285d58, dark: 0x222b31, silver: 0xc8d0d2, copper: 0xb76b39, gold: 0xd8b452, red: 0xb75a5e, blue: 0x547d9d, green: 0x69a46d, black: 0x182026 };
const material = (color, roughness = 0.55, metalness = 0.15) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const box = (w, h, d, color, name) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color)); mesh.name = name; return mesh; };
const cyl = (radius, depth, color, name, segments = 24) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), material(color)); mesh.name = name; return mesh; };
const add = (group, object, position = [0, 0, 0], rotation = [0, 0, 0]) => { object.position.set(...position); object.rotation.set(...rotation); group.add(object); return object; };

function fan(group, radius = 0.65) { add(group, cyl(radius, 0.12, colors.dark, "fan-frame"), [0, 0, 0], [Math.PI / 2, 0, 0]); add(group, cyl(radius * 0.2, 0.15, colors.silver, "fan-hub"), [0, 0, 0.1], [Math.PI / 2, 0, 0]); for (let i = 0; i < 7; i += 1) add(group, box(radius * 0.12, radius * 0.58, 0.06, colors.silver, `blade-${i}`), [Math.cos(i * Math.PI / 3.5) * radius * 0.38, Math.sin(i * Math.PI / 3.5) * radius * 0.38, 0.11], [0, 0, i * Math.PI / 3.5]); }
function fins(group, count = 10, width = 2.3, height = 1.0) { for (let i = 0; i < count; i += 1) add(group, box(width, 0.07, height, colors.silver, `fin-${i}`), [0, -0.32 + i * 0.07, 0]); }
function addNode(root, nodes, id, builder) { const group = new THREE.Group(); group.name = id; group.userData.nodeId = id; builder(group); group.traverse((object) => { if (object.isMesh) { object.userData.nodeId = id; object.castShadow = true; object.receiveShadow = true; } }); root.add(group); nodes[id] = group; return group; }

export function buildDrilldownModels() {
  const root = new THREE.Group(); const nodes = {};
  addNode(root, nodes, "gpu-cooler", (g) => { add(g, box(3.2, 1.3, 0.26, colors.dark, "shroud")); fins(g, 11, 2.5, 0.8); const left = new THREE.Group(); fan(left, 0.48); add(g, left, [-0.85, 0, 0.22]); const right = new THREE.Group(); fan(right, 0.48); add(g, right, [0.85, 0, 0.22]); });
  addNode(root, nodes, "gpu-fan", (g) => fan(g, 0.82));
  addNode(root, nodes, "gpu-fins", (g) => fins(g, 14, 3.0, 1.0));
  addNode(root, nodes, "gpu-heat-base", (g) => { add(g, box(2.5, 0.16, 1.0, colors.copper, "contact-plate")); for (let i = -1; i <= 1; i += 1) add(g, cyl(0.06, 2.2, colors.copper, `heat-pipe-${i}`), [i * 0.45, 0.18, 0.35], [0, 0, Math.PI / 2]); });
  addNode(root, nodes, "gpu-package", (g) => { add(g, box(1.25, 1.25, 0.15, colors.gold, "package-substrate")); add(g, box(0.78, 0.78, 0.14, colors.green, "die"), [0, 0.08, 0.14]); });
  addNode(root, nodes, "gpu-substrate", (g) => { add(g, box(1.45, 1.45, 0.12, colors.gold, "substrate")); for (let i = 0; i < 12; i += 1) add(g, cyl(0.035, 0.08, colors.silver, `solder-${i}`, 10), [-0.55 + (i % 6) * 0.22, -0.55 + Math.floor(i / 6) * 1.1, 0.1]); });
  addNode(root, nodes, "gpu-die", (g) => { add(g, box(0.9, 0.9, 0.12, colors.green, "silicon-die")); for (let i = 0; i < 9; i += 1) add(g, box(0.17, 0.17, 0.04, i % 2 ? colors.blue : colors.gold, `die-region-${i}`), [-0.3 + (i % 3) * 0.3, -0.3 + Math.floor(i / 3) * 0.3, 0.09]); });
  addNode(root, nodes, "gpu-vram", (g) => { for (let i = 0; i < 4; i += 1) add(g, box(0.45, 0.34, 0.11, colors.black, `vram-chip-${i}`), [-0.78 + (i % 2) * 1.56, -0.33 + Math.floor(i / 2) * 0.66, 0]); add(g, box(1.9, 1.05, 0.06, colors.pcb, "vram-board"), [0, 0, -0.1]); });
  addNode(root, nodes, "gpu-vram-package", (g) => { add(g, box(0.84, 0.62, 0.12, colors.black, "memory-package")); add(g, box(0.48, 0.34, 0.08, colors.green, "memory-die"), [0, 0.08, 0.1]); });
  addNode(root, nodes, "gpu-power-zone", (g) => { add(g, box(2.3, 1.2, 0.08, colors.pcb, "power-pcb")); for (let i = 0; i < 5; i += 1) { add(g, cyl(0.12, 0.2, colors.copper, `inductor-${i}`), [-0.75 + i * 0.38, 0.25, 0.1]); add(g, box(0.16, 0.34, 0.14, colors.silver, `mosfet-${i}`), [-0.75 + i * 0.38, -0.22, 0.1]); } });
  addNode(root, nodes, "gpu-vrm", (g) => { for (let i = 0; i < 6; i += 1) { add(g, cyl(0.13, 0.25, colors.copper, `vrm-inductor-${i}`), [-0.75 + (i % 3) * 0.75, 0.3 - Math.floor(i / 3) * 0.6, 0]); add(g, box(0.23, 0.18, 0.14, colors.black, `vrm-mosfet-${i}`), [-0.75 + (i % 3) * 0.75, 0.06 - Math.floor(i / 3) * 0.6, 0.1]); } });
  addNode(root, nodes, "gpu-pcb", (g) => { add(g, box(3.25, 1.35, 0.1, colors.pcb, "gpu-pcb")); for (let i = 0; i < 7; i += 1) add(g, box(1.8, 0.025, 0.02, colors.gold, `trace-${i}`), [0, -0.48 + i * 0.16, 0.08]); add(g, box(0.7, 0.7, 0.12, colors.green, "gpu-mount"), [0, 0, 0.1]); });
  addNode(root, nodes, "gpu-backplate", (g) => { add(g, box(3.35, 1.45, 0.1, colors.silver, "backplate")); add(g, box(1.5, 0.06, 0.02, colors.blue, "backplate-mark"), [0, 0, 0.08]); });
  addNode(root, nodes, "gpu-ports", (g) => { add(g, box(0.16, 1.45, 1.0, colors.silver, "bracket"), [1.55, 0, 0]); [0.45, 0, -0.45].forEach((y, i) => add(g, box(0.11, 0.24, 0.42, i === 1 ? colors.gold : colors.black, `port-${i}`), [1.64, y, 0])); });
  addNode(root, nodes, "cpu-package", (g) => { add(g, box(1.45, 1.25, 0.14, colors.gold, "cpu-substrate")); add(g, box(1.05, 0.92, 0.15, colors.silver, "cpu-lid"), [0, 0.13, 0.15]); add(g, box(0.65, 0.56, 0.08, colors.green, "cpu-die"), [0, -0.02, 0.24]); });
  addNode(root, nodes, "cpu-lid", (g) => add(g, box(1.65, 1.35, 0.14, colors.silver, "heat-spreader")));
  addNode(root, nodes, "cpu-substrate", (g) => { add(g, box(1.55, 1.25, 0.12, colors.gold, "package-substrate")); for (let i = 0; i < 16; i += 1) add(g, cyl(0.035, 0.06, colors.silver, `contact-${i}`, 10), [-0.6 + (i % 8) * 0.17, -0.5 + Math.floor(i / 8) * 1.0, 0.1]); });
  addNode(root, nodes, "cpu-die", (g) => { add(g, box(1.05, 0.82, 0.1, colors.green, "cpu-die")); for (let i = 0; i < 8; i += 1) add(g, box(0.18, 0.18, 0.04, i % 2 ? colors.blue : colors.gold, `cpu-region-${i}`), [-0.35 + (i % 4) * 0.23, -0.22 + Math.floor(i / 4) * 0.44, 0.08]); });
  const generic = (id, color = colors.pcb) => addNode(root, nodes, id, (g) => { add(g, box(1.8, 1.1, 0.1, color, id)); for (let i = 0; i < 5; i += 1) add(g, box(0.2, 0.2, 0.05, colors.gold, `${id}-detail-${i}`), [-0.6 + i * 0.3, 0, 0.08]); });
  ["motherboard-socket", "motherboard-memory-slots", "motherboard-pcie", "motherboard-chipset", "motherboard-vrm", "motherboard-io", "memory-pcb", "memory-chips", "memory-contacts", "m2-controller", "m2-nand", "m2-connector", "psu-shell", "psu-ports", "cooler-base", "cooler-fins", "cooler-fan"].forEach((id) => generic(id, id.includes("vrm") || id.includes("power") ? colors.copper : colors.pcb));
  addNode(root, nodes, "psu-fan", (g) => fan(g, 0.72));
  return { root, nodes };
}
