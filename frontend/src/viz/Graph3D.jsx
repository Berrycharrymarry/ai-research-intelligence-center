import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { useI18n } from "../i18n";
import Graph2D from "./Graph2D";
import { NODE_COLORS, nodeLabel } from "./graphMeta";

export { NODE_COLORS, nodeLabel };

const EDGE_COLORS = {
  cites: "rgba(248, 113, 113, 0.55)",
  related_to: "rgba(100, 116, 139, 0.32)",
  authored_by: "rgba(45, 212, 191, 0.28)",
  belongs_to: "rgba(34, 211, 238, 0.28)",
  uses: "rgba(167, 139, 250, 0.38)",
};

// Returns the WebGL tier available, or null when unavailable.
function webglTier() {
  try {
    if (!window.WebGLRenderingContext) return null;
    const canvas = document.createElement("canvas");
    const attrs = { failIfMajorPerformanceCaveat: false };
    if (canvas.getContext("webgl2", attrs)) return "webgl2";
    if (canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs)) return "webgl1";
    return null;
  } catch {
    return null;
  }
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Radial-gradient glow textures, cached per color.
const glowTextures = new Map();
function glowTexture(color) {
  if (!glowTextures.has(color)) {
    const s = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = s;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, hexToRgba(color, 0.95));
    g.addColorStop(0.5, hexToRgba(color, 0.4));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    glowTextures.set(color, new THREE.CanvasTexture(canvas));
  }
  return glowTextures.get(color);
}

function baseScale(size) {
  return 4.5 + (size || 8) * 1.05;
}

/**
 * 3D force-directed knowledge graph.
 * data: { nodes: [{data:{id,label,type,size}}], edges: [{data:{source,target,relation}}] }
 * Fails gracefully (never crashes the app) when WebGL is unavailable.
 */
