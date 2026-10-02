import { useEffect, useRef, useState } from "react";
import { ACESFilmicToneMapping, Box3, Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, PMREMGenerator, Scene, Sphere, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// The export's fan face points along glTF +Y. Rotate it into a conventional Y-up viewer.
const FRONT_DIRECTION = new Vector3(0, 0.16, 1).normalize();

function disposeModel(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value?.isTexture) value.dispose(); });
      material.dispose();
    });
  });
}

export default function GpuViewer({ modelUrl, fallbackUrl, lang, onStatus, onResetReady }) {
  const host = useRef(null);
  const [status, setStatus] = useState("loading");
  const zh = lang === "zh";

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let renderer;
    let controls;
    let model;
    let observer;
    let pmrem;
    let environment;
    let room;
    const container = host.current;
    const scene = new Scene();
    scene.background = new Color("#f7f8fa");
    const camera = new PerspectiveCamera(35, 1, 0.01, 1000);
    const root = new Group();
    root.rotation.x = Math.PI / 2;
    scene.add(root);
    scene.add(new HemisphereLight(0xffffff, 0xb8bec8, 3));
    const key = new DirectionalLight(0xffffff, 3.1);
    key.position.set(4, 7, 8);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 1.7);
    fill.position.set(-5, 2, -5);
    scene.add(fill);
    let bounds = null;

    const updateStatus = (next) => {
      if (cancelled) return;
      setStatus(next);
      onStatus(next);
    };

    const sizeCanvas = () => {
      if (!renderer) return;
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const fit = () => {
      if (!bounds || !controls) return;
      sizeCanvas();
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      const sphere = bounds.getBoundingSphere(new Sphere());
      const vfov = camera.fov * Math.PI / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const distance = Math.max(size.x / (2 * Math.tan(hfov / 2)), size.y / (2 * Math.tan(vfov / 2))) * 1.28 + size.z / 2;
      camera.position.copy(center).addScaledVector(FRONT_DIRECTION, distance);
      camera.near = Math.max(distance / 100, 0.001);
      camera.far = Math.max(distance * 20, 100);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.minDistance = Math.max(sphere.radius * 0.7, 0.001);
      controls.maxDistance = distance * 3;
      controls.update();
    };

    updateStatus("loading");
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false });
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      pmrem = new PMREMGenerator(renderer);
      room = new RoomEnvironment();
      environment = pmrem.fromScene(room, 0.04);
      scene.environment = environment.texture;
      container.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.autoRotate = false;
      sizeCanvas();
      observer = new ResizeObserver(() => { if (bounds) fit(); else sizeCanvas(); });
      observer.observe(container);
      const render = () => {
        frame = requestAnimationFrame(render);
        controls.update();
        renderer.render(scene, camera);
      };
      render();
      new GLTFLoader().load(modelUrl, (gltf) => {
        if (cancelled) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        root.add(model);
        root.updateMatrixWorld(true);
        bounds = new Box3().setFromObject(root);
        if (bounds.isEmpty()) { updateStatus("error"); return; }
        fit();
        onResetReady(() => fit);
        updateStatus("ready");
      }, undefined, () => updateStatus("error"));
    } catch {
      updateStatus("error");
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      if (model) disposeModel(model);
      environment?.dispose();
      room?.dispose();
      pmrem?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [modelUrl, onStatus, onResetReady]);

  return <div className="gpu-canvas-area">
    <div ref={host} className="gpu-canvas" aria-label={zh ? "可旋转缩放的显卡三维模型" : "Rotatable and zoomable 3D graphics card"} />
    {status !== "ready" && <div className="gpu-viewer-fallback">
      <img src={fallbackUrl} alt={zh ? "显卡外观渲染图" : "GPU exterior render"} />
      <p>{status === "loading" ? (zh ? "3D 模型加载中…" : "Loading 3D model…") : (zh ? "3D 模型无法显示，可查看渲染图。" : "The 3D model cannot be displayed. View the renders below.")}</p>
    </div>}
  </div>;
}
