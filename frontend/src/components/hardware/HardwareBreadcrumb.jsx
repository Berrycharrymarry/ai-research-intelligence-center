import { ChevronRight } from "lucide-react";
import { hardwareTree } from "../../data/hardwareTree";
export default function HardwareBreadcrumb({ path, lang, onNavigate }) {
  return <nav className="hardware-breadcrumb" aria-label={lang === "zh" ? "硬件学习路径" : "Hardware learning path"}>{path.map((id, index) => <span key={id}>{index > 0 && <ChevronRight size={13} />}<button className={index === path.length - 1 ? "active" : ""} onClick={() => onNavigate(index)}>{hardwareTree[id]?.name[lang] || id}</button></span>)}</nav>;
}