const Graph3D = forwardRef(function Graph3D({ data, onSelect, selectedId }, ref) {
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const graph2dRef = useRef(null);
  const spritesRef = useRef(new Map());
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const tRef = useRef(null);
  const rafRef = useRef(0);
  const [failed, setFailed] = useState(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const { t } = useI18n();

  onSelectRef.current = onSelect;
  tRef.current = t;

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useImperativeHandle(
    ref,
    () => ({
      fit: () =>
        fgRef.current ? fgRef.current.zoomToFit(400, 80) : graph2dRef.current?.fit(),
      zoomIn: () => (fgRef.current ? stepZoom(0.72) : graph2dRef.current?.zoomIn()),
      zoomOut: () => (fgRef.current ? stepZoom(1.4) : graph2dRef.current?.zoomOut()),
    }),
    []
  );

  function stepZoom(factor) {
    const fg = fgRef.current;
    if (!fg) return;
    const cp = fg.cameraPosition();
    fg.cameraPosition({ x: cp.x * factor, y: cp.y * factor, z: cp.z * factor }, cp, 350);
  }

  // one-time init — guarded so failures degrade to a notice instead of a black screen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const tier = webglTier();
    if (!tier) {
      setFailed("no-webgl");
      return undefined;
    }

    let tooltip = null;
    try {
      tooltip = document.createElement("div");
      tooltip.style.cssText =
        "position:absolute;pointer-events:none;z-index:20;display:none;max-width:280px;" +
        "padding:4px 9px;border-radius:6px;border:1px solid rgba(45,212,191,.4);" +
        "background:rgba(10,13,20,.92);color:#cbd5e1;font-size:11px;line-height:1.5;" +
        "font-family:ui-monospace,SFMono-Regular,Consolas,monospace;transform:translate(14px,14px);";
      el.appendChild(tooltip);

      const fg = new ForceGraph3D(el)
        .backgroundColor("rgba(0,0,0,0)")
        .nodeVal((n) => n.size || 8)
        .linkDistance(42)
        .linkColor((l) => EDGE_COLORS[l.relation] || "rgba(100,116,139,0.3)")
        .linkWidth(0.6)
        .linkOpacity(0.55)
        .linkDirectionalParticles((l) => (l.relation === "cites" ? 1 : 0))
        .linkDirectionalParticleWidth(1.4)
        .linkDirectionalParticleSpeed(0.004)
        .nodeThreeObject((node) => {
          const color = NODE_COLORS[node.type] || "#94a3b8";
          const material = new THREE.SpriteMaterial({
            map: glowTexture(color),
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.92,
          });
          const sprite = new THREE.Sprite(material);
          const base = baseScale(node.size);
          sprite.scale.set(base, base, 1);
          spritesRef.current.set(node.id, { sprite, material, base });
          return sprite;
        })
        .onNodeHover((node) => {
          el.style.cursor = node ? "pointer" : "grab";
          if (node) {
            const tt = tRef.current;
            tooltip.textContent = `${node.label || node.id} · ${tt ? nodeLabel(tt, node.type) : node.type}`;
            tooltip.style.display = "block";
          } else {
            tooltip.style.display = "none";
          }
        })
        .onNodeClick((node) => {
          onSelectRef.current &&
            onSelectRef.current({
              ...node,
              name: node.label || node.id,
            });
        });
      fgRef.current = fg;

      const controls = fg.controls();
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.zoomSpeed = 2.5; // raised wheel-zoom sensitivity
      controls.rotateSpeed = 1.1;
      controls.minDistance = 35;
      controls.maxDistance = 1400;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;

      const onMouseMove = (e) => {
        const rect = el.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - rect.left}px`;
        tooltip.style.top = `${e.clientY - rect.top}px`;
      };
      el.addEventListener("mousemove", onMouseMove);

      // keep the canvas in sync with the container size (guards against 0-size at init)
      let resizeTimer = null;
      const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const w = el.clientWidth;
          const h = el.clientHeight;
          if (w > 10 && h > 10 && fgRef.current) {
            fgRef.current.width(w).height(h);
          }
        }, 80);
      });
      ro.observe(el);

      // subtle glow pulse + selection dimming, per frame
      const t0 = performance.now();
      const animate = () => {
        const secs = (performance.now() - t0) / 1000;
        const sel = selectedRef.current;
        spritesRef.current.forEach(({ sprite, material, base }, id) => {
          const dimmed = sel && id !== sel;
          material.opacity = dimmed ? 0.1 : 0.92;
          const phase = (id.length ? id.charCodeAt(id.length - 1) : 0) % 7;
          const k = (dimmed ? 0.5 : 1) * (1 + 0.05 * Math.sin(secs * 2.2 + phase));
          sprite.scale.set(base * k, base * k, 1);
        });
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(rafRef.current);
        clearTimeout(resizeTimer);
        ro.disconnect();
        el.removeEventListener("mousemove", onMouseMove);
        spritesRef.current.clear();
        if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
        fgRef.current = null;
        el.innerHTML = "";
      };
    } catch (err) {
      console.error("Graph3D init failed:", err);
      setFailed(err && err.message ? String(err.message) : String(err));
      return undefined;
    }
  }, [retryNonce]);

  // data updates
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return undefined;
    try {
      const gData = {
        nodes: (data?.nodes || []).map((n) => ({ ...n.data })),
        links: (data?.edges || []).map((e) => ({ ...e.data })),
      };
      spritesRef.current.clear();
      fg.graphData(gData);
      // fit after the force layout has had time to spread the nodes out
      const id = setTimeout(() => fg.zoomToFit(500, 90), 2500);
      return () => clearTimeout(id);
    } catch (err) {
      console.error("Graph3D data update failed:", err);
      setFailed(err && err.message ? String(err.message) : String(err));
      return undefined;
    }
  }, [data]);

  if (failed) {
    // 3D unavailable (no WebGL / init error) — degrade to the 2D graph so the
    // knowledge graph keeps working instead of showing an empty panel.
    return (
      <div className="relative h-full w-full">
        <Graph2D ref={graph2dRef} data={data} onSelect={onSelect} selectedId={selectedId} />
        <div className="absolute left-3 top-3 z-10 max-w-[340px] rounded-md border border-warn/40 bg-panel/95 px-3 py-2 shadow-lg">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-warn">
            <AlertTriangle size={12} />
            {t("kg.fallback2d")}
            <span className="font-mono text-[9px] text-faint">[{failed}]</span>
          </div>
          <div className="mt-0.5 text-[10px] leading-relaxed text-faint">{t("kg.fallback2dHint")}</div>
          <button
            onClick={() => {
              setFailed(null);
              setRetryNonce((n) => n + 1);
            }}
            className="mt-1.5 rounded border border-warn/50 px-2 py-0.5 text-[10px] text-warn hover:bg-warn/10"
          >
            {t("kg.retry3d")}
          </button>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-md border border-line bg-panel" />;
});

export default Graph3D;
