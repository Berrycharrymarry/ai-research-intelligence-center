import { useState } from "react";
import { Box, Download, RotateCcw } from "lucide-react";
import { useI18n } from "../i18n";
import GpuViewer from "../viz/hardware/GpuViewer";
import "../styles/hardware.css";

const assetRoot = "/hardware/gpu-5060ti-ultra-w";
const modelUrl = `${assetRoot}/gpu_5060ti_ultra_w.glb`;
const images = [
  { file: "hero_reference.png", zh: "参考角度", en: "Reference angle" },
  { file: "hero_neutral.png", zh: "中性光对照", en: "Neutral lighting" },
  { file: "surface_detail.png", zh: "表面细节", en: "Surface detail" },
];

export default function HardwareLab() {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [status, setStatus] = useState("loading");
  const [resetView, setResetView] = useState(() => () => {});
  const labels = {
    loading: zh ? "正在加载 3D 模型" : "Loading 3D model",
    ready: zh ? "3D 模型可交互" : "3D model ready",
    error: zh ? "3D 模型暂不可用" : "3D model unavailable",
  };

  return <div className="gpu-showcase">
    <div className="gpu-heading">
      <div>
        <div className="gpu-kicker"><Box size={16} strokeWidth={1.5} /> GPU / 01</div>
        <h1>{zh ? "七彩虹 iGame 5060 Ti Ultra W 风格显卡" : "Colorful iGame 5060 Ti Ultra W style GPU"}</h1>
        <p>{zh ? "一张完整的白粉配色三风扇显卡，支持在浏览器中旋转和缩放观察。" : "Explore a complete white and pink triple fan graphics card. Rotate and zoom in the browser."}</p>
      </div>
      <div className="gpu-heading-meta"><span>{zh ? "外形尺寸" : "DIMENSIONS"}</span><strong>300.5 × 120 × 50 mm</strong></div>
    </div>

    <section className="gpu-viewer-section" aria-label={zh ? "交互式显卡模型" : "Interactive GPU model"}>
      <div className="gpu-viewer-frame">
        <GpuViewer modelUrl={modelUrl} fallbackUrl={`${assetRoot}/hero_reference.png`} lang={lang} onStatus={setStatus} onResetReady={setResetView} />
        <div className={`gpu-model-status gpu-model-status-${status}`} role="status"><span />{labels[status]}</div>
      </div>
      <div className="gpu-viewer-footer">
        <p>{zh ? "拖动旋转 · 滚轮或双指缩放" : "Drag to rotate · scroll or pinch to zoom"}</p>
        <div className="gpu-viewer-actions">
          <button type="button" onClick={resetView} disabled={status !== "ready"}><RotateCcw size={15} />{zh ? "复位视角" : "Reset view"}</button>
          {status === "ready" ? <a href={modelUrl} download><Download size={15} />{zh ? "下载 GLB" : "Download GLB"}</a> : <button type="button" disabled><Download size={15} />{zh ? "下载 GLB" : "Download GLB"}</button>}
        </div>
      </div>
    </section>

    <section className="gpu-gallery" aria-label={zh ? "显卡渲染图" : "GPU render gallery"}>
      <div className="gpu-section-heading"><span>02 / RENDERS</span><h2>{zh ? "外观与细节" : "Exterior & details"}</h2></div>
      <div className="gpu-gallery-grid">{images.map(({ file, zh: zhLabel, en }) => <figure key={file}>
        <img src={`${assetRoot}/${file}`} alt={`${zh ? "七彩虹 iGame 5060 Ti Ultra W 风格显卡" : "iGame 5060 Ti Ultra W style graphics card"} — ${zh ? zhLabel : en}`} loading="lazy" />
        <figcaption>{zh ? zhLabel : en}</figcaption>
      </figure>)}</div>
    </section>

    <p className="gpu-disclosure">{zh ? "按实物照片参考制作；接口、内部结构及部分尺寸为展示近似。" : "Made from product photo references; ports, internal structure, and some dimensions are approximated for display."}</p>
  </div>;
}
