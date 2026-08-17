import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { NODE_COLORS } from "./graphMeta";

cytoscape.use(fcose);

const EDGE_COLORS = {
  cites: "#f87171",
  related_to: "#64748b",
  authored_by: "#2c3650",
  belongs_to: "#22d3ee",
  uses: "#a78bfa",
};

function elements(data) {
  const nodes = (data?.nodes || []).map((n) => ({ data: n.data }));
  const edges = (data?.edges || []).map((e) => ({ data: e.data }));
  return [...nodes, ...edges];
}

/**
 * 2D fallback knowledge graph (Cytoscape). Used when WebGL is unavailable.
 * data shape matches Graph3D: { nodes: [{data:{id,label,type,size}}], edges: [{data:{source,target,relation}}] }
 */
const Graph2D = forwardRef(function Graph2D({ data, onSelect, selectedId, onReady }, ref) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useImperativeHandle(
    ref,
    () => ({
      fit: () => cyRef.current?.fit(undefined, 40),
      zoomIn: () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3),
      zoomOut: () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3),
    }),
    []
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return undefined;
    const cy = cytoscape({
      container: el,
      elements: elements(data),
      minZoom: 0.05,
      maxZoom: 5,
      wheelSensitivity: 0.35,
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele) => NODE_COLORS[ele.data("type")] || "#64748b",
            label: "data(label)",
            color: "#cbd5e1",
            "font-size": 8.5,
            "font-family": "JetBrains Mono, ui-monospace, monospace",
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            "text-wrap": "ellipsis",
            "text-max-width": "110px",
            width: (ele) => Math.min(30, 7 + (ele.data("size") || 8) * 0.8),
            height: (ele) => Math.min(30, 7 + (ele.data("size") || 8) * 0.8),
            "border-width": 1,
            "border-color": "#0a0d14",
            "overlay-opacity": 0,
          },
        },
        {
          selector: "node[type = 'author']",
          style: { shape: "round-rectangle", width: 7, height: 7 },
        },
        {
          selector: "node:selected",
          style: { "border-width": 2, "border-color": "#f8fafc" },
        },
        {
          selector: "edge",
          style: {
            "line-color": (ele) => EDGE_COLORS[ele.data("relation")] || "#2c3650",
            width: 0.7,
            "target-arrow-shape": "triangle",
            "target-arrow-color": (ele) => EDGE_COLORS[ele.data("relation")] || "#2c3650",
            "arrow-scale": 0.55,
            "curve-style": "bezier",
            opacity: 0.45,
          },
        },
      ],
      layout: {
        name: "fcose",
        quality: "default",
        randomize: true,
        animate: false,
        nodeRepulsion: 10000,
        idealEdgeLength: 70,
        edgeElasticity: 0.45,
        gravity: 0.25,
        numIter: 900,
      },
    });
    cyRef.current = cy;
    cy.on("tap", "node", (e) => onSelectRef.current && onSelectRef.current({ ...e.target.data(), name: e.target.data("label") }));
    cy.on("tap", (e) => {
      if (e.target === cy && onSelectRef.current) onSelectRef.current(null);
    });
    if (onReady) onReady(cy);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("dimmed");
    cy.style()
      .selector(".dimmed")
      .style({ opacity: 0.1 })
      .update();
    if (selectedId) {
      const n = cy.getElementById(selectedId);
      if (n.nonempty()) {
        cy.nodes().difference(n.closedNeighborhood()).addClass("dimmed");
      }
    }
  }, [selectedId, data]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border border-line bg-panel">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
});

export default Graph2D;
