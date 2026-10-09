import { useMemo, useState } from "react";
import { ChevronRight, Eye, EyeOff } from "lucide-react";

function TreeItem({ id, map, state, dispatch, zh, depth, open, setOpen }) {
  const node = map.get(id);
  if (!node) return null;
  const children = node.childIds || [];
  const expanded = open.has(id) || state.path.includes(id);
  const toggle = (event) => { event.stopPropagation(); const next = new Set(open); if (expanded) next.delete(id); else next.add(id); setOpen(next); };
  const select = () => {
    if (node.evidence === "conceptual" && !state.conceptual) dispatch({ type: "CONCEPTUAL" });
    dispatch({ type: "SELECT", id, nodes: map });
  };
  return <div className="gpu-tree-branch">
    <div className={`gpu-tree-row ${state.selectedId === id ? "selected" : ""}`} style={{ "--tree-depth": depth }}>
      <button className="gpu-tree-expand" onClick={toggle} disabled={!children.length} aria-label={expanded ? "Collapse" : "Expand"}><ChevronRight size={13} className={expanded ? "expanded" : ""} /></button>
      <button className="gpu-tree-label" onClick={select}><span>{zh ? node.nameZh : node.nameEn}</span>{node.teachingOnly && <em>{zh ? "示意" : "Concept"}</em>}</button>
      {node.kind === "part" && <button className="gpu-tree-eye" onClick={() => dispatch({ type: "VISIBILITY", id })} aria-label={zh ? "切换可见" : "Toggle visibility"}>{state.hidden.has(id) ? <EyeOff size={13} /> : <Eye size={13} />}</button>}
    </div>
    {children.length > 0 && expanded && <div>{children.map((child) => <TreeItem key={child} id={child} map={map} state={state} dispatch={dispatch} zh={zh} depth={depth + 1} open={open} setOpen={setOpen} />)}</div>}
  </div>;
}

export default function GpuPartsTree({ manifest, state, dispatch, zh }) {
  const map = useMemo(() => new Map((manifest?.nodes || []).map((node) => [node.id, node])), [manifest]);
  const [open, setOpen] = useState(new Set(["gpu"]));
  return <aside className="gpu-parts-panel">
    <header><div><span>ASSEMBLY</span><strong>{zh ? "部件树" : "Parts tree"}</strong></div><b>{manifest?.nodes?.length || 0}</b></header>
    <div className="gpu-tree-scroll">{manifest && <TreeItem id="gpu" map={map} state={state} dispatch={dispatch} zh={zh} depth={0} open={open} setOpen={setOpen} />}</div>
    <footer><span className="dot actual" />{zh ? "现有模型" : "Existing"}<span className="dot concept" />{zh ? "结构示意" : "Conceptual"}</footer>
  </aside>;
}
