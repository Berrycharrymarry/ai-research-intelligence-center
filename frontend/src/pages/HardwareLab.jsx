import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, EyeOff, Focus, Minus, Move3d, Plus, RotateCcw, Scan, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "../i18n";
import HardwareCatalog from "../components/hardware/HardwareCatalog";
import HardwareBreadcrumb from "../components/hardware/HardwareBreadcrumb";
import ChildPartPanel from "../components/hardware/ChildPartPanel";
import DrilldownScene from "../viz/hardware/DrilldownScene";
import { hardwareCatalogRoots, hardwareTree, getHardwareNode, validateHardwareTree } from "../data/hardwareTree";

const aliases = { "graphics-card": "gpu", ram: "memory", "power-supply": "psu" };
function normalisePath(raw) {
  const requested = (raw || "").split("/").filter(Boolean).map((id) => aliases[id] || id);
  const path = ["system"];
  requested.forEach((id) => {
    const current = hardwareTree[path[path.length - 1]];
    if (hardwareTree[id] && (current?.children || []).includes(id)) path.push(id);
  });
  return path;
}

const sceneAliases = { "ram-a": "memory", "ram-b": "memory", "gpu-power": "gpu", "cpu-power": "cpu", "main-power": "motherboard", "case-fan-front": "cooling", "case-fan-rear": "cooling", m2: "storage", "sata-ssd": "storage", "sata-cables": "storage" };

