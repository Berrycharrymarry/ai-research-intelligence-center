import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import { useI18n } from "../i18n";
import Graph2D from "./Graph2D";
import { NODE_COLORS, nodeLabel } from "./graphMeta";

export { NODE_COLORS, nodeLabel };
const endpoint = (value) => typeof value === "object" ? value.id : value;

function labelSprite(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const label = text.length > 30 ? `${text.slice(0, 29)}…` : text;
  ctx.font = "500 26px sans-serif";
  canvas.width = Math.ceil(ctx.measureText(label).width) + 24;
  canvas.height = 48;
  ctx.font = "500 26px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#344054";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, 24);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(canvas.width * 0.2, 9.6, 1);
  sprite.position.y = -15;
  return sprite;
}

const Graph3D = forwardRef(function Graph3D({ data, onSelect, selectedId, showLabels = false }, ref) {
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const fallbackRef = useRef(null);
  const callbacks = useRef({});
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const { t } = useI18n();
  callbacks.current = { onSelect, t };

  useImperativeHandle(ref, () => ({
    fit: () => fgRef.current ? fgRef.current.zoomToFit(450, 65) : fallbackRef.current?.fit(),
    zoomIn: () => fgRef.current ? zoom(0.78) : fallbackRef.current?.zoomIn(),
    zoomOut: () => fgRef.current ? zoom(1.28) : fallbackRef.current?.zoomOut(),
    focus: (id) => {
      const fg = fgRef.current;
      const node = fg?.graphData().nodes.find((n) => n.id === id);
      if (!node || !Number.isFinite(node.x)) return;
      const direction = fg.camera().position.clone().sub(fg.controls().target).normalize().multiplyScalar(180);
      fg.cameraPosition({ x: node.x + direction.x, y: node.y + direction.y, z: node.z + direction.z }, node, 500);
    },
  }), []);

  function zoom(factor) {
    const fg = fgRef.current;
    const target = fg.controls().target;
    const offset = fg.camera().position.clone().sub(target);
    offset.setLength(Math.max(25, Math.min(5000, offset.length() * factor)));
    fg.cameraPosition(offset.add(target), target, 300);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el || failed) return;
    let fg;
    let observer;
    const resources = new Set();
    const releaseLabels = () => {
      resources.forEach((sprite) => { sprite.material.map.dispose(); sprite.material.dispose(); });
      resources.clear();
    };
    const cleanup = () => {
      observer?.disconnect();
      if (fg) {
        const renderer = fg.renderer();
        fg._destructor();
        fg.controls().dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      }
      releaseLabels();
      fgRef.current = null;
      el.replaceChildren();
    };
    try {
      // v1.73 uses a factory followed by a separate mount call.
      fg = ForceGraph3D({ controlType: "orbit" })(el);
      fgRef.current = fg;
      fg.backgroundColor("#ffffff")
        .showNavInfo(false)
        .width(Math.max(1, el.clientWidth)).height(Math.max(1, el.clientHeight))
        .nodeLabel((node) => {
          const label = document.createElement("div");
          label.className = "graph-tooltip";
          label.textContent = `${node.name || node.label || node.id} · ${nodeLabel(callbacks.current.t, node.type)}`;
          return label;
        })
        .nodeVal((n) => Math.max(2, (n.size || 8) * (n.type === "paper" ? 0.45 : 1.5)))
        .nodeColor((n) => NODE_COLORS[n.type] || "#64748b")
        .nodeRelSize(2.3).nodeOpacity(0.94).nodeResolution(16)
        .linkColor(() => "#a5b3c2").linkOpacity(0.3).linkWidth(0.55)
        .cooldownTicks(120)
        .onNodeClick((node) => callbacks.current.onSelect?.({ ...node, name: node.name || node.label || node.id }))
        .onBackgroundClick(() => callbacks.current.onSelect?.(null))
        .onNodeHover((node) => { el.style.cursor = node ? "pointer" : "grab"; });
      if (showLabels) {
        fg.nodeThreeObjectExtend(true).nodeThreeObject((node) => {
          if (node.type === "paper" || node.type === "author") return undefined;
          const sprite = labelSprite(node.label || node.id);
          resources.add(sprite);
          return sprite;
        });
      }
      // Distance belongs to the d3 link force, not the graph component.
      fg.d3Force("link").distance(65);
      fg.d3Force("charge").strength(-95);
      const controls = fg.controls();
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.minDistance = 25;
      controls.maxDistance = 5000;
      controls.autoRotate = false;
      fg.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      observer = new ResizeObserver(() => {
        if (el.clientWidth && el.clientHeight) fg.width(el.clientWidth).height(el.clientHeight);
      });
      observer.observe(el);
      fg.__releaseLabels = releaseLabels;
    } catch (error) {
      console.error("Graph3D initialization failed", error);
      cleanup();
      setFailed(true);
      return;
    }
    return cleanup;
  }, [failed, retry, showLabels]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      const nodes = (data?.nodes || []).map(({ data: node }) => ({ ...node }));
      const ids = new Set(nodes.map((n) => n.id));
      const links = (data?.edges || []).map(({ data: edge }) => ({ ...edge }))
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target));
      fg.__releaseLabels();
      fg.graphData({ nodes, links });
      let fitted = false;
      fg.onEngineStop(() => {
        if (!fitted && nodes.length) { fitted = true; fg.zoomToFit(450, 65); }
      });
    } catch (error) {
      console.error("Graph3D data update failed", error);
      setFailed(true);
    }
  }, [data, failed, retry, showLabels]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const neighbors = new Set(selectedId ? [selectedId] : []);
    fg.graphData().links.forEach((link) => {
      const source = endpoint(link.source), target = endpoint(link.target);
      if (source === selectedId) neighbors.add(target);
      if (target === selectedId) neighbors.add(source);
    });
    fg.nodeColor((n) => selectedId && !neighbors.has(n.id) ? "#dce2e8" : NODE_COLORS[n.type] || "#64748b")
      .linkColor((link) => !selectedId ? "#a5b3c2" :
        endpoint(link.source) === selectedId || endpoint(link.target) === selectedId ? "#536d8a" : "#e9edf1");
  }, [selectedId, data, failed, retry, showLabels]);

  if (failed) return (
    <div className="relative h-full w-full">
      <Graph2D ref={fallbackRef} data={data} onSelect={onSelect} selectedId={selectedId} />
      <div role="status" className="absolute right-3 top-3 z-10 max-w-[280px] rounded-lg border border-line bg-panel/95 p-3 text-xs text-muted">
        <div className="flex items-center gap-2"><AlertTriangle size={14} />{t("kg.fallback2d")}</div>
        <p className="mt-1 text-faint">{t("kg.fallback2dHint")}</p>
        <button className="mt-2 underline underline-offset-4" onClick={() => { setFailed(false); setRetry((n) => n + 1); }}>{t("kg.retry3d")}</button>
      </div>
    </div>
  );
  return <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-panel" aria-label={t("nav.graph")} />;
});

export default Graph3D;
