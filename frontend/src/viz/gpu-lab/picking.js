import { Raycaster, Vector2 } from "three";

export class GpuPicker {
  constructor(camera, canvas, meshes) {
    this.camera = camera;
    this.canvas = canvas;
    this.meshes = meshes;
    this.raycaster = new Raycaster();
    this.pointer = new Vector2();
  }
  pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes.filter((mesh) => mesh.visible), false)[0];
    return hit?.object?.userData?.gpuPartId || null;
  }
}