export default function HardwareLab() {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const scene = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [path, setPath] = useState(() => normalisePath(searchParams.get("path")));
  const [layerExpanded, setLayerExpanded] = useState(0);
  const [movementMode, setMovementMode] = useState(false);
  const [solo, setSolo] = useState(false);
  const [offsets, setOffsets] = useState({});
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const currentNode = getHardwareNode(path[path.length - 1]) || hardwareTree.system;
  const pathKey = path.join("/");
  const currentOffsets = offsets[pathKey] || {};
  const currentRoot = path[1] || "system";
  const treeErrors = useMemo(() => validateHardwareTree(), []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (path.length === 1) next.delete("path");
    else next.set("path", path.slice(1).join("/"));
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [path, searchParams, setSearchParams]);
  useEffect(() => {
    const requested = normalisePath(searchParams.get("path"));
    setPath((current) => current.join("/") === requested.join("/") ? current : requested);
  }, [searchParams]);

  const selectCatalog = (nodeId) => {
    setPath(nodeId === "system" ? ["system"] : ["system", nodeId]);
    setLayerExpanded(0); setMovementMode(false); setSolo(false);
  };
  const selectChild = (nodeId) => {
    if (currentNode.children.includes(nodeId)) { setPath([...path, nodeId]); setLayerExpanded(0); setSolo(false); }
  };
  const navigateBreadcrumb = (index) => { setPath(path.slice(0, index + 1)); setLayerExpanded(0); setSolo(false); };
  const goBack = () => { if (path.length > 1) navigateBreadcrumb(path.length - 2); };
  const goHome = () => navigateBreadcrumb(0);
  const updateOffset = (nodeId, axis, value) => setOffsets((current) => ({ ...current, [pathKey]: { ...(current[pathKey] || {}), [nodeId]: { ...(current[pathKey]?.[nodeId] || {}), [axis]: value } } }));
  const nudge = (axis, amount) => updateOffset(currentNode.nodeId, axis, Math.max(-1.6, Math.min(1.6, (currentOffsets[currentNode.nodeId]?.[axis] || 0) + amount)));
  const restoreLayer = () => { setOffsets((current) => { const next = { ...current }; delete next[pathKey]; return next; }); setLayerExpanded(0); setMovementMode(false); };
  const restoreAll = () => { setPath(["system"]); setLayerExpanded(0); setOffsets({}); setSolo(false); setMovementMode(false); scene.current?.reset(); };
  const selectFromScene = (id) => {
    const mapped = hardwareTree[id] ? id : sceneAliases[id];
    if (!mapped) return;
    if (mapped === "system") return goHome();
    const node = hardwareTree[mapped];
    if (node?.parentId && path[path.length - 1] === node.parentId) return selectChild(mapped);
    if (hardwareCatalogRoots.includes(mapped)) return selectCatalog(mapped);
    if (node) { const root = node.nodeId === "m2" ? "storage" : (path[1] || node.parentId); if (hardwareTree[root]) setPath(["system", root]); }
  };
  useEffect(() => {
    const onKey = (event) => {
      if (!movementMode || event.target.closest("input,button,a")) return;
      const map = { ArrowLeft: ["x", -0.12], ArrowRight: ["x", 0.12], ArrowUp: ["y", 0.12], ArrowDown: ["y", -0.12], "[": ["z", -0.12], "]": ["z", 0.12] };
      if (map[event.key]) { event.preventDefault(); nudge(...map[event.key]); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [movementMode, currentNode.nodeId, currentOffsets]);

  return <div className="hardware-page drilldown-page">
    <div className="hardware-heading"><div><span className="eyebrow">LEARN BY TAKING IT APART</span><h1><Box size={25} strokeWidth={1.35} />{zh ? "3D 电脑硬件实验室" : "3D Hardware Lab"}</h1><p>{zh ? "从整机目录进入有限层级的硬件结构树，逐层聚焦、展开和复原。" : "Navigate a finite hardware tree to focus, separate, and restore each layer."}</p></div><div className="hardware-heading-stats"><div><strong>8</strong><span>{zh ? "一级目录" : "catalog roots"}</span></div><div><strong>45</strong><span>{zh ? "知识节点" : "knowledge nodes"}</span></div><div><strong>2×</strong><span>{zh ? "视频平台" : "video platforms"}</span></div></div></div>
    <div className="hardware-notice"><span><SlidersHorizontal size={15} />{zh ? "教学示意模型" : "Teaching model"}</span><p>{zh ? "组装节点说明真实安装关系；教学分离和架构示意节点只用于观察，不代表可徒手拆焊。每个开放节点都保留已核对的 B 站与 YouTube 讲解入口。" : "Assembly nodes explain real installation relationships. Teaching and architecture nodes are observational only, not a soldering guide. Open nodes retain checked Bilibili and YouTube lessons."}</p></div>
    <HardwareBreadcrumb path={path} lang={lang} onNavigate={navigateBreadcrumb} />
    <div className="hardware-toolbar"><div className="hardware-toolbar-group"><span className="toolbar-label">{zh ? "当前层" : "Layer"}</span><button className={layerExpanded === 0 ? "active" : ""} onClick={() => { setLayerExpanded(0); setOffsets((current) => ({ ...current, [pathKey]: {} })); }}><Box size={14} />{zh ? "组装" : "Assembly"}</button><button className={layerExpanded > 0 ? "active" : ""} onClick={() => setLayerExpanded(100)}><Move3d size={14} />{zh ? "展开本层" : "Expand layer"}</button></div><div className="hardware-toolbar-group"><span className="toolbar-label">{zh ? "交互" : "Interaction"}</span><button className={!movementMode ? "active" : ""} onClick={() => setMovementMode(false)}><Scan size={14} />{zh ? "观察" : "Observe"}</button><button className={movementMode ? "active" : ""} onClick={() => setMovementMode(true)}><Move3d size={14} />{zh ? "移动" : "Move"}</button></div><label className="hardware-check"><input type="checkbox" checked={solo} onChange={(event) => setSolo(event.target.checked)} />{zh ? "仅看当前" : "Solo current"}</label><span className="hardware-toolbar-help">{movementMode ? (zh ? "轴手柄拖动 · 方向键微调" : "Drag axis handles · arrow keys nudge") : (zh ? "点击模型或右侧子节点继续钻取" : "Click the model or a child node to drill down")}</span></div>
    <div className="hardware-workspace"><HardwareCatalog lang={lang} currentRoot={currentRoot} onSelect={selectCatalog} collapsed={catalogCollapsed} onToggle={() => setCatalogCollapsed((value) => !value)} /><section className="hardware-stage"><div className="hardware-scene-wrap"><DrilldownScene ref={scene} path={path} activeNode={currentNode} layerExpanded={layerExpanded} offsets={currentOffsets} movementMode={movementMode} solo={solo} onSelectNode={selectFromScene} onOffsetChange={(id, axis, value) => updateOffset(id, axis, value)} onMoveEnd={() => {}} onUnavailable={() => setWebglUnavailable(true)} />{webglUnavailable && <div className="hardware-fallback"><strong>{zh ? "当前浏览器无法使用 WebGL" : "WebGL is unavailable"}</strong><p>{zh ? "仍可使用左侧目录、层级说明和视频完成学习。" : "Use the catalog, layer notes, and video links to continue learning."}</p></div>}<div className="hardware-scene-badge"><span className="status-dot" />{path.length === 1 ? (zh ? "整机视图" : "FULL DESKTOP") : currentNode.name.en.toUpperCase()}</div><div className="hardware-camera-controls"><button onClick={() => scene.current?.zoomIn()} aria-label={zh ? "放大" : "Zoom in"}><Plus size={16} /></button><button onClick={() => scene.current?.zoomOut()} aria-label={zh ? "缩小" : "Zoom out"}><Minus size={16} /></button><button onClick={() => scene.current?.fit()} aria-label={zh ? "适应画面" : "Fit view"}><Scan size={16} /></button></div><div className="hardware-axis-controls"><button onClick={() => nudge("x", -0.15)}><ArrowLeft size={13} />X−</button><button onClick={() => nudge("x", 0.15)}>X+<ArrowRight size={13} /></button><button onClick={() => nudge("y", 0.15)}><ArrowUp size={13} />Y+</button><button onClick={() => nudge("y", -0.15)}><ArrowDown size={13} />Y−</button><button onClick={() => nudge("z", -0.15)}>Z−</button><button onClick={() => nudge("z", 0.15)}>Z+</button></div><div className="hardware-stage-caption">{movementMode ? (zh ? "拖动彩色轴手柄或用方向键移动当前节点。" : "Drag the colored axis handles or use arrow keys to move the current node.") : (zh ? "右侧只列出当前层的直接子节点。" : "The right panel lists only direct children of the current layer.")}</div></div><div className="hardware-decompose"><div className="hardware-decompose-label"><span>{path.length === 1 ? (zh ? "整机空间展开" : "Desktop separation") : (zh ? "本层空间展开" : "Layer separation")} </span><strong>{layerExpanded}%</strong></div><input type="range" min="0" max="100" step="1" value={layerExpanded} onChange={(event) => { setLayerExpanded(Number(event.target.value)); setOffsets((current) => ({ ...current, [pathKey]: {} })); }} aria-label={zh ? "本层展开程度" : "Layer separation"} /><div className="hardware-range-labels"><span>{zh ? "组装" : "Assembly"}</span><span>{zh ? "完全展开" : "Fully separated"}</span></div></div><div className="hardware-bottom-actions"><button onClick={() => scene.current?.focus()}><Focus size={14} />{zh ? "聚焦当前" : "Focus current"}</button><button onClick={() => setSolo((value) => !value)}><EyeOff size={14} />{solo ? (zh ? "显示上下文" : "Show context") : (zh ? "仅看当前" : "Solo current")}</button><button onClick={restoreLayer}><RotateCcw size={14} />{zh ? "复原本层" : "Restore layer"}</button><button className="reset-action" onClick={restoreAll}><RotateCcw size={14} />{zh ? "返回整机" : "Back to desktop"}</button></div></section><ChildPartPanel node={currentNode} lang={lang} onSelect={selectChild} onBack={goBack} onHome={goHome} onFocus={() => scene.current?.focus()} onRestore={restoreLayer} /></div>
    <div className="hardware-tour"><div><span className="eyebrow">03 / HIERARCHICAL DRILLDOWN</span><strong>{path.length === 1 ? (zh ? "从左侧目录开始" : "Start from the catalog") : `${zh ? "当前路径" : "Current path"} · ${path.length - 1} ${zh ? "层" : "level(s)"}`}</strong><p>{currentNode.purpose[lang]}</p></div><button onClick={() => path.length > 1 ? goBack() : selectCatalog("gpu")}>{path.length > 1 ? (zh ? "返回上一级" : "Back one level") : (zh ? "示例：打开显卡" : "Example: open GPU")}<ArrowRight size={14} /></button></div>
    {treeErrors.length > 0 && <div className="hardware-content-warning">{zh ? `结构校验发现 ${treeErrors.length} 项问题。` : `${treeErrors.length} tree validation issue(s) found.`}</div>}
  </div>;
}
