import { Box3, Quaternion, Sphere, Vector3 } from "three";

const ease = (t) => 1 - Math.pow(1 - t, 3);
const L1_EXPLODE = {
  shroud: [0, 0, 0.105], "fan.01": [-0.02, 0.025, 0.068], "fan.02": [0, 0.036, 0.075], "fan.03": [0.02, 0.025, 0.068],
  cooling: [0, 0, 0.025], board: [0, 0, -0.045], backplate: [0, 0, -0.105], io: [-0.075, 0, 0],
};

export class GpuAnimationController {
  constructor(registry, camera, controls) {
    this.registry = registry;
    this.camera = camera;
    this.controls = controls;
    this.tweens = new Map();
    this.cameraTween = null;
  }

  tweenPosition(id, target, duration = 520) {
    const object = this.registry.groups.get(id);
    if (!object) return;
    this.tweens.set(id, { object, from: object.position.clone(), to: target.clone(), start: performance.now(), duration });
  }

  restoreAll(duration = 420) {
    for (const [id, pose] of this.registry.home) {
      this.tweenPosition(id, pose.position, duration);
      const object = this.registry.groups.get(id);
      object.quaternion.copy(pose.quaternion);
    }
  }

  select(id) {
    this.restoreAll(360);
    if (id !== "gpu") {
      const chain = [];
      let node = this.registry.nodes.get(id);
      while (node?.parentId) { chain.unshift(node); node = this.registry.nodes.get(node.parentId); }
      chain.forEach((item, index) => {
        const group = this.registry.groups.get(item.id);
        const home = this.registry.home.get(item.id).position;
        const axis = new Vector3(...(item.motion?.extractAxis || [0, 0, 1])).normalize();
        const distance = Math.max(item.motion?.clearance || 0.012, 0.012) + Math.max(0.055 - index * 0.012, 0.016);
        this.tweenPosition(item.id, home.clone().addScaledVector(axis, distance), 520);
        group.visible = true;
      });
    }
    this.pendingFocus = { id, padding: id === "gpu" ? 1.18 : 1.5, at: performance.now() + 540 };
  }

  explode(enabled) {
    this.restoreAll(420);
    if (!enabled) { this.focus("gpu"); return; }
    for (const [id, offset] of Object.entries(L1_EXPLODE)) {
      const home = this.registry.home.get(id)?.position;
      if (home) this.tweenPosition(id, home.clone().add(new Vector3(...offset)), 650);
    }
    this.focus("gpu", 1.7);
  }

  focus(id, padding = 1.35) {
    const object = this.registry.groups.get(id) || this.registry.root;
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new Sphere());
    const center = sphere.center;
    const radius = Math.max(sphere.radius, 0.015);
    const direction = new Vector3(0.62, 0.36, 1).normalize();
    const distance = Math.max(radius / Math.sin((this.camera.fov * Math.PI / 180) / 2) * padding, 0.18);
    this.cameraTween = {
      fromPosition: this.camera.position.clone(), toPosition: center.clone().addScaledVector(direction, distance),
      fromTarget: this.controls.target.clone(), toTarget: center.clone(), start: performance.now(), duration: 600,
    };
  }

  update(now) {
    for (const [id, tween] of this.tweens) {
      const progress = Math.min(1, (now - tween.start) / tween.duration);
      tween.object.position.lerpVectors(tween.from, tween.to, ease(progress));
      if (progress >= 1) this.tweens.delete(id);
    }
    if (this.cameraTween) {
      const progress = Math.min(1, (now - this.cameraTween.start) / this.cameraTween.duration);
      const amount = ease(progress);
      this.camera.position.lerpVectors(this.cameraTween.fromPosition, this.cameraTween.toPosition, amount);
      this.controls.target.lerpVectors(this.cameraTween.fromTarget, this.cameraTween.toTarget, amount);
      if (progress >= 1) this.cameraTween = null;
    }
    if (this.pendingFocus && now >= this.pendingFocus.at) {
      const pending = this.pendingFocus; this.pendingFocus = null; this.focus(pending.id, pending.padding);
    }
  }
}
