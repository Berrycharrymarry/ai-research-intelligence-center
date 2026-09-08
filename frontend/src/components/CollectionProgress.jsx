import { AlertTriangle, ArrowUpRight, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";

const STAGES = ["searching", "enriching", "expanding", "analyzing"];
const COPY = {
  zh: { queued: "准备采集", searching: "发现与收录论文", enriching: "批量补全摘要", expanding: "连接引用文献", analyzing: "生成研究洞察", ready: "采集完成", error: "采集已中断" },
  en: { queued: "Preparing collection", searching: "Discovering papers", enriching: "Enriching abstracts", expanding: "Connecting citations", analyzing: "Generating insights", ready: "Collection complete", error: "Collection interrupted" },
};
const WARNING_COPY = {
  zh: {
    source_busy: "数据源暂时繁忙，系统会在稍后重试。",
    using_crossref: "OpenAlex 暂时不可用，已切换到 Crossref；已收录论文仍可阅读。",
    enrichment_unavailable: "摘要补全暂时不可用；已收录论文仍可阅读。",
    citations_unavailable: "引用扩展暂时不可用；已收录论文仍可阅读。",
    source_unavailable: "数据源暂时不可用；已收录论文仍可阅读。",
    server_restarted: "服务在采集过程中重启，已收录论文仍可阅读。",
  },
  en: {
    source_busy: "The source is busy. We will retry shortly.",
    using_crossref: "OpenAlex is temporarily unavailable. Continuing with Crossref; saved papers remain available.",
    enrichment_unavailable: "Abstract enrichment is temporarily unavailable; saved papers remain available.",
    citations_unavailable: "Citation expansion is temporarily unavailable; saved papers remain available.",
    source_unavailable: "The source is temporarily unavailable; saved papers remain available.",
    server_restarted: "The service restarted during collection; saved papers remain available.",
  },
};

export default function CollectionProgress({ compact = false }) {
  const { project } = useProject();
  const { lang } = useI18n();
  if (!project) return null;
  const zh = lang === "zh";
  const progress = project.collection_progress || {};
  const busy = ["collecting", "analyzing"].includes(project.status);
  const hasNotice = Boolean(progress.warning || progress.stage === "error" || project.status === "error");
  if (!busy && !hasNotice) return null;
  const stage = progress.stage || (project.status === "analyzing" ? "analyzing" : "searching");
  const count = progress.collected ?? project.paper_count ?? 0;
  const step = STAGES.indexOf(stage);
  const title = (COPY[lang] || COPY.en)[stage] || COPY[lang]?.searching;
  const warning = WARNING_COPY[lang]?.[progress.warning];
  const message = warning || progress.message || (stage === "error" ? (zh ? "采集未能完成。" : "Collection could not finish.") : null);
  if (compact) return <div className={`collection-compact ${hasNotice ? "has-notice" : ""}`} role="status">{hasNotice ? <AlertTriangle size={12} /> : <Loader2 size={12} className="animate-spin" />}<span>{title}</span><strong>{count}</strong></div>;
  return <section className="collection-panel" aria-label={zh ? "论文采集进度" : "Collection progress"}>
    <div className="collection-panel-top"><div><span className="experience-kicker">LIVE COLLECTION</span><h2>{title}<span className="collection-pulse" /></h2></div><div className="collection-count"><strong>{count}</strong><span>{zh ? "篇已收录" : "papers saved"}</span></div></div>
    <ol className="collection-steps">{STAGES.map((key, i) => <li key={key} className={i === step ? "current" : i < step ? "complete" : ""} aria-current={i === step ? "step" : undefined}><span>{String(i + 1).padStart(2, "0")}</span>{COPY[lang]?.[key] || COPY.en[key]}</li>)}</ol>
    <div className="collection-footer"><p>{progress.retry_after ? (zh ? `数据源限流，等待 ${progress.retry_after} 秒后重试。` : `Source rate limit: retrying after ${progress.retry_after} seconds.`) : message || (zh ? "论文正在分批保存，已收录内容可以提前阅读。" : "Papers are saved in batches. Start reading while collection continues.")}</p>{count > 0 && <Link to="/explorer">{zh ? "先看已收录论文" : "Read available papers"}<ArrowUpRight size={14} /></Link>}</div>
  </section>;
}
