import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// An original, decorative sculpture. Its particles and orbits are not research
// data; actual counts, topics and relationships belong to the surrounding UI.
const PALETTES = [
  ["#245bdf", "#83ddd9", "#bca9f2"],
  ["#5543c7", "#9ac8f6", "#e6b7d6"],
  ["#167b86", "#9de6c4", "#9bb2f0"],
  ["#326bd1", "#bee9ef", "#d1b4e5"],
];

const surface = /* glsl */ `
  uniform float uTime;
  uniform float uShape;
  const float PI = 3.14159265359;
  vec3 ribbon(float u, float v) {
    float angle = u * PI * 2.;
    float phase = uTime * .12;
    float radius = 1.46 + .105 * sin(angle * 3. + phase + uShape);
    float twist = angle * 1.5 + .28 * sin(angle * 2. + phase) + uShape * .3;
    float width = (v - .5) * 1.04;
    float radial = radius + width * cos(twist);
    return vec3(
      radial * cos(angle),
      radial * sin(angle),
      width * sin(twist) + .14 * sin(angle * 2. + phase + uShape * .5)
    );
  }
`;

const ribbonVertex = /* glsl */ `
  ${surface}
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vec3 p = ribbon(uv.x, uv.y);
    vec3 tangent = ribbon(uv.x + .0005, uv.y) - p;
    vec3 across = ribbon(uv.x, uv.y + .0005) - p;
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    vNormal = normalize(normalMatrix * normalize(cross(tangent, across)));
    vView = -mv.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mv;
  }
`;

