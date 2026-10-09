import { Eye, Focus, Layers3, Rotate3D, Scan, Undo2 } from "lucide-react";

export default function GpuLabToolbar({ state, dispatch, zh, canBack }) {
  const item = (active, label, Icon, onClick, disabled = false) => <button type="button" className={active ? "active" : ""} onClick={onClick} disabled={disabled} title={label}><Icon size={16} /><span>{label}</span></button>;
  return <div className="gpu-lab-toolbar" aria-label={zh ? "拆解工具" : "Disassembly tools"}>
    {item(false, zh ? "返回上级" : "Back", Undo2, () => dispatch({ type: "BACK" }), !canBack)}
    {item(state.exploded, zh ? "爆炸视图" : "Exploded", Layers3, () => dispatch({ type: "EXPLODE" }))}
    {item(state.xray, zh ? "透视遮挡" : "X-ray", Scan, () => dispatch({ type: "XRAY" }))}
    {item(state.conceptual, zh ? "内部示意" : "Conceptual", Eye, () => dispatch({ type: "CONCEPTUAL" }))}
    {item(state.autoRotate, zh ? "自动旋转" : "Auto rotate", Rotate3D, () => dispatch({ type: "AUTOROTATE" }))}
    {item(false, zh ? "完整复位" : "Reset all", Focus, () => dispatch({ type: "RESET" }))}
  </div>;
}
