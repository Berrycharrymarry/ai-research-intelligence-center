import { useCallback, useMemo, useReducer, useState } from "react";
import { Cpu, Download, ShieldCheck } from "lucide-react";
import { useI18n } from "../i18n";
import GpuLabBoundary from "../components/hardware/GpuLabBoundary";
import GpuLabToolbar from "../components/hardware/GpuLabToolbar";
import GpuPartsTree from "../components/hardware/GpuPartsTree";
import GpuInfoPanel from "../components/hardware/GpuInfoPanel";
import GpuLabViewport from "../viz/gpu-lab/GpuLabViewport";
import { GPU_LAB_ASSET } from "../viz/gpu-lab/assetCatalog";
import { gpuReducer, initialGpuState } from "../viz/gpu-lab/interactionState";
import "../styles/hardware.css";

export default function HardwareLab() {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [state, dispatch] = useReducer(gpuReducer, initialGpuState);
  const [manifest, setManifest] = useState(null);
  const onManifest = useCallback((value) => setManifest(value), []);
  const map = useMemo(() => new Map((manifest?.nodes || []).map((node) => [node.id, node])), [manifest]);
  const crumbs = state.path.map((id) => map.get(id)).filter(Boolean);
  return <div className="gpu-lab-page">
    <header className="gpu-lab-heading">
      <div><span className="gpu-lab-kicker"><Cpu size={16} />GPU DISASSEMBLY LAB / 5060 TI</span><h1>{zh ? "七彩虹 iGame 5060 Ti Ultra W 交互拆解实验室" : "Colorful iGame 5060 Ti Ultra W Interactive Lab"}</h1><p>{zh ? "从完整外观逐层进入风扇、散热系统、PCB 与芯片封装。模型结构来源与概念示意在界面中明确区分。" : "Move from the complete exterior into fans, cooling, PCB and package structure. Existing geometry and conceptual teaching parts are clearly distinguished."}</p></div>
      <div className="gpu-lab-meta"><span><ShieldCheck size={15} />{zh ? "资产已校验" : "Asset verified"}</span><strong>300.5 × 120 × 50 mm</strong><small>GLB 9.4 MB · 330 {zh ? "节点" : "nodes"}</small></div>
    </header>
    <section className="gpu-lab-shell">
      <div className="gpu-lab-topbar"><nav>{crumbs.map((node, index) => <button key={node.id} onClick={() => dispatch({ type: "SELECT", id: node.id, nodes: map })}>{index > 0 && <i>/</i>}{zh ? node.nameZh : node.nameEn}</button>)}</nav><a href={GPU_LAB_ASSET.modelUrl} download><Download size={14} />GLB</a></div>
      <div className="gpu-lab-grid">
        <GpuPartsTree manifest={manifest} state={state} dispatch={dispatch} zh={zh} />
        <main className="gpu-lab-stage"><GpuLabBoundary><GpuLabViewport asset={GPU_LAB_ASSET} state={state} dispatch={dispatch} onManifest={onManifest} zh={zh} /></GpuLabBoundary><GpuLabToolbar state={state} dispatch={dispatch} zh={zh} canBack={state.path.length > 1} /><div className="gpu-lab-stage-note"><span className={state.status} />{state.status === "ready" ? (zh ? "可交互 · 单击模型选择部件" : "Interactive · click the model to select a part") : (zh ? "正在准备模型" : "Preparing model")}</div></main>
        <GpuInfoPanel manifest={manifest} state={state} dispatch={dispatch} zh={zh} />
      </div>
    </section>
    <p className="gpu-lab-disclosure">{zh ? "外观依据用户提供的产品照片与既有 Blender 模型；PCB、芯片封装与电机内部为通用教学示意，不声明精确复现零售型号电气设计。" : "Exterior geometry follows the supplied product image and existing Blender model. PCB, package and motor internals are generic teaching representations, not claims of exact retail electrical design."}</p>
  </div>;
}
