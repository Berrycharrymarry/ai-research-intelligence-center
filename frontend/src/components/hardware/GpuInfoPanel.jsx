import { Box, Link2, MousePointer2, Rotate3D } from "lucide-react";

const evidenceLabel = (evidence, zh) => ({ photo: zh ? "照片依据" : "Photo evidence", existing_model: zh ? "现有模型" : "Existing model", conceptual: zh ? "结构示意" : "Conceptual" }[evidence] || evidence);

export default function GpuInfoPanel({ manifest, state, dispatch, zh }) {
  const map = new Map((manifest?.nodes || []).map((node) => [node.id, node]));
  const node = map.get(state.selectedId);
  if (!node) return <aside className="gpu-info-panel skeleton" />;
  const connections = node.connections || [];
  return <aside className="gpu-info-panel">
    <header><span>{node.category || "COMPONENT"}</span><b className={`evidence-${node.evidence}`}>{evidenceLabel(node.evidence, zh)}</b></header>
    <h2>{zh ? node.nameZh : node.nameEn}</h2><code>{node.id}</code><p>{zh ? node.functionZh : node.functionEn}</p>
    <dl>
      <div><dt><Box size={14} />{zh ? "位置" : "Location"}</dt><dd>{zh ? node.locationZh : `Inside ${node.parentId || "the complete assembly"}.`}</dd></div>
      <div><dt><Link2 size={14} />{zh ? "连接" : "Joint"}</dt><dd>{node.joint} · {connections.length ? connections.map((item) => item.type).join(", ") : (zh ? "根级装配" : "Root assembly")}</dd></div>
    </dl>
    {node.teachingOnly && <div className="gpu-concept-note">{zh ? "此内部形态用于说明通用硬件结构，不代表该零售型号的精确电气设计。" : "This internal form teaches generic hardware structure and is not an exact electrical reconstruction of the retail product."}</div>}
    <div className="gpu-inspect-mode"><span>{zh ? "拖动模式" : "Drag mode"}</span><div><button className={state.inspectionMode === "scene" ? "active" : ""} onClick={() => dispatch({ type: "MODE", mode: "scene" })}><MousePointer2 size={14} />{zh ? "整机" : "Scene"}</button><button className={state.inspectionMode === "part" ? "active" : ""} disabled={node.id === "gpu"} onClick={() => dispatch({ type: "MODE", mode: "part" })}><Rotate3D size={14} />{zh ? "部件" : "Part"}</button></div></div>
    <div className="gpu-info-help"><strong>{zh ? "操作" : "Controls"}</strong><p>{zh ? "单击选择；再次拖动已选部件可独立旋转。滚轮缩放，空白区域拖动整机。" : "Click to select. Drag the selected part again to rotate it independently. Scroll to zoom; drag empty space to orbit."}</p></div>
  </aside>;
}
