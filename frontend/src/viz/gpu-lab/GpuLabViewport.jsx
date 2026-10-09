import { useEffect, useRef } from "react";
import { ACESFilmicToneMapping, Box3, Box3Helper, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, PlaneGeometry, Mesh, MeshStandardMaterial, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadGpuAsset } from "./assetLoader.js";
import { createObjectRegistry, disposeRegistry, setRegistryAppearance } from "./objectRegistry.js";
import { GpuAnimationController } from "./animationController.js";
import { GpuPicker } from "./picking.js";

function setHelper(helper, object) {
  if (!object) { helper.visible = false; return; }
  helper.box.setFromObject(object);
  helper.visible = !helper.box.isEmpty();
}

export default function GpuLabViewport({ asset, state, dispatch, onManifest, zh }) {
  const host = useRef(null);
  const runtime = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const container = host.current;
    const aborter = new AbortController();
    let disposed = false;
    let frame = 0;
    const scene = new Scene();
    scene.background = new Color("#0b0e12");
    const camera = new PerspectiveCamera(34, 1, 0.002, 20);
    camera.position.set(0.35, 0.22, 0.62);
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 0.08;
    controls.maxDistance = 2.4;
    const hemi = new HemisphereLight(0xdbe7ff, 0x10141a, 2.1);
    scene.add(hemi);
    const key = new DirectionalLight(0xffffff, 3.8); key.position.set(1.5, 2.5, 3); scene.add(key);
    const rim = new DirectionalLight(0xff5caa, 2.2); rim.position.set(-2, 0.5, -2); scene.add(rim);
    const fill = new DirectionalLight(0x88b8ff, 1.4); fill.position.set(2, -1.5, -1); scene.add(fill);
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.03);
    scene.environment = environment.texture;
    const floor = new Mesh(new PlaneGeometry(4, 4), new MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.84, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.19; scene.add(floor);
    const hoverHelper = new Box3Helper(new Box3(), 0xff4f9a); hoverHelper.visible = false; scene.add(hoverHelper);
    const selectionHelper = new Box3Helper(new Box3(), 0x7ba7ff); selectionHelper.visible = false; scene.add(selectionHelper);

    const size = () => {
      const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    size();
    const observer = new ResizeObserver(size); observer.observe(container);

    loadGpuAsset(asset, { signal: aborter.signal }).then(({ gltf, manifest }) => {
      if (disposed) return;
      const registry = createObjectRegistry(gltf.scene, manifest);
      scene.add(registry.root);
      const animator = new GpuAnimationController(registry, camera, controls);
      const picker = new GpuPicker(camera, renderer.domElement, registry.meshes);
      runtime.current = { scene, camera, renderer, controls, registry, animator, picker, hoverHelper, selectionHelper, drag: null };
      onManifest(manifest);
      animator.focus("gpu", 1.15);
      dispatch({ type: "READY" });
    }).catch((error) => {
      if (!aborter.signal.aborted) dispatch({ type: "ERROR", error: error.message });
    });

    const onMove = (event) => {
      const rt = runtime.current;
      if (!rt) return;
      if (rt.drag) {
        const dx = event.clientX - rt.drag.x, dy = event.clientY - rt.drag.y;
        rt.drag.x = event.clientX; rt.drag.y = event.clientY; rt.drag.distance += Math.abs(dx) + Math.abs(dy);
        rt.drag.group.rotateOnWorldAxis(new Vector3(0, 1, 0), dx * 0.008);
        rt.drag.group.rotateOnWorldAxis(new Vector3(1, 0, 0), dy * 0.006);
        return;
      }
      const id = rt.picker.pick(event);
      dispatch({ type: "HOVER", id });
      renderer.domElement.style.cursor = id ? "pointer" : "grab";
    };
    const onDown = (event) => {
      const rt = runtime.current; if (!rt) return;
      const id = rt.picker.pick(event);
      const current = stateRef.current;
      if (current.inspectionMode === "part" && current.selectedId !== "gpu" && id && (id === current.selectedId || id.startsWith(`${current.selectedId}.`))) {
        rt.drag = { x: event.clientX, y: event.clientY, distance: 0, group: rt.registry.groups.get(current.selectedId) };
        rt.controls.enabled = false;
        renderer.domElement.setPointerCapture(event.pointerId);
      }
    };
    const onUp = (event) => {
      const rt = runtime.current; if (!rt) return;
      const drag = rt.drag; rt.drag = null; rt.controls.enabled = true;
      if (!drag || drag.distance < 5) {
        const id = rt.picker.pick(event);
        if (id) dispatch({ type: "SELECT", id, nodes: rt.registry.nodes });
      }
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const render = (now) => {
      frame = requestAnimationFrame(render);
      const rt = runtime.current;
      if (rt) {
        rt.animator.update(now);
        rt.controls.autoRotateSpeed = 0.8;
        rt.controls.update();
        setHelper(rt.hoverHelper, rt.hoverHelper.userData.targetId ? rt.registry.groups.get(rt.hoverHelper.userData.targetId) : null);
        setHelper(rt.selectionHelper, rt.registry.groups.get(rt.selectionHelper.userData.targetId));
      }
      renderer.render(scene, camera);
    };
    render(performance.now());

    return () => {
      disposed = true; aborter.abort(); cancelAnimationFrame(frame); observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      if (runtime.current?.registry) disposeRegistry(runtime.current.registry);
      floor.geometry.dispose(); floor.material.dispose(); environment.dispose(); room.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); runtime.current = null;
    };
  }, [asset, dispatch, onManifest]);

  useEffect(() => {
    const rt = runtime.current; if (!rt) return;
    const node = rt.registry.nodes.get(state.selectedId);
    const temporaryHidden = new Set(node?.motion?.revealPrerequisites || []);
    setRegistryAppearance(rt.registry, { conceptual: state.conceptual, xray: state.xray || state.path.length > 2, selectedId: state.selectedId, temporaryHidden, explicitHidden: state.hidden });
    rt.hoverHelper.userData.targetId = state.hoverId;
    rt.selectionHelper.userData.targetId = state.selectedId === "gpu" ? null : state.selectedId;
  }, [state.conceptual, state.xray, state.selectedId, state.hoverId, state.hidden, state.path]);

  useEffect(() => {
    const rt = runtime.current; if (!rt || state.status !== "ready") return;
    if (state.exploded) rt.animator.explode(true); else rt.animator.select(state.selectedId);
  }, [state.selectedId, state.exploded, state.status, state.motionRevision]);

  useEffect(() => { if (runtime.current) runtime.current.controls.autoRotate = state.autoRotate && state.inspectionMode === "scene"; }, [state.autoRotate, state.inspectionMode]);

  return <div className="gpu-lab-viewport" ref={host} aria-label={zh ? "可拆解显卡三维视图" : "Explorable GPU three dimensional view"}>
    {state.status === "loading" && <div className="gpu-lab-loading"><span /><strong>{zh ? "正在验证并装配 3D 模型" : "Validating and assembling 3D model"}</strong><small>{zh ? "约 9.4 MB" : "About 9.4 MB"}</small></div>}
    {state.status === "error" && <div className="gpu-lab-loading error"><strong>{zh ? "模型加载失败" : "Model failed to load"}</strong><small>{state.error}</small><button onClick={() => location.reload()}>{zh ? "重试" : "Retry"}</button></div>}
  </div>;
}