const ribbonFragment = /* glsl */ `
  uniform vec3 uBlue;
  uniform vec3 uMint;
  uniform vec3 uLilac;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  void main() {
    vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1. : -1.);
    vec3 viewDirection = normalize(vView);
    float fresnel = pow(1. - abs(dot(normal, viewDirection)), 2.);
    float light = dot(normal, normalize(vec3(-.45, .65, 1.)));
    float silk = .5 + .5 * sin(vUv.x * 17. + vUv.y * 5. + normal.z * 3.);
    vec3 iridescent = mix(uMint, uLilac, silk);
    iridescent = mix(iridescent, uBlue, smoothstep(.15, .8, -light) * .86);
    vec3 pearl = vec3(.93, .955, .98);
    vec3 color = mix(iridescent, pearl, smoothstep(-.15, .8, light) * .79);
    color = mix(color, uBlue, fresnel * .32);
    // Narrow highlights and fine silk fibres make the folds legible on white.
    float highlight = pow(max(0., dot(reflect(normalize(vec3(.6, -.4, -1.)), normal), viewDirection)), 32.);
    float fibres = .5 + .5 * sin(vUv.y * 800. + vUv.x * 19.);
    color *= .966 + .034 * fibres;
    color += highlight * .28;
    float edge = pow(abs(vUv.y - .5) * 2., 12.);
    color = mix(color, mix(uBlue, uMint, .55), edge * .36);
    gl_FragColor = vec4(color, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function indexOf(value) {
  return ((Math.trunc(Number(value) || 0) % PALETTES.length) + PALETTES.length) % PALETTES.length;
}

export default function DiscoveryScene({ activeIndex = 0, paused = false }) {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const stateRef = useRef({ activeIndex, paused });
  const [failed, setFailed] = useState(false);
  stateRef.current = { activeIndex, paused };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || failed) return undefined;
    const parent = mount.closest(".discovery-hero") || mount.parentElement?.parentElement || mount;
    const resources = new Set();
    const own = (resource) => { resources.add(resource); return resource; };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 760px)");
    let renderer;
    let resizeObserver;
    let intersectionObserver;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let visible = true;
    let disposed = false;
    let renderOnce = () => {};
    let resume = () => {};
    const pointer = new THREE.Vector2();
    const smoothPointer = new THREE.Vector2();
    const neutralPointer = new THREE.Vector2();

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { renderOnce(); resume(); }
    };
    const onMotion = () => { stop(); renderOnce(); resume(); };
    const onPointer = (event) => {
      const bounds = parent.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      pointer.set(
        THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1),
        THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1),
      );
    };
    const onLeave = () => pointer.set(0, 0);
    const onContextLost = (event) => {
      event.preventDefault();
      stop();
      if (!disposed) setFailed(true);
    };
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
      parent.removeEventListener("pointermove", onPointer);
      parent.removeEventListener("pointerleave", onLeave);
      renderer?.domElement.removeEventListener("webglcontextlost", onContextLost);
      resources.forEach((resource) => resource.dispose());
      resources.clear();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();
      controlsRef.current = null;
    };

    try {
      const canvas = document.createElement("canvas");
      const options = { alpha: true, antialias: !small.matches, powerPreference: "low-power" };
      // Probe before constructing the renderer so unsupported devices keep the
      // CSS sculpture instead of receiving a failed WebGL canvas.
      const context = canvas.getContext("webgl2", options) || canvas.getContext("webgl", options);
      if (!context) { setFailed(true); return cleanup; }
      renderer = new THREE.WebGLRenderer({ canvas, context, ...options });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0xffffff, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.cssText = "display:block;width:100%;height:100%;pointer-events:none";
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.addEventListener("webglcontextlost", onContextLost);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, .1, 30);
      camera.position.set(0, 0, 7.4);
      const sculpture = new THREE.Group();
      scene.add(sculpture);
      const initialIndex = indexOf(stateRef.current.activeIndex);
      const uniforms = {
        uTime: { value: 0 },
        uShape: { value: initialIndex },
        uBlue: { value: new THREE.Color(PALETTES[initialIndex][0]) },
        uMint: { value: new THREE.Color(PALETTES[initialIndex][1]) },
        uLilac: { value: new THREE.Color(PALETTES[initialIndex][2]) },
      };
      const targets = PALETTES.map((palette) => palette.map((color) => new THREE.Color(color)));
      const bodyGeometry = own(new THREE.PlaneGeometry(1, 1, small.matches ? 160 : 256, 36));
      const bodyMaterial = own(new THREE.ShaderMaterial({
        uniforms, vertexShader: ribbonVertex, fragmentShader: ribbonFragment,
        side: THREE.DoubleSide,
      }));
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.frustumCulled = false;
      sculpture.add(body);

      // The point budget is fixed at 720 on mobile and 1,800 on desktop. All
      // movement is in the vertex shader, with no per-frame buffer allocations.
      const pointCount = small.matches ? 720 : 1800;
      const pointParameters = new Float32Array(pointCount * 3);
      for (let i = 0; i < pointCount; i += 1) {
        const golden = (i * .61803398875) % 1;
        pointParameters[i * 3] = i / pointCount;
        pointParameters[i * 3 + 1] = golden;
        pointParameters[i * 3 + 2] = (i * .41421356237) % 1;
      }
      const pointGeometry = own(new THREE.BufferGeometry());
      pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointParameters, 3));
      const pointMaterial = own(new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          ${surface}
          varying float vAlpha;
          void main() {
            float u = fract(position.x + uTime * .008);
            vec3 p = ribbon(u, position.y * 1.44 - .22);
            float spread = .055 + pow(position.z, 5.) * .68;
            p += normalize(p) * spread;
            p.z += sin(position.x * 80. + uTime * .25) * spread;
            vec4 mv = modelViewMatrix * vec4(p, 1.);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp((1.8 + position.z * 2.) * 5. / -mv.z, 1., 3.);
            vAlpha = .2 + position.z * .4;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uBlue;
          uniform vec3 uLilac;
          varying float vAlpha;
          void main() {
            float distanceToCenter = length(gl_PointCoord - .5);
            if (distanceToCenter > .5) discard;
            gl_FragColor = vec4(mix(uBlue, uLilac, .24), vAlpha * (1. - smoothstep(.18, .5, distanceToCenter)));
            #include <colorspace_fragment>
          }
        `,
        transparent: true, depthWrite: false,
      }));
      const points = new THREE.Points(pointGeometry, pointMaterial);
      points.frustumCulled = false;
      sculpture.add(points);

      const orbitGroup = new THREE.Group();
      sculpture.add(orbitGroup);
      const orbitMaterial = own(new THREE.LineBasicMaterial({ color: "#7895ba", transparent: true, opacity: .18 }));
      const orbits = [];
      for (let orbitIndex = 0; orbitIndex < 3; orbitIndex += 1) {
        const orbit = new THREE.Group();
        orbit.rotation.set(.52 + orbitIndex * .62, .15 + orbitIndex * .33, orbitIndex * .78);
        const positions = [];
        const radius = 2.15 + orbitIndex * .15;
        for (let vertex = 0; vertex < 192; vertex += 1) {
          const angle = vertex / 192 * Math.PI * 2;
          positions.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
        }
        const geometry = own(new THREE.BufferGeometry().setFromPoints(positions));
        orbit.add(new THREE.LineLoop(geometry, orbitMaterial));
        orbitGroup.add(orbit);
        orbits.push({ orbit, radius });
      }
      scene.add(new THREE.HemisphereLight(0xffffff, 0xa2adca, 2.3));
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(-3, 5, 7);
      scene.add(light);
      const satelliteGeometry = own(new THREE.SphereGeometry(1, 18, 12));
      const satelliteMaterial = own(new THREE.MeshStandardMaterial({ color: "#526ac9", metalness: .42, roughness: .25 }));
      const satellites = orbits.map(({ orbit, radius }, i) => {
        const satellite = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
        satellite.scale.setScalar(i === 1 ? .059 : .035);
        orbit.add(satellite);
        return { satellite, radius, phase: i * 2.2, speed: .055 + i * .014 };
      });

      let baseX = 0;
      let mobile = false;
      const canAnimate = () => !disposed && visible && !document.hidden && !motion.matches && !stateRef.current.paused;
      const draw = (delta = 0) => {
        const selected = indexOf(stateRef.current.activeIndex);
        const easing = delta > 0 ? 1 - Math.exp(-delta * 2.8) : 1;
        uniforms.uBlue.value.lerp(targets[selected][0], easing);
        uniforms.uMint.value.lerp(targets[selected][1], easing);
        uniforms.uLilac.value.lerp(targets[selected][2], easing);
        uniforms.uShape.value = THREE.MathUtils.lerp(uniforms.uShape.value, selected, easing);
        uniforms.uTime.value = elapsed;
        smoothPointer.lerp(motion.matches ? neutralPointer : pointer, delta > 0 ? 1 - Math.exp(-delta * 3) : 1);
        sculpture.rotation.set(.32 + smoothPointer.y * .075, -.42 + smoothPointer.x * .1, -.18 + Math.sin(elapsed * .075) * .065);
        sculpture.position.set(baseX + smoothPointer.x * .055, mobile ? .02 : .035 + Math.sin(elapsed * .28) * .028, 0);
        orbitGroup.rotation.z = elapsed * .015;
        satellites.forEach(({ satellite, radius, phase, speed }) => {
          const angle = elapsed * speed + phase;
          satellite.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        });
        renderer.render(scene, camera);
      };
      const animate = (time) => {
        frame = 0;
        if (!canAnimate()) return;
        // Cap drawing at approximately 40 fps; browser RAF still synchronises
        // presentation, and background/offscreen instances have no RAF loop.
        const delta = lastTime ? (time - lastTime) / 1000 : 1 / 40;
        if (delta >= 1 / 42) {
          lastTime = time;
          elapsed += Math.min(delta, .06);
          draw(Math.min(delta, .06));
        }
        frame = requestAnimationFrame(animate);
      };
      renderOnce = () => { if (!disposed && !document.hidden && visible) draw(); };
      resume = () => {
        if (canAnimate() && !frame) { lastTime = 0; frame = requestAnimationFrame(animate); }
        else if (!canAnimate()) stop();
      };
      controlsRef.current = {
        update: () => {
          if (!canAnimate()) renderOnce();
          resume();
        },
      };
      const resize = () => {
        const width = mount.clientWidth;
        const height = mount.clientHeight;
        if (!width || !height) { stop(); return; }
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        mobile = width < 760;
        const worldWidth = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
        baseX = mobile ? worldWidth * .035 : worldWidth * .195;
        sculpture.scale.setScalar(mobile ? Math.min(.83, worldWidth / 4.8) : Math.min(1.03, worldWidth / 8));
        renderOnce();
        resume();
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      intersectionObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) { renderOnce(); resume(); } else stop();
      }, { threshold: 0.01 });
      intersectionObserver.observe(mount);
      document.addEventListener("visibilitychange", onVisibility);
      motion.addEventListener("change", onMotion);
      parent.addEventListener("pointermove", onPointer, { passive: true });
      parent.addEventListener("pointerleave", onLeave, { passive: true });
      resize();
    } catch {
      // Decorations must never prevent access to the research workspace.
      cleanup();
      setFailed(true);
    }
    return cleanup;
  }, [failed]);

  useEffect(() => { controlsRef.current?.update(); }, [activeIndex, paused]);

  return (
    <div aria-hidden="true" className="discovery-scene" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 72% 46%, rgba(224,236,253,.52), transparent 57%)" }} />
      <div ref={mountRef} style={{ position: "absolute", inset: 0, opacity: failed ? 0 : 1 }} />
      {failed && (
        <div style={{ position: "absolute", width: "min(58%, 510px)", aspectRatio: "1", right: "8%", top: "50%", transform: "translateY(-50%) rotate(-24deg)", borderRadius: "50%", border: "1px solid #d6e1f1", boxShadow: "inset 25px 8px 55px #b7dcec80, 20px 5px 75px #b2b8f044", background: "conic-gradient(from 25deg, #edf9ff, #afcadf, #c7b8e7, #fafcff, #a2d3e2, #edf9ff)", maskImage: "radial-gradient(ellipse, transparent 35%, #000 36%, #000 65%, transparent 72%)" }} />
      )}
    </div>
  );
}
